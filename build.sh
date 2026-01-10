#!/bin/bash
# Build script for note app with PocketBase

set -e

echo "Building note app..."

# Build for current platform
go build -o note

echo "✓ Build complete: ./note"
echo ""
echo "To run:"
echo "  ./note serve"
echo ""
echo "First-time setup - see detailed instructions when you run ./note serve"
echo "Quick summary:"
echo "  1. Create admin account at /_/"
echo "  2. Create 'notes' collection (see console for schema)"
echo "  3. Create user: user@note.local / notesapp2026"
echo "  4. Open app and check browser console for sync logs"
