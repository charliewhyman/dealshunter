"""Shared session utilities for scraping scripts.

Provides a single `create_session()` factory with retry/backoff and a
`get_headers()` helper to centralize User-Agent rotation.
"""
from typing import Dict
import random
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
]


def create_session(backoff_factor: float = 1.0, total_retries: int = 3) -> requests.Session:
    """Create a requests.Session configured with retry/backoff and a randomized User-Agent.

    Sessions created by this helper do NOT configure any proxies (direct connection).
    """
    session = requests.Session()
    retry = Retry(
        total=total_retries,
        backoff_factor=backoff_factor,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({"User-Agent": random.choice(USER_AGENTS)})
    return session


def get_headers() -> Dict[str, str]:
    """Return a headers dict with a randomized `User-Agent`.

    Use this when you need headers for a single request rather than a session.
    """
    return {"User-Agent": random.choice(USER_AGENTS)}
