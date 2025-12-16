"""
Centralized logging configuration.
"""

import logging
import sys
from typing import Optional
import config.settings as settings
def setup_logger(name: str, log_file: Optional[str] = None) -> logging.Logger:
    """Setup logger with console and optional file output."""
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, settings.LOG_LEVEL))
    
    # Clear existing handlers
    logger.handlers.clear()
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_format = logging.Formatter(settings.LOG_FORMAT)
    console_handler.setFormatter(console_format)
    logger.addHandler(console_handler)
    
    # File handler if specified
    if log_file:
        log_path = settings.LOG_DIR / log_file
        file_handler = logging.FileHandler(log_path, encoding='utf-8')
        file_format = logging.Formatter(settings.LOG_FORMAT)
        file_handler.setFormatter(file_format)
        logger.addHandler(file_handler)
    
    return logger

# Create main loggers
scraper_logger = setup_logger("scraper", "scraper.log")
uploader_logger = setup_logger("uploader", "uploader.log")
processor_logger = setup_logger("processor", "processor.log")