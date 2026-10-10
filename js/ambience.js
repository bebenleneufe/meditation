// Ambiences are synthesized live rather than streamed from files: an MP3 loop
// always has a small gap at its seam, while oscillators and looped noise never do.

export const NO_AMBIENCE_ID = 'aucune';

export const AMBIENCES = Object.freeze([
  { id: NO_AMBIENCE_ID, label: 'Aucune' },
  { id: 'nappe', label: 'Nappe douce' },
  { id: 'pluie', label: 'Pluie' },
  { id: 'vagues', label: 'Vagues' },
]);

// Calibrated so that, at the default volume, the ambience sits well under the guiding voice.
const MAXIMUM_GAIN = 0.5;
const FADE_IN_SECONDS = 4;
const MUTE_FADE_SECONDS = 0.6;
const NOISE_LOOP_SECONDS = 8;
const REVERB_SECONDS = 4;

// D major with an added ninth, voiced low: open and warm, with no tension to resolve.
const PAD_FREQUENCIES_HZ = Object.freeze([73.42, 110, 146.83, 185, 220, 329.63]);

function createNoiseBuffer(audioContext, { isBrown }) {
  const frameCount = NOISE_LOOP_SECONDS * audioContext.sampleRate;
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const samples = buffer.getChannelData(0);
  let brownValue = 0;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const whiteValue = Math.random() * 2 - 1;
    if (isBrown) {
      // Integrated white noise: energy shifts to the low end, like surf or distant thunder.
      brownValue = (brownValue + 0.02 * whiteValue) / 1.02;
      samples[frameIndex] = brownValue * 3.5;
    } else {
      samples[frameIndex] = whiteValue;
    }
  }
  return buffer;
}

function createLoopingNoise(audioContext, options) {
  const source = audioContext.createBufferSource();
  source.buffer = createNoiseBuffer(audioContext, options);
  source.loop = true;
  return source;
}

function createReverb(audioContext) {
  const frameCount = REVERB_SECONDS * audioContext.sampleRate;
  const impulse = audioContext.createBuffer(2, frameCount, audioContext.sampleRate);
  for (let channelIndex = 0; channelIndex < 2; channelIndex += 1) {
    const samples = impulse.getChannelData(channelIndex);
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      samples[frameIndex] = (Math.random() * 2 - 1) * (1 - frameIndex / frameCount) ** 3;
    }
  }
  const convolver = audioContext.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

// A slow oscillator added onto a gain parameter, so a level drifts instead of staying flat.
function modulate(audioContext, targetParameter, { frequencyHz, depth }) {
  const lowFrequencyOscillator = audioContext.createOscillator();
  const depthGain = audioContext.createGain();
  lowFrequencyOscillator.frequency.value = frequencyHz;
  depthGain.gain.value = depth;
  lowFrequencyOscillator.connect(depthGain).connect(targetParameter);
  return lowFrequencyOscillator;
}

function buildPad(audioContext, output) {
  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1100;
  const reverb = createReverb(audioContext);
  const wetGain = audioContext.createGain();
  wetGain.gain.value = 0.6;
  filter.connect(output);
  filter.connect(reverb).connect(wetGain).connect(output);

  const sources = [];
  PAD_FREQUENCIES_HZ.forEach((frequencyHz, voiceIndex) => {
    const voiceGain = audioContext.createGain();
    voiceGain.gain.value = 0.036;
    voiceGain.connect(filter);
    for (const detuneCents of [-5, 5]) {
      const oscillator = audioContext.createOscillator();
      oscillator.type = voiceIndex % 2 === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequencyHz;
      oscillator.detune.value = detuneCents;
      oscillator.connect(voiceGain);
      sources.push(oscillator);
    }
    // Each note breathes at its own slow rate, so the chord keeps shifting colour.
    sources.push(modulate(audioContext, voiceGain.gain, { frequencyHz: 0.03 + voiceIndex * 0.013, depth: 0.027 }));
  });
  return sources;
}

function buildRain(audioContext, output) {
  const drops = createLoopingNoise(audioContext, { isBrown: false });
  const highpass = audioContext.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 900;
  const lowpass = audioContext.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 5500;
  const dropsGain = audioContext.createGain();
  dropsGain.gain.value = 0.16;
  drops.connect(highpass).connect(lowpass).connect(dropsGain).connect(output);

  const rumble = createLoopingNoise(audioContext, { isBrown: true });
  const rumbleFilter = audioContext.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 450;
  const rumbleGain = audioContext.createGain();
  rumbleGain.gain.value = 0.5;
  rumble.connect(rumbleFilter).connect(rumbleGain).connect(output);

  return [drops, rumble, modulate(audioContext, dropsGain.gain, { frequencyHz: 0.05, depth: 0.04 })];
}

function buildWaves(audioContext, output) {
  const surf = createLoopingNoise(audioContext, { isBrown: true });
  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 650;
  const swellGain = audioContext.createGain();
  swellGain.gain.value = 0.55;
  surf.connect(filter).connect(swellGain).connect(output);

  // Two swell rates that never line up make the surf feel irregular, like a real shore.
  return [
    surf,
    modulate(audioContext, swellGain.gain, { frequencyHz: 0.075, depth: 0.4 }),
    modulate(audioContext, swellGain.gain, { frequencyHz: 0.031, depth: 0.15 }),
    modulate(audioContext, filter.frequency, { frequencyHz: 0.075, depth: 250 }),
  ];
}

export const AMBIENCE_BUILDERS = Object.freeze({
  nappe: buildPad,
  pluie: buildRain,
  vagues: buildWaves,
});

export function isKnownAmbience(ambienceId) {
  return AMBIENCES.some((ambience) => ambience.id === ambienceId);
}

export class AmbiencePlayer {
  #audioContext = null;
  #masterGain = null;
  #sources = [];
  #targetGain = 0;
  #isMuted = false;

  get isPlaying() {
    return this.#sources.length > 0;
  }

  get isMuted() {
    return this.#isMuted;
  }

  // Must be called synchronously from the click that starts the session (autoplay rules).
  start(ambienceId, volume) {
    this.stop({ fadeSeconds: 0 });
    const buildAmbience = AMBIENCE_BUILDERS[ambienceId];
    if (buildAmbience === undefined) {
      return;
    }
    try {
      const audioContext = this.#ensureAudioContext();
      this.#isMuted = false;
      this.#targetGain = Math.min(1, Math.max(0, volume)) * MAXIMUM_GAIN;
      this.#masterGain = audioContext.createGain();
      this.#masterGain.gain.setValueAtTime(0, audioContext.currentTime);
      this.#masterGain.gain.linearRampToValueAtTime(this.#targetGain, audioContext.currentTime + FADE_IN_SECONDS);
      this.#masterGain.connect(audioContext.destination);
      this.#sources = buildAmbience(audioContext, this.#masterGain);
      for (const source of this.#sources) {
        source.start();
      }
    } catch (error) {
      console.warn("Musique d'ambiance indisponible.", error);
      this.#sources = [];
    }
  }

  // Sources are stopped at a scheduled audio time rather than with a timer,
  // so nothing is left to clean up if the page goes away during the fade.
  stop({ fadeSeconds }) {
    if (this.#audioContext === null || this.#masterGain === null) {
      return;
    }
    const stopTime = this.#audioContext.currentTime + fadeSeconds;
    const masterGain = this.#masterGain;
    masterGain.gain.cancelScheduledValues(this.#audioContext.currentTime);
    masterGain.gain.setValueAtTime(masterGain.gain.value, this.#audioContext.currentTime);
    masterGain.gain.linearRampToValueAtTime(0, stopTime);
    for (const source of this.#sources) {
      source.addEventListener('ended', () => source.disconnect(), { once: true });
      source.stop(stopTime);
    }
    const lastSource = this.#sources.at(-1);
    lastSource?.addEventListener('ended', () => masterGain.disconnect(), { once: true });
    this.#sources = [];
    this.#masterGain = null;
  }

  async pause() {
    try {
      await this.#audioContext?.suspend();
    } catch (error) {
      console.warn("Pause de la musique d'ambiance impossible.", error);
    }
  }

  async resume() {
    try {
      await this.#audioContext?.resume();
    } catch (error) {
      console.warn("Reprise de la musique d'ambiance impossible.", error);
    }
  }

  toggleMute() {
    if (this.#audioContext === null || this.#masterGain === null) {
      return;
    }
    this.#isMuted = !this.#isMuted;
    const now = this.#audioContext.currentTime;
    this.#masterGain.gain.cancelScheduledValues(now);
    this.#masterGain.gain.setValueAtTime(this.#masterGain.gain.value, now);
    this.#masterGain.gain.linearRampToValueAtTime(this.#isMuted ? 0 : this.#targetGain, now + MUTE_FADE_SECONDS);
  }

  async dispose() {
    this.stop({ fadeSeconds: 0 });
    try {
      await this.#audioContext?.close();
    } catch (error) {
      console.warn("Fermeture de la musique d'ambiance impossible.", error);
    } finally {
      this.#audioContext = null;
    }
  }

  #ensureAudioContext() {
    if (this.#audioContext === null) {
      this.#audioContext = new AudioContext();
    }
    if (this.#audioContext.state === 'suspended') {
      this.#audioContext.resume().catch((error) => console.warn("Démarrage de l'audio refusé.", error));
    }
    return this.#audioContext;
  }
}
