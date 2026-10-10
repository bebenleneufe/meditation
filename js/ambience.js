// Ambiences are synthesized live rather than streamed from files: an MP3 loop
// always has a small gap at its seam, while oscillators and looped noise never do.

export const NO_AMBIENCE_ID = 'aucune';

export const AMBIENCES = Object.freeze([
  { id: NO_AMBIENCE_ID, label: 'Aucune' },
  { id: 'nappe', label: 'Nappe douce' },
  { id: 'pluie', label: 'Pluie' },
  { id: 'vagues', label: 'Vagues' },
  { id: 'feu', label: 'Feu de cheminée' },
  { id: 'foret', label: 'Forêt' },
  { id: 'bol', label: 'Bol tibétain' },
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

// Fills a mono buffer sample by sample; used for sounds made of discrete events
// (crackles, birdsong, bowl strikes) that are baked once and then looped.
function createGeneratedBuffer(audioContext, seconds, fillSamples) {
  const buffer = audioContext.createBuffer(1, Math.round(seconds * audioContext.sampleRate), audioContext.sampleRate);
  fillSamples(buffer.getChannelData(0), audioContext.sampleRate);
  return buffer;
}

function createLoopingBuffer(audioContext, buffer) {
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

function randomBetween(minimum, maximum) {
  return minimum + Math.random() * (maximum - minimum);
}

function fillCrackles(samples, sampleRate) {
  let cursor = 0;
  while (cursor < samples.length) {
    // Exponential gaps give the irregular rhythm of burning wood.
    cursor += Math.round(-Math.log(1 - Math.random()) * 0.16 * sampleRate);
    const length = Math.round(randomBetween(0.002, 0.012) * sampleRate);
    const amplitude = randomBetween(0.15, 1);
    for (let offset = 0; offset < length && cursor + offset < samples.length; offset += 1) {
      samples[cursor + offset] += (Math.random() * 2 - 1) * amplitude * Math.exp(-6 * offset / length);
    }
  }
}

function fillBirdsong(samples, sampleRate) {
  const totalSeconds = samples.length / sampleRate;
  const callCount = 7;
  for (let callIndex = 0; callIndex < callCount; callIndex += 1) {
    // Calls stay clear of the buffer's end so none is cut at the loop seam.
    let noteStart = randomBetween(0, totalSeconds - 2.5);
    const noteCount = Math.round(randomBetween(2, 6));
    const baseFrequency = randomBetween(2400, 4200);
    for (let noteIndex = 0; noteIndex < noteCount; noteIndex += 1) {
      const noteSeconds = randomBetween(0.05, 0.14);
      const sweepHz = randomBetween(-900, 900);
      const firstSample = Math.round(noteStart * sampleRate);
      const noteLength = Math.round(noteSeconds * sampleRate);
      let phase = 0;
      for (let offset = 0; offset < noteLength; offset += 1) {
        const progress = offset / noteLength;
        phase += 2 * Math.PI * (baseFrequency + sweepHz * progress) / sampleRate;
        samples[firstSample + offset] += 0.3 * Math.sin(Math.PI * progress) * Math.sin(phase);
      }
      noteStart += noteSeconds + randomBetween(0.04, 0.09);
    }
  }
}

const BOWL_STRIKE_PARTIALS = Object.freeze([
  { frequencyRatio: 1, gain: 1, decaySeconds: 9 },
  { frequencyRatio: 2.71, gain: 0.45, decaySeconds: 6 },
  { frequencyRatio: 5.18, gain: 0.2, decaySeconds: 3.5 },
  { frequencyRatio: 8.37, gain: 0.08, decaySeconds: 2 },
]);
const BOWL_FUNDAMENTAL_HZ = 146.83;

function fillBowlStrikes(samples, sampleRate) {
  const totalSeconds = samples.length / sampleRate;
  const longestDecay = BOWL_STRIKE_PARTIALS[0].decaySeconds;
  const strikeTimes = [randomBetween(1, 4), randomBetween(15, 19), randomBetween(29, totalSeconds - longestDecay)];
  for (const strikeTime of strikeTimes) {
    const firstSample = Math.round(strikeTime * sampleRate);
    const strikeLength = Math.round(longestDecay * sampleRate);
    for (let offset = 0; offset < strikeLength && firstSample + offset < samples.length; offset += 1) {
      const seconds = offset / sampleRate;
      const attack = Math.min(1, seconds / 0.01);
      let value = 0;
      for (const partial of BOWL_STRIKE_PARTIALS) {
        value += partial.gain * Math.exp(Math.log(1e-4) * seconds / partial.decaySeconds)
          * Math.sin(2 * Math.PI * BOWL_FUNDAMENTAL_HZ * partial.frequencyRatio * seconds);
      }
      samples[firstSample + offset] += 0.35 * attack * value;
    }
  }
}

function buildFire(audioContext, output) {
  const roar = createLoopingNoise(audioContext, { isBrown: true });
  const roarFilter = audioContext.createBiquadFilter();
  roarFilter.type = 'lowpass';
  roarFilter.frequency.value = 320;
  const roarGain = audioContext.createGain();
  roarGain.gain.value = 0.59;
  roar.connect(roarFilter).connect(roarGain).connect(output);

  const crackles = createLoopingBuffer(audioContext, createGeneratedBuffer(audioContext, 12, fillCrackles));
  const crackleFilter = audioContext.createBiquadFilter();
  crackleFilter.type = 'highpass';
  crackleFilter.frequency.value = 1200;
  const crackleGain = audioContext.createGain();
  crackleGain.gain.value = 0.37;
  crackles.connect(crackleFilter).connect(crackleGain).connect(output);

  return [roar, crackles, modulate(audioContext, roarGain.gain, { frequencyHz: 0.13, depth: 0.08 })];
}

function buildForest(audioContext, output) {
  const wind = createLoopingNoise(audioContext, { isBrown: false });
  const windFilter = audioContext.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 500;
  windFilter.Q.value = 0.6;
  const windGain = audioContext.createGain();
  windGain.gain.value = 0.42;
  wind.connect(windFilter).connect(windGain).connect(output);

  const birds = createLoopingBuffer(audioContext, createGeneratedBuffer(audioContext, 24, fillBirdsong));
  const birdFilter = audioContext.createBiquadFilter();
  birdFilter.type = 'highpass';
  birdFilter.frequency.value = 1500;
  const birdGain = audioContext.createGain();
  birdGain.gain.value = 1;
  const birdReverb = createReverb(audioContext);
  const birdReverbGain = audioContext.createGain();
  birdReverbGain.gain.value = 0.25;
  birds.connect(birdFilter).connect(birdGain).connect(output);
  birdGain.connect(birdReverb).connect(birdReverbGain).connect(output);

  return [
    wind,
    birds,
    modulate(audioContext, windGain.gain, { frequencyHz: 0.05, depth: 0.18 }),
    modulate(audioContext, windFilter.frequency, { frequencyHz: 0.03, depth: 200 }),
  ];
}

function buildBowl(audioContext, output) {
  const reverb = createReverb(audioContext);
  const wetGain = audioContext.createGain();
  wetGain.gain.value = 0.5;
  reverb.connect(wetGain).connect(output);

  const droneGain = audioContext.createGain();
  droneGain.gain.value = 0.08;
  droneGain.connect(output);
  droneGain.connect(reverb);
  const sources = [];
  // Two close frequencies beat slowly against each other, like a bowl still humming.
  for (const frequencyHz of [110, 110.6, 220.4]) {
    const oscillator = audioContext.createOscillator();
    oscillator.frequency.value = frequencyHz;
    oscillator.connect(droneGain);
    sources.push(oscillator);
  }

  const strikes = createLoopingBuffer(audioContext, createGeneratedBuffer(audioContext, 45, fillBowlStrikes));
  const strikeGain = audioContext.createGain();
  strikeGain.gain.value = 0.8;
  strikes.connect(strikeGain).connect(output);
  strikeGain.connect(reverb);
  sources.push(strikes);
  return sources;
}

export const AMBIENCE_BUILDERS = Object.freeze({
  nappe: buildPad,
  pluie: buildRain,
  vagues: buildWaves,
  feu: buildFire,
  foret: buildForest,
  bol: buildBowl,
});

export function isKnownAmbience(ambienceId) {
  return AMBIENCES.some((ambience) => ambience.id === ambienceId);
}

// The music playing for the current session is one "layer". When a sleep timer
// lets the music outlast the session, its layer keeps fading on its own while
// a new session can start a fresh one.
export class AmbiencePlayer {
  #audioContext = null;
  #currentLayer = null;
  #lingeringLayer = null;
  #targetGain = 0;
  #isMuted = false;
  #onLingerEnd;

  constructor({ onLingerEnd = () => {} } = {}) {
    this.#onLingerEnd = onLingerEnd;
  }

  get isPlaying() {
    return this.#currentLayer !== null;
  }

  get isLingering() {
    return this.#lingeringLayer !== null;
  }

  get isMuted() {
    return this.#isMuted;
  }

  // Must be called synchronously from the click that starts the session (autoplay rules).
  start(ambienceId, volume) {
    this.stop({ fadeSeconds: 0 });
    this.stopLingering({ fadeSeconds: 0 });
    const buildAmbience = AMBIENCE_BUILDERS[ambienceId];
    if (buildAmbience === undefined) {
      return;
    }
    try {
      const audioContext = this.#ensureAudioContext();
      this.#isMuted = false;
      this.#targetGain = Math.min(1, Math.max(0, volume)) * MAXIMUM_GAIN;
      const masterGain = audioContext.createGain();
      masterGain.gain.setValueAtTime(0, audioContext.currentTime);
      masterGain.gain.linearRampToValueAtTime(this.#targetGain, audioContext.currentTime + FADE_IN_SECONDS);
      masterGain.connect(audioContext.destination);
      const sources = buildAmbience(audioContext, masterGain);
      for (const source of sources) {
        source.start();
      }
      this.#currentLayer = { masterGain, sources };
    } catch (error) {
      console.warn("Musique d'ambiance indisponible.", error);
      this.#currentLayer = null;
    }
  }

  // With a delay, the music keeps playing after the session (sleep timer) and fades out later.
  stop({ fadeSeconds, delaySeconds = 0 }) {
    const layer = this.#currentLayer;
    if (layer === null) {
      return;
    }
    this.#currentLayer = null;
    if (delaySeconds > 0) {
      this.#lingeringLayer = layer;
    }
    this.#releaseLayer(layer, { fadeSeconds, delaySeconds });
  }

  stopLingering({ fadeSeconds }) {
    const layer = this.#lingeringLayer;
    if (layer === null) {
      return;
    }
    this.#lingeringLayer = null;
    this.#releaseLayer(layer, { fadeSeconds, delaySeconds: 0 });
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
    if (this.#audioContext === null || this.#currentLayer === null) {
      return;
    }
    this.#isMuted = !this.#isMuted;
    const { gain } = this.#currentLayer.masterGain;
    const now = this.#audioContext.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(this.#isMuted ? 0 : this.#targetGain, now + MUTE_FADE_SECONDS);
  }

  async dispose() {
    this.stop({ fadeSeconds: 0 });
    this.stopLingering({ fadeSeconds: 0 });
    try {
      await this.#audioContext?.close();
    } catch (error) {
      console.warn("Fermeture de la musique d'ambiance impossible.", error);
    } finally {
      this.#audioContext = null;
    }
  }

  // Everything is scheduled on the audio clock rather than with timers,
  // so there is nothing left to clear if the page goes away mid-fade.
  #releaseLayer(layer, { fadeSeconds, delaySeconds }) {
    const now = this.#audioContext.currentTime;
    const fadeStartTime = now + delaySeconds;
    const stopTime = fadeStartTime + fadeSeconds;
    const { gain } = layer.masterGain;
    const currentLevel = gain.value;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(currentLevel, now);
    gain.setValueAtTime(currentLevel, fadeStartTime);
    gain.linearRampToValueAtTime(0, stopTime);
    for (const source of layer.sources) {
      source.addEventListener('ended', () => source.disconnect(), { once: true });
      source.stop(stopTime);
    }
    layer.sources.at(-1)?.addEventListener('ended', () => {
      layer.masterGain.disconnect();
      if (this.#lingeringLayer === layer) {
        this.#lingeringLayer = null;
      }
      if (delaySeconds > 0) {
        this.#onLingerEnd();
      }
    }, { once: true });
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
