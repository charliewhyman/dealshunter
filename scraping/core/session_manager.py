"""
HTTP session management with connection pooling.
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import random
import config.settings as settings

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
]

class SessionManager:
    """Manages HTTP sessions with retry logic."""
    
    _sessions = {}
    
    @classmethod
    def get_session(cls, shop_id: str = "default") -> requests.Session:
        """Get or create a session for a specific shop."""
        if shop_id not in cls._sessions:
            session = requests.Session()
            
            # Configure retry strategy
            retry_strategy = Retry(
                total=settings.SCRAPER_CONFIG['retry_attempts'],
                backoff_factor=1,
                status_forcelist=[429, 500, 502, 503, 504],
                allowed_methods=["GET", "POST"],
                raise_on_status=False,
            )
            
            adapter = HTTPAdapter(
                max_retries=retry_strategy,
                pool_connections=10,
                pool_maxsize=20
            )
            
            session.mount("http://", adapter)
            session.mount("https://", adapter)
            
            # Set headers
            headers = settings.DEFAULT_HEADERS.copy()
            headers["User-Agent"] = random.choice(USER_AGENTS)
            # Avoid advertising brotli to servers if the runtime may not support it
            ae = headers.get('Accept-Encoding', '')
            if 'br' in ae:
                parts = [p.strip() for p in ae.split(',') if p.strip() and p.strip() != 'br']
                headers['Accept-Encoding'] = ', '.join(parts) if parts else 'gzip, deflate'

            session.headers.update(headers)
            
            cls._sessions[shop_id] = session
        
        return cls._sessions[shop_id]
    
    @classmethod
    def get_headers(cls) -> dict:
        """Get headers with random User-Agent."""
        headers = settings.DEFAULT_HEADERS.copy()
        headers["User-Agent"] = random.choice(USER_AGENTS)
        return headers
    
    @classmethod
    def close_all(cls):
        """Close all sessions."""
        for session in cls._sessions.values():
            session.close()
        cls._sessions.clear()