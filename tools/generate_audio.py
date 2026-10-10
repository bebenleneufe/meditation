"""Génère une piste MP3 par méditation guidée : cloche, consignes lues par Piper, silences, cloches de fin.

Les textes et les moments des consignes sont lus dans js/meditations.js, qui reste la seule source.
Usage :
    python tools/generate_audio.py --voice chemin/vers/fr_FR-upmc-medium.onnx
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

# Voice validated by ear: "pierre" from the upmc model, slightly slowed down
# and one semitone lower than Piper's output.
DEFAULT_SPEAKER = "pierre"
DEFAULT_LENGTH_SCALE = 1.1
DEFAULT_PITCH_SEMITONES = -1.0

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


def resolve_speaker_id(voice, speaker_name):
    speaker_ids = voice.config.speaker_id_map or {}
    if speaker_name not in speaker_ids:
        if not speaker_ids:
            return None
        raise SystemExit(f"Locuteur « {speaker_name} » absent du modèle : {', '.join(speaker_ids)}")
    return speaker_ids[speaker_name]


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


def synthesize_cue(voice, text, synthesis_config):
    """Ellipses mark a breath in the scripts: Piper barely pauses on them, so the pause is inserted by hand."""
    sample_rate = voice.config.sample_rate
    pieces = []
    for fragment_index, fragment in enumerate(split_on_ellipses(text)):
        if fragment_index > 0:
            pieces.append(np.zeros(int(ELLIPSIS_PAUSE_SECONDS * sample_rate), dtype=np.float32))
        for sentence_index, chunk in enumerate(voice.synthesize(fragment, syn_config=synthesis_config)):
            if sentence_index > 0:
                pieces.append(np.zeros(int(SENTENCE_PAUSE_SECONDS * sample_rate), dtype=np.float32))
            pieces.append(chunk.audio_float_array)
    speech = np.concatenate(pieces)
    return speech / np.abs(speech).max() * VOICE_PEAK


def mix_at(track, clip, start_seconds, sample_rate):
    start_index = int(start_seconds * sample_rate)
    track[start_index:start_index + len(clip)] += clip


def write_wav(samples, sample_rate, path):
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes((np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes())


def shift_pitch(samples, sample_rate, semitones):
    """Pitch only, at constant speed, keeping the formants so the voice stays natural.

    Applied to the whole voice track at once rather than per cue: one pass keeps the
    timing intact and avoids running the filter dozens of times.
    """
    if semitones == 0:
        return samples
    pitch_ratio = 2 ** (semitones / 12)
    with tempfile.TemporaryDirectory() as temporary_directory:
        source_path = Path(temporary_directory) / "voix.wav"
        write_wav(samples, sample_rate, source_path)
        shifted = subprocess.run(
            [
                "ffmpeg", "-loglevel", "error", "-i", str(source_path),
                "-af", f"rubberband=pitch={pitch_ratio:.5f}:formant=preserved:pitchq=quality",
                "-f", "f32le", "-ac", "1", "-ar", str(sample_rate), "-",
            ],
            check=True,
            capture_output=True,
        ).stdout
    shifted_samples = np.frombuffer(shifted, dtype=np.float32)
    aligned = np.zeros_like(samples)
    aligned[:min(len(samples), len(shifted_samples))] = shifted_samples[:len(samples)]
    return aligned


def build_track(meditation, voice, synthesis_config, pitch_semitones):
    sample_rate = voice.config.sample_rate
    session_seconds = meditation["durationMinutes"] * 60
    bell = synthesize_bell(sample_rate)
    end_bells_seconds = (END_BELL_STRIKES - 1) * END_BELL_SPACING_SECONDS + len(bell) / sample_rate
    track_length = int((session_seconds + end_bells_seconds + TRAILING_SILENCE_SECONDS) * sample_rate)
    voice_track = np.zeros(track_length, dtype=np.float32)
    bell_track = np.zeros(track_length, dtype=np.float32)

    timing_problems = []
    cues = meditation["cues"]
    for cue_index, cue in enumerate(cues):
        speech = synthesize_cue(voice, cue["text"], synthesis_config)
        cue_end_seconds = cue["atSeconds"] + len(speech) / sample_rate
        next_cue_seconds = cues[cue_index + 1]["atSeconds"] if cue_index + 1 < len(cues) else session_seconds
        free_seconds = next_cue_seconds - cue_end_seconds
        if free_seconds < MINIMUM_GAP_BETWEEN_CUES_SECONDS:
            timing_problems.append(
                f"  {cue['atSeconds']}s ({len(speech) / sample_rate:.1f}s de voix) déborde : "
                f"il reste {free_seconds:.1f}s avant {next_cue_seconds}s"
            )
        mix_at(voice_track, speech, cue["atSeconds"], sample_rate)

    mix_at(bell_track, bell, 0, sample_rate)
    for strike_index in range(END_BELL_STRIKES):
        mix_at(bell_track, bell, session_seconds + strike_index * END_BELL_SPACING_SECONDS, sample_rate)

    track = shift_pitch(voice_track, sample_rate, pitch_semitones) + bell_track
    peak = np.abs(track).max()
    if peak > 0.98:
        track *= 0.98 / peak
    return track, timing_problems


def encode_mp3(track, sample_rate, destination):
    with tempfile.TemporaryDirectory() as temporary_directory:
        wav_path = Path(temporary_directory) / "piste.wav"
        write_wav(track, sample_rate, wav_path)
        subprocess.run(
            [
                "ffmpeg", "-loglevel", "error", "-y", "-i", str(wav_path),
                "-ac", "1", "-codec:a", "libmp3lame", "-q:a", MP3_VBR_QUALITY, str(destination),
            ],
            check=True,
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--voice", required=True, type=Path, help="modèle Piper .onnx (avec son .onnx.json à côté)")
    parser.add_argument("--speaker", default=DEFAULT_SPEAKER, help="locuteur, pour les modèles à plusieurs voix")
    parser.add_argument("--length-scale", type=float, default=DEFAULT_LENGTH_SCALE, help="plus grand = plus lent")
    parser.add_argument("--pitch", type=float, default=DEFAULT_PITCH_SEMITONES, help="décalage de hauteur en demi-tons")
    parser.add_argument("--only", help="identifiant d'une seule méditation à générer")
    arguments = parser.parse_args()

    voice = PiperVoice.load(str(arguments.voice))
    synthesis_config = SynthesisConfig(
        speaker_id=resolve_speaker_id(voice, arguments.speaker),
        length_scale=arguments.length_scale,
    )
    OUTPUT_DIRECTORY.mkdir(exist_ok=True)

    has_timing_problems = False
    for meditation in load_guided_meditations():
        if arguments.only is not None and meditation["id"] != arguments.only:
            continue
        track, timing_problems = build_track(meditation, voice, synthesis_config, arguments.pitch)
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
