"""Regenerates src/lib/game/ui-sounds.json from the installed game.

The editor plays the game's own interface sounds. They are not free-floating
clips: the game reaches them through an `AudioDatabase` ScriptableObject, whose
`sfxs` list maps a *name* like `UI/OK` to a weighted distribution of AudioClips
plus the volume it is played at. `ButtonSounds` on a UI button holds two of
those names — `clickSfx` and `selectSfx` — and hands them to
`AudioManager.PlaySfx`. So the name is the game's own vocabulary for "the sound
this interaction makes", and it is what this script keys on. A clip file name
(`v2 - 6 - main menu gui`) says nothing and would silently follow an audio pass
that swapped which clip a sound uses.

PALETTE below maps the editor's own events to those names. Only sounds the game
plays in a *menu* are borrowed: nothing that belongs to the ship, a weapon or an
enemy, and nothing spatial.

`UI/Back` is deliberately absent. It exists in the database with an empty
distribution, so `Sfx.HasSound` is false and the game plays silence for it —
borrowing the name would mean inventing a sound the game does not have.

Three things about the encode:

- **The trailing silence is cut here, not by ffmpeg.** Every UI clip is authored
  into a fixed 1-2 second slot and is mostly silence; the real sound is the
  first ~200 ms. `silenceremove` mis-cut the short ones (it wants a run of
  non-silence to stop trimming, and a 74 ms blip does not give it one), so the
  cut point is found in the samples instead: the last frame above THRESHOLD,
  plus TAIL for the decay. Everything dropped is provably below the threshold.
- **Stereo is kept.** These are 2-channel clips whose channels genuinely differ
  (measurably different peak and RMS), so a downmix risks cancelling parts of
  the sound. At a constant bitrate the stereo file is the same size as the mono
  one anyway, so there is nothing to buy by folding them.
- **MP3, not Opus.** The desktop app runs on WebKitGTK on Linux, whose codec
  support is whatever GStreamer plugins the distribution shipped. MP3 is the one
  format every engine the app runs in decodes without a plugin question.

Needs `ffmpeg` on PATH (with libmp3lame). It is the only extractor that does;
`bun run extract` reports it as a skip rather than failing the whole run.

Usage (or `bun run extract` for everything):
    .venv/Scripts/python scripts/extract-ui-sounds.py [path-to-Punk_Data]
"""

from __future__ import annotations

import base64
import io
import shutil
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

import punklib

# The editor's own event -> the name the game's AudioDatabase files it under.
# Every one of these is a *menu* sound in game; see the module docstring.
PALETTE = {
    # `ButtonSounds.clickSfx` on the game's own buttons.
    "click": "UI/OK",
    # `ButtonSounds.selectSfx` — moving onto a control, not activating it.
    "hover": "UI/Step",
    # The vault screen opening and closing; the editor's dialogs do the same job.
    "open": "UI/Grid/Open",
    "close": "UI/Grid/Close",
    # The two module sounds, borrowed by the module picker for the same events.
    "select": "UI/Grid/ModuleSelected",
    "place": "UI/Grid/ModulePlaced",
}

# Below this the sample is silence: -70 dBFS in 16-bit, i.e. the noise floor of
# a clip that was authored as digital silence and encoded lossily.
THRESHOLD = round(32768 * 10 ** (-70 / 20))

# Kept after the last audible frame, so a decay is not cut off mid-fade.
TAIL_SECONDS = 0.03

BITRATE = "64k"


def audio_database(assets: punklib.PunkAssets) -> dict | None:
    """The one AudioDatabase asset's fields, or None if the scan found none."""
    for obj in assets.env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        if assets.script_class(obj) != "AudioDatabase":
            continue
        try:
            return obj.read(check_read=False).__dict__
        except Exception:
            continue
    return None


def trim(wav_bytes: bytes) -> tuple[bytes, float, float]:
    """Drops the trailing silence. Returns the wav, and the length before/after.

    A frame counts as audible if *any* channel in it is above THRESHOLD, so a
    sound that lives in one channel is not treated as silence."""
    with wave.open(io.BytesIO(wav_bytes)) as src:
        channels, width, rate, frames = (
            src.getnchannels(),
            src.getsampwidth(),
            src.getframerate(),
            src.getnframes(),
        )
        raw = src.readframes(frames)
    if width != 2:
        # UnityPy writes 16-bit PCM; anything else means its decoder changed.
        punklib.warn(f"expected 16-bit samples, got {width * 8}-bit — not trimming")
        return wav_bytes, frames / rate, frames / rate
    samples = struct.unpack(f"<{len(raw) // 2}h", raw)
    last = 0
    for i, value in enumerate(samples):
        if value > THRESHOLD or value < -THRESHOLD:
            last = i
    keep = min(frames, last // channels + 1 + round(TAIL_SECONDS * rate))
    out = io.BytesIO()
    with wave.open(out, "wb") as dst:
        dst.setnchannels(channels)
        dst.setsampwidth(width)
        dst.setframerate(rate)
        dst.writeframes(raw[: keep * channels * width])
    return out.getvalue(), frames / rate, keep / rate


def to_mp3(wav_bytes: bytes) -> bytes:
    """The clip as an MP3, through ffmpeg. Raises if ffmpeg is unhappy."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.wav"
        dst = Path(tmp) / "out.mp3"
        src.write_bytes(wav_bytes)
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
             "-codec:a", "libmp3lame", "-b:a", BITRATE, str(dst)],
            check=True,
        )
        return dst.read_bytes()


def clip_uri(pptr) -> tuple[str, float, float] | None:
    """An AudioClip pointer as an MP3 data URI, with its length before/after
    trimming. None when the clip cannot be read or decoded."""
    try:
        clip = pptr.read()
    except Exception:
        return None
    try:
        samples = clip.samples
    except Exception as err:
        punklib.warn(f"could not decode AudioClip {clip.m_Name!r}: {err}")
        return None
    if not samples:
        punklib.warn(f"AudioClip {clip.m_Name!r} decoded to nothing")
        return None
    wav_bytes = next(iter(samples.values()))
    trimmed, before, after = trim(wav_bytes)
    mp3 = to_mp3(trimmed)
    return "data:audio/mpeg;base64," + base64.b64encode(mp3).decode(), before, after


def run(assets: punklib.PunkAssets) -> None:
    if not shutil.which("ffmpeg"):
        punklib.warn("ffmpeg not on PATH — skipping ui-sounds.json (it is unchanged)")
        return
    db = audio_database(assets)
    if db is None:
        punklib.warn("no AudioDatabase asset found — skipping ui-sounds.json")
        return
    by_name = {s.__dict__.get("name"): s.__dict__ for s in db.get("sfxs") or []}

    sounds: dict[str, dict] = {}
    for key, name in PALETTE.items():
        sfx = by_name.get(name)
        if sfx is None:
            punklib.warn(f"the game no longer has an sfx named {name!r} (editor sound {key!r})")
            continue
        items = getattr(sfx.get("audioClips"), "__dict__", {}).get("items") or []
        clips = []
        for item in items:
            d = item.__dict__
            got = clip_uri(d.get("value"))
            if got is None:
                continue
            uri, before, after = got
            clips.append({"uri": uri, "weight": round(d.get("weight", 0.0), 4)})
            print(f"  {key:<7} {name:<24} {before:.3f}s -> {after:.3f}s, {len(uri) * 3 // 4} bytes")
        if not clips:
            # An sfx the game itself plays silence for; see the UI/Back note.
            punklib.warn(f"{name!r} has no playable clip — editor sound {key!r} dropped")
            continue
        sounds[key] = {"sfx": name, "volume": round(sfx.get("volume", 1.0), 4), "clips": clips}

    missing = sorted(set(PALETTE) - set(sounds))
    if missing:
        punklib.warn(f"no sound for {', '.join(missing)} — the editor falls back to silence")
    punklib.write_json(punklib.DATA_DIR / "ui-sounds.json", sounds)


if __name__ == "__main__":
    run(punklib.PunkAssets(punklib.game_data_from_argv()))
