/**
 * Note App - Script
 * Handles state, UI rendering, and share target logic.
 */

// --- Data Layer ---
const Store = {
    get() {
        return JSON.parse(localStorage.getItem("notes") || "[]");
    },
    save(notes) {
        localStorage.setItem("notes", JSON.stringify(notes));
    },
    add(text) {
        if (!text.trim()) return;
        const notes = this.get();
        notes.unshift({ text, time: Date.now() });
        this.save(notes);
        return notes;
    },
    delete(index) {
        const notes = this.get();
        notes.splice(index, 1);
        this.save(notes);
        return notes;
    },
    deleteAll() {
        this.save([]);
        return [];
    },
    update(index, text) {
        const notes = this.get();
        if (notes[index].text !== text) {
            notes[index].text = text;
            notes[index].edited = true;
            this.save(notes);
        }
        return notes;
    }
};

// --- Utilities ---
const Utils = {
    formatTime(ts) {
        const d = new Date(ts);
        return d.toLocaleString("de-DE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    },
    formatTimeCompact(ts) {
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

    init() {
        // Initialize debounced update (wait 1s of inactivity to save)
        this.debouncedUpdate = Utils.debounce(1000, (index, text) => {
            if (this.notes[index] && this.notes[index].text !== text) {
                console.log("Autosaving note", index);
                this.notes = Store.update(index, text);
            }
        });

        this.render();
        this.bindEvents();
        this.registerServiceWorker();
        this.checkShareTarget();
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

    addNote() {
        const text = this.elements.input.value.trim();
        if (text) {
            this.notes = Store.add(text);
            this.render();
            this.elements.input.value = "";
            this.elements.input.focus();
        }
    },

    deleteNote(i) {
        if (confirm("Notiz wirklich löschen?")) {
            // Cancel any pending debounced updates to avoid zombie writes
            // Ideally debounce would support cancellation, but simplistic reload is fine
            this.notes = Store.delete(i);
            this.render();
        }
    },

    deleteAll() {
        if (this.notes.length === 0) return;
        if (confirm("Wirklich ALLE Notizen löschen? Das kann nicht rückgängig gemacht werden.")) {
            this.notes = Store.deleteAll();
            this.render();
        }
    },

    generateExportString() {
        return this.notes
            .map((note) => {
                const time = Utils.formatTimeCompact(note.time);
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
        const time = Utils.formatTimeCompact(note.time);
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
        this.debouncedUpdate(i, newText);
    },

    handleBlur(e) {
        const i = parseInt(e.target.dataset.index);
        const newText = e.target.textContent.trim();
        const currentText = this.notes[i].text;

        e.target.classList.remove("editing");

        if (newText && newText !== currentText) {
            // Final save on blur
            this.notes = Store.update(i, newText);
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
            <div class="note-time">${Utils.formatTime(note.time)} ${note.edited ? '<span style="font-size:12px;color:#6b7280;margin-left:6px">(bearbeitet)</span>' : ""}</div>
            <div class="note-actions">
              <a class="note-copy" data-copy-index="${i}" onclick="copyNote(${i})">Kopieren</a>
              <button class="note-delete" onclick="deleteNote(${i})" title="Löschen">✕</button>
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
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("sw.js")
                .catch((err) => console.warn("SW registration failed", err));
        }
    },

    checkShareTarget() {
        if (window.location.search) {
            this.handleShareTarget();
        }
    },

    handleShareTarget() {
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
            this.notes = Store.add(noteContent);
            this.render();
            // Remove params without refreshing
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
};

App.init();
