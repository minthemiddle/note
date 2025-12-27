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
    }
};

// --- App Logic ---
const App = {
    notes: Store.get(),
    elements: {
        input: document.getElementById("noteInput"),
        list: document.getElementById("notesList"),
        saveLink: document.getElementById("saveLink")
    },

    init() {
        this.render();
        this.bindEvents();
        this.registerServiceWorker();
        this.checkShareTarget();
    },

    bindEvents() {
        const { input, saveLink } = this.elements;

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

        // Global functions for inline usage (deleteNote)
        // Note: Ideally we delegate events, but keeping it simple for now to match index.html style
        window.deleteNote = (i) => this.deleteNote(i);
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
            this.notes = Store.delete(i);
            this.render();
        }
    },

    handleEdit(e) {
        const i = parseInt(e.target.dataset.index);
        const newText = e.target.textContent.trim();
        const currentText = this.notes[i].text;

        if (newText && newText !== currentText) {
            this.notes = Store.update(i, newText);
            this.render();
        } else if (!newText) {
            // Re-render if empty to restore or delete? 
            // Original logic just re-rendered.
            this.render();
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
            <button class="note-delete" onclick="deleteNote(${i})" title="Löschen">✕</button>
          </div>
          <div class="note-text" contenteditable="true" data-index="${i}">${Utils.escapeHtml(note.text)}</div>
        </div>`).join("");

        // Attach listeners to new elements
        document.querySelectorAll(".note-text").forEach((el) => {
            let orig = el.textContent;
            el.addEventListener("input", () =>
                el.classList.toggle("editing", el.textContent.trim() !== orig.trim())
            );
            el.addEventListener("focus", () => (orig = el.textContent));
            el.addEventListener("blur", (e) => this.handleEdit(e));
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

        // Heuristic: Check if text contains URL
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
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
};

// Start the app
App.init();
