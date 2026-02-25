const CACHE_NAME = 'metronom-v2';

const AUDIO_FILES = [
  '/audio/intro.wav', '/audio/outro.wav', '/audio/melody.wav',
  '/audio/verse.wav', '/audio/chorus.wav', '/audio/bridge.wav',
  '/audio/silence.wav', '/audio/stop.wav', '/audio/start.wav',
  '/audio/1.wav', '/audio/2.wav', '/audio/3.wav',
  '/audio/4.wav', '/audio/5.wav', '/audio/6.wav',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/', ...AUDIO_FILES]))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (event.request.url.startsWith('http')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
