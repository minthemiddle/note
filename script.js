/**
 * Note App - Script
 * Handles state, UI rendering, share target logic, and PocketBase sync.
 */

console.log('[Note App] Script version: v13 - DateTime fields for PocketBase');

// --- PocketBase Sync Layer ---
const pb = new PocketBase(window.location.origin);
const SYNC_USER_EMAIL = "user@note.local";
const SYNC_USER_PASSWORD = "notesapp2026";

// Enable debugging
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[Note Sync]', ...args);
const warn = (...args) => console.warn('[Note Sync]', ...args);
const error = (...args) => console.error('[Note Sync]', ...args);

const Sync = {
    authenticated: false,
    syncing: false,

    // Helper to get user model from authStore (SDK stores it as 'model' not 'record')
    getUserModel() {
        return pb.authStore.model || pb.authStore.baseModel || null;
    },

    getUserId() {
        const model = this.getUserModel();
        return model?.id || null;
    },

    async init() {
        log('========================================');
        log('Initializing PocketBase sync...');
        log('PocketBase URL:', window.location.origin);
        log('========================================');

        try {
            // Try to restore auth from localStorage
            log('Step 1: Loading auth from cookie...');
            pb.authStore.loadFromCookie(document.cookie);
            log('Auth store isValid:', pb.authStore.isValid);
            log('Auth store has record:', !!pb.authStore.record);

            if (!pb.authStore.isValid) {
                log('Step 2: No valid auth found, attempting login...');
                log('Credentials:');
                log('  Email:', SYNC_USER_EMAIL);
                log('  Password:', SYNC_USER_PASSWORD.substring(0, 4) + '****');

                try {
                    // Auto-login
                    log('Calling pb.collection("users").authWithPassword()...');
                    const authData = await pb.collection('users').authWithPassword(SYNC_USER_EMAIL, SYNC_USER_PASSWORD);
                    log('✓ Authentication successful!');
                    log('Auth data:', {
                        userId: authData.record?.id,
                        email: authData.record?.email,
                        username: authData.record?.username,
                        token: authData.token ? authData.token.substring(0, 20) + '...' : 'NO TOKEN'
                    });

                    // Check all possible property names for the user record
                    log('Checking authStore properties...');
                    log('pb.authStore.model:', pb.authStore.model);
                    log('pb.authStore.baseModel:', pb.authStore.baseModel);
                    log('pb.authStore.record:', pb.authStore.record);

                    if (!authData.record || !authData.record.id) {
                        error('❌ Login succeeded but no user record returned!');
                        error('authData:', authData);
                        this.authenticated = false;
                        return;
                    }
                } catch (authErr) {
                    error('========================================');
                    error('❌ LOGIN FAILED');
                    error('========================================');
                    error('Have you created the user in PocketBase?');
                    error('Required credentials:');
                    error('  Email:', SYNC_USER_EMAIL);
                    error('  Password:', SYNC_USER_PASSWORD);
                    error('');
                    error('API Error:', authErr);
                    error('Error status:', authErr.status);
                    error('Error data:', authErr.data);
                    error('Error response:', authErr.response);
                    error('Error message:', authErr.message);
                    error('========================================');
                    this.authenticated = false;
                    return;
                }
            } else {
                log('Step 2: Using existing auth from cookie');
                log('Existing auth:', {
                    isValid: pb.authStore.isValid,
                    token: pb.authStore.token
                });
            }

            // Verify auth is valid
            log('Step 3: Verifying authentication...');
            log('pb.authStore.isValid:', pb.authStore.isValid);
            log('pb.authStore.token:', pb.authStore.token ? 'Present' : 'Missing');

            if (!pb.authStore.isValid || !pb.authStore.token) {
                error('❌ Auth is not valid after login!');
                error('pb.authStore:', pb.authStore);
                this.authenticated = false;
                return;
            }

            log('Step 4: Setting authenticated = true');
            this.authenticated = true;
            log('✓ Authentication complete!');

            // Get user info from the correct property
            const userModel = pb.authStore.model || pb.authStore.baseModel || {};
            log('Final auth state:', {
                authenticated: this.authenticated,
                userId: userModel.id,
                email: userModel.email,
                isValid: pb.authStore.isValid
            });

            // Pull from server on init (server wins)
            log('Step 5: Pulling data from server...');
            await this.pullFromServer();
            log('========================================');
        } catch (err) {
            error('========================================');
            error('❌ UNEXPECTED ERROR during sync init');
            error('========================================');
            error('Error:', err);
            error('Error stack:', err.stack);
            error('Error details:', err.response || err.message);
            error('========================================');
            this.authenticated = false;
        }
    },

    async pullFromServer() {
        if (!this.authenticated) {
            warn('Skipping pull: not authenticated');
            return;
        }
        if (this.syncing) {
            warn('Skipping pull: already syncing');
            return;
        }

        // Safety check
        const userId = this.getUserId();
        if (!userId) {
            error('❌ Cannot pull: user ID missing');
            this.authenticated = false;
            return;
        }

        this.syncing = true;
        log('Fetching notes from server...');

        try {
            log('User ID:', userId);

            const records = await pb.collection('notes').getFullList({
                sort: '-time',
                filter: `user = "${userId}"`,
            });

            log(`✓ Fetched ${records.length} notes from server`);

            if (records.length > 0) {
                // Server wins: replace local data
                const notes = records.map(r => {
                    // Convert DateTime string to milliseconds for local use
                    const timeMs = r.time ? new Date(r.time).getTime() : Date.now();

                    return {
                        id: r.id,
                        clientId: r.clientId || Store.generateId(), // Generate if missing
                        text: r.text,
                        time: r.time,    // Keep ISO string for server
                        timeMs: timeMs,  // Milliseconds for local sorting/display
                        edited: r.edited || false,
                    };
                });

                localStorage.setItem("notes", JSON.stringify(notes));
                log('✓ Local storage updated with server data');
                log('Notes:', notes);
            } else {
                log('No notes on server');
            }
        } catch (err) {
            error('❌ Failed to pull from server:', err);
            error('Error details:', err.response || err.message);
        } finally {
            this.syncing = false;
        }
    },

    async pushToServer(note) {
        if (!this.authenticated) {
            warn('Skipping push: not authenticated');
            return;
        }

        // Safety check
        const userId = this.getUserId();
        if (!userId) {
            error('❌ Cannot push: user ID missing');
            this.authenticated = false;
            return;
        }

        // Ensure note has a clientId
        if (!note.clientId) {
            note.clientId = Store.generateId();
            log('Generated missing clientId:', note.clientId);
        }

        try {
            const data = {
                clientId: note.clientId,
                text: note.text,
                time: note.time,
                edited: note.edited || false,
                user: userId,
            };

            log('Pushing note to server:', {
                serverId: note.id,
                clientId: note.clientId,
                textPreview: note.text.substring(0, 50) + '...'
            });

            if (note.id) {
                // Update existing by server ID
                const record = await pb.collection('notes').update(note.id, data);
                log('✓ Note updated on server:', record.id);
            } else {
                // Check if note already exists on server by clientId
                try {
                    const existing = await pb.collection('notes').getFirstListItem(
                        `clientId = "${note.clientId}" && user = "${userId}"`
                    );

                    if (existing) {
                        log('Found existing note by clientId, updating:', existing.id);
                        const record = await pb.collection('notes').update(existing.id, data);
                        note.id = record.id;

                        // Update localStorage with server ID
                        const notes = Store.get();
                        const noteIndex = notes.findIndex(n => n.clientId === note.clientId);
                        if (noteIndex !== -1) {
                            notes[noteIndex].id = record.id;
                            Store.save(notes);
                            log('✓ Local note updated with server ID');
                        }

                        log('✓ Note updated on server:', record.id);
                        return;
                    }
                } catch (err) {
                    // Note doesn't exist, will create below
                    log('Note not found on server by clientId, creating new');
                }

                // Create new
                const record = await pb.collection('notes').create(data);
                note.id = record.id;
                log('✓ Note created on server:', record.id);

                // Update localStorage with server ID
                const notes = Store.get();
                const noteIndex = notes.findIndex(n => n.clientId === note.clientId);
                if (noteIndex !== -1) {
                    notes[noteIndex].id = record.id;
                    Store.save(notes);
                    log('✓ Local note updated with server ID');
                }
            }
        } catch (err) {
            error('❌ Failed to push to server:', err);
            error('Error details:', err.response || err.message);
        }
    },

    async deleteFromServer(noteId) {
        if (!this.authenticated) {
            warn('Skipping delete: not authenticated');
            return;
        }
        if (!noteId) {
            warn('Skipping delete: no noteId provided');
            return;
        }

        try {
            log('Deleting note from server:', noteId);
            await pb.collection('notes').delete(noteId);
            log('✓ Note deleted from server');
        } catch (err) {
            error('❌ Failed to delete from server:', err);
            error('Error details:', err.response || err.message);
        }
    },

    async deleteAllFromServer() {
        if (!this.authenticated) {
            warn('Skipping delete all: not authenticated');
            return;
        }

        // Safety check
        const userId = this.getUserId();
        if (!userId) {
            error('❌ Cannot delete all: user ID missing');
            this.authenticated = false;
            return;
        }

        try {
            log('Deleting all notes from server...');
            const records = await pb.collection('notes').getFullList({
                filter: `user = "${userId}"`,
            });

            log(`Found ${records.length} notes to delete`);
            for (const record of records) {
                await pb.collection('notes').delete(record.id);
                log('Deleted note:', record.id);
            }
            log('✓ All notes deleted from server');
        } catch (err) {
            error('❌ Failed to delete all from server:', err);
            error('Error details:', err.response || err.message);
        }
    }
};

// --- Data Layer ---
const Store = {
    get() {
        return JSON.parse(localStorage.getItem("notes") || "[]");
    },
    save(notes) {
        localStorage.setItem("notes", JSON.stringify(notes));
    },

    // Generate client-side UUID
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    async add(text) {
        if (!text.trim()) return;
        const notes = this.get();
        const now = new Date();
        const newNote = {
            clientId: this.generateId(),
            text,
            time: now.toISOString(), // ISO format for PocketBase DateTime
            timeMs: now.getTime()     // Keep timestamp for local sorting/display
        };
        notes.unshift(newNote);
        this.save(notes);

        log("Created note with clientId:", newNote.clientId);

        // Sync to server
        await Sync.pushToServer(newNote);

        return notes;
    },
    async delete(index) {
        const notes = this.get();
        const noteId = notes[index]?.id;
        notes.splice(index, 1);
        this.save(notes);

        // Delete from server
        if (noteId) {
            await Sync.deleteFromServer(noteId);
        }

        return notes;
    },
    async deleteAll() {
        await Sync.deleteAllFromServer();
        this.save([]);
        return [];
    },
    async update(index, text) {
        const notes = this.get();
        if (notes[index].text !== text) {
            log("Store.update: Updating note", index, "with new text");
            notes[index].text = text;
            notes[index].edited = true;
            this.save(notes);

            // Sync to server
            log("Store.update: Syncing note", index, "to server");
            await Sync.pushToServer(notes[index]);
        } else {
            log("Store.update: No changes detected for note", index);
        }
        return notes;
    }
};

// --- Utilities ---
const Utils = {
    // Helper to get timestamp from note (handles both old and new format)
    getTimestamp(note) {
        // New format: timeMs property
        if (note.timeMs) return note.timeMs;
        // Old format: time as integer
        if (typeof note.time === 'number') return note.time;
        // Fallback: parse time as date string
        return note.time ? new Date(note.time).getTime() : Date.now();
    },

    formatTime(note) {
        const ts = this.getTimestamp(note);
        const d = new Date(ts);
        const locale = navigator.language || "de-DE";
        return d.toLocaleString(locale, {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    },
    formatTimeCompact(note) {
        const ts = this.getTimestamp(note);
        const d = new Date(ts);
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const HH = String(d.getHours()).padStart(2, "0");
        const MM = String(d.getMinutes()).padStart(2, "0");
        return `${yy}${mm}${dd}${HH}${MM}`;
    },
    escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    },
    cleanUrl(u) {
        try {
            const urlObj = new URL(u);
            // Remove text fragments like #:~:text=
            urlObj.hash = urlObj.hash.replace(/:~:text=.*$/i, "");
            // Remove UTM params
            const paramsToRemove = [];
            for (const [key] of urlObj.searchParams) {
                if (key.startsWith("utm_")) paramsToRemove.push(key);
            }
            paramsToRemove.forEach((k) => urlObj.searchParams.delete(k));
            return urlObj.toString();
        } catch (e) {
            return u;
        }
    },
    debounce(ms, fn) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    }
};

// --- App Logic ---
const AUTOSAVE_DELAY_MS = 1000;

const App = {
    notes: Store.get(),
    debouncedUpdate: null,

    elements: {
        input: document.getElementById("noteInput"),
        list: document.getElementById("notesList"),
        saveLink: document.getElementById("saveLink"),
        actionCopy: document.getElementById("actionCopy"),
        actionExport: document.getElementById("actionExport"),
        actionDelete: document.getElementById("actionDelete")
    },

    async init() {
        // Initialize debounced update
        this.debouncedUpdate = Utils.debounce(AUTOSAVE_DELAY_MS, async (index, text) => {
            if (this.notes[index] && this.notes[index].text !== text) {
                log("Autosaving note", index);
                this.notes = await Store.update(index, text);
            }
        });

        // Initialize PocketBase sync
        await Sync.init();

        // Reload notes after sync
        this.notes = Store.get();

        this.render();
        this.bindEvents();
        this.registerServiceWorker();
        this.checkShareTarget();
        this.checkStorageQuota();
    },

    bindEvents() {
        const { input, saveLink, actionCopy, actionExport, actionDelete } = this.elements;

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                this.addNote();
            }
        });

        saveLink.addEventListener("click", (e) => {
            e.preventDefault();
            this.addNote();
        });

        // Footer Actions
        if (actionCopy) actionCopy.addEventListener("click", () => this.copyAll());
        if (actionExport) actionExport.addEventListener("click", () => this.exportAll());
        if (actionDelete) actionDelete.addEventListener("click", () => this.deleteAll());

        // Global functions for inline usage (deleteNote, copyNote)
        window.deleteNote = (i) => this.deleteNote(i);
        window.copyNote = (i) => this.copyNote(i);
    },

    async addNote() {
        const text = this.elements.input.value.trim();
        if (text) {
            this.notes = await Store.add(text);
            this.render();
            this.elements.input.value = "";
            this.elements.input.focus();
        }
    },

    async deleteNote(i) {
        if (confirm("Notiz wirklich löschen?")) {
            // Cancel any pending debounced updates to avoid zombie writes
            // Ideally debounce would support cancellation, but simplistic reload is fine
            this.notes = await Store.delete(i);
            this.render();
        }
    },

    async deleteAll() {
        if (this.notes.length === 0) return;
        if (confirm("Wirklich ALLE Notizen löschen? Das kann nicht rückgängig gemacht werden.")) {
            this.notes = await Store.deleteAll();
            this.render();
        }
    },

    generateExportString() {
        return this.notes
            .map((note) => {
                const time = Utils.formatTimeCompact(note);
                return `## ${time}\n\n${note.text}\n\n`;
            })
            .join("");
    },

    async copyAll() {
        if (this.notes.length === 0) return;
        const text = this.generateExportString();
        try {
            await navigator.clipboard.writeText(text);
            const originalText = this.elements.actionCopy.textContent;
            this.elements.actionCopy.textContent = "Kopiert! ✓";
            setTimeout(() => {
                this.elements.actionCopy.textContent = originalText;
            }, 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
            alert("Konnte nicht kopieren.");
        }
    },

    async copyNote(i) {
        const note = this.notes[i];
        if (!note) return;
        const time = Utils.formatTimeCompact(note);
        const text = `## ${time}\n\n${note.text}\n\n`;
        try {
            await navigator.clipboard.writeText(text);
            const button = document.querySelector(`[data-copy-index="${i}"]`);
            if (button) {
                const originalText = button.textContent;
                button.textContent = "Kopiert! ✓";
                setTimeout(() => {
                    button.textContent = originalText;
                }, 2000);
            }
        } catch (err) {
            console.error("Failed to copy note:", err);
            alert("Konnte nicht kopieren.");
        }
    },

    async exportAll() {
        if (this.notes.length === 0) return;
        const text = this.generateExportString();
        const date = new Date().toISOString().split("T")[0];
        const fileName = `notizen_export_${date}.md`;

        // Modern File System Access API
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'Markdown File',
                        accept: { 'text/markdown': ['.md'] },
                    }],
                });
                const writable = await handle.createWritable();
                await writable.write(text);
                await writable.close();
                return;
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('File Picker failed, falling back:', err);
                } else {
                    return; // User cancelled
                }
            }
        }

        // Legacy Fallback
        const blob = new Blob([text], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    handleInput(e) {
        const i = parseInt(e.target.dataset.index);
        // With plaintext-only, textContent is exactly what we want
        const newText = e.target.textContent.trim();
        e.target.classList.toggle("editing", true);
        log("Text changed, debouncing update for note", i);
        this.debouncedUpdate(i, newText);
    },

    async handleBlur(e) {
        const i = parseInt(e.target.dataset.index);
        const newText = e.target.textContent.trim();
        const currentText = this.notes[i]?.text;

        e.target.classList.remove("editing");

        if (newText && newText !== currentText) {
            log("Note blurred, saving changes for note", i);
            // Final save on blur
            this.notes = await Store.update(i, newText);
            this.render(); // Re-render to ensure state consistency
        }
    },

    render() {
        const { list } = this.elements;
        if (this.notes.length === 0) {
            list.innerHTML = `
        <div class="empty-state"><div style="font-size:32px">📭</div><div>Noch keine Notizen vorhanden</div></div>`;
            return;
        }

        list.innerHTML = this.notes.map((note, i) => `
        <div class="note">
          <div class="note-header">
            <div class="note-time">${Utils.formatTime(note)} ${note.edited ? '<span style="font-size:12px;color:#6b7280;margin-left:6px">(bearbeitet)</span>' : ""}</div>
            <div class="note-actions">
              <a class="note-copy" data-copy-index="${i}" onclick="copyNote(${i})" aria-label="Notiz kopieren">Kopieren</a>
              <button class="note-delete" onclick="deleteNote(${i})" title="Löschen" aria-label="Notiz löschen">✕</button>
            </div>
          </div>
          <div class="note-text" contenteditable="plaintext-only" data-index="${i}">${Utils.escapeHtml(note.text)}</div>
        </div>`).join("");

        // Attach listeners
        document.querySelectorAll(".note-text").forEach((el) => {
            el.addEventListener("input", (e) => this.handleInput(e));
            el.addEventListener("blur", (e) => this.handleBlur(e));
            el.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && e.shiftKey) {
                    e.preventDefault();
                    el.blur();
                }
            });
        });
    },

    registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return;

        navigator.serviceWorker
            .register("sw.js")
            .then((registration) => {
                // Check for updates periodically
                setInterval(() => {
                    registration.update();
                }, 60000); // Check every minute

                // Listen for updates
                registration.addEventListener("updatefound", () => {
                    const newWorker = registration.installing;
                    if (!newWorker) return;

                    newWorker.addEventListener("statechange", () => {
                        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                            // New service worker is waiting
                            this.showUpdateNotification(registration);
                        }
                    });
                });
            })
            .catch((err) => console.warn("SW registration failed", err));

        // Handle controller change (reload triggered)
        navigator.serviceWorker.addEventListener("controllerchange", () => {
            window.location.reload();
        });
    },

    showUpdateNotification(registration) {
        const message = "Neue Version verfügbar! Seite neu laden?";
        if (confirm(message)) {
            const waitingWorker = registration.waiting;
            if (waitingWorker) {
                waitingWorker.postMessage({ type: "SKIP_WAITING" });
            }
        }
    },

    checkShareTarget() {
        if (window.location.search) {
            this.handleShareTarget();
        }
    },

    async handleShareTarget() {
        const urlParams = new URLSearchParams(window.location.search);
        let title = urlParams.get("title") || "";
        let text = urlParams.get("text") || "";
        let url = urlParams.get("url") || "";

        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const foundUrls = text.match(urlRegex);

        if (foundUrls && foundUrls.length > 0) {
            const embeddedUrl = foundUrls[0];
            if (!url || url === embeddedUrl) {
                url = embeddedUrl;
            }
            if (text.trim() === embeddedUrl) {
                text = "";
            } else {
                text = text.replace(embeddedUrl, "").trim();
            }
        }

        if (url) {
            url = Utils.cleanUrl(url);
        }

        let noteContent = "";
        if (text) {
            noteContent += `> ${text}\n\n`;
        } else if (title) {
            noteContent += `${title}\n\n`;
        }

        if (url) {
            noteContent += `Source: ${url}`;
        }

        noteContent = noteContent.trim();
        if (noteContent) {
            this.notes = await Store.add(noteContent);
            this.render();
            // Remove params without refreshing
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    },

    async checkStorageQuota() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return; // API not supported
        }

        try {
            const estimate = await navigator.storage.estimate();
            const usage = estimate.usage || 0;
            const quota = estimate.quota || 0;
            const percentUsed = (usage / quota) * 100;

            if (percentUsed > 80) {
                console.warn(`Storage quota: ${percentUsed.toFixed(1)}% used (${usage}/${quota} bytes)`);
                alert(`Warnung: Speicher zu ${Math.round(percentUsed)}% voll. Bitte alte Notizen löschen oder exportieren.`);
            }
        } catch (err) {
            console.error("Failed to check storage quota:", err);
        }
    }
};

App.init();
