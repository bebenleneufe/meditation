// Guided sessions are driven by the audio track's own clock rather than a timer:
// the track keeps playing when the phone locks, and subtitles stay in sync with
// the voice even if the file buffered for a moment.
export class AudioTrackPlayer {
  #audioElement = new Audio();
  #onTick;
  #onComplete;
  #durationSeconds = 0;
  #lastReportedSecond = null;
  #hasCompleted = false;
  #trackListenersController = null;

  constructor({ onTick, onComplete }) {
    this.#onTick = onTick;
    this.#onComplete = onComplete;
    this.#audioElement.preload = 'auto';
  }

  get isRunning() {
    return this.#trackListenersController !== null && !this.#audioElement.paused;
  }

  get elapsedSeconds() {
    return Math.floor(this.#audioElement.currentTime);
  }

  // Returns play()'s promise untouched: the caller must invoke this synchronously
  // inside the click handler (autoplay rules), then await it to detect failure.
  start(trackPath, durationSeconds) {
    this.stop();
    this.#durationSeconds = durationSeconds;
    this.#lastReportedSecond = null;
    this.#hasCompleted = false;
    this.#trackListenersController = new AbortController();
    const { signal } = this.#trackListenersController;
    this.#audioElement.addEventListener('timeupdate', () => this.#handleTimeUpdate(), { signal });
    this.#audioElement.addEventListener('ended', () => this.#complete(), { signal });
    this.#audioElement.src = trackPath;
    return this.#audioElement.play();
  }

  pause() {
    this.#audioElement.pause();
  }

  async resume() {
    try {
      await this.#audioElement.play();
    } catch (error) {
      console.warn('Reprise de la piste audio impossible.', error);
    }
  }

  stop() {
    this.#trackListenersController?.abort();
    this.#trackListenersController = null;
    this.#audioElement.pause();
    // Dropping the source releases the buffered file instead of keeping it in memory.
    this.#audioElement.removeAttribute('src');
    this.#audioElement.load();
  }

  #handleTimeUpdate() {
    const elapsedSeconds = this.elapsedSeconds;
    if (elapsedSeconds !== this.#lastReportedSecond) {
      this.#lastReportedSecond = elapsedSeconds;
      this.#onTick({
        elapsedSeconds,
        remainingSeconds: Math.max(0, this.#durationSeconds - elapsedSeconds),
      });
    }
    // The session ends when the closing bells start, not when the file ends:
    // the bells then ring out while the end screen is shown.
    if (elapsedSeconds >= this.#durationSeconds) {
      this.#complete();
    }
  }

  #complete() {
    if (this.#hasCompleted) {
      return;
    }
    this.#hasCompleted = true;
    this.#onComplete();
  }
}
