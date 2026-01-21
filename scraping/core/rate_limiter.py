"""
Intelligent rate limiter with adaptive delays and robust 429 handling.
"""

import time
import random
from collections import defaultdict
from core.logger import scraper_logger


class SmartRateLimiter:
    """Rate limiter that adapts per shop based on responses."""
    
    def __init__(self, base_delay: float = 2.0, max_delay: float = 30.0):
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.shop_delays = defaultdict(lambda: base_delay)
        self.shop_errors = defaultdict(int)
        self.shop_429_count = defaultdict(int)
        self.last_request_time = defaultdict(float)
        
    def get_delay(self, shop_id: str) -> float:
        """Get current delay for a specific shop."""
        return self.shop_delays[shop_id]
    
    def adapt_delay(self, shop_id: str, response=None, error: bool = False) -> float:
        """Adapt delay based on response and return wait time."""
        current_delay = self.shop_delays[shop_id]
        
        if response and response.status_code == 429:
            # Rate limited - aggressive backoff
            retry_after = self._parse_retry_after(response)
            
            # Exponential backoff based on consecutive 429s
            consecutive_429s = self.shop_429_count[shop_id]
            backoff_multiplier = 2 ** min(consecutive_429s, 5)  # Cap at 2^5 = 32x
            
            new_delay = min(retry_after * backoff_multiplier, self.max_delay)
            self.shop_errors[shop_id] += 1
            self.shop_429_count[shop_id] += 1
            
            scraper_logger.warning(
                f"Rate limited (429) for {shop_id}. "
                f"Retry-After: {retry_after}s, "
                f"Consecutive 429s: {consecutive_429s + 1}, "
                f"New delay: {new_delay:.1f}s"
            )
            
        elif error or (response and response.status_code >= 500):
            # Server error - moderate backoff
            new_delay = min(current_delay * 1.5, self.max_delay)
            self.shop_errors[shop_id] += 1
            scraper_logger.warning(f"Server error for {shop_id}, delay increased to {new_delay:.1f}s")
            
        else:
            # Success - gradually reduce delay and reset 429 counter
            new_delay = max(self.base_delay, current_delay * 0.9)
            self.shop_errors[shop_id] = max(0, self.shop_errors[shop_id] - 1)
            self.shop_429_count[shop_id] = 0  # Reset on success
        
        # Add small random variation to avoid thundering herd
        jitter = random.uniform(-0.2, 0.2)
        new_delay = max(self.base_delay, min(new_delay + jitter, self.max_delay))
        
        self.shop_delays[shop_id] = new_delay
        return new_delay
    
    def _parse_retry_after(self, response) -> float:
        """Parse Retry-After header with fallback logic."""
        retry_after = response.headers.get("Retry-After")
        
        if retry_after:
            try:
                # Try as seconds (integer)
                return float(retry_after)
            except ValueError:
                # Could be HTTP date format, but just use default
                pass
        
        # Shopify-specific headers
        if "X-Shopify-Shop-Api-Call-Limit" in response.headers:
            limit_info = response.headers.get("X-Shopify-Shop-Api-Call-Limit", "")
            scraper_logger.debug(f"Shopify API limit: {limit_info}")
        
        # Default retry time for 429 without Retry-After header
        return 5.0
    
    def wait(self, shop_id: str, response=None, error: bool = False) -> float:
        """Adapt delay and wait appropriate amount of time."""
        # Calculate wait time based on response
        wait_time = self.adapt_delay(shop_id, response, error)
        
        # Ensure minimum time between requests to same shop
        time_since_last = time.time() - self.last_request_time.get(shop_id, 0)
        if time_since_last < wait_time:
            actual_wait = wait_time - time_since_last
        else:
            actual_wait = 0.1  # Tiny wait even if enough time passed
        
        if actual_wait > 0:
            time.sleep(actual_wait)
        
        self.last_request_time[shop_id] = time.time()
        return actual_wait
    
    def wait_before_request(self, shop_id: str) -> float:
        """Wait before making a request (proactive rate limiting)."""
        current_delay = self.shop_delays[shop_id]
        time_since_last = time.time() - self.last_request_time.get(shop_id, 0)
        
        if time_since_last < current_delay:
            wait_time = current_delay - time_since_last
            time.sleep(wait_time)
            self.last_request_time[shop_id] = time.time()
            return wait_time
        
        self.last_request_time[shop_id] = time.time()
        return 0
    
    def reset_shop(self, shop_id: str):
        """Reset delay and error count for a shop."""
        self.shop_delays[shop_id] = self.base_delay
        self.shop_errors[shop_id] = 0
        self.shop_429_count[shop_id] = 0
        if shop_id in self.last_request_time:
            del self.last_request_time[shop_id]
    
    def get_stats(self, shop_id: str) -> dict:
        """Get current stats for a shop."""
        return {
            'current_delay': self.shop_delays[shop_id],
            'error_count': self.shop_errors[shop_id],
            'consecutive_429s': self.shop_429_count[shop_id],
            'last_request': self.last_request_time.get(shop_id, 0)
        }