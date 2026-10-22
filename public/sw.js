self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Finance", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Finance", {
      body: payload.body || "",
      icon: payload.icon || "/icon-192x192.png",
      badge: "/icon-192x192.png",
      data: { url: payload.url || "/overview" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = new URL(event.notification.data?.url || "/overview", self.location.origin);
  const url = requestedUrl.origin === self.location.origin ? requestedUrl.href : "/overview";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url === url);
      return existing ? existing.focus() : self.clients.openWindow(url);
    }),
  );
});
