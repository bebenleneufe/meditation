import { MeditationTimer } from './timer.js';
import { Bell } from './bell.js';
import { BreathingGuide } from './breathing.js';
import { SessionHistory } from './history.js';
import { ScreenWakeLock } from './wake-lock.js';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from './preferences.js';
import { describeDuration, formatClock } from './format.js';

const MINIMUM_RECORDED_SECONDS = 60;
const END_BELL_STRIKES = 3;
const INTERVAL_BELL_VOLUME = 0.35;

function requireElement(rootElement, selector) {
  const element = rootElement.querySelector(selector);
  if (element === null) {
    throw new Error(`Élément introuvable : ${selector}`);
  }
  return element;
}

class MeditationApp {
  #elements;
  #timer;
  #breathingGuide;
  #bell = new Bell();
  #history = new SessionHistory();
  #wakeLock = new ScreenWakeLock();
  #listenersController = new AbortController();
  #activeSession = null;

  constructor(rootElement) {
    this.#elements = {
      views: rootElement.querySelectorAll('[data-view]'),
      setupForm: requireElement(rootElement, '[data-setup-form]'),
      clock: requireElement(rootElement, '[data-clock]'),
      pauseButton: requireElement(rootElement, '[data-pause-button]'),
      stopButton: requireElement(rootElement, '[data-stop-button]'),
      backButton: requireElement(rootElement, '[data-back-button]'),
      doneMessage: requireElement(rootElement, '[data-done-message]'),
      sessionsStat: requireElement(rootElement, '[data-stat="sessions"]'),
      minutesStat: requireElement(rootElement, '[data-stat="minutes"]'),
      streakStat: requireElement(rootElement, '[data-stat="streak"]'),
    };
    this.#timer = new MeditationTimer({
      onTick: (progress) => this.#handleTick(progress),
      onComplete: () => this.#handleComplete(),
    });
    this.#breathingGuide = new BreathingGuide({
      circleElement: requireElement(rootElement, '[data-breath-circle]'),
      labelElement: requireElement(rootElement, '[data-breath-label]'),
    });
  }

  init() {
    this.#applyPreferencesToForm(loadPreferences());
    this.#renderStats();
    this.#bindEvents();
  }

  destroy() {
    this.#listenersController.abort();
    this.#timer.stop();
    this.#breathingGuide.stop();
    this.#wakeLock.release();
    this.#bell.dispose();
  }

  #bindEvents() {
    const { signal } = this.#listenersController;
    const { setupForm, pauseButton, stopButton, backButton } = this.#elements;

    setupForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#startSession();
    }, { signal });
    setupForm.addEventListener('change', () => savePreferences(this.#readFormPreferences()), { signal });
    pauseButton.addEventListener('click', () => this.#togglePause(), { signal });
    stopButton.addEventListener('click', () => this.#stopSessionEarly(), { signal });
    backButton.addEventListener('click', () => this.#showView('setup'), { signal });
    document.addEventListener('keydown', (event) => this.#handleKeydown(event), { signal });
    document.addEventListener('visibilitychange', () => this.#handleVisibilityChange(), { signal });
  }

  #readFormPreferences() {
    const formData = new FormData(this.#elements.setupForm);
    const durationMinutes = Number(formData.get('duration'));
    return {
      durationMinutes: durationMinutes > 0 ? durationMinutes : DEFAULT_PREFERENCES.durationMinutes,
      intervalMinutes: Number(formData.get('interval')) || 0,
      breathingGuideEnabled: formData.get('breathingGuide') !== null,
    };
  }

  #applyPreferencesToForm(preferences) {
    const formControls = this.#elements.setupForm.elements;
    formControls.namedItem('duration').value = String(preferences.durationMinutes);
    formControls.namedItem('interval').value = String(preferences.intervalMinutes);
    formControls.namedItem('breathingGuide').checked = preferences.breathingGuideEnabled;
  }

  async #startSession() {
    try {
      const preferences = this.#readFormPreferences();
      const intervalSeconds = preferences.intervalMinutes * 60;
      this.#activeSession = {
        durationSeconds: preferences.durationMinutes * 60,
        intervalSeconds,
        nextIntervalBellAtSeconds: intervalSeconds > 0 ? intervalSeconds : null,
        breathingGuideEnabled: preferences.breathingGuideEnabled,
      };

      await this.#bell.unlock();
      this.#bell.ring();
      this.#showView('session');
      this.#renderPausedState(false);
      if (preferences.breathingGuideEnabled) {
        this.#breathingGuide.start();
      }
      this.#timer.start(this.#activeSession.durationSeconds * 1000);
      await this.#wakeLock.acquire();
    } catch (error) {
      console.error('Impossible de démarrer la séance.', error);
      this.#activeSession = null;
      this.#showView('setup');
    }
  }

  #handleTick({ remainingSeconds, elapsedSeconds }) {
    this.#elements.clock.textContent = formatClock(remainingSeconds);
    this.#ringIntervalBellIfDue(remainingSeconds, elapsedSeconds);
  }

  // Compared with ">=" rather than "===" because a throttled background tab
  // can skip whole seconds; an exact match would silently miss bells.
  #ringIntervalBellIfDue(remainingSeconds, elapsedSeconds) {
    const session = this.#activeSession;
    if (session === null || session.nextIntervalBellAtSeconds === null || remainingSeconds <= 0) {
      return;
    }
    if (elapsedSeconds >= session.nextIntervalBellAtSeconds) {
      this.#bell.ring({ volume: INTERVAL_BELL_VOLUME });
      session.nextIntervalBellAtSeconds += session.intervalSeconds;
    }
  }

  #handleComplete() {
    if (this.#activeSession === null) {
      return;
    }
    this.#bell.ring({ strikes: END_BELL_STRIKES });
    this.#finishSession(this.#activeSession.durationSeconds);
  }

  #stopSessionEarly() {
    if (this.#activeSession === null) {
      return;
    }
    const meditatedSeconds = this.#timer.elapsedSeconds;
    this.#timer.stop();
    this.#finishSession(meditatedSeconds);
  }

  #finishSession(meditatedSeconds) {
    this.#breathingGuide.stop();
    this.#wakeLock.release();
    this.#activeSession = null;

    const isRecorded = meditatedSeconds >= MINIMUM_RECORDED_SECONDS;
    if (isRecorded) {
      this.#history.record(meditatedSeconds);
      this.#renderStats();
    }
    this.#elements.doneMessage.textContent = isRecorded
      ? `Vous avez médité ${describeDuration(meditatedSeconds)}. Prenez un instant avant de reprendre votre journée.`
      : "Séance de moins d'une minute : elle n'a pas été enregistrée.";
    this.#showView('done');
  }

  #togglePause() {
    if (this.#activeSession === null) {
      return;
    }
    if (this.#timer.isRunning) {
      this.#timer.pause();
      if (this.#activeSession.breathingGuideEnabled) {
        this.#breathingGuide.pause();
      }
      this.#wakeLock.release();
      this.#renderPausedState(true);
      return;
    }
    this.#timer.resume();
    if (this.#activeSession.breathingGuideEnabled) {
      this.#breathingGuide.resume();
    }
    this.#wakeLock.acquire();
    this.#renderPausedState(false);
  }

  #handleKeydown(event) {
    if (this.#activeSession === null) {
      return;
    }
    // A focused button already reacts to Space natively; handling it here too would toggle twice.
    if (event.key === ' ' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      this.#togglePause();
    } else if (event.key === 'Escape') {
      this.#stopSessionEarly();
    }
  }

  // The browser drops the wake lock whenever the page is hidden; it must be re-requested on return.
  #handleVisibilityChange() {
    if (document.visibilityState === 'visible' && this.#activeSession !== null && this.#timer.isRunning) {
      this.#wakeLock.acquire();
    }
  }

  #renderPausedState(isPaused) {
    this.#elements.pauseButton.textContent = isPaused ? 'Reprendre' : 'Pause';
    this.#elements.clock.classList.toggle('is-paused', isPaused);
  }

  #renderStats() {
    const { totalSessions, totalMinutes, streakDays } = this.#history.getStats();
    this.#elements.sessionsStat.textContent = String(totalSessions);
    this.#elements.minutesStat.textContent = String(totalMinutes);
    this.#elements.streakStat.textContent = String(streakDays);
  }

  #showView(viewName) {
    for (const viewElement of this.#elements.views) {
      viewElement.hidden = viewElement.dataset.view !== viewName;
    }
  }
}

try {
  const meditationApp = new MeditationApp(requireElement(document, '[data-app]'));
  meditationApp.init();
  window.addEventListener('pagehide', (event) => {
    // A page kept in the back/forward cache will be shown again as-is, so it must stay alive.
    if (!event.persisted) {
      meditationApp.destroy();
    }
  });
} catch (error) {
  console.error("L'application n'a pas pu démarrer.", error);
}
