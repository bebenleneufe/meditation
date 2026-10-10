// A longer exhale than inhale is the classic cue for calming the nervous system.
const BREATHING_PHASES = Object.freeze([
  { label: 'Inspirez', durationMs: 4000, isExpanded: true },
  { label: 'Expirez', durationMs: 6000, isExpanded: false },
]);

export class BreathingGuide {
  #circleElement;
  #labelElement;
  #phaseIndex = 0;
  #phaseTimeoutId = null;

  constructor({ circleElement, labelElement }) {
    this.#circleElement = circleElement;
    this.#labelElement = labelElement;
  }

  start() {
    this.stop();
    this.#phaseIndex = 0;
    this.#applyCurrentPhase();
  }

  pause() {
    this.#clearPhaseTimeout();
    this.#labelElement.textContent = 'En pause';
  }

  resume() {
    this.#clearPhaseTimeout();
    this.#applyCurrentPhase();
  }

  stop() {
    this.#clearPhaseTimeout();
    this.#circleElement.classList.remove('is-expanded');
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
