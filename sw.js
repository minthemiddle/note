const CACHE_NAME = "notizen-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Handle POST requests from Web Share Target
  if (event.request.method === "POST") {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData();
        const title = formData.get("title");
        const text = formData.get("text");
        const url = formData.get("url");
        const files = formData.getAll("files");

        const payload = { title, text, url, files: [] };

        // Process files if present
        if (files && files.length > 0) {
          for (const file of files) {
            if (file.size > 0) {
              // Convert file to data URL for storage
              const reader = new FileReader();
              const filePromise = new Promise((resolve) => {
                reader.onload = () => {
                  payload.files.push({
                    name: file.name,
                    type: file.type,
                    url: reader.result,
                  });
                  resolve();
                };
                reader.readAsDataURL(file);
              });
              await filePromise;
            }
          }
        }

        // Get all clients and send the shared data
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        // Send to the focused client or the first available client
        const client =
          clients.find((c) => c.focused) || clients.find((c) => c.url === "/") || clients[0];

        if (client) {
          client.postMessage({
            type: "shared-data",
            payload: payload,
          });
        }

        // Redirect to home
        return Response.redirect("/", 303);
      })()
    );
  } else {
    // For GET requests, just pass through
    event.respondWith(fetch(event.request));
  }
});
