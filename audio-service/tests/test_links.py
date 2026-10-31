from app.links import best_video, parse_musicbrainz, site_name


def entry(vid, title, channel, verified=None, duration=None, views=None):
    return {"id": vid, "title": title, "channel": channel, "channel_is_verified": verified,
            "duration": duration, "view_count": views}


# Real search results (titles/channels) seen for these songs
GANGNAM = [
    entry("9bZkp7q19f0", "PSY - GANGNAM STYLE(강남스타일) M/V", "officialpsy", True, 253, 6_110_784_254),
    entry("cGc_NfiTxng", "PSY - GANGNAM STYLE [Original Video]", "Tobsi", None, 223, 54_765_399),
    entry("CH1XGdu-hzQ", "PSY- Gangnam Style (Official Music Video)", "Love WildManChris", None, 302, 133_117_776),
    entry("DzivgKuhNl4", "PSY - GANGNAM STYLE (강남스타일) @ Seoul Plaza Live Concert", "officialpsy", True, 231, 85_219_609),
    entry("ASO_zypdnsQ", "PSY - GENTLEMAN M/V", "officialpsy", True, 234, 1_765_826_045),
]
SHAPE = [
    entry("Svtr-p4mrQ8", "Ed Sheeran - Shape of You (The Biggest Weekend)", "BBC Radio 1", True, 282, 48_995_144),
    entry("liTfD88dbCo", "Ed Sheeran - Shape of You (Lyrics)", "7clouds", True, 232, 168_757_880),
    entry("JGwWNGJdvx8", "Ed Sheeran - Shape of You (Official Music Video)", "Ed Sheeran", True, 264, 6_835_180_904),
    entry("6x96tejoZ9Y", "Ed Sheeran - Shape Of You (Asher Remix)", "Asher", True, 224, 31_884_229),
]
URANIUM = [
    entry("qzaeM5bY2h0", "ZAYLO - MONTAGEM URANIUM (Slowed)", "New'o", True, 101, 11_404),
    entry("ZJdnKkV47uc", "ZAYLO - MONTAGEM URANIUM (Slowed)", "void", True, 100, 3_657_906),
    entry("p6OsHGCWPHM", "ZAYLO - MONTAGEM URANIUM (ultra slowed + reverb)", "Nagumo", None, 150, 1_116_352),
]


def test_picks_the_artists_own_music_video():
    v = best_video(GANGNAM, "Gangnam Style", "PSY", "Silent Records/Universal Republic Records", 219)
    assert v["url"].endswith("9bZkp7q19f0") and v["official"]


def test_official_video_beats_lyrics_and_remix():
    v = best_video(SHAPE, "Shape of You", "Ed Sheeran", "Atlantic Records UK", 233)
    assert v["url"].endswith("JGwWNGJdvx8") and v["official"]


def test_label_channel_counts_and_words_in_the_title_are_not_penalised():
    v = best_video(URANIUM, "MONTAGEM URANIUM (Slowed)", "ZAYLO", "void", 99)
    assert v["url"].endswith("ZJdnKkV47uc") and v["official"]


def test_fan_upload_is_only_a_best_match():
    fans = [entry("x1", "Some Song (Lyrics)", "random lyrics channel", None, 200, 1000),
            entry("x2", "Artist - Some Song", "Someone Else", None, 200, 50_000)]
    v = best_video(fans, "Some Song", "Artist", None, 200)
    assert v["url"].endswith("x2") and not v["official"]


def test_nothing_relevant_means_no_video():
    assert best_video([entry("z", "Totally different thing", "x", None, 10, 5)], "Some Song", "Artist", None, 200) is None
    assert best_video([], "Some Song", "Artist", None, 200) is None


MB_RESPONSE = {
    "isrc": "XX0000000001",
    "recordings": [
        {"title": "Chapter 25", "relations": [  # wrong recording sharing the ISRC: ignored
            {"type": "download for free", "url": {"resource": "https://example.com/wrong.mp3"}}]},
        {"title": "Some Song (Radio Edit)", "relations": [
            {"type": "free streaming", "url": {"resource": "https://music.youtube.com/watch?v=ytmusic"}},
            {"type": "free streaming", "url": {"resource": "https://www.youtube.com/watch?v=official1"}},
            {"type": "streaming", "url": {"resource": "https://open.spotify.com/track/abc"}},
            {"type": "download for free", "url": {"resource": "https://artist.bandcamp.com/track/some-song"}},
            {"type": "download for free", "url": {"resource": "https://artist.bandcamp.com/track/some-song"}},
            {"type": "purchase for download", "url": {"resource": "https://store.example.com/buy"}},
        ]},
    ],
}


def test_parse_musicbrainz_takes_youtube_and_free_downloads_only():
    links = parse_musicbrainz(MB_RESPONSE, "Some Song")
    assert links["youtube"] == "https://www.youtube.com/watch?v=official1"  # not music.youtube.com
    assert links["freeDownloads"] == [{"url": "https://artist.bandcamp.com/track/some-song", "site": "Bandcamp"}]


def test_paid_links_never_count_as_free():
    data = {"recordings": [{"title": "Some Song", "relations": [
        {"type": "purchase for download", "url": {"resource": "https://store.example.com/buy"}}]}]}
    assert parse_musicbrainz(data, "Some Song")["freeDownloads"] == []


def test_site_names():
    assert site_name("https://artist.bandcamp.com/track/x") == "Bandcamp"
    assert site_name("https://archive.org/details/x") == "Internet Archive"
    assert site_name("https://www.example.org/song.mp3") == "example.org"
