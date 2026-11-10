"""Unprivileged SkellWorld discovery through its documented read-only console."""
from __future__ import annotations
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DASHBOARD = "http://127.0.0.1:48674"
MAX_RESPONSE = 256 * 1024


def _request(endpoint: str, expected_schema: str) -> dict:
    req = Request(DASHBOARD + endpoint, headers={"Accept": "application/json"}, method="GET")
    with urlopen(req, timeout=0.9) as res:
        if res.status != 200:
            raise ValueError("Unexpected status")
        body = res.read(MAX_RESPONSE + 1)
    if len(body) > MAX_RESPONSE:
        raise ValueError("SkellWorld response is too large")
    obj = json.loads(body)
    if not isinstance(obj, dict) or obj.get("schema") != expected_schema:
        raise ValueError("Incompatible SkellWorld schema")
    return obj


def discover() -> dict:
    try:
        status = _request("/api/status", "skellworld-status/1")
        catalog = _request("/api/catalog", "skellworld-catalog/1")
        peers = status.get("peers", [])
        plugins = catalog.get("plugins", [])
        if not isinstance(peers, list) or not isinstance(plugins, list):
            raise ValueError("Invalid SkellWorld payload")
        # Only informational fields. Never treat these events as trusted commands.
        peers = [{"product_id": x.get("product_id", ""),
                  "display_name": x.get("display_name", "")}
                 for x in peers[:32] if isinstance(x, dict)]
        plugins = [{"repository": x.get("repository", ""),
                    "product_id": x.get("product_id"),
                    "integration": x.get("integration", "planned")}
                   for x in plugins[:200] if isinstance(x, dict)]
        return {"online": True, "peer_count": len(peers), "peers": peers,
                "catalog": plugins, "source": "SkellWorld read-only console v1",
                "warning": "SW1 is unauthenticated; presence is informational only"}
    except (OSError, HTTPError, URLError, ValueError, TypeError, TimeoutError) as exc:
        return {"online": False, "peer_count": 0, "peers": [], "catalog": [],
                "source": "SkellWorld read-only console v1", "warning": "Unavailable: " + type(exc).__name__}
