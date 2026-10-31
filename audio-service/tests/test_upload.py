import math
import struct
import wave

import pytest
from fastapi.testclient import TestClient

from app import config
from app import main as main_module
from app.audio import probe_file
from app.errors import AudioError
from app.pipeline import process_upload


def make_wav(path, seconds=20, rate=16000):
    """A WAV with a 440 Hz tone (so silence detection finds sound)."""
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = b"".join(
            struct.pack("<h", int(8000 * math.sin(2 * math.pi * 440 * i / rate))) for i in range(rate * seconds)
        )
        w.writeframes(frames)
    return path


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "AUDIO_SERVICE_TOKEN", "")
    monkeypatch.setattr(config, "TEMP_DIR", tmp_path / "jobs")
    (tmp_path / "jobs").mkdir()

    async def fake_recognize(segments, _audio_path):
        return [{"index": s["index"], "hit": None, "error": None, "status": "no_match"} for s in segments]

    async def fake_alternatives(_songs):
        pass

    monkeypatch.setattr(main_module, "recognize_segments", fake_recognize)
    monkeypatch.setattr(main_module, "add_alternatives", fake_alternatives)
    return TestClient(main_module.app)


def test_probe_file(tmp_path):
    has_audio, duration = probe_file(make_wav(tmp_path / "a.wav", seconds=3))
    assert has_audio and abs(duration - 3) < 0.1

    text = tmp_path / "notes.txt"
    text.write_text("not audio")
    assert probe_file(text) == (False, 0.0)


def test_upload_is_processed_and_deleted(client, tmp_path):
    wav = make_wav(tmp_path / "my song.wav")
    with wav.open("rb") as f:
        res = client.post("/identify-file", files={"file": ("my song.wav", f, "audio/wav")})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["source"] == "upload" and body["title"] == "my song.wav" and body["videoId"] is None
    assert abs(body["duration"] - 20) < 0.2
    assert body["songs"] == [] and len(body["segments"]) >= 1
    assert "audioPath" not in body
    assert list((tmp_path / "jobs").iterdir()) == []  # temp files removed


def test_upload_rejects_non_media(client):
    res = client.post("/identify-file", files={"file": ("notes.txt", b"hello there", "text/plain")})
    assert res.status_code == 422 and res.json()["code"] == "no_audio_track"


def test_upload_rejects_empty_file(client):
    res = client.post("/identify-file", files={"file": ("empty.mp3", b"", "audio/mpeg")})
    assert res.status_code == 400 and res.json()["code"] == "empty_file"


def test_upload_rejects_too_big(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_MB", 0)
    res = client.post("/identify-file", files={"file": ("a.mp3", b"x" * 10, "audio/mpeg")})
    assert res.status_code == 413 and res.json()["code"] == "file_too_big"


def test_upload_too_long(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MAX_DURATION_SECONDS", 5)
    wav = make_wav(tmp_path / "long.wav", seconds=8)
    with pytest.raises(AudioError) as err:
        process_upload(wav, tmp_path, "long.wav")
    assert err.value.code == "too_long"
