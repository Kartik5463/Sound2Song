import pytest

from app.audio import parse_silence, plan_segments, sound_ranges
from app.youtube import extract_video_id


@pytest.mark.parametrize("url", [
    "https://www.youtube.com/watch?v=9bZkp7q19f0",
    "https://youtube.com/watch?v=9bZkp7q19f0&t=43s",
    "youtube.com/watch?v=9bZkp7q19f0",
    "https://m.youtube.com/watch?v=9bZkp7q19f0",
    "https://music.youtube.com/watch?v=9bZkp7q19f0&list=RD",
    "https://youtu.be/9bZkp7q19f0?si=abc",
    "https://www.youtube.com/shorts/9bZkp7q19f0",
    "https://www.youtube.com/embed/9bZkp7q19f0",
    "https://www.youtube.com/live/9bZkp7q19f0",
])
def test_extract_video_id_valid(url):
    assert extract_video_id(url) == "9bZkp7q19f0"


@pytest.mark.parametrize("url", [
    "", "hello", "https://vimeo.com/123", "https://youtube.com/watch?v=short",
    "https://evil.com/watch?v=9bZkp7q19f0", "https://youtube.com/playlist?list=PL123",
])
def test_extract_video_id_invalid(url):
    assert extract_video_id(url) is None


def test_parse_silence_including_open_ended():
    stderr = (
        "[silencedetect @ 0x1] silence_start: -0.01\n"
        "[silencedetect @ 0x1] silence_end: 2.5 | silence_duration: 2.5\n"
        "[silencedetect @ 0x1] silence_start: 50\n"
    )
    assert parse_silence(stderr, 60.0) == [(0.0, 2.5), (50.0, 60.0)]


def test_sound_ranges_are_gaps_between_silence():
    assert sound_ranges(60, [(0, 2.5), (30, 32), (50, 60)]) == [(2.5, 30), (32, 50)]
    assert sound_ranges(10, []) == [(0.0, 10)]


def spans(segs):
    return [(s["start"], s["end"]) for s in segs]


def test_plan_segments_splits_evenly_without_leftovers():
    # 45 s -> two equal parts of 22.5 s (closest to 20 s), nothing dropped
    assert spans(plan_segments(45, [], segment_seconds=20, min_seconds=4)) == [(0, 22.5), (22.5, 45)]
    # 25 s stays one segment rather than 20 s + a 5 s leftover
    assert spans(plan_segments(25, [], segment_seconds=20, min_seconds=4)) == [(0, 25)]
    assert plan_segments(60, [], segment_seconds=20, min_seconds=4)[-1] == {
        "index": 2, "start": 40, "end": 60, "section": 0,
    }


def test_plan_segments_skips_silence_and_caps_count():
    segs = plan_segments(60, [(10, 40)], segment_seconds=20, min_seconds=6)
    assert spans(segs) == [(0, 10), (40, 60)]
    assert [s["section"] for s in segs] == [0, 1]

    segs = plan_segments(900, [], segment_seconds=10, min_seconds=6, max_segments=5)
    assert len(segs) == 5
    assert segs[0]["start"] == 0 and segs[-1]["start"] > 600  # spread across the video


def test_plan_segments_never_spans_a_song_change():
    # A 32 s montage with changes at 12.8 s and 22 s -> three sections
    segs = plan_segments(32, [], cuts=[12.8, 22.0], segment_seconds=12, min_seconds=4)
    assert spans(segs) == [(0, 12.8), (12.8, 22.0), (22.0, 32)]
    assert [s["section"] for s in segs] == [0, 1, 2]


def test_plan_segments_drops_tiny_sections():
    segs = plan_segments(30, [], cuts=[2.0], segment_seconds=12, min_seconds=4)
    assert spans(segs) == [(2.0, 16.0), (16.0, 30)]  # the 2 s piece before the cut is too short


def test_check_info_rejects_live_and_long_videos():
    from app import config
    from app.errors import AudioError
    from app.youtube import _check_info

    _check_info({"duration": 200})  # fine

    with pytest.raises(AudioError) as live:
        _check_info({"is_live": True, "duration": 0})
    assert live.value.code == "live_stream"

    with pytest.raises(AudioError) as long_:
        _check_info({"duration": config.MAX_DURATION_SECONDS + 1})
    assert long_.value.code == "too_long" and long_.value.status_code == 422


def test_read_segment_returns_a_wav_slice(tmp_path):
    import io
    import wave

    from app.audio import read_segment

    src = tmp_path / "clean.wav"
    with wave.open(str(src), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(bytes([1, 0]) * 16000 * 30)  # 30 s of 16-bit mono

    clip = read_segment(src, 12, 24)
    with wave.open(io.BytesIO(clip)) as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1
        assert w.getnframes() == 16000 * 12

    tail = read_segment(src, 24, 40)  # past the end: just what's there
    with wave.open(io.BytesIO(tail)) as w:
        assert w.getnframes() == 16000 * 6


def test_service_token_is_required_when_configured(monkeypatch):
    from fastapi.testclient import TestClient

    from app import config
    from app.main import app

    monkeypatch.setattr(config, "AUDIO_SERVICE_TOKEN", "s3cret")
    client = TestClient(app)
    assert client.get("/health").status_code == 200  # health stays open for uptime checks
    assert client.post("/process", json={"url": "https://youtu.be/xxxxxxxxxxx"}).status_code == 401
    bad = client.post("/process", json={"url": "https://vimeo.com/123"}, headers={"X-Service-Token": "s3cret"})
    assert bad.status_code == 400 and bad.json()["code"] == "invalid_url"
