from app import config, youtube


def test_token_server_is_passed_to_yt_dlp_only_when_configured(monkeypatch):
    monkeypatch.setattr(config, "YTDLP_COOKIES_FILE", "")
    monkeypatch.setattr(config, "YTDLP_POT_PROVIDER_URL", "")
    assert "extractor_args" not in youtube._ydl_opts()

    monkeypatch.setattr(config, "YTDLP_POT_PROVIDER_URL", "http://127.0.0.1:4416")
    args = youtube._ydl_opts()["extractor_args"]
    assert args == {"youtubepot-bgutilhttp": {"base_url": ["http://127.0.0.1:4416"]}}


def test_pot_status_when_off_or_unreachable(monkeypatch):
    monkeypatch.setattr(config, "YTDLP_POT_PROVIDER_URL", "")
    assert youtube.pot_provider_status() == {"configured": False, "reachable": False}

    monkeypatch.setattr(config, "YTDLP_POT_PROVIDER_URL", "http://127.0.0.1:9")  # nothing listens here
    status = youtube.pot_provider_status()
    assert status["configured"] is True and status["reachable"] is False


def test_health_reports_token_server(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    monkeypatch.setattr(config, "YTDLP_POT_PROVIDER_URL", "")
    body = TestClient(app).get("/health").json()
    assert body["poTokenServer"] == {"configured": False, "reachable": False}


def test_player_clients_and_debug_settings(monkeypatch):
    monkeypatch.setattr(config, "YTDLP_COOKIES_FILE", "")
    monkeypatch.setattr(config, "YTDLP_POT_PROVIDER_URL", "")
    monkeypatch.setattr(config, "YTDLP_PLAYER_CLIENTS", ["mweb", "tv"])
    monkeypatch.setattr(config, "YTDLP_DEBUG", True)
    opts = youtube._ydl_opts()
    assert opts["extractor_args"] == {"youtube": {"player_client": ["mweb", "tv"]}}
    assert opts["verbose"] is True and opts["quiet"] is False


def test_proxy_and_ipv4_reach_every_yt_dlp_call(monkeypatch):
    from app import links

    monkeypatch.setattr(config, "YTDLP_PROXY", "socks5://127.0.0.1:40000")
    monkeypatch.setattr(config, "YTDLP_FORCE_IPV4", True)
    opts = youtube._ydl_opts()
    assert opts["proxy"] == "socks5://127.0.0.1:40000" and opts["source_address"] == "0.0.0.0"
    assert links.network_opts() == {"proxy": "socks5://127.0.0.1:40000", "source_address": "0.0.0.0"}


def test_network_status_hides_proxy_passwords(monkeypatch):
    monkeypatch.setattr(config, "YTDLP_PROXY", "http://user:secret@proxy.example.com:8080")
    monkeypatch.setattr(config, "YTDLP_FORCE_IPV4", False)
    status = youtube.network_status()
    assert "secret" not in str(status) and status["proxy"] == "http://***@proxy.example.com:8080"
    assert status["proxyListening"] is False  # nothing to connect to in tests

    monkeypatch.setattr(config, "YTDLP_PROXY", "")
    assert youtube.network_status()["proxy"] is None
