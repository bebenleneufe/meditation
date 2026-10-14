// Must match AUDIO_CACHE in sw.js: the page fills the same cache the service worker reads.
const AUDIO_CACHE_NAME = 'audio-v1';

function toAbsoluteUrl(path) {
  return new URL(path, window.location.href).href;
}

// Keeps every guided track on the phone so sessions work in airplane mode, and
// hands out local blob URLs for cached tracks: playing from memory avoids the
// network and the service worker's ranged responses, which iOS handles poorly offline.
export class OfflineAudioLibrary {
  #trackUrls;
  #onProgress;
  #downloadController = null;

  constructor({ trackPaths, onProgress }) {
    this.#trackUrls = trackPaths.map(toAbsoluteUrl);
    this.#onProgress = onProgress;
  }

  static get isSupported() {
    return 'caches' in window;
  }

  get isDownloading() {
    return this.#downloadController !== null;
  }

  get totalCount() {
    return this.#trackUrls.length;
  }

  async countAvailable() {
    try {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      const matches = await Promise.all(this.#trackUrls.map((trackUrl) => cache.match(trackUrl)));
      return matches.filter((response) => response !== undefined).length;
    } catch (error) {
      console.warn('Lecture du stockage hors ligne impossible.', error);
      return 0;
    }
  }

  // Sequential on purpose: one file at a time keeps the phone responsive and
  // leaves bandwidth for a session that may be starting.
  async downloadMissing() {
    if (this.isDownloading) {
      return;
    }
    this.#downloadController = new AbortController();
    const { signal } = this.#downloadController;
    try {
      await this.#requestPersistentStorage();
      const cache = await caches.open(AUDIO_CACHE_NAME);
      for (const trackUrl of this.#trackUrls) {
        if ((await cache.match(trackUrl)) === undefined) {
          const response = await fetch(trackUrl, { signal });
          if (!response.ok) {
            throw new Error(`${response.status} pour ${trackUrl}`);
          }
          await cache.put(trackUrl, response);
        }
        this.#onProgress({ availableCount: await this.countAvailable(), isDownloading: true });
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.warn('Téléchargement hors ligne interrompu.', error);
      }
    } finally {
      this.#downloadController = null;
      this.#onProgress({ availableCount: await this.countAvailable(), isDownloading: false });
    }
  }

  async createObjectUrl(trackPath) {
    try {
      const cache = await caches.open(AUDIO_CACHE_NAME);
      const cachedResponse = await cache.match(toAbsoluteUrl(trackPath));
      return cachedResponse === undefined ? null : URL.createObjectURL(await cachedResponse.blob());
    } catch (error) {
      console.warn(`Piste hors ligne illisible : ${trackPath}`, error);
      return null;
    }
  }

  dispose() {
    this.#downloadController?.abort();
  }

  // Without this, a browser short on space may silently evict the tracks.
  async #requestPersistentStorage() {
    try {
      await navigator.storage?.persist?.();
    } catch (error) {
      console.info('Stockage persistant refusé.', error);
    }
  }
}
