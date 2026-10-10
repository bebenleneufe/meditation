import { MeditationTimer } from './timer.js';
import { AudioTrackPlayer } from './audio-track.js';
import { Bell } from './bell.js';
import { BREATHING_MODES, BreathingGuide } from './breathing.js';
import { GuidedScript } from './guided-script.js';
import { SessionHistory } from './history.js';
import { ScreenWakeLock } from './wake-lock.js';
import { ALL_MEDITATIONS, FREE_MEDITATION_ID, audioTrackPath, findMeditation } from './meditations.js';
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

function describeMeditationLength(meditation) {
  return meditation.durationMinutes === null ? 'durée au choix' : `${meditation.durationMinutes} min`;
}

class MeditationApp {
  #elements;
  #timer;
  #audioTrack;
  #breathingGuide;
  #bell = new Bell();
  #history = new SessionHistory();
  #wakeLock = new ScreenWakeLock();
  #listenersController = new AbortController();
  #activeSession = null;

  constructor(rootElement, optionTemplate) {
    this.#elements = {
      optionTemplate,
      views: rootElement.querySelectorAll('[data-view]'),
      setupForm: requireElement(rootElement, '[data-setup-form]'),
      meditationList: requireElement(rootElement, '[data-meditation-list]'),
      freeOptions: requireElement(rootElement, '[data-free-options]'),
      sessionTitle: requireElement(rootElement, '[data-session-title]'),
      cue: requireElement(rootElement, '[data-cue]'),
      clock: requireElement(rootElement, '[data-clock]'),
      pauseButton: requireElement(rootElement, '[data-pause-button]'),
      stopButton: requireElement(rootElement, '[data-stop-button]'),
      backButton: requireElement(rootElement, '[data-back-button]'),
      doneMessage: requireElement(rootElement, '[data-done-message]'),
      sessionsStat: requireElement(rootElement, '[data-stat="sessions"]'),
      minutesStat: requireElement(rootElement, '[data-stat="minutes"]'),
      streakStat: requireElement(rootElement, '[data-stat="streak"]'),
    };
    const sessionCallbacks = {
      onTick: (progress) => this.#handleTick(progress),
      onComplete: () => this.#handleComplete(),
    };
    this.#timer = new MeditationTimer(sessionCallbacks);
    this.#audioTrack = new AudioTrackPlayer(sessionCallbacks);
    this.#breathingGuide = new BreathingGuide({
      circleElement: requireElement(rootElement, '[data-breath-circle]'),
      labelElement: requireElement(rootElement, '[data-breath-label]'),
    });
  }

  init() {
    this.#renderMeditationOptions();
    this.#applyPreferencesToForm(loadPreferences());
    this.#renderOptionGroups();
    this.#renderStats();
    this.#bindEvents();
  }

  destroy() {
    this.#listenersController.abort();
    this.#timer.stop();
    this.#audioTrack.stop();
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
    setupForm.addEventListener('change', () => this.#handleSetupChange(), { signal });
    pauseButton.addEventListener('click', () => this.#togglePause(), { signal });
    stopButton.addEventListener('click', () => this.#stopSessionEarly(), { signal });
    backButton.addEventListener('click', () => this.#showView('setup'), { signal });
    document.addEventListener('keydown', (event) => this.#handleKeydown(event), { signal });
    document.addEventListener('visibilitychange', () => this.#handleVisibilityChange(), { signal });
  }

  #renderMeditationOptions() {
    const fragment = document.createDocumentFragment();
    for (const meditation of ALL_MEDITATIONS) {
      const optionElement = this.#elements.optionTemplate.content.firstElementChild.cloneNode(true);
      requireElement(optionElement, 'input').value = meditation.id;
      requireElement(optionElement, '.meditation-option__title').textContent = meditation.title;
      requireElement(optionElement, '.meditation-option__duration').textContent = describeMeditationLength(meditation);
      requireElement(optionElement, '.meditation-option__summary').textContent = meditation.summary;
      fragment.append(optionElement);
    }
    this.#elements.meditationList.replaceChildren(fragment);
  }

  #renderOptionGroups() {
    this.#elements.freeOptions.hidden = this.#readSelectedMeditation().id !== FREE_MEDITATION_ID;
  }

  #handleSetupChange() {
    savePreferences(this.#readFormPreferences());
    this.#renderOptionGroups();
  }

  #readSelectedMeditation() {
    const selectedMeditationId = new FormData(this.#elements.setupForm).get('meditation');
    return findMeditation(selectedMeditationId) ?? findMeditation(DEFAULT_PREFERENCES.meditationId);
  }

  #readFormPreferences() {
    const formData = new FormData(this.#elements.setupForm);
    const durationMinutes = Number(formData.get('duration'));
    return {
      meditationId: this.#readSelectedMeditation().id,
      durationMinutes: durationMinutes > 0 ? durationMinutes : DEFAULT_PREFERENCES.durationMinutes,
      intervalMinutes: Number(formData.get('interval')) || 0,
      breathingGuideEnabled: formData.get('breathingGuide') !== null,
    };
  }

  #applyPreferencesToForm(preferences) {
    const formControls = this.#elements.setupForm.elements;
    formControls.namedItem('meditation').value = preferences.meditationId;
    formControls.namedItem('duration').value = String(preferences.durationMinutes);
    formControls.namedItem('interval').value = String(preferences.intervalMinutes);
    formControls.namedItem('breathingGuide').checked = preferences.breathingGuideEnabled;
  }

  #createSession(meditation, preferences) {
    const isGuided = meditation.id !== FREE_MEDITATION_ID;
    const durationMinutes = isGuided ? meditation.durationMinutes : preferences.durationMinutes;
    const intervalSeconds = isGuided ? 0 : preferences.intervalMinutes * 60;
    let breathingMode = null;
    if (isGuided) {
      breathingMode = BREATHING_MODES.ambient;
    } else if (preferences.breathingGuideEnabled) {
      breathingMode = BREATHING_MODES.paced;
    }
    return {
      meditation,
      durationSeconds: durationMinutes * 60,
      intervalSeconds,
      nextIntervalBellAtSeconds: intervalSeconds > 0 ? intervalSeconds : null,
      breathingMode,
      script: isGuided ? new GuidedScript(meditation.cues) : null,
      usesAudioTrack: isGuided,
    };
  }

  #activeClock() {
    return this.#activeSession?.usesAudioTrack ? this.#audioTrack : this.#timer;
  }

  async #startSession() {
    this.#timer.stop();
    this.#audioTrack.stop();
    const session = this.#createSession(this.#readSelectedMeditation(), this.#readFormPreferences());
    this.#activeSession = session;

    // Started before the first await: browsers only allow playback inside the click itself.
    const trackPlayback = session.usesAudioTrack
      ? this.#audioTrack.start(audioTrackPath(session.meditation), session.durationSeconds)
      : null;

    try {
      await this.#bell.unlock();
      this.#elements.sessionTitle.textContent = session.meditation.title;
      this.#elements.cue.textContent = '';
      this.#elements.clock.textContent = formatClock(session.durationSeconds);
      this.#showView('session');
      this.#renderPausedState(false);
      if (session.breathingMode !== null) {
        this.#breathingGuide.start(session.breathingMode);
      }
      await this.#startClock(session, trackPlayback);
      await this.#wakeLock.acquire();
    } catch (error) {
      console.error('Impossible de démarrer la séance.', error);
      this.#breathingGuide.stop();
      this.#activeSession = null;
      this.#showView('setup');
    }
  }

  async #startClock(session, trackPlayback) {
    if (trackPlayback !== null) {
      try {
        await trackPlayback;
        return;
      } catch (error) {
        // Offline or blocked file: the session still works with the written cues and the synthesized bell.
        console.warn('Piste audio indisponible, consignes affichées seulement.', error);
        this.#audioTrack.stop();
        session.usesAudioTrack = false;
      }
    }
    this.#bell.ring();
    this.#timer.start(session.durationSeconds * 1000);
  }

  #handleTick({ remainingSeconds, elapsedSeconds }) {
    this.#elements.clock.textContent = formatClock(remainingSeconds);
    this.#presentDueCue(elapsedSeconds);
    this.#ringIntervalBellIfDue(remainingSeconds, elapsedSeconds);
  }

  #presentDueCue(elapsedSeconds) {
    const dueCue = this.#activeSession?.script?.takeLatestDueCue(elapsedSeconds) ?? null;
    if (dueCue !== null) {
      this.#elements.cue.textContent = dueCue.text;
    }
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
    const session = this.#activeSession;
    if (session === null) {
      return;
    }
    // Audio tracks carry their own closing bells.
    if (!session.usesAudioTrack) {
      this.#bell.ring({ strikes: END_BELL_STRIKES });
    }
    this.#finishSession(session.durationSeconds);
  }

  #stopSessionEarly() {
    if (this.#activeSession === null) {
      return;
    }
    const clock = this.#activeClock();
    const meditatedSeconds = clock.elapsedSeconds;
    clock.stop();
    this.#finishSession(meditatedSeconds);
  }

  #finishSession(meditatedSeconds) {
    const { meditation } = this.#activeSession;
    this.#breathingGuide.stop();
    this.#wakeLock.release();
    this.#activeSession = null;

    const isRecorded = meditatedSeconds >= MINIMUM_RECORDED_SECONDS;
    if (isRecorded) {
      this.#history.record({ durationSeconds: meditatedSeconds, meditationId: meditation.id });
      this.#renderStats();
    }
    this.#elements.doneMessage.textContent = isRecorded
      ? `${meditation.title} : ${describeDuration(meditatedSeconds)} de pratique. Prenez un instant avant de reprendre votre journée.`
      : "Séance de moins d'une minute : elle n'a pas été enregistrée.";
    this.#showView('done');
  }

  #togglePause() {
    if (this.#activeSession === null) {
      return;
    }
    const clock = this.#activeClock();
    if (clock.isRunning) {
      clock.pause();
      this.#breathingGuide.pause();
      this.#wakeLock.release();
      this.#renderPausedState(true);
      return;
    }
    clock.resume();
    this.#breathingGuide.resume();
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
    if (document.visibilityState === 'visible' && this.#activeSession !== null && this.#activeClock().isRunning) {
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
  const meditationApp = new MeditationApp(
    requireElement(document, '[data-app]'),
    requireElement(document, '[data-meditation-option-template]'),
  );
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
