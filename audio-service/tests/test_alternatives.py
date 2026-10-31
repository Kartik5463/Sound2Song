import asyncio

from app import alternatives
from app.alternatives import add_alternatives, build_mashup, mashup_parts
from app.recognize import merge_results, parse_answer


def test_mashup_parts_from_real_titles():
    assert mashup_parts("Darkside X Aja Sanam (Remix)") == ["Darkside", "Aja Sanam"]
    assert mashup_parts("Kesariya x Tum Hi Ho (Mashup)") == ["Kesariya", "Tum Hi Ho"]
    assert mashup_parts("Song A vs. Song B [Lofi Edit]") == ["Song A", "Song B"]
    assert mashup_parts("A × B + C") == ["A", "B", "C"]


def test_normal_titles_are_not_mashups():
    assert mashup_parts("DARKSIDE") == []
    assert mashup_parts("Sexy Back") == []  # the word "x" alone must be separate
    assert mashup_parts("Max Power") == []
    assert mashup_parts("") == []


SONG = {"key": "550233203", "title": "DARKSIDE", "artist": "Neoni", "shazamUrl": "u", "coverUrl": "c"}
MASHUP = {"key": "654019278", "title": "Darkside X Aja Sanam (Remix)", "artist": "Lord Arkh",
          "shazamUrl": "m", "coverUrl": "mc"}
COVER = {"key": "671279825", "title": "Darkside", "artist": "R-ONE", "shazamUrl": "r", "coverUrl": "rc"}


def test_build_mashup_lists_parts_and_marks_what_was_heard():
    m = build_mashup(SONG, [COVER, MASHUP], found_titles=["DARKSIDE"])
    assert m["title"] == "Darkside X Aja Sanam (Remix)" and m["artist"] == "Lord Arkh"
    assert m["parts"] == [{"name": "Darkside", "identified": True}, {"name": "Aja Sanam", "identified": False}]


def test_mashup_must_contain_the_song_we_heard():
    unrelated = {**MASHUP, "title": "Other Song X Another One"}
    assert build_mashup(SONG, [unrelated], found_titles=["DARKSIDE"]) is None
    assert build_mashup(SONG, [COVER], found_titles=["DARKSIDE"]) is None


def test_parse_answer_keeps_other_matching_tracks():
    answer = {
        "matches": [{"id": "550233203", "offset": 1, "timeskew": 0, "frequencyskew": 0},
                    {"id": "671279825"}, {"id": "654019278"}, {"id": "654019278"}],
        "track": {"key": "550233203", "title": "DARKSIDE", "subtitle": "Neoni"},
    }
    assert parse_answer(answer)["altKeys"] == ["671279825", "654019278"]


def test_merge_collects_alt_keys_from_all_hits():
    segs = [{"index": 0, "start": 0, "end": 6}, {"index": 1, "start": 6, "end": 13}]
    hit = {"key": "a", "title": "A", "artist": "x", "offset": 0, "skew": 0}
    results = [
        {"index": 0, "hit": {**hit, "altKeys": ["b"]}, "error": None, "status": "matched"},
        {"index": 1, "hit": {**hit, "offset": 6, "altKeys": ["c", "b"]}, "error": None, "status": "matched"},
    ]
    assert merge_results(segs, results)[0]["altKeys"] == ["b", "c"]


def test_add_alternatives_with_fake_lookup(monkeypatch):
    catalogue = {"671279825": COVER, "654019278": MASHUP}

    class FakeShazam:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            pass

        async def track_about(self, track_id):
            t = catalogue.get(str(track_id))
            return t and {"key": t["key"], "title": t["title"], "subtitle": t["artist"], "url": t["shazamUrl"]}

    monkeypatch.setattr(alternatives, "Shazam", FakeShazam)
    songs = [{**SONG, "altKeys": ["671279825", "654019278", "999"]}]
    asyncio.run(add_alternatives(songs))
    song = songs[0]
    assert "altKeys" not in song
    assert [a["artist"] for a in song["alsoMatches"]] == ["R-ONE", "Lord Arkh"]
    assert [p["name"] for p in song["mashup"]["parts"]] == ["Darkside", "Aja Sanam"]
