import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:4321/api';

type Product = {
  id?: number | string;
  product_id?: number | string;
  title?: string;
  shop_name?: string;
  min_price?: number | string | null;
  max_price?: number | string | null;
  in_stock?: boolean;
  is_archived?: boolean;
  on_sale?: boolean;
  made_in_canada?: boolean;
  max_discount_percentage?: number | string | null;
  grouped_product_type?: string;
  top_level_category?: string;
  gender_age?: string;
  size_group?: string;
  size_groups?: string[];
  images?: unknown[] | string | null;
  variants?: Array<{ price?: number | string }>;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  const body = await response.text();

  expect(response.status, `${path}: ${body}`).toBe(200);

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${path} returned invalid JSON: ${body}`);
  }
}

function productsUrl(
  params: Record<string, string | number | boolean>
): string {
  return `/products?${new URLSearchParams(
    Object.entries(params).map(([key, value]) => [
      key,
      String(value),
    ])
  )}`;
}

function selectedFilter(key: string, value: string) {
  return { [key]: JSON.stringify([value]) };
}

test.describe('Products API Regression Tests', () => {
  test('GET /products returns products with default filters', async () => {
    const products = await getJson<Product[]>('/products');

    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);

    for (const product of products) {
      expect(product).toHaveProperty('id');
      expect(product).toHaveProperty('title');
      expect(product).toHaveProperty('shop_name');
      expect(product).toHaveProperty('min_price');
      expect(product.in_stock).toBe(true);
      expect(product.is_archived).toBe(false);
    }
  });

  test('GET /products supports pagination', async () => {
    const firstPage = await getJson<Product[]>(
      productsUrl({ limit: 5, offset: 0 })
    );

    const secondPage = await getJson<Product[]>(
      productsUrl({ limit: 5, offset: 5 })
    );

    expect(firstPage.length).toBeLessThanOrEqual(5);
    expect(secondPage.length).toBeLessThanOrEqual(5);

    if (firstPage.length === 5 && secondPage.length > 0) {
      const firstIds = new Set(
        firstPage.map((p) => String(p.id ?? p.product_id))
      );

      for (const product of secondPage) {
        expect(
          firstIds.has(String(product.id ?? product.product_id))
        ).toBe(false);
      }
    }
  });

  test('GET /products filters by shop name', async () => {
    const shops = await getJson<Array<{ shop_name: string }>>('/shops');

    test.skip(shops.length === 0, 'Requires at least one shop');

    const shopName = shops[0].shop_name;

    const products = await getJson<Product[]>(
      productsUrl({
        ...selectedFilter('selectedShopName', shopName),
        limit: 50,
      })
    );

    for (const product of products) {
      expect(product.shop_name).toBe(shopName);
    }
  });

  test('GET /products filters by size groups', async () => {
    const sizes = await getJson<Array<{ size_group: string }>>('/sizes');

    test.skip(sizes.length === 0, 'Requires at least one size group');

    const size = sizes[0].size_group;

    const products = await getJson<Product[]>(
      productsUrl({
        ...selectedFilter('selectedSizeGroups', size),
        limit: 50,
      })
    );

    for (const product of products) {
      const productSizes = Array.isArray(product.size_groups)
        ? product.size_groups
        : product.size_group != null
          ? [product.size_group]
          : [];

      expect(productSizes).toContain(size);
    }
  });

  test('GET /products filters by grouped product type', async () => {
    const types = await getJson<
      Array<{ grouped_product_type: string }>
    >('/types');

    test.skip(types.length === 0, 'Requires at least one product type');

    const type = types[0].grouped_product_type;

    const products = await getJson<Product[]>(
      productsUrl({
        ...selectedFilter('selectedGroupedTypes', type),
        limit: 50,
      })
    );

    for (const product of products) {
      expect(product.grouped_product_type).toBe(type);
    }
  });

  test('GET /products filters by category', async () => {
    const categories = await getJson<
      Array<{ top_level_category: string }>
    >('/categories');

    test.skip(categories.length === 0, 'Requires at least one category');

    const category = categories[0].top_level_category;

    const products = await getJson<Product[]>(
      productsUrl({
        ...selectedFilter('selectedTopLevelCategories', category),
        limit: 50,
      })
    );

    for (const product of products) {
      expect(product.top_level_category).toBe(category);
    }
  });

  test('GET /products filters by gender and age', async () => {
    const genders = await getJson<Array<{ gender_age: string }>>(
      '/genders'
    );

    test.skip(genders.length === 0, 'Requires gender/age metadata');

    const gender = genders[0].gender_age;

    const products = await getJson<Product[]>(
      productsUrl({
        ...selectedFilter('selectedGenderAges', gender),
        limit: 50,
      })
    );

    for (const product of products) {
      expect(product.gender_age).toBe(gender);
    }
  });

  test('GET /products filters by sale status', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ onSaleOnly: true, limit: 50 })
    );

    for (const product of products) {
      expect(product.on_sale).toBe(true);
    }
  });

  test('GET /products filters by Canadian-made products', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ madeInCanadaOnly: true, limit: 50 })
    );

    for (const product of products) {
      expect(product.made_in_canada).toBe(true);
    }
  });

  test('GET /products filters by minimum price', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ minPrice: 50, limit: 50 })
    );

    for (const product of products) {
      if (product.min_price != null) {
        expect(Number(product.min_price)).toBeGreaterThanOrEqual(50);
      }
    }
  });

  test('GET /products filters by maximum price', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ maxPrice: 100, limit: 50 })
    );

    for (const product of products) {
      if (product.min_price != null) {
        expect(Number(product.min_price)).toBeLessThanOrEqual(100);
      }
    }
  });

  test('GET /products filters by price range', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ minPrice: 50, maxPrice: 150, limit: 50 })
    );

    for (const product of products) {
      if (product.min_price != null) {
        expect(Number(product.min_price)).toBeGreaterThanOrEqual(50);
        expect(Number(product.min_price)).toBeLessThanOrEqual(150);
      }
    }
  });

  test('GET /products sorts by price ascending', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ sortOrder: 'price_asc', limit: 50 })
    );

    const prices = products
      .map((p) => p.min_price)
      .filter((p): p is number | string => p != null)
      .map(Number)
      .filter(Number.isFinite);

    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  test('GET /products sorts by price descending', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ sortOrder: 'price_desc', limit: 50 })
    );

    const prices = products
      .map((p) => p.min_price)
      .filter((p): p is number | string => p != null)
      .map(Number)
      .filter(Number.isFinite);

    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
    }
  });

  test('GET /products sorts by discount descending', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ sortOrder: 'discount_desc', limit: 50 })
    );

    const discounts = products
      .map((p) => p.max_discount_percentage)
      .filter((p): p is number | string => p != null)
      .map(Number)
      .filter(Number.isFinite);

    for (let i = 1; i < discounts.length; i++) {
      expect(discounts[i]).toBeLessThanOrEqual(discounts[i - 1]);
    }
  });

  test('GET /products filters by search query', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ searchQuery: 'shirt', limit: 20 })
    );

    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeLessThanOrEqual(20);
  });

  test('GET /products combines search and sale filters', async () => {
    const products = await getJson<Product[]>(
      productsUrl({
        searchQuery: 'shirt',
        onSaleOnly: true,
        limit: 20,
      })
    );

    for (const product of products) {
      expect(product.on_sale).toBe(true);
    }
  });

  test('GET /products combines multiple filters', async () => {
    const [shops, sizes] = await Promise.all([
      getJson<Array<{ shop_name: string }>>('/shops'),
      getJson<Array<{ size_group: string }>>('/sizes'),
    ]);

    test.skip(
      shops.length === 0 || sizes.length === 0,
      'Requires shop and size metadata'
    );

    const shopName = shops[0].shop_name;
    const size = sizes[0].size_group;

    const products = await getJson<Product[]>(
      productsUrl({
        ...selectedFilter('selectedShopName', shopName),
        ...selectedFilter('selectedSizeGroups', size),
        onSaleOnly: true,
        limit: 50,
      })
    );

    for (const product of products) {
      expect(product.shop_name).toBe(shopName);
      expect(product.on_sale).toBe(true);

      const productSizes = Array.isArray(product.size_groups)
        ? product.size_groups
        : product.size_group != null
          ? [product.size_group]
          : [];

      expect(productSizes).toContain(size);
    }
  });

  test('GET /products excludes archived products by default', async () => {
    const products = await getJson<Product[]>('/products');

    for (const product of products) {
      expect(product.is_archived).toBe(false);
    }
  });

  test('GET /products handles empty search results', async () => {
    const products = await getJson<Product[]>(
      productsUrl({
        searchQuery: 'nonexistentproduct12345',
        limit: 10,
      })
    );

    expect(Array.isArray(products)).toBe(true);
  });

  test('GET /products handles invalid sort order', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ sortOrder: 'invalid', limit: 10 })
    );

    expect(Array.isArray(products)).toBe(true);
  });

  test('GET /products handles a large offset', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ offset: 1000, limit: 10 })
    );

    expect(Array.isArray(products)).toBe(true);
  });

  test('GET /pricing returns prices for requested product IDs', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ limit: 5 })
    );

    const ids = products
      .map((p) => Number(p.id ?? p.product_id))
      .filter(Number.isFinite);

    test.skip(ids.length === 0, 'Requires valid product IDs');

    const pricing = await getJson<Array<{ product_id: number | string }>>(
      `/pricing?ids=${encodeURIComponent(ids.join(','))}`
    );

    expect(Array.isArray(pricing)).toBe(true);

    const requestedIds = new Set(ids);

    for (const item of pricing) {
      expect(requestedIds.has(Number(item.product_id))).toBe(true);
    }
  });

  test('GET /products/:id returns product details', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ limit: 1 })
    );

    test.skip(products.length === 0, 'Requires at least one product');

    const id = products[0].id ?? products[0].product_id;

    test.skip(id == null, 'Product has no ID');

    const product = await getJson<Product>(
      `/products/${encodeURIComponent(String(id))}`
    );

    expect(String(product.id ?? product.product_id)).toBe(String(id));
    expect(product.title).toBeDefined();
    expect(product.shop_name).toBeDefined();
  });

  test('GET /shops returns a list of shops', async () => {
    const shops = await getJson<Array<{ id: number; shop_name: string }>>(
      '/shops'
    );

    expect(Array.isArray(shops)).toBe(true);

    for (const shop of shops) {
      expect(shop.id).toBeDefined();
      expect(shop.shop_name).toBeDefined();
    }
  });

  test('GET /sizes returns size groups', async () => {
    const sizes = await getJson<Array<{ size_group: string }>>('/sizes');

    expect(Array.isArray(sizes)).toBe(true);

    for (const size of sizes) {
      expect(size.size_group).toBeDefined();
    }
  });

  test('GET /types returns product types', async () => {
    const types = await getJson<
      Array<{ grouped_product_type: string }>
    >('/types');

    expect(Array.isArray(types)).toBe(true);

    for (const type of types) {
      expect(type.grouped_product_type).toBeDefined();
    }
  });

  test('GET /categories returns categories', async () => {
    const categories = await getJson<
      Array<{ top_level_category: string }>
    >('/categories');

    expect(Array.isArray(categories)).toBe(true);

    for (const category of categories) {
      expect(category.top_level_category).toBeDefined();
    }
  });

  test('GET /genders returns gender and age groups', async () => {
    const genders = await getJson<Array<{ gender_age: string }>>(
      '/genders'
    );

    expect(Array.isArray(genders)).toBe(true);

    for (const gender of genders) {
      expect(gender.gender_age).toBeDefined();
    }
  });


  test('GET /products returns consistent response structure', async () => {
    const products = await getJson<Product[]>(
      productsUrl({ limit: 10 })
    );

    expect(Array.isArray(products)).toBe(true);

    test.skip(products.length === 0, 'Requires at least one product');

    const product = products[0];

    for (const field of [
      'id',
      'title',
      'shop_name',
      'min_price',
      'in_stock',
      'is_archived',
      'on_sale',
      'made_in_canada',
    ]) {
      expect(product).toHaveProperty(field);
    }
  });

  test('GET /products maintains consistent data across requests', async () => {
    const [first, second] = await Promise.all([
      getJson<Product[]>(productsUrl({ limit: 10 })),
      getJson<Product[]>(productsUrl({ limit: 10 })),
    ]);

    expect(first.length).toBe(second.length);

    if (first.length > 0) {
      expect(first[0].id).toBe(second[0].id);
      expect(first[0].title).toBe(second[0].title);
      expect(first[0].shop_name).toBe(second[0].shop_name);
    }
  });

  test('GET /products handles large result sets efficiently', async () => {
    const start = Date.now();

    const products = await getJson<Product[]>(
      productsUrl({ limit: 100 })
    );

    expect(Date.now() - start).toBeLessThan(5000);
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeLessThanOrEqual(100);
  });
});