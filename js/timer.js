const TICK_INTERVAL_MS = 250;

// Remaining time is derived from an end timestamp instead of counting ticks,
// because browsers throttle timers in background tabs and a tick counter would drift.
export class MeditationTimer {
  #onTick;
  #onComplete;
  #durationMs = 0;
  #remainingMs = 0;
  #endTimestamp = 0;
  #intervalId = null;
  #lastReportedSecond = null;

  constructor({ onTick, onComplete }) {
    this.#onTick = onTick;
    this.#onComplete = onComplete;
  }

  get isRunning() {
    return this.#intervalId !== null;
  }

  get elapsedSeconds() {
    const remainingMs = this.isRunning ? this.#computeRemainingMs() : this.#remainingMs;
    return Math.floor((this.#durationMs - remainingMs) / 1000);
  }

  start(durationMs) {
    this.stop();
    this.#durationMs = durationMs;
    this.#remainingMs = durationMs;
    this.#lastReportedSecond = null;
    this.#run();
  }

  pause() {
    if (!this.isRunning) {
      return;
    }
    this.#remainingMs = this.#computeRemainingMs();
    this.#clearInterval();
  }

  resume() {
    if (this.isRunning || this.#remainingMs <= 0) {
      return;
    }
    this.#run();
  }

  stop() {
    if (this.isRunning) {
      this.#remainingMs = this.#computeRemainingMs();
    }
    this.#clearInterval();
  }

  #run() {
    this.#endTimestamp = Date.now() + this.#remainingMs;
    this.#intervalId = setInterval(() => this.#tick(), TICK_INTERVAL_MS);
    this.#tick();
  }

  #tick() {
    const remainingMs = this.#computeRemainingMs();
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    if (remainingSeconds !== this.#lastReportedSecond) {
      this.#lastReportedSecond = remainingSeconds;
      this.#onTick({
        remainingSeconds,
        elapsedSeconds: Math.floor((this.#durationMs - remainingMs) / 1000),
      });
    }

    if (remainingMs <= 0) {
      this.#remainingMs = 0;
      this.#clearInterval();
      this.#onComplete();
    }
  }

  #computeRemainingMs() {
    return Math.max(0, this.#endTimestamp - Date.now());
  }

  #clearInterval() {
    clearInterval(this.#intervalId);
    this.#intervalId = null;
  }
}
