"""Find the moments where the music changes (likely a new song), without any API calls.

Shazam only allows a few requests per minute, so we can't ask it about every clip.
Instead we look at the audio ourselves: each half-second is described by its harmony
(chroma: how much of each of the 12 musical notes is present) and its tone colour
(energy in a set of frequency bands). Where the few seconds before a moment sound very
different from the few seconds after it, a different song has probably started.
The recognition step then makes sure each of these sections gets checked.

This is a "novelty curve" (Foote, 2000), simplified to comparing two windows.
"""

import wave
from pathlib import Path

import numpy as np

SAMPLE_FRAME = 2048  # FFT size (128 ms at 16 kHz)
HOP = 1024
BLOCK_SECONDS = 0.5  # features are averaged per block
WINDOW_SECONDS = 5.0  # compare this much audio before vs after each moment
MIN_GAP_SECONDS = 6.0  # two changes can't be closer than this
EDGE_SECONDS = 3.0  # ignore changes this close to the start/end of a sound range


def _read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as w:
        rate = w.getframerate()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        if w.getnchannels() > 1:
            data = data.reshape(-1, w.getnchannels()).mean(axis=1)
    return data.astype(np.float32) / 32768.0, rate


def frames_per_block(rate: int) -> int:
    return max(1, round(BLOCK_SECONDS * rate / HOP))


def block_duration(rate: int) -> float:
    """Actual length of one feature block in seconds (close to BLOCK_SECONDS)."""
    return frames_per_block(rate) * HOP / rate


def block_features(samples: np.ndarray, rate: int) -> np.ndarray:
    """One feature vector per block (~BLOCK_SECONDS): 12 chroma values + 16 log band energies."""
    if len(samples) < SAMPLE_FRAME:
        return np.zeros((0, 28), dtype=np.float32)
    n_frames = 1 + (len(samples) - SAMPLE_FRAME) // HOP
    idx = np.arange(SAMPLE_FRAME)[None, :] + HOP * np.arange(n_frames)[:, None]
    frames = samples[idx] * np.hanning(SAMPLE_FRAME).astype(np.float32)
    spec = np.abs(np.fft.rfft(frames, axis=1))  # (frames, bins)
    freqs = np.fft.rfftfreq(SAMPLE_FRAME, 1 / rate)

    # Chroma: map each bin between 80 Hz and 5 kHz to one of the 12 pitch classes
    usable = (freqs >= 80) & (freqs <= 5000)
    pitch_class = (np.round(12 * np.log2(freqs[usable] / 440.0)) + 9) % 12
    chroma = np.zeros((n_frames, 12), dtype=np.float32)
    for pc in range(12):
        chroma[:, pc] = spec[:, usable][:, pitch_class == pc].sum(axis=1)
    chroma /= chroma.sum(axis=1, keepdims=True) + 1e-9

    # Timbre: log energy in 16 bands spaced evenly on a log scale (60 Hz .. Nyquist)
    edges = np.geomspace(60, rate / 2, 17)
    bands = np.stack(
        [spec[:, (freqs >= lo) & (freqs < hi)].sum(axis=1) for lo, hi in zip(edges, edges[1:])], axis=1
    )
    bands = np.log1p(bands)
    bands /= np.linalg.norm(bands, axis=1, keepdims=True) + 1e-9

    feats = np.concatenate([chroma, bands], axis=1)
    per_block = frames_per_block(rate)
    n_blocks = n_frames // per_block
    return feats[: n_blocks * per_block].reshape(n_blocks, per_block, -1).mean(axis=1)


def novelty_curve(feats: np.ndarray, block_seconds: float = BLOCK_SECONDS) -> np.ndarray:
    """For each block boundary: how different the window before is from the window after
    (1 - cosine similarity of the mean feature vectors). 0 where it can't be computed."""
    w = max(1, round(WINDOW_SECONDS / block_seconds))
    n = len(feats)
    out = np.zeros(n, dtype=np.float32)
    if n < 2 * w:
        return out
    # Centre features so cosine similarity reflects differences, not shared baseline
    centred = feats - feats.mean(axis=0, keepdims=True)
    csum = np.vstack([np.zeros((1, centred.shape[1])), np.cumsum(centred, axis=0)])
    for t in range(w, n - w + 1):
        before = (csum[t] - csum[t - w]) / w
        after = (csum[t + w] - csum[t]) / w
        denom = np.linalg.norm(before) * np.linalg.norm(after)
        out[t] = 0.0 if denom == 0 else 1 - float(before @ after) / denom
    return out


def pick_peaks(curve: np.ndarray, threshold: float, block_seconds: float = BLOCK_SECONDS) -> list[tuple[float, float]]:
    """Local maxima above threshold, at least MIN_GAP_SECONDS apart, strongest first kept.
    Returns (time in seconds, strength)."""
    gap = max(1, round(MIN_GAP_SECONDS / block_seconds))
    candidates = [
        t for t in range(1, len(curve) - 1)
        if curve[t] >= threshold and curve[t] >= curve[t - 1] and curve[t] >= curve[t + 1]
    ]
    chosen: list[int] = []
    for t in sorted(candidates, key=lambda t: -curve[t]):
        if all(abs(t - c) >= gap for c in chosen):
            chosen.append(t)
    return sorted((t * block_seconds, float(curve[t])) for t in chosen)


def detect_changes(
    path: Path, ranges: list[tuple[float, float]], threshold: float = 0.5
) -> list[tuple[float, float]]:
    """Likely song changes as (time in seconds, strength 0..2), within the given sound ranges.
    Silence between ranges is already a natural break, so only changes inside ranges count."""
    samples, rate = _read_wav(path)
    changes = []
    for start, end in ranges:
        if end - start < 2 * WINDOW_SECONDS:
            continue
        chunk = samples[int(start * rate): int(end * rate)]
        block = block_duration(rate)
        curve = novelty_curve(block_features(chunk, rate), block)
        for t, strength in pick_peaks(curve, threshold, block):
            if EDGE_SECONDS <= t <= (end - start) - EDGE_SECONDS:
                changes.append((round(start + t, 2), round(strength, 3)))
    return changes
