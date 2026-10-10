export class GuidedScript {
  #cues;
  #nextCueIndex = 0;

  constructor(cues) {
    this.#cues = [...cues].sort((first, second) => first.atSeconds - second.atSeconds);
  }

  // When a background tab is throttled several cues can fall due at once;
  // only the most recent one is returned so they are not read back to back.
  takeLatestDueCue(elapsedSeconds) {
    let latestDueCue = null;
    while (this.#nextCueIndex < this.#cues.length && this.#cues[this.#nextCueIndex].atSeconds <= elapsedSeconds) {
      latestDueCue = this.#cues[this.#nextCueIndex];
      this.#nextCueIndex += 1;
    }
    return latestDueCue;
  }
}
