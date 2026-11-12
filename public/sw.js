/* Service worker: nhận và hiển thị thông báo đẩy, xử lý nút trên thông báo */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Sổ Sức Khỏe", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Sổ Sức Khỏe";
  const opts = {
    body: data.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: data.tag,
    data: { url: data.url || "/", key: data.key, sig: data.sig },
  };
  if (data.urgent) {
    // Nhắc thuốc / huyết áp: nằm lì đến khi bấm, rung dài, kêu lại khi nhắc lần nữa
    opts.requireInteraction = true;
    opts.renotify = !!data.tag;
    opts.vibrate = [400, 200, 400, 200, 400, 200, 800];
  }
  if (Array.isArray(data.actions)) opts.actions = data.actions.slice(0, 2);
  event.waitUntil(self.registration.showNotification(title, opts));
});

function openUrl(url) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const w of wins) {
      if ("focus" in w) {
        w.navigate(url);
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  });
}

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const d = n.data || {};
  n.close();
  if ((event.action === "done" || event.action === "snooze") && d.key && d.sig) {
    event.waitUntil(
      fetch("/api/reminders/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: d.key, sig: d.sig, action: event.action }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((j) =>
          self.registration.showNotification(event.action === "done" ? "✅ Đã ghi nhận" : "⏰ Sẽ nhắc lại sau khoảng 10 phút", {
            body: j && j.label ? j.label : "",
            icon: "/icon.svg",
            badge: "/icon.svg",
            tag: "ack",
          }),
        )
        .catch(() => openUrl(d.url || "/")),
    );
    return;
  }
  event.waitUntil(openUrl(d.url || "/"));
});
