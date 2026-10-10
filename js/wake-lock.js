// Keeps the screen on during a session: on mobile, a sleeping screen
// suspends audio and the final bell would never ring.
export class ScreenWakeLock {
  #sentinel = null;

  get isSupported() {
    return 'wakeLock' in navigator;
  }

  async acquire() {
    if (!this.isSupported || this.#sentinel !== null) {
      return;
    }
    try {
      this.#sentinel = await navigator.wakeLock.request('screen');
      this.#sentinel.addEventListener('release', () => {
        this.#sentinel = null;
      }, { once: true });
    } catch (error) {
      console.warn("Impossible de garder l'écran allumé.", error);
    }
  }

  async release() {
    const currentSentinel = this.#sentinel;
    this.#sentinel = null;
    try {
      await currentSentinel?.release();
    } catch (error) {
      console.warn("Libération du verrou d'écran impossible.", error);
    }
  }
}
