// App files are served network-first so a deploy shows up on the next launch,
// with the cache as the offline fallback. Audio is cached whole after a first
// play, and served from that cache in byte ranges only when offline: iOS refuses
// media without ranges, and Chrome aborts a playback whose ranges mix network
// responses with ones built here, so a single playback never mixes the two.

const SHELL_CACHE = 'shell-v6';
const AUDIO_CACHE = 'audio-v1';
const FONT_CACHE = 'fonts-v1';
const KNOWN_CACHES = new Set([SHELL_CACHE, AUDIO_CACHE, FONT_CACHE]);

const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/achievements.js',
  './js/ambience.js',
  './js/audio-track.js',
  './js/bell.js',
  './js/breathing.js',
  './js/format.js',
  './js/guided-script.js',
  './js/history.js',
  './js/meditations.js',
  './js/offline-audio.js',
  './js/preferences.js',
  './js/progress-view.js',
  './js/reminder.js',
  './js/storage.js',
  './js/timer.js',
  './js/wake-lock.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(removeOutdatedCaches());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  const requestUrl = new URL(request.url);
  if (requestUrl.pathname.endsWith('.mp3')) {
    event.respondWith(serveAudio(event));
  } else if (requestUrl.hostname === 'fonts.googleapis.com' || requestUrl.hostname === 'fonts.gstatic.com') {
    event.respondWith(serveFromCacheFirst(request, FONT_CACHE));
  } else if (requestUrl.origin === self.location.origin) {
    event.respondWith(serveFromNetworkFirst(request));
  }
});

async function precacheShell() {
  try {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES);
    await self.skipWaiting();
  } catch (error) {
    console.warn('Préchargement hors ligne incomplet.', error);
  }
}

async function removeOutdatedCaches() {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter((cacheName) => !KNOWN_CACHES.has(cacheName)).map((cacheName) => caches.delete(cacheName)));
    await self.clients.claim();
  } catch (error) {
    console.warn('Nettoyage des anciens caches impossible.', error);
  }
}

async function serveFromNetworkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request, { ignoreSearch: true });
    if (cachedResponse !== undefined) {
      return cachedResponse;
    }
    throw error;
  }
}

async function serveFromCacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  if (cachedResponse !== undefined) {
    return cachedResponse;
  }
  const networkResponse = await fetch(request);
  if (networkResponse.ok || networkResponse.type === 'opaque') {
    await cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

async function serveAudio(event) {
  const { request } = event;
  const cache = await caches.open(AUDIO_CACHE);
  try {
    const networkResponse = await fetch(request);
    // A ranged response cannot be stored, so the whole file is fetched once on the side.
    event.waitUntil(cacheWholeFileIfMissing(cache, request.url));
    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request.url);
    if (cachedResponse !== undefined) {
      return createRangeResponse(request, cachedResponse);
    }
    throw error;
  }
}

async function cacheWholeFileIfMissing(cache, fileUrl) {
  try {
    if ((await cache.match(fileUrl)) === undefined) {
      await cache.add(fileUrl);
    }
  } catch (error) {
    console.warn(`Mise en cache impossible : ${fileUrl}`, error);
  }
}

async function createRangeResponse(request, fullResponse) {
  const rangeHeader = request.headers.get('range');
  if (rangeHeader === null) {
    return fullResponse;
  }
  const fileBlob = await fullResponse.blob();
  const rangeMatch = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
  if (rangeMatch === null) {
    return new Response(fileBlob, { headers: { 'Content-Type': 'audio/mpeg' } });
  }
  const [, startText, endText] = rangeMatch;
  const isSuffixRange = startText === '' && endText !== '';
  const start = isSuffixRange ? Math.max(0, fileBlob.size - Number(endText)) : Number(startText || 0);
  const end = isSuffixRange || endText === '' ? fileBlob.size - 1 : Math.min(Number(endText), fileBlob.size - 1);
  return new Response(fileBlob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${fileBlob.size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
