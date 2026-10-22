// Garde l'appli disponible hors ligne. Changer VERSION à chaque mise à jour des fichiers.
const VERSION = "forme-v2";
const FILES = ["./", "index.html", "styles.css", "manifest.webmanifest", "icon.svg", "data/aliments-perso.js", "data/ciqual.js",
  "js/db.js", "js/calc.js", "js/foods.js", "js/app.js", "lib/xlsx.full.min.js"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  if (new URL(e.request.url).origin !== location.origin) return;   // Open Food Facts : toujours en ligne
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
