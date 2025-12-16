"""
Intelligent rate limiter with adaptive delays.
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
        
    def get_delay(self, shop_id: str) -> float:
        """Get current delay for a specific shop."""
        return self.shop_delays[shop_id]
    
    def adapt_delay(self, shop_id: str, response=None, error: bool = False) -> float:
        """Adapt delay based on response and return wait time."""
        current_delay = self.shop_delays[shop_id]
        
        if response and response.status_code == 429:
            # Rate limited - exponential backoff
            retry_after = int(response.headers.get("Retry-After", 5))
            new_delay = min(retry_after * (2 ** self.shop_errors[shop_id]), self.max_delay)
            self.shop_errors[shop_id] += 1
            scraper_logger.warning(f"Rate limited for {shop_id}, delay increased to {new_delay:.1f}s")
            
        elif error or (response and response.status_code >= 500):
            # Server error - moderate backoff
            new_delay = min(current_delay * 1.5, self.max_delay)
            self.shop_errors[shop_id] += 1
            scraper_logger.warning(f"Server error for {shop_id}, delay increased to {new_delay:.1f}s")
            
        else:
            # Success - gradually reduce delay
            new_delay = max(self.base_delay, current_delay * 0.9)
            self.shop_errors[shop_id] = max(0, self.shop_errors[shop_id] - 1)
        
        # Add small random variation
        new_delay += random.uniform(-0.2, 0.2)
        new_delay = max(self.base_delay, min(new_delay, self.max_delay))
        
        self.shop_delays[shop_id] = new_delay
        return new_delay
    
    def wait(self, shop_id: str, response=None, error: bool = False) -> float:
        """Adapt delay and wait appropriate amount of time."""
        wait_time = self.adapt_delay(shop_id, response, error)
        time.sleep(wait_time)
        return wait_time
    
    def reset_shop(self, shop_id: str):
        """Reset delay and error count for a shop."""
        self.shop_delays[shop_id] = self.base_delay
        self.shop_errors[shop_id] = 0