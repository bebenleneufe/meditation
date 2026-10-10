// A longer exhale than inhale is the classic cue for calming the nervous system.
export const DEFAULT_BREATHING_PATTERN = Object.freeze([
  { label: 'Inspirez', seconds: 4, isExpanded: true, tone: null },
  { label: 'Expirez', seconds: 6, isExpanded: false, tone: null },
]);

export const BREATHING_MODES = Object.freeze({
  paced: 'paced',
  ambient: 'ambient',
});

export class BreathingGuide {
  #circleElement;
  #labelElement;
  #onPhaseChange;
  #mode = null;
  #pattern = DEFAULT_BREATHING_PATTERN;
  #phaseIndex = 0;
  #phaseTimeoutId = null;

  constructor({ circleElement, labelElement, onPhaseChange = () => {} }) {
    this.#circleElement = circleElement;
    this.#labelElement = labelElement;
    this.#onPhaseChange = onPhaseChange;
  }

  start(mode, pattern = DEFAULT_BREATHING_PATTERN) {
    this.stop();
    this.#mode = mode;
    if (mode === BREATHING_MODES.ambient) {
      // In guided sessions the voice leads the breath; a slow, wordless pulse
      // keeps the screen alive without competing with the instructions.
      this.#circleElement.classList.add('is-ambient');
      return;
    }
    this.#pattern = pattern;
    this.#phaseIndex = 0;
    this.#applyCurrentPhase();
  }

  pause() {
    this.#clearPhaseTimeout();
    this.#circleElement.classList.add('is-paused');
    if (this.#mode === BREATHING_MODES.paced) {
      this.#labelElement.textContent = 'En pause';
    }
  }

  // A paced exercise restarts its cycle from the inhale: resuming mid-hold would be disorienting.
  resume() {
    this.#circleElement.classList.remove('is-paused');
    if (this.#mode === BREATHING_MODES.paced) {
      this.#clearPhaseTimeout();
      this.#phaseIndex = 0;
      this.#applyCurrentPhase();
    }
  }

  stop() {
    this.#clearPhaseTimeout();
    this.#mode = null;
    this.#circleElement.classList.remove('is-expanded', 'is-ambient', 'is-paused');
    this.#labelElement.textContent = '';
  }

  #applyCurrentPhase() {
    const currentPhase = this.#pattern[this.#phaseIndex];
    const durationMs = currentPhase.seconds * 1000;
    this.#circleElement.style.setProperty('--phase-duration', `${durationMs}ms`);
    this.#circleElement.classList.toggle('is-expanded', currentPhase.isExpanded);
    this.#labelElement.textContent = currentPhase.label;
    this.#onPhaseChange(currentPhase);

    this.#phaseTimeoutId = setTimeout(() => {
      this.#phaseIndex = (this.#phaseIndex + 1) % this.#pattern.length;
      this.#applyCurrentPhase();
    }, durationMs);
  }

  #clearPhaseTimeout() {
    clearTimeout(this.#phaseTimeoutId);
    this.#phaseTimeoutId = null;
  }
}
