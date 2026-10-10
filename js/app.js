import { MeditationTimer } from './timer.js';
import { Bell } from './bell.js';
import { BREATHING_MODES, BreathingGuide } from './breathing.js';
import { GuidedScript } from './guided-script.js';
import { Narrator } from './narrator.js';
import { SessionHistory } from './history.js';
import { ScreenWakeLock } from './wake-lock.js';
import { ALL_MEDITATIONS, FREE_MEDITATION_ID, findMeditation } from './meditations.js';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences } from './preferences.js';
import { describeDuration, formatClock } from './format.js';

const MINIMUM_RECORDED_SECONDS = 60;
const END_BELL_STRIKES = 3;
const INTERVAL_BELL_VOLUME = 0.35;
const VOICE_PREVIEW_TEXT = 'Bonjour. Installez-vous confortablement, et prenez une grande inspiration.';

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
  #breathingGuide;
  #narrator = null;
  #bell = new Bell();
  #history = new SessionHistory();
  #wakeLock = new ScreenWakeLock();
  #listenersController = new AbortController();
  #activeSession = null;
  #preferredVoiceName = null;

  constructor(rootElement, optionTemplate) {
    this.#elements = {
      optionTemplate,
      views: rootElement.querySelectorAll('[data-view]'),
      setupForm: requireElement(rootElement, '[data-setup-form]'),
      meditationList: requireElement(rootElement, '[data-meditation-list]'),
      guidedOptions: requireElement(rootElement, '[data-guided-options]'),
      freeOptions: requireElement(rootElement, '[data-free-options]'),
      voicePicker: requireElement(rootElement, '[data-voice-picker]'),
      voiceSelect: requireElement(rootElement, '[data-voice-select]'),
      voicePreviewButton: requireElement(rootElement, '[data-voice-preview]'),
      voiceUnavailableNote: requireElement(rootElement, '[data-voice-unavailable]'),
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
    this.#renderMeditationOptions();
    const preferences = loadPreferences();
    this.#preferredVoiceName = preferences.voiceName;
    this.#applyPreferencesToForm(preferences);
    // Created after preferences are applied: its voice list callback needs the saved voice.
    this.#narrator = new Narrator({ onVoicesChanged: () => this.#renderVoiceOptions() });
    this.#renderVoiceOptions();
    this.#renderStats();
    this.#bindEvents();
  }

  destroy() {
    this.#listenersController.abort();
    this.#timer.stop();
    this.#breathingGuide.stop();
    this.#narrator?.dispose();
    this.#wakeLock.release();
    this.#bell.dispose();
  }

  #bindEvents() {
    const { signal } = this.#listenersController;
    const { setupForm, voicePreviewButton, pauseButton, stopButton, backButton } = this.#elements;

    setupForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.#startSession();
    }, { signal });
    setupForm.addEventListener('change', () => this.#handleSetupChange(), { signal });
    voicePreviewButton.addEventListener('click', () => this.#previewVoice(), { signal });
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

  #renderVoiceOptions() {
    const { voiceSelect, voiceUnavailableNote } = this.#elements;
    const voiceOptions = this.#narrator.voiceOptions;

    const fragment = document.createDocumentFragment();
    for (const { name, label } of voiceOptions) {
      const optionElement = document.createElement('option');
      optionElement.value = name;
      optionElement.textContent = label;
      fragment.append(optionElement);
    }
    voiceSelect.replaceChildren(fragment);

    const isPreferredVoiceAvailable = voiceOptions.some((option) => option.name === this.#preferredVoiceName);
    const selectedVoiceName = isPreferredVoiceAvailable ? this.#preferredVoiceName : this.#narrator.recommendedVoiceName;
    if (selectedVoiceName !== null) {
      voiceSelect.value = selectedVoiceName;
      this.#narrator.selectVoice(selectedVoiceName);
    }
    voiceUnavailableNote.hidden = this.#narrator.hasFrenchVoice;
    this.#renderOptionGroups();
  }

  #renderOptionGroups() {
    const { guidedOptions, freeOptions, voicePicker, setupForm } = this.#elements;
    const isFreeMeditation = this.#readSelectedMeditation().id === FREE_MEDITATION_ID;
    const isVoiceEnabled = setupForm.elements.namedItem('voiceEnabled').checked;
    guidedOptions.hidden = isFreeMeditation;
    freeOptions.hidden = !isFreeMeditation;
    voicePicker.hidden = !isVoiceEnabled || this.#narrator === null || !this.#narrator.hasFrenchVoice;
  }

  #handleSetupChange() {
    const preferences = this.#readFormPreferences();
    if (preferences.voiceName !== null) {
      this.#preferredVoiceName = preferences.voiceName;
      this.#narrator.selectVoice(preferences.voiceName);
    }
    savePreferences(preferences);
    this.#renderOptionGroups();
  }

  #previewVoice() {
    this.#narrator.silence();
    this.#narrator.speak(VOICE_PREVIEW_TEXT);
  }

  #readSelectedMeditation() {
    const selectedMeditationId = new FormData(this.#elements.setupForm).get('meditation');
    return findMeditation(selectedMeditationId) ?? findMeditation(DEFAULT_PREFERENCES.meditationId);
  }

  #readFormPreferences() {
    const formData = new FormData(this.#elements.setupForm);
    const durationMinutes = Number(formData.get('duration'));
    const selectedVoiceName = formData.get('voiceName');
    return {
      meditationId: this.#readSelectedMeditation().id,
      durationMinutes: durationMinutes > 0 ? durationMinutes : DEFAULT_PREFERENCES.durationMinutes,
      intervalMinutes: Number(formData.get('interval')) || 0,
      breathingGuideEnabled: formData.get('breathingGuide') !== null,
      voiceEnabled: formData.get('voiceEnabled') !== null,
      // A device without French voices has an empty list; keep the voice chosen on another visit.
      voiceName: selectedVoiceName || this.#preferredVoiceName,
    };
  }

  #applyPreferencesToForm(preferences) {
    const formControls = this.#elements.setupForm.elements;
    formControls.namedItem('meditation').value = preferences.meditationId;
    formControls.namedItem('duration').value = String(preferences.durationMinutes);
    formControls.namedItem('interval').value = String(preferences.intervalMinutes);
    formControls.namedItem('breathingGuide').checked = preferences.breathingGuideEnabled;
    formControls.namedItem('voiceEnabled').checked = preferences.voiceEnabled;
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
      isVoiceEnabled: isGuided && preferences.voiceEnabled,
    };
  }

  async #startSession() {
    try {
      const session = this.#createSession(this.#readSelectedMeditation(), this.#readFormPreferences());
      this.#activeSession = session;

      // Must run before the first await: iOS only unlocks speech inside the user gesture itself.
      if (session.isVoiceEnabled) {
        this.#narrator.unlock();
      }
      await this.#bell.unlock();
      this.#bell.ring();

      this.#elements.sessionTitle.textContent = session.meditation.title;
      this.#elements.cue.textContent = '';
      this.#showView('session');
      this.#renderPausedState(false);
      if (session.breathingMode !== null) {
        this.#breathingGuide.start(session.breathingMode);
      }
      this.#timer.start(session.durationSeconds * 1000);
      await this.#wakeLock.acquire();
    } catch (error) {
      console.error('Impossible de démarrer la séance.', error);
      this.#activeSession = null;
      this.#showView('setup');
    }
  }

  #handleTick({ remainingSeconds, elapsedSeconds }) {
    this.#elements.clock.textContent = formatClock(remainingSeconds);
    this.#presentDueCue(elapsedSeconds);
    this.#ringIntervalBellIfDue(remainingSeconds, elapsedSeconds);
  }

  #presentDueCue(elapsedSeconds) {
    const session = this.#activeSession;
    const dueCue = session?.script?.takeLatestDueCue(elapsedSeconds) ?? null;
    if (dueCue === null) {
      return;
    }
    this.#elements.cue.textContent = dueCue.text;
    if (session.isVoiceEnabled) {
      this.#narrator.speak(dueCue.text);
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
    this.#narrator.silence();
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
    const session = this.#activeSession;
    if (session === null) {
      return;
    }
    if (this.#timer.isRunning) {
      this.#timer.pause();
      this.#narrator.silence();
      this.#breathingGuide.pause();
      this.#wakeLock.release();
      this.#renderPausedState(true);
      return;
    }
    this.#timer.resume();
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
