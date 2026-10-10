// The Web Speech API does not expose a voice's gender, so male voices are
// recognised by the names that the main platforms give them.
const KNOWN_MALE_VOICE_NAMES = new Set([
  'thomas', 'nicolas', 'daniel', 'henri', 'remy', 'alain', 'claude', 'jerome',
  'maurice', 'yves', 'paul', 'guillaume', 'antoine', 'jean', 'fabrice', 'gerard',
  'frd',
]);
const HIGH_QUALITY_MARKERS = new Set(['natural', 'online', 'premium', 'enhanced', 'neural']);

// Slower and slightly lower than default: the target is a calm, grounded delivery.
const SPEECH_RATE = 0.82;
const SPEECH_PITCH = 0.9;

function tokenizeVoiceName(voiceName) {
  return voiceName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((token) => token !== '');
}

function isLikelyMaleVoice(voice) {
  return tokenizeVoiceName(voice.name).some((token) => KNOWN_MALE_VOICE_NAMES.has(token));
}

function scoreVoice(voice) {
  const nameTokens = tokenizeVoiceName(voice.name);
  let score = 0;
  if (nameTokens.some((token) => KNOWN_MALE_VOICE_NAMES.has(token))) {
    score += 10;
  }
  if (nameTokens.some((token) => HIGH_QUALITY_MARKERS.has(token))) {
    score += 3;
  }
  if (voice.lang.toLowerCase().replace('_', '-') === 'fr-fr') {
    score += 1;
  }
  return score;
}

export class Narrator {
  #synthesis = 'speechSynthesis' in window ? window.speechSynthesis : null;
  #frenchVoices = [];
  #selectedVoice = null;
  #onVoicesChanged;
  #listenersController = new AbortController();

  constructor({ onVoicesChanged }) {
    this.#onVoicesChanged = onVoicesChanged;
    if (this.#synthesis === null) {
      return;
    }
    // Voices load asynchronously on most browsers; the first getVoices() call is often empty.
    this.#synthesis.addEventListener('voiceschanged', () => {
      this.#loadVoices();
      this.#onVoicesChanged();
    }, { signal: this.#listenersController.signal });
    this.#loadVoices();
  }

  get isSupported() {
    return this.#synthesis !== null;
  }

  get voiceOptions() {
    return this.#frenchVoices.map((voice) => ({
      name: voice.name,
      label: isLikelyMaleVoice(voice) ? `${voice.name} (voix d'homme)` : voice.name,
    }));
  }

  get recommendedVoiceName() {
    const [bestVoice] = [...this.#frenchVoices].sort((first, second) => scoreVoice(second) - scoreVoice(first));
    return bestVoice?.name ?? null;
  }

  selectVoice(voiceName) {
    this.#selectedVoice = this.#frenchVoices.find((voice) => voice.name === voiceName) ?? null;
  }

  // iOS only allows speech that starts inside a user gesture; speaking an empty
  // utterance from the click handler unlocks it for the rest of the session.
  unlock() {
    try {
      this.#synthesis?.speak(new SpeechSynthesisUtterance(''));
    } catch (error) {
      console.warn('Déblocage de la voix impossible.', error);
    }
  }

  get hasFrenchVoice() {
    return this.#frenchVoices.length > 0;
  }

  // Without a French voice the browser would fall back to its default one,
  // usually English, and mangle the instructions: subtitles are better than that.
  speak(text) {
    if (this.#synthesis === null || this.#selectedVoice === null) {
      return;
    }
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.#selectedVoice.lang;
      utterance.voice = this.#selectedVoice;
      utterance.rate = SPEECH_RATE;
      utterance.pitch = SPEECH_PITCH;
      this.#synthesis.speak(utterance);
    } catch (error) {
      console.warn('Lecture vocale impossible, les consignes restent affichées.', error);
    }
  }

  silence() {
    this.#synthesis?.cancel();
  }

  dispose() {
    this.silence();
    this.#listenersController.abort();
  }

  #loadVoices() {
    const previousVoiceName = this.#selectedVoice?.name ?? null;
    this.#frenchVoices = this.#synthesis
      .getVoices()
      .filter((voice) => voice.lang.toLowerCase().startsWith('fr'));
    this.selectVoice(previousVoiceName ?? this.recommendedVoiceName);
  }
}
