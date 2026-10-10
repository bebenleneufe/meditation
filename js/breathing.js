// A longer exhale than inhale is the classic cue for calming the nervous system.
const BREATHING_PHASES = Object.freeze([
  { label: 'Inspirez', durationMs: 4000, isExpanded: true },
  { label: 'Expirez', durationMs: 6000, isExpanded: false },
]);

export const BREATHING_MODES = Object.freeze({
  paced: 'paced',
  ambient: 'ambient',
});

export class BreathingGuide {
  #circleElement;
  #labelElement;
  #mode = null;
  #phaseIndex = 0;
  #phaseTimeoutId = null;

  constructor({ circleElement, labelElement }) {
    this.#circleElement = circleElement;
    this.#labelElement = labelElement;
  }

  start(mode) {
    this.stop();
    this.#mode = mode;
    if (mode === BREATHING_MODES.ambient) {
      // In guided sessions the voice leads the breath; a slow, wordless pulse
      // keeps the screen alive without competing with the instructions.
      this.#circleElement.classList.add('is-ambient');
      return;
    }
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

  resume() {
    this.#circleElement.classList.remove('is-paused');
    if (this.#mode === BREATHING_MODES.paced) {
      this.#clearPhaseTimeout();
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
    const currentPhase = BREATHING_PHASES[this.#phaseIndex];
    this.#circleElement.style.setProperty('--phase-duration', `${currentPhase.durationMs}ms`);
    this.#circleElement.classList.toggle('is-expanded', currentPhase.isExpanded);
    this.#labelElement.textContent = currentPhase.label;

    this.#phaseTimeoutId = setTimeout(() => {
      this.#phaseIndex = (this.#phaseIndex + 1) % BREATHING_PHASES.length;
      this.#applyCurrentPhase();
    }, currentPhase.durationMs);
  }

  #clearPhaseTimeout() {
    clearTimeout(this.#phaseTimeoutId);
    this.#phaseTimeoutId = null;
  }
}
