"""
Data schemas for all entities.
"""

from dataclasses import dataclass, asdict
from typing import Optional, List

@dataclass
class BaseEntity:
    """Base class for all scraped entities."""
    shop_id: str
    scraped_at: str
    
    def to_dict(self):
        return asdict(self)

@dataclass
class ShopData(BaseEntity):
    """Shop information."""
    id: str
    name: str
    url: str
    is_shopify: bool = True
    scrape_status: str = "success"

@dataclass
class CollectionData(BaseEntity):
    """Collection information."""
    id: str
    handle: str
    title: str
    collection_url: str
    description: Optional[str] = None
    products_count: Optional[int] = None
    published_at: Optional[str] = None
    updated_at: Optional[str] = None

@dataclass
class ProductData(BaseEntity):
    """Product information."""
    id: str
    handle: str
    title: str
    product_url: str
    description: Optional[str] = None
    product_type: Optional[str] = None
    vendor: Optional[str] = None
    tags: Optional[List[str]] = None
    price: Optional[float] = None
    compare_at_price: Optional[float] = None
    available: Optional[bool] = None
    image_url: Optional[str] = None
    published_at: Optional[str] = None
    updated_at: Optional[str] = None
    variants: Optional[List[dict]] = None
    images: Optional[List[dict]] = None
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []
        if self.variants is None:
            self.variants = []
        if self.images is None:
            self.images = []

@dataclass
class CollectionProductMapping(BaseEntity):
    """Collection-to-product relationship."""
    collection_id: str
    product_id: str
    position: Optional[int] = None
    added_at: Optional[str] = None

# Database schemas for upload
@dataclass
class DbShop:
    """Shop schema for database."""
    id: str
    name: str
    url: str
    is_shopify: bool = True
    scrape_status: str = "success"
    
    def to_dict(self):
        return asdict(self)

@dataclass
class DbCollection:
    """Collection schema for database."""
    id: str
    title: str
    handle: str
    shop_id: str
    collection_url: str
    description: Optional[str] = None
    products_count: Optional[int] = None
    published_at_external: Optional[str] = None
    updated_at_external: Optional[str] = None
    
    def to_dict(self):
        return asdict(self)

@dataclass 
class DbProduct:
    """Product schema for database."""
    id: str
    title: str
    handle: str
    vendor: str
    description: str
    updated_at_external: Optional[str] = None
    published_at_external: Optional[str] = None
    product_type: str = ""
    tags: Optional[List[str]] = None
    url: str = ""
    shop_id: str = ""
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []
    
    def to_dict(self):
        return asdict(self)

@dataclass
class DbCollectionProduct:
    """Collection-product schema for database."""
    product_id: str
    collection_id: str
    
    def to_dict(self):
        return asdict(self)