
import React from 'react';
import { Link } from 'react-router-dom';

export interface FilterActions {
  setGroupedTypes: (types: string[]) => void;
  setTopLevelCategories: (categories: string[]) => void;
  setGenderAges: (genders: string[]) => void;
  setSearchQuery: (query: string) => void;
}

export interface CategoryConfig {
  slug: string;
  title: string;
  metaDescription: string;
  h1: string;
  introText: React.ReactNode | ((actions: FilterActions) => React.ReactNode);
  bottomContent: React.ReactNode;
  filterDefaults: {
    selectedTopLevelCategories?: string[];
    selectedGenderAges?: string[];
    selectedGroupedTypes?: string[];
    query?: string;
  };
}

const FilterButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button 
    onClick={onClick}
    className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline bg-transparent border-none p-0 cursor-pointer text-base"
  >
    {children}
  </button>
);

export const CATEGORIES: Record<string, CategoryConfig> = {
  // 1. Women's Clothing
  'womens-clothing': {
    slug: 'womens-clothing',
    title: "Women's Clothing Canada - Compare Prices & Deals | Curated Canada",
    metaDescription: "Shop women's clothing from top Canadian retailers. Compare prices on dresses, tops, jeans, and more. Find the best deals updated daily.",
    h1: "Women's Clothing - Compare Prices Across Canada",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Discover the best deals on women's fashion from Canada's top independent retailers. 
          We aggregate thousands of products so you can easily compare prices, styles, and sizes 
          in one place.
        </p>
        <p className="text-gray-600 dark:text-gray-300 flex flex-wrap gap-2 items-center">
          Popular subcategories: 
          <FilterButton onClick={() => actions.setGroupedTypes(['Clothing - Tops'])}>Tops</FilterButton>, 
          <FilterButton onClick={() => actions.setGroupedTypes(['Clothing - Dresses & Jumpsuits'])}>Dresses</FilterButton>, 
          <FilterButton onClick={() => actions.setGroupedTypes(['Clothing - Bottoms'])}>Bottoms</FilterButton>,
          <Link to="/collections/womens-footwear" className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline">Women's Footwear</Link>.
        </p>
      </div>
    ),
    bottomContent: (
      <div className="prose dark:prose-invert max-w-none mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
        <h2>Shopping for Women's Clothing in Canada</h2>
        <p>
          Canada has a thriving scene of independent boutiques and retailers offering unique 
          styles that you won't find in big-box stores. Curated Canada helps you discover 
          these hidden gems while ensuring you get the best value for your money.
        </p>
      </div>
    ),
    filterDefaults: {
      selectedGenderAges: ['Women', 'Unisex'],
      selectedTopLevelCategories: ['Clothing']
    }
  },

  // 2. Men's Clothing
  'mens-clothing': {
    slug: 'mens-clothing',
    title: "Men's Clothing Canada - Compare Prices & Deals | Curated Canada",
    metaDescription: "Browse men's clothing from leading Canadian shops. Compare prices on shirts, pants, jackets, and essentials. Save money on quality menswear.",
    h1: "Men's Clothing - Compare Prices Across Canada",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Upgrade your wardrobe with the best men's clothing deals from across Canada. 
          We compare prices from trusted independent retailers to bring you quality menswear 
          at the best prices.
        </p>
        <p className="text-gray-600 dark:text-gray-300 flex flex-wrap gap-2 items-center">
          Browse by category: 
          <FilterButton onClick={() => actions.setGroupedTypes(['Clothing - Tops'])}>Shirts & Tops</FilterButton>, 
          <FilterButton onClick={() => actions.setGroupedTypes(['Clothing - Bottoms'])}>Pants & Jeans</FilterButton>, 
          <FilterButton onClick={() => actions.setGroupedTypes(['Clothing - Outerwear'])}>Outerwear</FilterButton>,
          <Link to="/collections/mens-footwear" className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline">Men's Footwear</Link>.
        </p>
      </div>
    ),
    bottomContent: (
      <div className="prose dark:prose-invert max-w-none mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
        <h2>Men's Fashion in Canada</h2>
        <p>
          From rugged outdoor gear to sharp tailoring, Canadian retailers offer exceptional 
          quality menswear. Our platform brings these diverse options together, allowing 
          you to shop locally while comparing prices easily.
        </p>
      </div>
    ),
    filterDefaults: {
      selectedGenderAges: ['Men', 'Unisex'],
      selectedTopLevelCategories: ['Clothing']
    }
  },

  // 3. Clothing (General)
  'clothing': {
    slug: 'clothing',
    title: "Clothing Deals Canada - Shop Fashion for Everyone | Curated Canada",
    metaDescription: "Shop the best clothing deals in Canada for men, women, and everyone. Compare prices on apparel from independent retailers.",
    h1: "Clothing Deals Across Canada",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Explore a vast collection of clothing from Canada's best boutiques. 
          Whether you're looking for basics, statement pieces, or technical gear, 
          we help you find the best prices.
        </p>
        <p className="text-gray-600 dark:text-gray-300 flex flex-wrap gap-2 items-center">
          Sections: 
          <Link to="/collections/womens-clothing" className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline">Women's</Link>,
          <Link to="/collections/mens-clothing" className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline">Men's</Link>.
        </p>
      </div>
    ),
    bottomContent: (
      <div className="prose dark:prose-invert max-w-none mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
        <h2>Complete Fashion Directory</h2>
        <p>
          We aggregate apparel from hundreds of sources to give you the most comprehensive 
          view of the Canadian fashion market.
        </p>
      </div>
    ),
    filterDefaults: {
      selectedTopLevelCategories: ['Clothing']
    }
  },

  // 4. Women's Footwear
  'womens-footwear': {
    slug: 'womens-footwear',
    title: "Women's Footwear Canada - Boots, Sneakers & Sandals | Curated Canada",
    metaDescription: "Find deals on women's shoes, boots, and sneakers. Compare prices from Canadian shoe stores.",
    h1: "Women's Footwear Deals",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Step out in style with our collection of women's footwear. 
        </p>
        <p className="text-gray-600 dark:text-gray-300 flex flex-wrap gap-2 items-center">
          Popular: 
          <FilterButton onClick={() => actions.setGroupedTypes(['Footwear - Boots'])}>Boots</FilterButton>, 
          <FilterButton onClick={() => actions.setGroupedTypes(['Footwear - Sneakers'])}>Sneakers</FilterButton>,
          <FilterButton onClick={() => actions.setGroupedTypes(['Footwear - Sandals & Summer'])}>Sandals</FilterButton>.
        </p>
      </div>
    ),
    bottomContent: (
      <div className="prose dark:prose-invert max-w-none mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
        <h2>Women's Shoes from Canadian Retailers</h2>
      </div>
    ),
    filterDefaults: {
      selectedGenderAges: ['Women', 'Unisex'],
      selectedTopLevelCategories: ['Footwear']
    }
  },

  // 5. Men's Footwear
  'mens-footwear': {
    slug: 'mens-footwear',
    title: "Men's Footwear Canada - Boots, Sneakers & Dress Shoes | Curated Canada",
    metaDescription: "Compare prices on men's shoes, boots, and sneakers. Find the best deals on footwear from Canadian retailers.",
    h1: "Men's Footwear Deals",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Find your next pair of shoes at the best price. 
        </p>
        <p className="text-gray-600 dark:text-gray-300 flex flex-wrap gap-2 items-center">
          Popular: 
          <FilterButton onClick={() => actions.setGroupedTypes(['Footwear - Sneakers'])}>Sneakers</FilterButton>, 
          <FilterButton onClick={() => actions.setGroupedTypes(['Footwear - Boots'])}>Boots</FilterButton>,
          <FilterButton onClick={() => actions.setGroupedTypes(['Footwear - Dress Shoes'])}>Dress Shoes</FilterButton>.
        </p>
      </div>
    ),
    bottomContent: (
      <div className="prose dark:prose-invert max-w-none mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
        <h2>Men's Shoes from Canadian Retailers</h2>
      </div>
    ),
    filterDefaults: {
      selectedGenderAges: ['Men', 'Unisex'],
      selectedTopLevelCategories: ['Footwear']
    }
  },

  // 6. Footwear (General)
  'footwear': {
    slug: 'footwear',
    title: "Footwear Canada - Shop Shoes for Everyone | Curated Canada",
    metaDescription: "Shop all footwear deals in Canada. Sneakers, boots, and shoes for men, women, and kids.",
    h1: "Footwear Deals Across Canada",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Browse our complete collection of footwear. 
        </p>
        <p className="text-gray-600 dark:text-gray-300 flex flex-wrap gap-2 items-center">
          Sections: 
          <Link to="/collections/womens-footwear" className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline">Women's</Link>,
          <Link to="/collections/mens-footwear" className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline">Men's</Link>.
        </p>
      </div>
    ),
    bottomContent: (
      <div className="prose dark:prose-invert max-w-none mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
        <h2>All Footwear</h2>
      </div>
    ),
    filterDefaults: {
      selectedTopLevelCategories: ['Footwear']
    }
  },

  // 7. Jewelry
  'jewelry': {
    slug: 'jewelry',
    title: "Jewelry Canada - Compare Prices on Necklaces, Rings & Earrings | Curated Canada",
    metaDescription: "Find the best deals on jewelry in Canada. Compare prices on necklaces, earrings, bracelets, and rings from independent retailers.",
    h1: "Jewelry - Compare Prices on Necklaces, Rings & Earrings",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Add a touch of elegance to any outfit with our curated selection of jewelry. 
        </p>
        <p className="text-gray-600 dark:text-gray-300 flex flex-wrap gap-2 items-center">
           Discover: 
          <FilterButton onClick={() => { actions.setGroupedTypes(['Accessories - Jewelry']); actions.setSearchQuery('earrings'); }}>Earrings</FilterButton>, 
          <FilterButton onClick={() => { actions.setGroupedTypes(['Accessories - Jewelry']); actions.setSearchQuery('necklace'); }}>Necklaces</FilterButton>, 
          <FilterButton onClick={() => { actions.setGroupedTypes(['Accessories - Jewelry']); actions.setSearchQuery('ring'); }}>Rings</FilterButton>.
        </p>
      </div>
    ),
    bottomContent: (
      <div className="prose dark:prose-invert max-w-none mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
        <h2>Canadian Jewelry</h2>
      </div>
    ),
    filterDefaults: {
      selectedGroupedTypes: ['Accessories - Jewelry'] 
      // Note: We use grouped type here to narrow it down specifically to jewelry, unlike top level 'Accessories'
    }
  },

  // 8. Accessories
  'accessories': {
    slug: 'accessories',
    title: "Accessories Canada - Bags, Hats & More | Curated Canada",
    metaDescription: "Shop accessories from Canadian retailers. Bags, hats, scarves, and more.",
    h1: "Accessories Deals",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Complete your look with the perfect accessories.
        </p>
        <p className="text-gray-600 dark:text-gray-300 flex flex-wrap gap-2 items-center">
          Popular: 
          <FilterButton onClick={() => actions.setGroupedTypes(['Accessories - Bags'])}>Bags</FilterButton>, 
          <FilterButton onClick={() => actions.setGroupedTypes(['Accessories - Headwear'])}>Hats & Headwear</FilterButton>,
          <Link to="/collections/jewelry" className="font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline">Jewelry</Link>.
        </p>
      </div>
    ),
    bottomContent: (
      <div className="prose dark:prose-invert max-w-none mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
        <h2>Accessories</h2>
      </div>
    ),
    filterDefaults: {
      selectedTopLevelCategories: ['Accessories']
    }
  },

  // 9. Home & Living
  'home-living': {
    slug: 'home-living',
    title: "Home & Living Decor Canada - Deals & Sales | Curated Canada",
    metaDescription: "Discover unique home decor and living items from Canadian boutiques.",
    h1: "Home & Living Deals",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Find beautiful items for your home.
        </p>
      </div>
    ),
    bottomContent: (
      <div className="prose dark:prose-invert max-w-none mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
        <h2>Home Decor</h2>
      </div>
    ),
    filterDefaults: {
      selectedTopLevelCategories: ['Home & Living']
    }
  }
};
