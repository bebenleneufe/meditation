"""Génère une piste MP3 par méditation guidée : cloche, consignes lues, silences, cloches de fin.

Les textes et les moments des consignes sont lus dans js/meditations.js, qui reste la seule source.
Usage :
    ELEVENLABS_API_KEY=... python tools/generate_audio.py            # voix Adrien (ElevenLabs)
    python tools/generate_audio.py --engine piper --voice fr_FR-upmc-medium.onnx
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import wave
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIRECTORY = REPO_ROOT / "audio"
# Every ElevenLabs request costs credits: clips are kept here so a rerun only pays for changed text.
CACHE_DIRECTORY = REPO_ROOT / ".audio-cache"

# Voice validated by ear: "Adrien" from the ElevenLabs voice library, slowed down by 8 %.
# ElevenLabs' own "speed" setting barely changes the delivery, hence the time-stretch afterwards.
ELEVENLABS_VOICE_ID = "TTtB1x9U8PF0Vgf20IAP"
ELEVENLABS_MODEL_ID = "eleven_multilingual_v2"
ELEVENLABS_VOICE_SETTINGS = {"stability": 0.6, "similarity_boost": 0.75, "style": 0, "speed": 0.9}
ELEVENLABS_SAMPLE_RATE = 44100
ELEVENLABS_TEMPO = 0.92

PIPER_DEFAULT_SPEAKER = "pierre"
PIPER_LENGTH_SCALE = 1.1
PIPER_PITCH_SEMITONES = -1.0
PIPER_SENTENCE_PAUSE_SECONDS = 0.7
PIPER_ELLIPSIS_PAUSE_SECONDS = 1.1

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

MP3_VBR_QUALITY = "4"


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


def write_wav(samples, sample_rate, path):
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes((np.clip(samples, -1, 1) * 32767).astype(np.int16).tobytes())


def decode_audio(path, sample_rate):
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(sample_rate), "-"],
        check=True,
        capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def apply_rubberband(samples, sample_rate, rubberband_options):
    with tempfile.TemporaryDirectory() as temporary_directory:
        source_path = Path(temporary_directory) / "source.wav"
        write_wav(samples, sample_rate, source_path)
        processed = subprocess.run(
            [
                "ffmpeg", "-loglevel", "error", "-i", str(source_path),
                "-af", f"rubberband={rubberband_options}:pitchq=quality",
                "-f", "f32le", "-ac", "1", "-ar", str(sample_rate), "-",
            ],
            check=True,
            capture_output=True,
        ).stdout
    return np.frombuffer(processed, dtype=np.float32).copy()


def normalize_voice(speech):
    return speech / np.abs(speech).max() * VOICE_PEAK


class ElevenLabsNarrator:
    sample_rate = ELEVENLABS_SAMPLE_RATE

    def __init__(self, api_key):
        self.api_key = api_key
        CACHE_DIRECTORY.mkdir(exist_ok=True)

    def synthesize(self, text):
        speech = decode_audio(self._fetch_clip(text), self.sample_rate)
        slowed = apply_rubberband(speech, self.sample_rate, f"tempo={ELEVENLABS_TEMPO}")
        return normalize_voice(slowed)

    def _fetch_clip(self, text):
        request_body = {
            "text": text,
            "model_id": ELEVENLABS_MODEL_ID,
            "voice_settings": ELEVENLABS_VOICE_SETTINGS,
        }
        cache_key = hashlib.sha256(
            json.dumps([ELEVENLABS_VOICE_ID, request_body], sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest()[:24]
        cached_path = CACHE_DIRECTORY / f"{cache_key}.mp3"
        if cached_path.exists():
            return cached_path

        request = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128",
            data=json.dumps(request_body).encode(),
            headers={"xi-api-key": self.api_key, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                audio_bytes = response.read()
        except urllib.error.HTTPError as error:
            raise SystemExit(f"ElevenLabs a refusé « {text[:40]}… » : {error.code} {error.read()[:300]!r}")
        cached_path.write_bytes(audio_bytes)
        return cached_path


class PiperNarrator:
    def __init__(self, model_path, speaker_name):
        from piper import PiperVoice, SynthesisConfig

        self.voice = PiperVoice.load(str(model_path))
        self.sample_rate = self.voice.config.sample_rate
        speaker_ids = self.voice.config.speaker_id_map or {}
        if speaker_ids and speaker_name not in speaker_ids:
            raise SystemExit(f"Locuteur « {speaker_name} » absent du modèle : {', '.join(speaker_ids)}")
        self.config = SynthesisConfig(speaker_id=speaker_ids.get(speaker_name), length_scale=PIPER_LENGTH_SCALE)

    def synthesize(self, text):
        """Ellipses mark a breath in the scripts: Piper barely pauses on them, so the pause is inserted by hand."""
        fragments = [fragment.strip() for fragment in re.split(r"…|\.\.\.", text) if fragment.strip()]
        pieces = []
        for fragment_index, fragment in enumerate(fragments):
            if fragment_index > 0:
                pieces.append(self._silence(PIPER_ELLIPSIS_PAUSE_SECONDS))
            for sentence_index, chunk in enumerate(self.voice.synthesize(fragment, syn_config=self.config)):
                if sentence_index > 0:
                    pieces.append(self._silence(PIPER_SENTENCE_PAUSE_SECONDS))
                pieces.append(chunk.audio_float_array)
        speech = np.concatenate(pieces)
        pitch_ratio = 2 ** (PIPER_PITCH_SEMITONES / 12)
        lowered = apply_rubberband(speech, self.sample_rate, f"pitch={pitch_ratio:.5f}:formant=preserved")
        return normalize_voice(lowered)

    def _silence(self, seconds):
        return np.zeros(int(seconds * self.sample_rate), dtype=np.float32)


def synthesize_bell(sample_rate):
    longest_decay = max(decay for _, _, decay in BELL_PARTIALS)
    time_axis = np.arange(int(longest_decay * sample_rate)) / sample_rate
    bell = np.zeros_like(time_axis)
    for frequency_ratio, peak_gain, decay_seconds in BELL_PARTIALS:
        attack = np.clip(time_axis / BELL_ATTACK_SECONDS, 0, 1)
        decay = np.exp(np.log(1e-4) * time_axis / decay_seconds)
        bell += peak_gain * attack * decay * np.sin(2 * np.pi * BELL_FUNDAMENTAL_HZ * frequency_ratio * time_axis)
    return (bell / np.abs(bell).max() * BELL_PEAK).astype(np.float32)


def mix_at(track, clip, start_seconds, sample_rate):
    start_index = int(start_seconds * sample_rate)
    track[start_index:start_index + len(clip)] += clip


def build_track(meditation, narrator):
    sample_rate = narrator.sample_rate
    session_seconds = meditation["durationMinutes"] * 60
    bell = synthesize_bell(sample_rate)
    end_bells_seconds = (END_BELL_STRIKES - 1) * END_BELL_SPACING_SECONDS + len(bell) / sample_rate
    track = np.zeros(int((session_seconds + end_bells_seconds + TRAILING_SILENCE_SECONDS) * sample_rate), dtype=np.float32)

    timing_problems = []
    cues = meditation["cues"]
    for cue_index, cue in enumerate(cues):
        speech = narrator.synthesize(cue["text"])
        cue_end_seconds = cue["atSeconds"] + len(speech) / sample_rate
        next_cue_seconds = cues[cue_index + 1]["atSeconds"] if cue_index + 1 < len(cues) else session_seconds
        free_seconds = next_cue_seconds - cue_end_seconds
        if free_seconds < MINIMUM_GAP_BETWEEN_CUES_SECONDS:
            timing_problems.append(
                f"  {cue['atSeconds']}s ({len(speech) / sample_rate:.1f}s de voix) déborde : "
                f"il reste {free_seconds:.1f}s avant {next_cue_seconds}s"
            )
        mix_at(track, speech, cue["atSeconds"], sample_rate)

    mix_at(track, bell, 0, sample_rate)
    for strike_index in range(END_BELL_STRIKES):
        mix_at(track, bell, session_seconds + strike_index * END_BELL_SPACING_SECONDS, sample_rate)

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


def create_narrator(arguments):
    if arguments.engine == "piper":
        if arguments.voice is None:
            raise SystemExit("--voice est obligatoire avec --engine piper")
        return PiperNarrator(arguments.voice, arguments.speaker)
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key:
        raise SystemExit("La variable ELEVENLABS_API_KEY est vide.")
    return ElevenLabsNarrator(api_key)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--engine", choices=("elevenlabs", "piper"), default="elevenlabs")
    parser.add_argument("--voice", type=Path, help="modèle Piper .onnx (avec --engine piper)")
    parser.add_argument("--speaker", default=PIPER_DEFAULT_SPEAKER, help="locuteur Piper, pour les modèles à plusieurs voix")
    parser.add_argument("--only", help="identifiant d'une seule méditation à générer")
    arguments = parser.parse_args()

    narrator = create_narrator(arguments)
    OUTPUT_DIRECTORY.mkdir(exist_ok=True)

    has_timing_problems = False
    for meditation in load_guided_meditations():
        if arguments.only is not None and meditation["id"] != arguments.only:
            continue
        track, timing_problems = build_track(meditation, narrator)
        if timing_problems:
            has_timing_problems = True
            print(f"{meditation['id']} : consignes trop rapprochées, rien n'est écrit", file=sys.stderr)
            print("\n".join(timing_problems), file=sys.stderr)
            continue
        destination = OUTPUT_DIRECTORY / f"{meditation['id']}.mp3"
        encode_mp3(track, narrator.sample_rate, destination)
        print(f"{destination.relative_to(REPO_ROOT)} : {len(track) / narrator.sample_rate:.0f}s, "
              f"{destination.stat().st_size / 1024:.0f} Ko")

    return 1 if has_timing_problems else 0


if __name__ == "__main__":
    sys.exit(main())
