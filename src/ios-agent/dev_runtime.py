#!/usr/bin/env python3
"""Validated personal tailnet runtime configuration. No application credentials."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse

METRO_PORT = 19404
PUBLIC_PORTS = {"metro": 10444, "graphql": 10445, "web": 10446}


def validate_config(value):
    if not isinstance(value, dict) or type(value.get("version")) is not int or value.get("version") != 1:
        raise ValueError("runtime_version_required")
    mobile = Path(value.get("mobile", "")).resolve()
    node = Path(value.get("node", "")).resolve()
    if not (mobile / "ios/kudos.xcworkspace").exists() or not node.is_file():
        raise ValueError("runtime_mobile_and_Node_required")
    hosts = set()
    for key, port in PUBLIC_PORTS.items():
        raw = value.get(key + "URL", "")
        if not isinstance(raw, str) or not raw.isascii() or re.search(r'[\s\\]', raw):
            raise ValueError("runtime_private_tailnet_URL_required")
        u = urlparse(raw)
        expected_path = "/development/graphql" if key == "graphql" else "/"
        if (u.scheme != "https" or not u.hostname or not u.hostname.endswith(".ts.net")
                or u.port != port or u.path != expected_path or u.query or u.fragment
                or u.username is not None or u.password is not None):
            raise ValueError("runtime_private_tailnet_URL_required")
        hosts.add(u.hostname)
    if len(hosts) != 1:
        raise ValueError("runtime_endpoints_must_share_host")
    names = value.get("routeNames", [])
    if not isinstance(names, list) or len(names) > 256 or any(not isinstance(n, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,63}', n) for n in names):
        raise ValueError("runtime_route_names_invalid")
    return {"version": 1, "mobile": str(mobile), "node": str(node),
            **{key + "URL": value[key + "URL"] for key in PUBLIC_PORTS}, "routeNames": sorted(set(names))}


def load_config(path):
    path = Path(path)
    if path.stat().st_mode & 0o077 or path.stat().st_size > 16384:
        raise ValueError("runtime_config_must_be_small_and_private")
    return validate_config(json.loads(path.read_text()))
