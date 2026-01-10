package main

import (
	"embed"
	"log"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
)

//go:embed index.html style.css script.js sw.js manifest.webmanifest icon.svg icon-192.png icon-512.png icon-maskable-192.png icon-maskable-512.png screenshot-desktop.png screenshot-mobile.png
var staticFiles embed.FS

func main() {
	app := pocketbase.New()

	log.Println("Starting Note App with PocketBase...")

	// Serve embedded static files
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Serve static files on all routes
		se.Router.GET("/{path...}", func(e *core.RequestEvent) error {
			path := e.Request.PathValue("path")

			// Handle root
			if path == "" {
				path = "index.html"
			}

			// Try to read the file
			data, err := staticFiles.ReadFile(path)
			if err != nil {
				// Try with .html extension
				if !strings.HasSuffix(path, ".html") {
					data, err = staticFiles.ReadFile(path + ".html")
					if err != nil {
						// File not found, serve index.html for SPA routing
						data, err = staticFiles.ReadFile("index.html")
						if err != nil {
							return e.NotFoundError("", nil)
						}
					}
				} else {
					return e.NotFoundError("", nil)
				}
			}

			// Determine content type
			contentType := getContentType(path)
			return e.Blob(http.StatusOK, contentType, data)
		})

		return se.Next()
	})

	log.Println("=" + strings.Repeat("=", 70))
	log.Println("📝  Note App Instructions:")
	log.Println("=" + strings.Repeat("=", 70))
	log.Println("1. Visit the admin UI to create collections and users:")
	log.Println("   http://127.0.0.1:8090/_/")
	log.Println("")
	log.Println("2. Create the 'notes' collection with these fields:")
	log.Println("   - clientId (Plain text, required) - for client-side sync")
	log.Println("   - text (Plain text, required)")
	log.Println("   - time (Date, required) - better for editing in PocketBase UI")
	log.Println("   - edited (Bool, optional)")
	log.Println("   - user (Relation to users, required)")
	log.Println("")
	log.Println("3. Set all API rules to: @request.auth.id != ''")
	log.Println("")
	log.Println("4. Create a user:")
	log.Println("   Email: user@note.local")
	log.Println("   Password: notesapp2026")
	log.Println("   Mark as 'Verified'")
	log.Println("")
	log.Println("5. Visit the app:")
	log.Println("   http://127.0.0.1:8090")
	log.Println("=" + strings.Repeat("=", 70))

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func getContentType(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".html":
		return "text/html; charset=utf-8"
	case ".css":
		return "text/css; charset=utf-8"
	case ".js":
		return "application/javascript; charset=utf-8"
	case ".json", ".webmanifest":
		return "application/json; charset=utf-8"
	case ".svg":
		return "image/svg+xml"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".woff":
		return "font/woff"
	case ".woff2":
		return "font/woff2"
	default:
		return "application/octet-stream"
	}
}
