// Service worker khusus web push pengingat booking. Sengaja tanpa cache dan
// tanpa handler fetch: tugasnya hanya menampilkan notifikasi.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Payload bukan JSON: pakai judul cadangan.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Pengingat booking", {
      body: data.body,
      icon: "/brand/marky-192.png",
      tag: data.tag,
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (!url) return;
  // Hanya buka tautan di origin sendiri, apa pun isi payload-nya.
  let target;
  try {
    target = new URL(url, self.location.origin);
  } catch {
    return;
  }
  if (target.origin !== self.location.origin) return;
  event.waitUntil(clients.openWindow(target.href));
});
