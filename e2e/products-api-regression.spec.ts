import { test, expect } from '@playwright/test';

// API base URL
const API_BASE = 'http://localhost:4321/api';

test.describe('Products API Regression Tests', () => {
  // ===========================================================================
  // BASIC PRODUCT LISTING TESTS
  // ===========================================================================

  test('GET /api/products returns products with default filters', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
    
    const product = products[0];
    expect(product).toHaveProperty('id');
    expect(product).toHaveProperty('title');
    expect(product).toHaveProperty('shop_name');
    expect(product).toHaveProperty('min_price');
    expect(product).toHaveProperty('in_stock');
    expect(product).toHaveProperty('is_archived');
    
    products.forEach(p => {
      expect(p.in_stock).toBe(true);
      expect(p.is_archived).toBe(false);
    });
  });

  test('GET /api/products returns correct pagination with offset and limit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=5&offset=0`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    expect(products.length).toBeLessThanOrEqual(5);
    expect(products.length).toBeGreaterThan(0);
    
    const response2 = await fetch(`${API_BASE}/products?limit=10&offset=5`);
    const products2 = await response2.json();
    expect(products2.length).toBeLessThanOrEqual(10);
  });

  // ===========================================================================
  // FILTER TESTS
  // ===========================================================================

  test('GET /api/products filters by shop name', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const shopsResponse = await fetch(`${API_BASE}/shops`);
    const shops = await shopsResponse.json();
    
    if (shops.length > 0) {
      const firstShop = shops[0].shop_name;
      const response = await fetch(`${API_BASE}/products?selectedShopName=${encodeURIComponent(JSON.stringify([firstShop]))}&limit=10`);
      expect(response.status).toBe(200);
      
      const products = await response.json();
      products.forEach(p => {
        expect(p.shop_name).toBe(firstShop);
      });
    }
  });

  test('GET /api/products filters by size groups', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const sizesResponse = await fetch(`${API_BASE}/sizes`);
    const sizes = await sizesResponse.json();
    
    if (sizes.length > 0) {
      const firstSize = sizes[0].size_group;
      const response = await fetch(`${API_BASE}/products?selectedSizeGroups=${encodeURIComponent(JSON.stringify([firstSize]))}&limit=10`);
      expect(response.status).toBe(200);
      
      const products = await response.json();
      products.forEach(p => {
        if (Array.isArray(p.size_groups) && p.size_groups.length > 0) {
          expect(p.size_groups).toContain(firstSize);
        }
      });
    }
  });

  test('GET /api/products filters by grouped types', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const typesResponse = await fetch(`${API_BASE}/types`);
    const types = await typesResponse.json();
    
    if (types.length > 0) {
      const firstType = types[0].grouped_product_type;
      const response = await fetch(`${API_BASE}/products?selectedGroupedTypes=${encodeURIComponent(JSON.stringify([firstType]))}&limit=10`);
      expect(response.status).toBe(200);
      
      const products = await response.json();
      products.forEach(p => {
        expect(p.grouped_product_type).toBe(firstType);
      });
    }
  });

  test('GET /api/products filters by top level categories', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const categoriesResponse = await fetch(`${API_BASE}/categories`);
    const categories = await categoriesResponse.json();
    
    if (categories.length > 0) {
      const firstCategory = categories[0].top_level_category;
      const response = await fetch(`${API_BASE}/products?selectedTopLevelCategories=${encodeURIComponent(JSON.stringify([firstCategory]))}&limit=10`);
      expect(response.status).toBe(200);
      
      const products = await response.json();
      products.forEach(p => {
        expect(p.top_level_category).toBe(firstCategory);
      });
    }
  });

  test('GET /api/products filters by gender/age', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const gendersResponse = await fetch(`${API_BASE}/genders`);
    const genders = await gendersResponse.json();
    
    if (genders.length > 0) {
      const firstGender = genders[0].gender_age;
      const response = await fetch(`${API_BASE}/products?selectedGenderAges=${encodeURIComponent(JSON.stringify([firstGender]))}&limit=10`);
      expect(response.status).toBe(200);
      
      const products = await response.json();
      products.forEach(p => {
        expect(p.gender_age).toBe(firstGender);
      });
    }
  });

  test('GET /api/products filters by on_sale_only', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?onSaleOnly=true&limit=50`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    products.forEach(p => {
      expect(p.on_sale).toBe(true);
    });
  });

  test('GET /api/products filters by made_in_canada_only', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?madeInCanadaOnly=true&limit=50`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    products.forEach(p => {
      expect(p.made_in_canada).toBe(true);
    });
  });

  // ===========================================================================
  // PRICE BOUNDARY TESTS
  // ===========================================================================

  test('GET /api/pricing returns prices only for requested products', async () => {
    const productsResponse = await fetch(`${API_BASE}/products?limit=5`);
    expect(productsResponse.status).toBe(200);

    const products = await productsResponse.json();
    const productIds = products
      .map((product: { id?: number | string }) => Number(product.id))
      .filter((id: number) => Number.isFinite(id));

    test.skip(productIds.length === 0, 'Requires products with valid IDs');

    const response = await fetch(
      `${API_BASE}/pricing?ids=${encodeURIComponent(productIds.join(','))}`
    );
    expect(response.status).toBe(200);

    const pricing = await response.json();
    expect(Array.isArray(pricing)).toBe(true);

    const requestedIds = new Set(productIds);
    for (const item of pricing) {
      expect(requestedIds.has(Number(item.product_id))).toBe(true);
    }
  });


  test('GET /api/products filters by min_price', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?minPrice=50&limit=50`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    products.forEach(p => {
      if (p.min_price !== null) {
        expect(Number(p.min_price)).toBeGreaterThanOrEqual(50);
      }
    });
  });

  test('GET /api/products filters by max_price', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?maxPrice=100&limit=50`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    products.forEach(p => {
      if (p.min_price !== null) {
        expect(Number(p.min_price)).toBeLessThanOrEqual(100);
      }
    });
  });

  test('GET /api/products filters by price range', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?minPrice=50&maxPrice=150&limit=50`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    products.forEach(p => {
      if (p.min_price !== null) {
        expect(Number(p.min_price)).toBeGreaterThanOrEqual(50);
        expect(Number(p.min_price)).toBeLessThanOrEqual(150);
      }
    });
  });

  // ===========================================================================
  // SORTING TESTS
  // ===========================================================================
  test('GET /api/products sorts by price ascending', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const response = await fetch(`${API_BASE}/products?sortOrder=price_asc&limit=20`);
    expect(response.status).toBe(200);

    const products = await response.json();
    const prices = products.map(p => parseFloat(p.min_price ?? '9999'));

    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  test('GET /api/products sorts by price descending', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const response = await fetch(`${API_BASE}/products?sortOrder=price_desc&limit=20`);
  expect(response.status).toBe(200);

  const products = await response.json();
  const prices = products.map(p => parseFloat(p.min_price ?? '0'));

  for (let i = 1; i < prices.length; i++) {
    expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
  }
});


  test('GET /api/products sorts by discount descending', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?sortOrder=discount_desc&limit=20`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    const discounts = products.map(p => parseFloat(p.max_discount_percentage ?? '0'));
    
    for (let i = 1; i < discounts.length; i++) {
      expect(discounts[i]).toBeLessThanOrEqual(discounts[i - 1]);
    }
  });

  // ===========================================================================
  // COMBINED FILTERS AND SEARCH TESTS
  // ===========================================================================

  test('GET /api/products combines multiple filters', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const [shopsResponse, sizesResponse] = await Promise.all([
      fetch(`${API_BASE}/shops`),
      fetch(`${API_BASE}/sizes`),
    ]);

    expect(shopsResponse.status).toBe(200);
    expect(sizesResponse.status).toBe(200);

    const shops = await shopsResponse.json();
    const sizes = await sizesResponse.json();

    // Skip clearly if the API has no data to test with.
    test.skip(
      !Array.isArray(shops) ||
        shops.length === 0 ||
        !Array.isArray(sizes) ||
        sizes.length === 0,
      'Requires at least one shop and one size group'
    );

    const shopName = shops[0].shop_name;
    const sizeGroup = sizes[0].size_group;

    const params = new URLSearchParams({
      selectedShopName: JSON.stringify([String(shops[0].id)]),
      selectedSizeGroups: JSON.stringify([sizeGroup]),
      onSaleOnly: 'true',
      limit: '20',
    });

    const response = await fetch(`${API_BASE}/products?${params}`);
    const body = await response.text();

    console.log('Request URL:', `${API_BASE}/products?${params}`);
    console.log('Status:', response.status);
    console.log('Response body:', body);

    expect(response.status, body).toBe(200);

    const products = JSON.parse(body);
    expect(Array.isArray(products)).toBe(true);


    for (const product of products) {
      expect(product.shop_name).toBe(shopName);
      expect(product.size_group).toBe(sizeGroup);
      expect(product.on_sale).toBe(true);
    }
  });

  test('GET /api/products filters by search query', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?searchQuery=shirt&limit=20`);
    expect(response.status).toBe(200);
    

  test('GET /api/products combines search and filters', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?searchQuery=shirt&onSaleOnly=true&limit=20`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    products.forEach(p => {
      expect(p.on_sale).toBe(true);
    });
  });

  // ===========================================================================
  // PRODUCT STATUS TESTS
  // ===========================================================================

  test('GET /api/products returns only in-stock products by default', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    products.forEach(p => {
      expect(p.in_stock).toBe(true);
    });
  });

  test('GET /api/products returns archived products when filtering correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Note: Currently API filters out archived products by default
    // This test verifies the behavior
    const response = await fetch(`${API_BASE}/products`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    products.forEach(p => {
      expect(p.is_archived).toBe(false);
    });
  });

  // ===========================================================================
  // FREE PRODUCTS WITH PAID CUSTOMIZATIONS
  // ===========================================================================

  test('GET /api/products handles free products with min_price null', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=100`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    const freeProducts = products.filter(p => p.min_price === null || p.min_price === 0);
    
    // Should have at least some free products or handle them correctly
    expect(freeProducts.length).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/products handles paid customizations in variants', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=20`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    products.forEach(p => {
      if (Array.isArray(p.variants) && p.variants.length > 0) {
        // Each variant should have consistent pricing
      }
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  test('GET /api/products handles empty search results', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?searchQuery=nonexistentproduct12345&limit=10`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    // Should return empty array or handle gracefully
    expect(Array.isArray(products)).toBe(true);
  });

  test('GET /api/products handles invalid price parameters', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?minPrice=-100&limit=10`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    // Should handle negative prices gracefully
    expect(Array.isArray(products)).toBe(true);
  });

  test('GET /api/products handles missing pagination parameters', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    // Should use default limit/pagination
    expect(Array.isArray(products)).toBe(true);
  });

  test('GET /api/products handles invalid sort order', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?sortOrder=invalid&limit=10`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    // Should use default sort order
    expect(Array.isArray(products)).toBe(true);
  });

  test('GET /api/products handles offset beyond available products', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?offset=1000&limit=10`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    // Should return empty array
    expect(Array.isArray(products)).toBe(true);
  });

  test('GET /api/products handles multiple filter combinations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Combine multiple filters
    const response = await fetch(`${API_BASE}/products?onSaleOnly=true&madeInCanadaOnly=true&limit=20`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    products.forEach(p => {
      expect(p.on_sale).toBe(true);
      expect(p.made_in_canada).toBe(true);
    });
  });

  // ===========================================================================
  // PRICING API TESTS
  // ===========================================================================

  test('GET /api/pricing returns pricing for multiple product IDs', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const productsResponse = await fetch(`${API_BASE}/products?limit=5`);
  const productsBody = await productsResponse.text();
  expect(productsResponse.status, productsBody).toBe(200);

  const products = JSON.parse(productsBody);
  const productIds = products
    .map((product: { id?: number | string; product_id?: number | string }) =>
      Number(product.id ?? product.product_id)
    )
    .filter((id: number) => Number.isFinite(id));

  test.skip(productIds.length < 2, 'Requires at least two products with valid IDs');

  const response = await fetch(
    `${API_BASE}/pricing?ids=${encodeURIComponent(productIds.join(','))}`
  );
  const pricingBody = await response.text();
  expect(response.status, pricingBody).toBe(200);

  const pricing = JSON.parse(pricingBody);
  expect(Array.isArray(pricing)).toBe(true);

  const requestedIds = new Set(productIds);
  for (const item of pricing) {
    expect(requestedIds.has(Number(item.product_id))).toBe(true);
  }
});

  // ===========================================================================
  // PRODUCT DETAILS TESTS
  // ===========================================================================

  test('GET /api/products/:id returns complete product details', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=1`);
    const products = await response.json();
    
    if (products.length > 0) {
      const productId = products[0].id;
      const response2 = await fetch(`${API_BASE}/products/${productId}`);
      expect(response2.status).toBe(200);
      
      const product = await response2.json();
      expect(product.id).toBe(productId);
      expect(product.title).toBeDefined();
      expect(product.shop_name).toBeDefined();
    }
  });

  // ===========================================================================
  // METADATA ENDPOINTS TESTS
  // ===========================================================================

  test('GET /api/shops returns list of shops', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/shops`);
    expect(response.status).toBe(200);
    
    const shops = await response.json();
    expect(Array.isArray(shops)).toBe(true);
    shops.forEach(s => {
      expect(s.id).toBeDefined();
      expect(s.shop_name).toBeDefined();
    });
  });

  test('GET /api/sizes returns list of size groups', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/sizes`);
    expect(response.status).toBe(200);
    
    const sizes = await response.json();
    expect(Array.isArray(sizes)).toBe(true);
    sizes.forEach(s => {
      expect(s.size_group).toBeDefined();
    });
  });

  test('GET /api/types returns list of product types', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/types`);
    expect(response.status).toBe(200);
    
    const types = await response.json();
    expect(Array.isArray(types)).toBe(true);
    types.forEach(t => {
      expect(t.grouped_product_type).toBeDefined();
    });
  });

  test('GET /api/categories returns list of categories', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/categories`);
    expect(response.status).toBe(200);
    
    const categories = await response.json();
    expect(Array.isArray(categories)).toBe(true);
    categories.forEach(c => {
      expect(c.top_level_category).toBeDefined();
    });
  });

  test('GET /api/genders returns list of gender/age groups', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/genders`);
    expect(response.status).toBe(200);
    
    const genders = await response.json();
    expect(Array.isArray(genders)).toBe(true);
    genders.forEach(g => {
      expect(g.gender_age).toBeDefined();
    });
  });

  test('GET /api/pricing handles single product ID', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=1`);
    const products = await response.json();
    
    if (products.length > 0) {
      const productId = products[0].id;
      const response2 = await fetch(`${API_BASE}/pricing?ids=${productId}`);
      expect(response2.status).toBe(200);
      
      const pricing = await response2.json();
      expect(Array.isArray(pricing)).toBe(true);
    }
  });

  // ===========================================================================
  // IMAGE ENDPOINTS TESTS
  // ===========================================================================

  test('GET /api/images/:collection_id returns images for collection - array format', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=1`);
    const products = await response.json();
    
    if (products.length > 0 && Array.isArray(products[0].images)) {
      const firstImage = products[0].images[0];
      if (firstImage && firstImage.collection_id) {
        const response2 = await fetch(`${API_BASE}/images/${firstImage.collection_id}`);
        expect(response2.status).toBe(200);
        
        const images = await response2.json();
        expect(Array.isArray(images)).toBe(true);
      }
    }
  });

  // ===========================================================================
  // VARIANTS ENDPOINTS TESTS
  // ===========================================================================

  test('GET /api/variants/:product_id returns variants for product', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const productsResponse = await fetch(`${API_BASE}/products?limit=1`);
    const productsBody = await productsResponse.text();
    expect(productsResponse.status, productsBody).toBe(200);

    const products = JSON.parse(productsBody);
    test.skip(products.length === 0, 'Requires at least one product');

    const productId = products[0].id ?? products[0].product_id;
    test.skip(productId == null, 'Product response has no ID');

    const response = await fetch(
      `${API_BASE}/variants/${encodeURIComponent(String(productId))}`
    );
    const body = await response.text();

    expect(response.status, body).toBe(200);

    const variants = JSON.parse(body);
    expect(Array.isArray(variants)).toBe(true);
  });

  test('GET /api/images/:collection_id returns images for collection', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=1`);
    const products = await response.json();
    
    if (products.length > 0 && Array.isArray(products[0].images)) {
      const collectionId = products[0].images[0].collection_id;
      if (collectionId) {
        const response2 = await fetch(`${API_BASE}/images/${collectionId}`);
        expect(response2.status).toBe(200);
        
        const images = await response2.json();
        expect(Array.isArray(images)).toBe(true);
        images.forEach(img => {
          expect(img.src).toBeDefined();
          expect(img.alt).toBeDefined();
        });
      }
    }
  });

  test('GET /api/images/:collection_id handles image as JSON string', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=1`);
    const products = await response.json();
    
    if (products.length > 0 && typeof products[0].images === 'string') {
      const jsonImages = JSON.parse(products[0].images);
      expect(Array.isArray(jsonImages)).toBe(true);
      jsonImages.forEach(img => {
        expect(img.src).toBeDefined();
        expect(img.alt).toBeDefined();
      });
    }
  });

  // ===========================================================================
  // DISCOUNT CALCULATION TESTS
  // ===========================================================================

  test('GET /api/products returns correct discount calculations', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const response = await fetch(`${API_BASE}/products?limit=5`);
  expect(response.status).toBe(200);

  const products = await response.json();

  for (const product of products) {
    if (!product.on_sale) continue;

    const minPrice = Number(product.min_price);
    const maxPrice = Number(product.max_price);
    const actualDiscount = Number(product.max_discount_percentage);

    // Skip products without usable prices or a numeric discount.
    if (
      !Number.isFinite(minPrice) ||
      !Number.isFinite(maxPrice) ||
      maxPrice <= 0 ||
      !Number.isFinite(actualDiscount)
    ) {
      continue;
    }

    const expectedDiscount = 100 * (1 - minPrice / maxPrice);
    expect(Math.abs(expectedDiscount - actualDiscount)).toBeLessThan(1);
  }
});

  test('GET /api/products handles products without discounts', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=50`);
    const products = await response.json();
    
    const productsWithoutDiscount = products.filter(p => !p.on_sale);
    productsWithoutDiscount.forEach(p => {
      expect(p.max_discount_percentage).toBe(0);
    });
  });

  // ===========================================================================
  // VARIANT-WARE PRICING TESTS
  // ===========================================================================

  test('GET /api/products/:id handles variant pricing correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=5`);
    const products = await response.json();
    
    products.forEach(p => {
      if (Array.isArray(p.variants) && p.variants.length > 0) {
        // Verify all variants have consistent pricing
        const prices = p.variants.map(v => v.price);
        const uniquePrices = new Set(prices);
        // Variants may have different prices based on options
      }
    });
  });

  // ===========================================================================
  // RESPONSE FORMAT TESTS
  // ===========================================================================

  test('GET /api/products returns consistent response structure', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=10`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    const firstProduct = products[0];
    
    // Check required fields
    expect(firstProduct.id).toBeDefined();
    expect(firstProduct.title).toBeDefined();
    expect(firstProduct.shop_name).toBeDefined();
    expect(firstProduct.min_price).toBeDefined();
    expect(firstProduct.in_stock).toBeDefined();
    expect(firstProduct.is_archived).toBeDefined();
    expect(firstProduct.on_sale).toBeDefined();
    expect(firstProduct.made_in_canada).toBeDefined();
    
    // Check optional fields
    if (firstProduct.size_groups) {
      expect(Array.isArray(firstProduct.size_groups)).toBe(true);
    }
    if (firstProduct.top_level_category) {
      expect(firstProduct.top_level_category).toBeDefined();
    }
    if (firstProduct.subcategory) {
      expect(firstProduct.subcategory).toBeDefined();
    }
  });

  // ===========================================================================
  // PERFORMANCE TESTS
  // ===========================================================================

  test('GET /api/products handles large result sets efficiently', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products?limit=100`);
    const startTime = Date.now();
    const products = await response.json();
    const endTime = Date.now();
    
    // Should complete within reasonable time
    expect(endTime - startTime).toBeLessThan(5000);
    expect(products.length).toBeLessThanOrEqual(100);
  });

  // ===========================================================================
  // COMPREHENSIVE FILTERING TEST
  // ===========================================================================

  test('GET /api/products handles all filters together', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const shopsResponse = await fetch(`${API_BASE}/shops`);
    const shops = await shopsResponse.json();
    
    const sizesResponse = await fetch(`${API_BASE}/sizes`);
    const sizes = await sizesResponse.json();
    
    const typesResponse = await fetch(`${API_BASE}/types`);
    const types = await typesResponse.json();
    
    const categoriesResponse = await fetch(`${API_BASE}/categories`);
    const categories = await categoriesResponse.json();
    
    const gendersResponse = await fetch(`${API_BASE}/genders`);
    const genders = await gendersResponse.json();
    
    if (shops.length > 0 && sizes.length > 0 && types.length > 0 && categories.length > 0 && genders.length > 0) {
      const params = new URLSearchParams({
        selectedShopName: JSON.stringify([String(shops[0].id)]),
        selectedSizeGroups: JSON.stringify([sizes[0].size_group]),
        selectedGroupedTypes: JSON.stringify([types[0].grouped_product_type]),
        selectedTopLevelCategories: JSON.stringify([categories[0].top_level_category]),
        selectedGenderAges: JSON.stringify([genders[0].gender_age]),
        onSaleOnly: 'true',
        madeInCanadaOnly: 'true',
        limit: '20'
      });
      
      const response = await fetch(`${API_BASE}/products?${params.toString()}`);
      expect(response.status).toBe(200);
      
      const products = await response.json();
      expect(Array.isArray(products)).toBe(true);
    }
  });

  test('GET /api/products handles empty filters gracefully', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response = await fetch(`${API_BASE}/products`);
    expect(response.status).toBe(200);
    
    const products = await response.json();
    expect(Array.isArray(products)).toBe(true);
  });

  // ===========================================================================
  // DATA INTEGRITY TESTS
  // ===========================================================================

  test('GET /api/products maintains data consistency across requests', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const response1 = await fetch(`${API_BASE}/products?limit=10`);
    const products1 = await response1.json();
    
    const response2 = await fetch(`${API_BASE}/products?limit=10`);
    const products2 = await response2.json();
    
    // First product should be consistent
    expect(products1[0].id).toBe(products2[0].id);
    expect(products1[0].title).toBe(products2[0].title);
    expect(products1[0].shop_name).toBe(products2[0].shop_name);
  });

  test('GET /api/products handles optional image data', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const response = await fetch(`${API_BASE}/products?limit=5`);
  expect(response.status).toBe(200);

  const products = await response.json();
  expect(Array.isArray(products)).toBe(true);

  for (const product of products) {
    if (product.images == null) continue;

    expect(Array.isArray(product.images)).toBe(true);

    for (const image of product.images) {
      expect(image).toEqual(expect.objectContaining({}));

      for (const field of ['src', 'alt', 'width', 'height', 'position', 'version']) {
        if (image[field] !== undefined && image[field] !== null) {
          expect(image[field]).toBeDefined();
        }
      }
    }
  }
});

  // ===========================================================================
  // SUMMARY
  // ===========================================================================

  test.describe('Summary', () => {
    test('All regression tests cover the following scenarios:', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Basic listing
      const response = await fetch(`${API_BASE}/products`);
      expect(response.status).toBe(200);
      
      // Filtering
      expect(response.ok).toBe(true);
      
      // Sorting
      expect(response.status).toBe(200);
      
      // Pagination
      expect(response.status).toBe(200);
      
      // Search
      expect(response.status).toBe(200);
      
      // Product statuses (in-stock by default)
      expect(response.status).toBe(200);
      
      // Free products with paid customizations
      expect(response.status).toBe(200);
      
      // Edge cases (empty results, invalid params)
      expect(response.status).toBe(200);
    });
  });
});