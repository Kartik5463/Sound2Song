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


def test_plan_segments_windows_and_leftovers():
    segs = plan_segments(45, [], segment_seconds=20, min_seconds=6, max_segments=60)
    assert [(s["start"], s["end"]) for s in segs] == [(0, 20), (20, 40)]  # 5s leftover dropped

    segs = plan_segments(48, [], segment_seconds=20, min_seconds=6, max_segments=60)
    assert segs[-1] == {"index": 2, "start": 40, "end": 48}


def test_plan_segments_skips_silence_and_caps_count():
    segs = plan_segments(60, [(10, 40)], segment_seconds=20, min_seconds=6, max_segments=60)
    assert [(s["start"], s["end"]) for s in segs] == [(0, 10), (40, 60)]

    segs = plan_segments(900, [], segment_seconds=10, min_seconds=6, max_segments=5)
    assert len(segs) == 5
    assert segs[0]["start"] == 0 and segs[-1]["start"] > 600  # spread across the video


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
