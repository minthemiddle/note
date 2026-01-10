# Note App - PocketBase Setup Guide

This app is a local-first PWA with PocketBase backend for multi-device sync.

## Architecture

- **Frontend**: Pure HTML/CSS/JS PWA (no build step)
- **Backend**: PocketBase (Go binary with embedded frontend)
- **Storage**: Local-first with background sync to PocketBase
- **Conflict Resolution**: Server wins
- **Authentication**: Auto-login with single user

## Quick Start

### 1. Build the Binary

```bash
./build.sh
```

This creates a single `note` executable containing both frontend and backend.

### 2. First Run - Initialize Database

```bash
./note serve
```

This starts the server on `http://127.0.0.1:8090`

### 3. Create Admin Account

1. Visit `http://127.0.0.1:8090/_/`
2. Create admin account (for managing PocketBase)
3. Keep these credentials safe!

### 4. Create Notes Collection

In the PocketBase admin UI:

1. Click "New collection"
2. Name it: `notes`
3. Type: "Base collection"
4. Add these fields:
   - **clientId** (Plain text, Required) - for client-side sync tracking
   - **text** (Plain text, Required)
   - **time** (Date, Required) - readable timestamps in PocketBase UI
   - **edited** (Bool, Optional)
   - **user** (Relation, Required)
     - Collection: users
     - Max select: 1
     - Cascade delete: Yes

5. Set API Rules (all 5 tabs):
   ```
   @request.auth.id != ''
   ```
   (This ensures only authenticated users can access their own notes)

6. Save the collection

### 5. Create App User

In the PocketBase admin UI:

1. Go to "Users" collection
2. Click "New record"
3. Fill in:
   - Email: `user@note.local`
   - Password: `notesapp2026`
   - Username: `user`
   - Check "Verified"
4. Save

**Important**: These credentials must match the values in `script.js` (lines 8-9).

### 6. Use the App

Visit `http://127.0.0.1:8090` - the app will auto-login and sync!

Open browser console (F12) to see detailed sync debugging logs.

## Deployment to VPS

### Option 1: Systemd Service (Recommended)

1. Build for Linux (if building on Mac):
   ```bash
   GOOS=linux GOARCH=amd64 go build -o note-linux
   ```

2. Upload to server:
   ```bash
   scp note-linux user@yourserver.com:/opt/note/
   ```

3. Create systemd service `/etc/systemd/system/note.service`:
   ```ini
   [Unit]
   Description=Note App
   After=network.target

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/opt/note
   ExecStart=/opt/note/note-linux serve --http=0.0.0.0:8090
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

4. Enable and start:
   ```bash
   sudo systemctl enable note
   sudo systemctl start note
   ```

### Option 2: Reverse Proxy (nginx)

Create nginx config `/etc/nginx/sites-available/note`:

```nginx
server {
    listen 80;
    server_name notes.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload nginx:
```bash
sudo ln -s /etc/nginx/sites-available/note /etc/nginx/sites-enabled/
sudo systemctl reload nginx
```

### Option 3: Add SSL with Certbot

```bash
sudo certbot --nginx -d notes.yourdomain.com
```

## Environment Variables

You can customize PocketBase behavior:

```bash
# Change port
./note serve --http=127.0.0.1:3000

# Custom data directory
./note serve --dir=/custom/path/pb_data

# Enable debug logs
./note serve --dev
```

## Multi-Device Sync

Once deployed:

1. Visit your server URL on any device
2. App auto-authenticates
3. Notes sync in background
4. Works offline, syncs when online
5. Server version always wins conflicts

## Security Notes

1. **Change default password**: Edit `script.js` lines 8-9 and update user in PocketBase admin
2. **Use HTTPS in production**: Set up SSL via nginx + certbot
3. **Admin UI**: Access via `yourserver.com/_/` (create strong admin password)
4. **Firewall**: Only expose port 80/443, not 8090 directly

## File Structure

```
note/
├── main.go                 # PocketBase server with embedded files
├── go.mod                  # Go dependencies
├── pb_migrations/          # Database migrations
├── pb_data/               # Database (gitignored)
├── index.html             # PWA frontend
├── script.js              # App logic + sync
├── style.css              # Styles
├── sw.js                  # Service worker
├── manifest.webmanifest   # PWA manifest
├── icon*.png              # App icons
└── build.sh               # Build script
```

## Troubleshooting

### "Login failed. Have you created the user in PocketBase?"

**Solution:**
1. Open PocketBase admin UI: `http://127.0.0.1:8090/_/`
2. Go to "Users" collection
3. Create user with **exact** credentials:
   - Email: `user@note.local`
   - Password: `notesapp2026`
   - Check "Verified" checkbox
4. Refresh the app

### "Cannot pull: auth record missing"

**Solution:**
- Clear browser cache and cookies
- Reload the page
- Check console - you should see login attempt
- Verify user exists in PocketBase admin

### "Collection not found" or 404 errors

**Solution:**
1. Check PocketBase admin UI
2. Verify "notes" collection exists with exact fields:
   - `clientId` (Plain text, required)
   - `text` (Plain text, required)
   - `time` (Date, required)
   - `edited` (Bool, optional)
   - `user` (Relation to users, required)
3. Check API Rules are set to: `@request.auth.id != ''`
4. Refresh the app

### Notes not appearing in database

**Check browser console for:**
- `✓ Note created on server:` - means sync worked
- `❌ Failed to push to server:` - means sync failed

**Common causes:**
- Notes collection doesn't exist → create it via admin UI
- API rules too restrictive → set to `@request.auth.id != ''`
- User not authenticated → check user exists and credentials match

### Sync not working?
- Open browser console (F12)
- Look for `[Note Sync]` messages
- Check for red `❌` error messages
- Verify user credentials match in PocketBase admin and `script.js`
- Check network tab for failed API requests

### Can't access admin UI?
- Make sure you're visiting `http://yourserver:8090/_/` with trailing slash
- Check if port 8090 is accessible (firewall rules)

### Start fresh
```bash
# Delete database and rebuild
rm -rf pb_data/
./note serve
# Then redo steps 3-6
```

## Development

To modify the app:

1. Edit frontend files (`index.html`, `script.js`, `style.css`, etc.)
2. Rebuild: `./build.sh`
3. Restart server: `Ctrl+C` then `./note serve`

Frontend files are embedded at build time, so you must rebuild after changes.

## Backup

Backup the `pb_data/` directory regularly:

```bash
tar -czf note-backup-$(date +%Y%m%d).tar.gz pb_data/
```

## License

MIT
