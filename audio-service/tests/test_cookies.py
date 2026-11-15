import os
import stat

from app import config, youtube


def test_read_only_cookies_are_copied_to_a_writable_file(tmp_path, monkeypatch):
    secret = tmp_path / "secrets" / "cookies.txt"
    secret.parent.mkdir()
    secret.write_text("# Netscape HTTP Cookie File\n")
    os.chmod(secret, stat.S_IREAD)  # like Render's read-only /etc/secrets
    monkeypatch.setattr(config, "YTDLP_COOKIES_FILE", str(secret))
    monkeypatch.setattr(config, "TEMP_DIR", tmp_path / "work" / "tmp")

    opts = youtube._ydl_opts()
    copy = opts["cookiefile"]
    assert copy != str(secret) and open(copy).read().startswith("# Netscape")
    with open(copy, "a") as f:  # yt-dlp can write to it
        f.write("x")


def test_no_cookies_configured(monkeypatch):
    monkeypatch.setattr(config, "YTDLP_COOKIES_FILE", "")
    assert "cookiefile" not in youtube._ydl_opts()


def test_cookies_status_reports_without_values(tmp_path, monkeypatch):
    f = tmp_path / "cookies.txt"
    f.write_text("# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tsecretvalue\n")
    monkeypatch.setattr(config, "YTDLP_COOKIES_FILE", str(f))
    status = youtube.cookies_status()
    assert status == {"configured": True, "found": True, "youtubeCookies": 1, "netscapeFormat": True}
    assert "secretvalue" not in str(status)

    monkeypatch.setattr(config, "YTDLP_COOKIES_FILE", str(tmp_path / "missing.txt"))
    assert youtube.cookies_status()["found"] is False
