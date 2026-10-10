"""Génère une piste MP3 par méditation guidée : cloche, consignes lues par Piper, silences, cloches de fin.

Les textes et les moments des consignes sont lus dans js/meditations.js, qui reste la seule source.
Usage :
    python tools/generate_audio.py --voice chemin/vers/fr_FR-tom-medium.onnx
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from piper import PiperVoice, SynthesisConfig

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIRECTORY = REPO_ROOT / "audio"

# Slower than Piper's default delivery, for a calm and grounded voice.
SPEECH_LENGTH_SCALE = 1.2
SENTENCE_PAUSE_SECONDS = 0.7
ELLIPSIS_PAUSE_SECONDS = 1.1
MINIMUM_GAP_BETWEEN_CUES_SECONDS = 1.5
VOICE_PEAK = 0.8

# Same singing-bowl model as js/bell.js, so the free and guided sessions sound alike.
BELL_FUNDAMENTAL_HZ = 196
BELL_PARTIALS = (
    (1.0, 1.0, 8.0),
    (2.71, 0.45, 5.0),
    (5.18, 0.2, 3.0),
    (8.37, 0.08, 1.6),
)
BELL_PEAK = 0.55
BELL_ATTACK_SECONDS = 0.015
END_BELL_STRIKES = 3
END_BELL_SPACING_SECONDS = 2.5
TRAILING_SILENCE_SECONDS = 1.0

MP3_SAMPLE_RATE = 24000
MP3_VBR_QUALITY = "6"


def load_guided_meditations():
    command = [
        "node",
        "--input-type=module",
        "-e",
        "import { GUIDED_MEDITATIONS } from './js/meditations.js';"
        "process.stdout.write(JSON.stringify(GUIDED_MEDITATIONS));",
    ]
    completed = subprocess.run(command, cwd=REPO_ROOT, check=True, capture_output=True, text=True)
    return json.loads(completed.stdout)


def synthesize_bell(sample_rate):
    longest_decay = max(decay for _, _, decay in BELL_PARTIALS)
    time_axis = np.arange(int(longest_decay * sample_rate)) / sample_rate
    bell = np.zeros_like(time_axis)
    for frequency_ratio, peak_gain, decay_seconds in BELL_PARTIALS:
        attack = np.clip(time_axis / BELL_ATTACK_SECONDS, 0, 1)
        decay = np.exp(np.log(1e-4) * time_axis / decay_seconds)
        bell += peak_gain * attack * decay * np.sin(2 * np.pi * BELL_FUNDAMENTAL_HZ * frequency_ratio * time_axis)
    return bell / np.abs(bell).max() * BELL_PEAK


def split_on_ellipses(text):
    return [fragment.strip() for fragment in re.split(r"…|\.\.\.", text) if fragment.strip()]


def synthesize_cue(voice, text):
    """Ellipses mark a breath in the scripts: Piper barely pauses on them, so the pause is inserted by hand."""
    sample_rate = voice.config.sample_rate
    config = SynthesisConfig(length_scale=SPEECH_LENGTH_SCALE)
    pieces = []
    for fragment_index, fragment in enumerate(split_on_ellipses(text)):
        if fragment_index > 0:
            pieces.append(np.zeros(int(ELLIPSIS_PAUSE_SECONDS * sample_rate), dtype=np.float32))
        for sentence_index, chunk in enumerate(voice.synthesize(fragment, syn_config=config)):
            if sentence_index > 0:
                pieces.append(np.zeros(int(SENTENCE_PAUSE_SECONDS * sample_rate), dtype=np.float32))
            pieces.append(chunk.audio_float_array)
    speech = np.concatenate(pieces)
    return speech / np.abs(speech).max() * VOICE_PEAK


def mix_at(track, clip, start_seconds, sample_rate):
    start_index = int(start_seconds * sample_rate)
    track[start_index:start_index + len(clip)] += clip


def build_track(meditation, voice):
    sample_rate = voice.config.sample_rate
    session_seconds = meditation["durationMinutes"] * 60
    bell = synthesize_bell(sample_rate)
    end_bells_seconds = (END_BELL_STRIKES - 1) * END_BELL_SPACING_SECONDS + len(bell) / sample_rate
    track = np.zeros(int((session_seconds + end_bells_seconds + TRAILING_SILENCE_SECONDS) * sample_rate), dtype=np.float32)

    mix_at(track, bell, 0, sample_rate)

    timing_problems = []
    cues = meditation["cues"]
    for cue_index, cue in enumerate(cues):
        speech = synthesize_cue(voice, cue["text"])
        cue_end_seconds = cue["atSeconds"] + len(speech) / sample_rate
        next_cue_seconds = cues[cue_index + 1]["atSeconds"] if cue_index + 1 < len(cues) else session_seconds
        free_seconds = next_cue_seconds - cue_end_seconds
        if free_seconds < MINIMUM_GAP_BETWEEN_CUES_SECONDS:
            timing_problems.append(
                f"  {cue['atSeconds']}s ({len(speech) / sample_rate:.1f}s de voix) déborde : "
                f"il reste {free_seconds:.1f}s avant {next_cue_seconds}s"
            )
        mix_at(track, speech, cue["atSeconds"], sample_rate)

    for strike_index in range(END_BELL_STRIKES):
        mix_at(track, bell, session_seconds + strike_index * END_BELL_SPACING_SECONDS, sample_rate)

    peak = np.abs(track).max()
    if peak > 0.98:
        track *= 0.98 / peak
    return track, timing_problems


def encode_mp3(track, sample_rate, destination):
    with tempfile.NamedTemporaryFile(suffix=".wav") as temporary_wav:
        with wave.open(temporary_wav.name, "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes((track * 32767).astype(np.int16).tobytes())
        subprocess.run(
            [
                "ffmpeg", "-loglevel", "error", "-y", "-i", temporary_wav.name,
                "-ac", "1", "-ar", str(MP3_SAMPLE_RATE),
                "-codec:a", "libmp3lame", "-q:a", MP3_VBR_QUALITY, str(destination),
            ],
            check=True,
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--voice", required=True, type=Path, help="modèle Piper .onnx (avec son .onnx.json à côté)")
    parser.add_argument("--only", help="identifiant d'une seule méditation à générer")
    arguments = parser.parse_args()

    voice = PiperVoice.load(str(arguments.voice))
    OUTPUT_DIRECTORY.mkdir(exist_ok=True)

    has_timing_problems = False
    for meditation in load_guided_meditations():
        if arguments.only is not None and meditation["id"] != arguments.only:
            continue
        track, timing_problems = build_track(meditation, voice)
        if timing_problems:
            has_timing_problems = True
            print(f"{meditation['id']} : consignes trop rapprochées, rien n'est écrit", file=sys.stderr)
            print("\n".join(timing_problems), file=sys.stderr)
            continue
        destination = OUTPUT_DIRECTORY / f"{meditation['id']}.mp3"
        encode_mp3(track, voice.config.sample_rate, destination)
        print(f"{destination.relative_to(REPO_ROOT)} : {len(track) / voice.config.sample_rate:.0f}s, "
              f"{destination.stat().st_size / 1024:.0f} Ko")

    return 1 if has_timing_problems else 0


if __name__ == "__main__":
    sys.exit(main())
