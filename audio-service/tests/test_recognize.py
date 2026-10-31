import asyncio
import time

from app.recognize import (
    RateLimiter, confidence, fill_in, initial_probes, merge_results, next_probe, parse_answer,
)


def seg(i, length=12):
    return {"index": i, "start": i * length, "end": (i + 1) * length}


def hit(key, skew=0.0, title=None):
    return {"key": key, "title": title or f"Song {key}", "artist": "Artist", "offset": 0, "skew": skew}


def results(*keys):
    """keys[i] is the song key matched in segment i, or None for no match."""
    return [
        {"index": i, "hit": hit(k) if k else None, "error": None, "status": "matched" if k else "no_match"}
        for i, k in enumerate(keys)
    ]


def checks(**found):
    """checks(p3="a", p7=None) -> {3: result with song a, 7: result with no match}"""
    return {int(k[1:]): {"hit": hit(v) if v else None, "error": None} for k, v in found.items()}


def test_parse_answer_extracts_track_fields():
    answer = {
        "matches": [{"offset": 36.06, "timeskew": -6.8e-05, "frequencyskew": 0.0}],
        "track": {
            "key": "68450484",
            "title": "Gangnam Style",
            "subtitle": "PSY",
            "isrc": "USUM71210283",
            "url": "https://www.shazam.com/track/68450484/gangnam-style",
            "genres": {"primary": "Pop"},
            "images": {"coverart": "small.jpg", "coverarthq": "big.jpg"},
            "sections": [{"type": "SONG", "metadata": [
                {"title": "Album", "text": "The Singles"},
                {"title": "Label", "text": "Universal"},
                {"title": "Released", "text": "2012"},
            ]}],
            "hub": {"actions": [{"type": "applemusicplay"}, {"type": "uri", "uri": "https://audio/preview.m4a"}]},
        },
    }
    parsed = parse_answer(answer)
    assert parsed["key"] == "68450484"
    assert parsed["title"] == "Gangnam Style" and parsed["artist"] == "PSY"
    assert parsed["album"] == "The Singles" and parsed["year"] == "2012" and parsed["genre"] == "Pop"
    assert parsed["coverUrl"] == "big.jpg"
    assert parsed["previewUrl"] == "https://audio/preview.m4a"
    assert parsed["skew"] < 1e-3


def test_parse_answer_no_match():
    assert parse_answer({"matches": [], "tagid": "x"}) is None
    assert parse_answer({}) is None


def test_confidence_grows_with_agreeing_segments():
    assert confidence([hit("a")]) == 0.75
    assert confidence([hit("a")] * 2) == 0.94
    assert confidence([hit("a")] * 10) == 0.99  # capped
    assert confidence([hit("a", skew=0.03)]) == 0.45  # skewed hit counts less


def test_single_song_with_one_missed_segment_is_one_range():
    segments = [seg(i) for i in range(5)]
    songs = merge_results(segments, results("a", "a", None, "a", "a"))
    assert len(songs) == 1
    assert songs[0]["appearances"] == [{"start": 0, "end": 60}]
    assert songs[0]["segmentsMatched"] == 4
    assert songs[0]["startTime"] == 0 and songs[0]["endTime"] == 60
    assert "hits" not in songs[0] and "skew" not in songs[0]


def test_multiple_songs_in_order_of_appearance():
    segments = [seg(i) for i in range(8)]
    songs = merge_results(segments, results(None, "b", "b", None, None, "a", "a", "a"))
    assert [s["key"] for s in songs] == ["b", "a"]
    assert songs[0]["appearances"] == [{"start": 12, "end": 36}]
    assert songs[1]["appearances"] == [{"start": 60, "end": 96}]


def test_song_that_returns_later_gets_two_appearances():
    segments = [seg(i) for i in range(7)]
    songs = merge_results(segments, results("a", "a", "b", "b", None, None, "a"))
    a = next(s for s in songs if s["key"] == "a")
    assert a["appearances"] == [{"start": 0, "end": 24}, {"start": 72, "end": 84}]
    assert a["startTime"] == 0 and a["endTime"] == 24


def test_gap_is_not_bridged_when_another_song_is_in_between():
    segments = [seg(i) for i in range(3)]
    songs = merge_results(segments, results("a", "b", "a"))
    a = next(s for s in songs if s["key"] == "a")
    assert len(a["appearances"]) == 2


def test_failed_segments_are_ignored():
    segments = [seg(i) for i in range(3)]
    res = results("a", None, "a")
    res[1]["error"] = "TimeoutError"
    songs = merge_results(segments, res)
    assert songs[0]["appearances"] == [{"start": 0, "end": 36}]


def test_no_hits_means_no_songs():
    assert merge_results([seg(0), seg(1)], results(None, None)) == []


# ---------- choosing which segments to check ----------

def test_initial_probes_are_spread_out():
    assert initial_probes(21, 3) == [3, 10, 17]
    assert initial_probes(2, 3) == [0, 1]
    assert initial_probes(1, 3) == [0]


def test_same_song_everywhere_needs_no_more_checks():
    assert next_probe(21, checks(p3="a", p10="a", p17="a")) is None


def test_boundary_between_two_songs_is_narrowed_down():
    c = checks(p3="a", p10="b", p17="b")
    assert next_probe(21, c) == 6  # middle of the a|b gap (4..9)
    c.update(checks(p6="a"))
    assert next_probe(21, c) == 8  # now between 6 (a) and 10 (b)
    c.update(checks(p8="b"))
    assert next_probe(21, c) == 7
    c.update(checks(p7="b"))
    assert next_probe(21, c) is None  # boundary found: a ends at 6, b starts at 7


def test_widest_boundary_gap_goes_first():
    c = checks(p2="a", p4="b", p12="c")
    assert next_probe(15, c) == 8  # gap 5..11 beats gap 3..3


def test_nothing_found_keeps_exploring_biggest_gap_including_edges():
    assert next_probe(21, checks(p3=None, p10=None, p17=None)) in (6, 13)
    assert next_probe(10, checks(p5=None)) == 2  # edge gap 0..4 is the widest


def test_failed_check_next_to_song_is_rechecked_nearby():
    c = {3: {"hit": None, "error": "TimeoutError"}, **checks(p10="a")}
    assert next_probe(14, c) == 6


def test_fill_in_infers_between_matching_checks():
    c = checks(p0="a", p3="a", p5=None)
    out = fill_in(7, c)
    assert [r["status"] for r in out] == [
        "matched", "inferred", "inferred", "matched", "skipped", "no_match", "skipped",
    ]
    assert out[1]["hit"]["key"] == "a"


def test_inferred_segments_extend_range_but_not_confidence():
    segments = [seg(i) for i in range(5)]
    out = fill_in(5, checks(p0="a", p4="a"))
    songs = merge_results(segments, out)
    assert songs[0]["appearances"] == [{"start": 0, "end": 60}]
    assert songs[0]["segmentsMatched"] == 2
    assert songs[0]["confidence"] == confidence([hit("a")] * 2)


# ---------- rate limiter ----------

def test_rate_limiter_allows_burst_then_waits():
    async def run():
        rl = RateLimiter(burst=2, refill_seconds=0.2)
        t = time.monotonic()
        for _ in range(3):
            await rl.acquire()
        return time.monotonic() - t

    elapsed = asyncio.run(run())
    assert 0.15 <= elapsed < 0.6  # first two instantly, third after one refill


def test_rate_limiter_penalty_pauses_everyone():
    async def run():
        rl = RateLimiter(burst=5, refill_seconds=0.01)
        rl.penalize(0.2)
        t = time.monotonic()
        await rl.acquire()
        return time.monotonic() - t

    assert asyncio.run(run()) >= 0.18


# ---------- whole recognition loop with a fake Shazam ----------

class FakeShazam:
    """Stands in for shazamio.Shazam: answers from a {segment file name: song key} table."""

    answers: dict = {}
    calls: list = []
    rate_limited = False

    def __init__(self, **_):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        pass

    async def recognize(self, path):
        from shazamio.exceptions import RateLimited

        FakeShazam.calls.append(path)
        if FakeShazam.rate_limited:
            raise RateLimited("429")
        key = FakeShazam.answers.get(path)
        if not key:
            return {"matches": []}
        return {"matches": [{"offset": 0, "timeskew": 0, "frequencyskew": 0}],
                "track": {"key": key, "title": f"Song {key}", "subtitle": "Artist"}}


def _setup(monkeypatch, *, budget=5.0, cooldown=0.05):
    import app.recognize as rec
    from app import config

    monkeypatch.setattr(rec, "Shazam", FakeShazam)
    monkeypatch.setattr(rec, "_limiter", rec.RateLimiter(burst=100, refill_seconds=0.001))
    monkeypatch.setattr(config, "RECOGNIZE_TIME_BUDGET_SECONDS", budget)
    monkeypatch.setattr(config, "SHAZAM_COOLDOWN_SECONDS", cooldown)
    FakeShazam.calls = []
    FakeShazam.rate_limited = False
    return rec


def _segments(n):
    return [{**seg(i), "path": f"seg{i}"} for i in range(n)]


def test_single_song_video_uses_three_checks(monkeypatch):
    rec = _setup(monkeypatch)
    FakeShazam.answers = {f"seg{i}": "a" for i in range(21)}
    out = asyncio.run(rec.recognize_segments(_segments(21)))
    assert len(FakeShazam.calls) == 3
    statuses = [r["status"] for r in out]
    assert statuses.count("matched") == 3 and "inferred" in statuses


def test_two_song_video_finds_the_boundary(monkeypatch):
    rec = _setup(monkeypatch)
    FakeShazam.answers = {f"seg{i}": ("a" if i < 8 else "b") for i in range(21)}
    out = asyncio.run(rec.recognize_segments(_segments(21)))
    songs = rec.merge_results(_segments(21), out)
    assert [s["key"] for s in songs] == ["a", "b"]
    assert out[7]["hit"]["key"] == "a" and out[8]["hit"]["key"] == "b"
    assert len(FakeShazam.calls) <= 8


def test_blocked_shazam_gives_up_within_budget(monkeypatch):
    import pytest
    from app.errors import AudioError

    rec = _setup(monkeypatch, budget=0.5, cooldown=0.2)
    FakeShazam.rate_limited = True
    started = time.monotonic()
    with pytest.raises(AudioError) as err:
        asyncio.run(rec.recognize_segments(_segments(21)))
    assert err.value.code == "recognition_busy"
    assert time.monotonic() - started < 1.5
