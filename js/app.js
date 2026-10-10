import { MeditationTimer } from './timer.js';
import { AudioTrackPlayer } from './audio-track.js';
import { AMBIENCES, AmbiencePlayer, NO_AMBIENCE_ID } from './ambience.js';
import { Bell } from './bell.js';
import { BREATHING_MODES, BreathingGuide, DEFAULT_BREATHING_PATTERN } from './breathing.js';
import { GuidedScript } from './guided-script.js';
import { SessionHistory } from './history.js';
import { ScreenWakeLock } from './wake-lock.js';
import { buildDailyReminderCalendar, downloadCalendarFile, isValidReminderTime } from './reminder.js';
import { ACCESSORIES, findNewlyUnlockedBadges, listUnlockedAccessories } from './achievements.js';
import { ProgressView, createBadgeIcon } from './progress-view.js';
import { ALL_MEDITATIONS, CATEGORIES, FREE_MEDITATION_ID, audioTrackPath, findMeditation } from './meditations.js';
import { AMBIENCE_AFTER_CHOICES, DEFAULT_PREFERENCES, loadPreferences, savePreferences } from './preferences.js';
import { describeDuration, formatClock } from './format.js';

const MINIMUM_RECORDED_SECONDS = 60;
const END_BELL_STRIKES = 3;
const INTERVAL_BELL_VOLUME = 0.35;
// The closing bells ring for several seconds; the music fades out underneath them.
const AMBIENCE_FADE_ON_COMPLETE_SECONDS = 8;
const AMBIENCE_FADE_ON_STOP_SECONDS = 1.5;
// After a sleep timer, the music dims over a long stretch so the silence never startles.
const AMBIENCE_SLEEP_FADE_SECONDS = 30;
const CLOCK_TIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

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

function greetingForHour(hour) {
  if (hour < 5 || hour >= 18) {
    return 'Bonsoir';
  }
  return hour < 12 ? 'Bonjour' : 'Bon après-midi';
}

class MeditationApp {
  #elements;
  #timer;
  #audioTrack;
  #breathingGuide;
  #bell = new Bell();
  #ambience;
  #history = new SessionHistory();
  #wakeLock = new ScreenWakeLock();
  #listenersController = new AbortController();
  #activeSession = null;
  #progressView;
  #wornAccessory = null;

  constructor(rootElement, optionTemplate) {
    this.#elements = {
      optionTemplate,
      views: rootElement.querySelectorAll('[data-view]'),
      sessionView: requireElement(rootElement, '[data-view="session"]'),
      doneView: requireElement(rootElement, '[data-view="done"]'),
      greeting: requireElement(rootElement, '[data-greeting]'),
      openProgressButton: requireElement(rootElement, '[data-open-progress]'),
      progressBackButton: requireElement(rootElement, '[data-progress-back]'),
      newBadges: requireElement(rootElement, '[data-new-badges]'),
      linger: requireElement(rootElement, '[data-linger]'),
      lingerText: requireElement(rootElement, '[data-linger-text]'),
      lingerStopButton: requireElement(rootElement, '[data-linger-stop]'),
      ambienceAfterField: requireElement(rootElement, '[data-ambience-after-field]'),
      accessoryUses: rootElement.querySelectorAll('[data-accessory-use]'),
      startDetail: requireElement(rootElement, '[data-start-detail]'),
      progressRing: requireElement(rootElement, '[data-progress-ring]'),
      setupForm: requireElement(rootElement, '[data-setup-form]'),
      meditationList: requireElement(rootElement, '[data-meditation-list]'),
      freeOptions: requireElement(rootElement, '[data-free-options]'),
      ambienceList: requireElement(rootElement, '[data-ambience-list]'),
      ambienceVolumeField: requireElement(rootElement, '[data-ambience-volume-field]'),
      ambienceToggle: requireElement(rootElement, '[data-ambience-toggle]'),
      reminderButton: requireElement(rootElement, '[data-reminder-button]'),
      reminderStatus: requireElement(rootElement, '[data-reminder-status]'),
      sessionTitle: requireElement(rootElement, '[data-session-title]'),
      cue: requireElement(rootElement, '[data-cue]'),
      clock: requireElement(rootElement, '[data-clock]'),
      pauseButton: requireElement(rootElement, '[data-pause-button]'),
      stopButton: requireElement(rootElement, '[data-stop-button]'),
      backButton: requireElement(rootElement, '[data-back-button]'),
      doneTitle: requireElement(rootElement, '[data-done-title]'),
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
    this.#ambience = new AmbiencePlayer({ onLingerEnd: () => this.#renderLinger(null) });
    this.#audioTrack = new AudioTrackPlayer(sessionCallbacks);
    this.#breathingGuide = new BreathingGuide({
      circleElement: requireElement(rootElement, '[data-breath-circle]'),
      labelElement: requireElement(rootElement, '[data-breath-label]'),
      onPhaseChange: (phase) => this.#handleBreathingPhase(phase),
    });
    this.#progressView = new ProgressView({
      rootElement: requireElement(rootElement, '[data-view="progress"]'),
      onToggleAccessory: (accessoryId) => this.#toggleAccessory(accessoryId),
    });
  }

  init() {
    this.#elements.greeting.textContent = greetingForHour(new Date().getHours());
    this.#renderMeditationOptions();
    this.#renderAmbienceOptions();
    const preferences = loadPreferences();
    this.#applyPreferencesToForm(preferences);
    const unlockedAccessories = listUnlockedAccessories(this.#history.getStats());
    this.#wornAccessory = unlockedAccessories.includes(preferences.wornAccessory) ? preferences.wornAccessory : null;
    this.#renderWornAccessory();
    this.#renderOptionGroups();
    this.#renderStats();
    this.#bindEvents();
  }

  destroy() {
    this.#listenersController.abort();
    this.#timer.stop();
    this.#audioTrack.stop();
    this.#breathingGuide.stop();
    this.#progressView.destroy();
    this.#wakeLock.release();
    this.#bell.dispose();
    this.#ambience.dispose();
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
    this.#elements.ambienceToggle.addEventListener('click', () => this.#toggleAmbienceMute(), { signal });
    this.#elements.reminderButton.addEventListener('click', () => this.#exportDailyReminder(), { signal });
    backButton.addEventListener('click', () => this.#showView('setup'), { signal });
    this.#elements.openProgressButton.addEventListener('click', () => this.#openProgress(), { signal });
    this.#elements.lingerStopButton.addEventListener('click', () => this.#stopLingeringMusic(), { signal });
    this.#elements.progressBackButton.addEventListener('click', () => this.#showView('setup'), { signal });
    document.addEventListener('keydown', (event) => this.#handleKeydown(event), { signal });
    document.addEventListener('visibilitychange', () => this.#handleVisibilityChange(), { signal });
  }

  #renderMeditationOptions() {
    const fragment = document.createDocumentFragment();
    for (const category of CATEGORIES) {
      const sectionElement = document.createElement('section');
      const titleElement = document.createElement('h3');
      const gridElement = document.createElement('div');
      sectionElement.className = 'category';
      titleElement.className = 'category__title';
      titleElement.textContent = category.title;
      gridElement.className = 'meditation-grid';
      for (const meditation of ALL_MEDITATIONS.filter((candidate) => candidate.category === category.id)) {
        gridElement.append(this.#createMeditationCard(meditation));
      }
      sectionElement.append(titleElement, gridElement);
      fragment.append(sectionElement);
    }
    this.#elements.meditationList.replaceChildren(fragment);
  }

  #createMeditationCard(meditation) {
    const cardElement = this.#elements.optionTemplate.content.firstElementChild.cloneNode(true);
    cardElement.dataset.color = meditation.color;
    requireElement(cardElement, 'input').value = meditation.id;
    requireElement(cardElement, '.meditation-card__title').textContent = meditation.title;
    requireElement(cardElement, '.meditation-card__duration').textContent = describeMeditationLength(meditation);
    requireElement(cardElement, '.meditation-card__summary').textContent = meditation.summary;
    return cardElement;
  }

  #renderAmbienceOptions() {
    const fragment = document.createDocumentFragment();
    for (const ambience of AMBIENCES) {
      const chipElement = document.createElement('label');
      const inputElement = document.createElement('input');
      const textElement = document.createElement('span');
      chipElement.className = 'chip';
      inputElement.type = 'radio';
      inputElement.name = 'ambience';
      inputElement.value = ambience.id;
      textElement.textContent = ambience.label;
      chipElement.append(inputElement, textElement);
      fragment.append(chipElement);
    }
    this.#elements.ambienceList.replaceChildren(fragment);
  }

  #renderOptionGroups() {
    const selectedMeditation = this.#readSelectedMeditation();
    const isFreeMeditation = selectedMeditation.id === FREE_MEDITATION_ID;
    const durationLabel = isFreeMeditation
      ? `${this.#readFormPreferences().durationMinutes} min`
      : describeMeditationLength(selectedMeditation);
    this.#elements.freeOptions.hidden = !isFreeMeditation;
    const hasAmbience = this.#readFormPreferences().ambienceId !== NO_AMBIENCE_ID;
    this.#elements.ambienceVolumeField.hidden = !hasAmbience;
    this.#elements.ambienceAfterField.hidden = !hasAmbience;
    this.#elements.startDetail.textContent = `${selectedMeditation.title} · ${durationLabel}`;
  }

  #handleSetupChange() {
    this.#savePreferences();
    this.#renderOptionGroups();
  }

  // Some preferences live outside the form (the worn accessory), so both sources are merged.
  #savePreferences() {
    savePreferences({ ...this.#readFormPreferences(), wornAccessory: this.#wornAccessory });
  }

  #openProgress() {
    this.#progressView.render(this.#history.getStats(), this.#wornAccessory);
    this.#showView('progress');
    window.scrollTo({ top: 0 });
  }

  #toggleAccessory(accessoryId) {
    const stats = this.#history.getStats();
    if (!listUnlockedAccessories(stats).includes(accessoryId)) {
      return;
    }
    this.#wornAccessory = this.#wornAccessory === accessoryId ? null : accessoryId;
    this.#savePreferences();
    this.#renderWornAccessory();
    this.#progressView.render(stats, this.#wornAccessory);
  }

  #renderWornAccessory() {
    for (const useElement of this.#elements.accessoryUses) {
      useElement.setAttribute('href', this.#wornAccessory === null ? '' : `#accessory-${this.#wornAccessory}`);
      // SVG elements have no "hidden" property: the attribute itself must be toggled.
      useElement.parentElement.toggleAttribute('hidden', this.#wornAccessory === null);
    }
  }

  #renderNewBadges(newBadges) {
    const fragment = document.createDocumentFragment();
    for (const badge of newBadges) {
      const badgeElement = document.createElement('div');
      const textElement = document.createElement('span');
      const titleElement = document.createElement('span');
      badgeElement.className = 'new-badge';
      textElement.className = 'new-badge__text';
      titleElement.className = 'new-badge__title';
      titleElement.textContent = `Nouveau badge : ${badge.title}`;
      textElement.append(titleElement, badge.accessory === undefined
        ? badge.description
        : `${badge.description} La mascotte porte maintenant : ${ACCESSORIES[badge.accessory].toLowerCase()}.`);
      badgeElement.append(createBadgeIcon(badge), textElement);
      fragment.append(badgeElement);
    }
    this.#elements.newBadges.replaceChildren(fragment);
    this.#elements.newBadges.hidden = newBadges.length === 0;
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
      ambienceId: formData.get('ambience') ?? DEFAULT_PREFERENCES.ambienceId,
      ambienceVolume: Number(formData.get('ambienceVolume')) || DEFAULT_PREFERENCES.ambienceVolume,
      ambienceAfterMinutes: AMBIENCE_AFTER_CHOICES.includes(Number(formData.get('ambienceAfterMinutes')))
        ? Number(formData.get('ambienceAfterMinutes'))
        : DEFAULT_PREFERENCES.ambienceAfterMinutes,
      reminderTime: isValidReminderTime(formData.get('reminderTime'))
        ? formData.get('reminderTime')
        : DEFAULT_PREFERENCES.reminderTime,
    };
  }

  #applyPreferencesToForm(preferences) {
    const formControls = this.#elements.setupForm.elements;
    formControls.namedItem('meditation').value = preferences.meditationId;
    formControls.namedItem('duration').value = String(preferences.durationMinutes);
    formControls.namedItem('interval').value = String(preferences.intervalMinutes);
    formControls.namedItem('breathingGuide').checked = preferences.breathingGuideEnabled;
    formControls.namedItem('ambience').value = preferences.ambienceId;
    formControls.namedItem('ambienceVolume').value = String(preferences.ambienceVolume);
    formControls.namedItem('ambienceAfterMinutes').value = String(preferences.ambienceAfterMinutes);
    formControls.namedItem('reminderTime').value = preferences.reminderTime;
  }

  #createSession(meditation, preferences) {
    const isGuided = meditation.kind === 'guided';
    const isBreathingExercise = meditation.kind === 'breathing';
    const isFree = meditation.kind === 'free';
    const durationMinutes = isFree ? preferences.durationMinutes : meditation.durationMinutes;
    const intervalSeconds = isFree ? preferences.intervalMinutes * 60 : 0;
    let breathingMode = null;
    if (isGuided) {
      breathingMode = BREATHING_MODES.ambient;
    } else if (isBreathingExercise || preferences.breathingGuideEnabled) {
      breathingMode = BREATHING_MODES.paced;
    }
    return {
      meditation,
      durationSeconds: durationMinutes * 60,
      intervalSeconds,
      nextIntervalBellAtSeconds: intervalSeconds > 0 ? intervalSeconds : null,
      breathingMode,
      breathingPattern: isBreathingExercise ? meditation.pattern : DEFAULT_BREATHING_PATTERN,
      playsBreathTones: isBreathingExercise,
      script: isGuided ? new GuidedScript(meditation.cues) : null,
      usesAudioTrack: isGuided,
      ambienceAfterSeconds: preferences.ambienceAfterMinutes * 60,
    };
  }

  #handleBreathingPhase(phase) {
    if (this.#activeSession?.playsBreathTones && phase.tone !== null) {
      this.#bell.playBreathTone(phase.tone);
    }
  }

  #activeClock() {
    return this.#activeSession?.usesAudioTrack ? this.#audioTrack : this.#timer;
  }

  async #startSession() {
    this.#timer.stop();
    this.#audioTrack.stop();
    const preferences = this.#readFormPreferences();
    const session = this.#createSession(this.#readSelectedMeditation(), preferences);
    this.#activeSession = session;

    // Started before the first await: browsers only allow playback inside the click itself.
    const trackPlayback = session.usesAudioTrack
      ? this.#audioTrack.start(audioTrackPath(session.meditation), session.durationSeconds)
      : null;
    this.#ambience.start(preferences.ambienceId, preferences.ambienceVolume);
    this.#renderLinger(null);
    this.#renderAmbienceToggle();

    try {
      await this.#bell.unlock();
      this.#elements.sessionView.dataset.color = session.meditation.color;
      this.#elements.doneView.dataset.color = session.meditation.color;
      this.#elements.sessionTitle.textContent = session.meditation.title;
      this.#elements.cue.textContent = '';
      this.#elements.clock.textContent = formatClock(session.durationSeconds);
      this.#renderProgress(0);
      this.#showView('session');
      this.#renderPausedState(false);
      if (session.breathingMode !== null) {
        this.#breathingGuide.start(session.breathingMode, session.breathingPattern);
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
    if (this.#activeSession !== null) {
      this.#renderProgress(Math.min(1, elapsedSeconds / this.#activeSession.durationSeconds));
    }
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
    this.#releaseAmbience(session, AMBIENCE_FADE_ON_COMPLETE_SECONDS);
    this.#finishSession(session.durationSeconds);
  }

  #stopSessionEarly() {
    if (this.#activeSession === null) {
      return;
    }
    const clock = this.#activeClock();
    const meditatedSeconds = clock.elapsedSeconds;
    clock.stop();
    this.#releaseAmbience(this.#activeSession, AMBIENCE_FADE_ON_STOP_SECONDS);
    this.#finishSession(meditatedSeconds);
  }

  #finishSession(meditatedSeconds) {
    const { meditation } = this.#activeSession;
    this.#breathingGuide.stop();
    this.#wakeLock.release();
    this.#activeSession = null;

    const isRecorded = meditatedSeconds >= MINIMUM_RECORDED_SECONDS;
    let newBadges = [];
    if (isRecorded) {
      const statsBefore = this.#history.getStats();
      this.#history.record({ durationSeconds: meditatedSeconds, meditationId: meditation.id });
      newBadges = findNewlyUnlockedBadges(statsBefore, this.#history.getStats());
      this.#wearNewestAccessory(newBadges);
      this.#renderStats();
    }
    this.#renderNewBadges(newBadges);
    // A sleep session must not end on bouncing confetti: the screen stays still and dim.
    const isSleepSession = meditation.category === 'sommeil';
    this.#elements.doneView.classList.toggle('is-quiet', isSleepSession);
    this.#elements.doneTitle.textContent = this.#describeDoneTitle(isRecorded, isSleepSession);
    this.#elements.doneMessage.textContent = isRecorded
      ? `« ${meditation.title} » : ${describeDuration(meditatedSeconds)} de pratique.`
      : "Séance de moins d'une minute : elle n'a pas été enregistrée.";
    this.#showView('done');
  }

  // A freshly earned accessory is put on straight away: seeing it is the reward.
  #wearNewestAccessory(newBadges) {
    const newestAccessory = newBadges.filter((badge) => badge.accessory !== undefined).at(-1)?.accessory;
    if (newestAccessory !== undefined) {
      this.#wornAccessory = newestAccessory;
      this.#savePreferences();
      this.#renderWornAccessory();
    }
  }

  #describeDoneTitle(isRecorded, isSleepSession) {
    if (isSleepSession) {
      return 'Bonne nuit';
    }
    return isRecorded ? 'Bravo !' : 'À bientôt';
  }

  #togglePause() {
    if (this.#activeSession === null) {
      return;
    }
    const clock = this.#activeClock();
    if (clock.isRunning) {
      clock.pause();
      this.#ambience.pause();
      this.#breathingGuide.pause();
      this.#wakeLock.release();
      this.#renderPausedState(true);
      return;
    }
    clock.resume();
    this.#ambience.resume();
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
    } else if (event.key === 'm' || event.key === 'M') {
      this.#toggleAmbienceMute();
    }
  }

  // The browser drops the wake lock whenever the page is hidden; it must be re-requested on return.
  #handleVisibilityChange() {
    if (document.visibilityState === 'visible' && this.#activeSession !== null && this.#activeClock().isRunning) {
      this.#wakeLock.acquire();
    }
  }

  #exportDailyReminder() {
    try {
      const { reminderTime } = this.#readFormPreferences();
      const appUrl = new URL('./', window.location.href).href;
      downloadCalendarFile(buildDailyReminderCalendar({ reminderTime, appUrl }), 'rappel-meditation.ics');
      this.#elements.reminderStatus.textContent =
        `Rappel de ${reminderTime} prêt : ouvrez le fichier « rappel-meditation.ics » pour l'ajouter à votre agenda.`;
    } catch (error) {
      console.error('Création du rappel impossible.', error);
      this.#elements.reminderStatus.textContent = "Le rappel n'a pas pu être créé. Réessayez, ou ajoutez-le à la main dans votre agenda.";
    }
  }

  #releaseAmbience(session, fadeSeconds) {
    if (!this.#ambience.isPlaying || session.ambienceAfterSeconds === 0) {
      this.#ambience.stop({ fadeSeconds });
      return;
    }
    this.#ambience.stop({ fadeSeconds: AMBIENCE_SLEEP_FADE_SECONDS, delaySeconds: session.ambienceAfterSeconds });
    const endTime = new Date(Date.now() + (session.ambienceAfterSeconds + AMBIENCE_SLEEP_FADE_SECONDS) * 1000);
    this.#renderLinger(endTime);
  }

  #stopLingeringMusic() {
    this.#ambience.stopLingering({ fadeSeconds: AMBIENCE_FADE_ON_STOP_SECONDS });
    this.#renderLinger(null);
  }

  #renderLinger(endTime) {
    this.#elements.linger.hidden = endTime === null;
    this.#elements.lingerText.textContent = endTime === null
      ? ''
      : `La musique continue jusqu'à ${CLOCK_TIME_FORMATTER.format(endTime)} environ.`;
  }

  #toggleAmbienceMute() {
    if (!this.#ambience.isPlaying) {
      return;
    }
    this.#ambience.toggleMute();
    this.#renderAmbienceToggle();
  }

  #renderAmbienceToggle() {
    const { ambienceToggle } = this.#elements;
    ambienceToggle.hidden = !this.#ambience.isPlaying;
    ambienceToggle.textContent = this.#ambience.isMuted ? 'Remettre la musique' : 'Couper la musique';
    ambienceToggle.setAttribute('aria-pressed', String(this.#ambience.isMuted));
  }

  #renderProgress(completedFraction) {
    this.#elements.progressRing.style.setProperty('--progress', completedFraction.toFixed(4));
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

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (error) {
    // Expected in sandboxed previews; the app simply runs without offline support there.
    console.info('Mode hors ligne indisponible ici.', error);
  }
}

try {
  const meditationApp = new MeditationApp(
    requireElement(document, '[data-app]'),
    requireElement(document, '[data-meditation-option-template]'),
  );
  meditationApp.init();
  registerServiceWorker();
  window.addEventListener('pagehide', (event) => {
    // A page kept in the back/forward cache will be shown again as-is, so it must stay alive.
    if (!event.persisted) {
      meditationApp.destroy();
    }
  });
} catch (error) {
  console.error("L'application n'a pas pu démarrer.", error);
}
