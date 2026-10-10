const BOWL_FUNDAMENTAL_HZ = 196;
const STRIKE_SPACING_SECONDS = 2.5;
const SCHEDULING_LEAD_SECONDS = 0.05;
const SILENT_GAIN = 0.0001;

// Inharmonic partial ratios mimic a singing bowl; a pure harmonic series would
// sound like an electronic beep. Higher partials fade faster, like real metal.
const BOWL_PARTIALS = Object.freeze([
  { frequencyRatio: 1, peakGain: 1, decaySeconds: 8 },
  { frequencyRatio: 2.71, peakGain: 0.45, decaySeconds: 5 },
  { frequencyRatio: 5.18, peakGain: 0.2, decaySeconds: 3 },
  { frequencyRatio: 8.37, peakGain: 0.08, decaySeconds: 1.6 },
]);

const TOTAL_PARTIAL_GAIN = BOWL_PARTIALS.reduce((sum, partial) => sum + partial.peakGain, 0);

// Synthesized rather than loaded from a file so the app has no audio asset to fetch.
export class Bell {
  #audioContext = null;

  // Browsers only allow audio to start from a user gesture, so this must be
  // called from a click/submit handler before the first ring.
  async unlock() {
    try {
      if (this.#audioContext === null) {
        this.#audioContext = new AudioContext();
      }
      if (this.#audioContext.state === 'suspended') {
        await this.#audioContext.resume();
      }
    } catch (error) {
      console.warn('Audio indisponible, la séance continuera sans cloche.', error);
    }
  }

  ring({ strikes = 1, volume = 0.8 } = {}) {
    if (this.#audioContext === null || this.#audioContext.state !== 'running') {
      return;
    }
    const firstStrikeTime = this.#audioContext.currentTime + SCHEDULING_LEAD_SECONDS;
    for (let strikeIndex = 0; strikeIndex < strikes; strikeIndex += 1) {
      this.#scheduleStrike(firstStrikeTime + strikeIndex * STRIKE_SPACING_SECONDS, volume);
    }
  }

  async dispose() {
    try {
      await this.#audioContext?.close();
    } catch (error) {
      console.warn("Fermeture de l'audio impossible.", error);
    } finally {
      this.#audioContext = null;
    }
  }

  #scheduleStrike(startTime, volume) {
    const audioContext = this.#audioContext;
    const masterGain = audioContext.createGain();
    masterGain.gain.value = volume / TOTAL_PARTIAL_GAIN;
    masterGain.connect(audioContext.destination);

    let activeOscillatorCount = BOWL_PARTIALS.length;

    for (const partial of BOWL_PARTIALS) {
      const oscillator = audioContext.createOscillator();
      const envelope = audioContext.createGain();
      const endTime = startTime + partial.decaySeconds;

      oscillator.type = 'sine';
      oscillator.frequency.value = BOWL_FUNDAMENTAL_HZ * partial.frequencyRatio;

      envelope.gain.setValueAtTime(SILENT_GAIN, startTime);
      envelope.gain.exponentialRampToValueAtTime(partial.peakGain, startTime + 0.015);
      envelope.gain.exponentialRampToValueAtTime(SILENT_GAIN, endTime);

      oscillator.connect(envelope).connect(masterGain);
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect();
        envelope.disconnect();
        activeOscillatorCount -= 1;
        if (activeOscillatorCount === 0) {
          masterGain.disconnect();
        }
      }, { once: true });

      oscillator.start(startTime);
      oscillator.stop(endTime + 0.1);
    }
  }
}
