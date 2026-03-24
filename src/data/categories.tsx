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
        <h2>Women's Clothing from Independent Canadian Brands</h2>
        <p>
          Canada has a diverse and growing independent fashion scene. From Vancouver's
          sustainable labels to Montreal's contemporary designers and Toronto's streetwear
          brands, Canadian women's fashion covers every style and price point. Curated Canada
          brings these retailers together so you can compare prices and find brands you might
          not have discovered otherwise.
        </p>

        <h3>Made in Canada Women's Clothing</h3>
        <p>
          A number of Canadian brands manufacture their garments entirely within Canada.
          Encircled and Free Label produce women's clothing in Toronto and Vancouver
          respectively, using ethically sourced materials. Harly Jae, based in Vancouver,
          focuses on vintage-inspired slow fashion made locally. Blondie Apparel, Ashabi Wears,
          Buttercream Clothing, This Is J, Ang Hill, and Birds of North America are also made
          in Canada. Use the "Made in Canada" filter to browse only domestically produced items.
        </p>

        <h3>Finding the Best Deals on Canadian Women's Fashion</h3>
        <p>
          Sort by Best Discount to see which Canadian brands are currently running sales.
          Many independent retailers run end-of-season clearances with significant reductions
          on past-season styles. The price filter lets you set a firm budget, and you can
          combine it with size and type filters to narrow down exactly what you need.
          Deals update daily as retailers adjust their pricing.
        </p>

        <h3>Size Inclusivity in Canadian Women's Fashion</h3>
        <p>
          Many Canadian independent brands offer extended sizing. Knix, Encircled, and
          Anne Mulaire carry ranges that go beyond standard sizing. Use the Size filter
          to find available options across the full range. Independent Canadian brands
          are often a better choice for hard-to-find sizes than mainstream retail.
        </p>

        <h3>Sustainable Canadian Women's Clothing</h3>
        <p>
          Sustainability is a common thread across Canadian independent fashion. Ecologyst
          uses bluesign-certified materials. Anian works with recycled and natural fibres.
          Free Label is B Corp certified. Rowe and Vestige Story both focus on considered,
          longer-lasting pieces. These brands offer a genuine alternative to the fast
          fashion cycle.
        </p>

        <h3>Shop by Region</h3>
        <p>
          Toronto is home to brands including Encircled, Birds of North America, Blondie Apparel,
          This Is J, Ang Hill, and Body of Work. Vancouver has Harly Jae, Free Label, Rowe,
          Vestige Story, and Arraei Collective. Montreal has Eve Gravel, Jennifer Glasgow Design,
          and Milo and Dexter. Alberta has Ashabi Wears and Buttercream Clothing in Calgary.
          Manitoba has Anne Mulaire in Winnipeg.
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
        <h2>Men's Clothing from Independent Canadian Brands</h2>
        <p>
          Canadian menswear ranges from rugged outdoor gear built for cold winters to
          sharp contemporary pieces from urban designers. Independent Canadian brands
          tend to focus on quality construction and longevity rather than trend-driven
          fast fashion, making them a good choice for building a wardrobe that lasts.
        </p>

        <h3>Made in Canada Menswear</h3>
        <p>
          Several Canadian brands produce their men's clothing domestically. Province of
          Canada manufactures basics and fleece in Toronto. Reigning Champ produces premium
          activewear in Vancouver. Anian uses recycled wool and natural fibres sewn in
          Victoria. Frere du Nord makes contemporary menswear in Oshawa, Ontario. Common
          Manufacturing in Toronto focuses on durable workwear made in Canada. 18 Waits
          and Good for Sunday are also made in Toronto. Use the "Made in Canada" filter
          to find these and other domestically produced options.
        </p>

        <h3>Canadian Men's Outerwear</h3>
        <p>
          Outerwear is a strong suit for Canadian menswear brands. Anian, Ecologyst, North
          Standard, and Muttonhead all produce coats and jackets suited to Canadian winters.
          Good Neighbour in Toronto and Kindred Coast in Vancouver offer more contemporary
          outerwear options. Rudsak in Montreal is known for leather goods and outerwear.
          Filter by Outerwear under the Type dropdown to compare styles and prices across
          all available brands at once.
        </p>

        <h3>Canadian Denim</h3>
        <p>
          Naked and Famous Denim, based in Montreal, is one of the most respected selvedge
          denim brands in North America. They produce raw denim jeans using Japanese mill
          fabric and sell directly from their Canadian site. Tate and Yoko, also in Montreal,
          is another Canadian denim specialist worth exploring.
        </p>

        <h3>How to Find Deals on Canadian Men's Clothing</h3>
        <p>
          Sort by Best Discount to see active sales across all Canadian menswear retailers.
          Many independent brands run significant end-of-season sales, particularly on
          outerwear in spring and lighter styles in autumn. Combine the sale filter with
          a size filter to quickly find discounted items in your size across multiple brands.
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
    introText: () => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Explore a wide collection of clothing from Canada's best independent boutiques.
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
        <h2>Canadian Clothing from Independent Brands Across Every Category</h2>
        <p>
          Canada's independent fashion sector spans fine knitwear, tailored outerwear,
          activewear, denim, and children's clothing. Independent Canadian brands typically
          offer smaller runs with more considered design, meaning you are less likely to
          see the same item everywhere else.
        </p>

        <h3>Why Buy from Independent Canadian Clothing Brands</h3>
        <p>
          Independent Canadian brands keep revenue within local communities, pay domestic
          wages, and often have more transparent supply chains than global fast fashion
          retailers. Brands like Province of Canada, Encircled, Anian, and Free Label are
          all open about where and how their clothes are made. Buying from them has a direct
          impact that buying from a multinational does not.
        </p>

        <h3>How Curated Canada Works</h3>
        <p>
          We pull product listings directly from Canadian brand websites and update pricing
          daily. When you click through to a product, you go directly to the retailer's own
          site to complete your purchase. The filters let you narrow by gender, size, price
          range, product type, and whether something is made in Canada, so you can find what
          you are looking for across dozens of brands at once.
        </p>

        <h3>Canadian Clothing by Province</h3>
        <p>
          Ontario brands include Province of Canada, Encircled, Muttonhead, Knix, 18 Waits,
          Frere du Nord, Common Manufacturing, Stanfield's, and Victoire Boutique. British
          Columbia is home to Ecologyst, Reigning Champ, Anian, Free Label, Harly Jae, Rowe,
          Kindred Coast, and Simply Merino. Quebec has Naked and Famous Denim, Eve Gravel,
          Milo and Dexter, Sheertex, Message Factory, Bonnetier, Frank and Oak, and Rudsak.
          Alberta has Local Laundry, Ashabi Wears, and Buttercream Clothing. Manitoba has
          Anne Mulaire, Prana Vida, and Wheat and Wildflower.
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
    metaDescription: "Find deals on women's shoes, boots, and sneakers from Canadian brands. Compare prices from independent Canadian shoe retailers.",
    h1: "Women's Footwear Deals",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Find the best prices on women's footwear from Canada's top independent shoe brands.
          From winter boots built for Canadian winters to sandals and everyday sneakers.
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
        <h2>Women's Footwear from Canadian Brands</h2>
        <p>
          Canadian footwear brands are built with the country's climate in mind. Waterproof
          construction, insulated linings, and durable materials are common features across
          Canadian boots and shoes. La Canadienne and Boutique Martino are both known for
          combining practicality with refined style.
        </p>

        <h3>Made in Canada Women's Shoes and Boots</h3>
        <p>
          Boutique Martino has been producing women's footwear in Quebec City for decades,
          with boots and shoes made entirely in Canada. Padraig Cottage makes wool slippers
          and casual footwear in Vancouver. La Canadienne is a Montreal-based brand known
          for waterproof leather boots well suited to Canadian winters. Use the "Made in
          Canada" filter to browse only domestically manufactured options.
        </p>

        <h3>Winter Boots for Canadian Weather</h3>
        <p>
          A proper pair of winter boots is a necessity in most Canadian cities. Independent
          Canadian brands tend to offer better options than mass-market retailers for cold
          weather footwear. Filter by Boots under the Type dropdown to compare all available
          winter and ankle boot options across brands. Look for insulation suited to
          sub-zero temperatures and soles with good grip on packed snow.
        </p>

        <h3>Shopping by Season</h3>
        <p>
          Many Canadian retailers offer the best prices on boots in spring and early summer
          as they clear winter inventory. Sandals and summer footwear are typically discounted
          in September and October. Sort by Best Discount to catch these seasonal clearances.
          Deals update daily so it is worth checking back if you are watching a specific
          brand or style.
        </p>
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
    metaDescription: "Compare prices on men's shoes, boots, and sneakers from Canadian brands. Find the best deals on footwear from independent Canadian retailers.",
    h1: "Men's Footwear Deals",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Find your next pair of shoes at the best price. Compare men's footwear from
          Canada's top independent shoe brands, from heritage boots to everyday sneakers.
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
        <h2>Men's Footwear from Canadian Brands</h2>
        <p>
          Canada has produced some well-regarded men's footwear brands. Viberg in Victoria
          and Wohlford in Vancouver both make handcrafted leather boots and shoes using
          traditional construction methods. These are built to be resoled and worn for many
          years, making them a different kind of purchase compared to mass-market footwear.
        </p>

        <h3>Heritage Canadian Boot Makers</h3>
        <p>
          Viberg is widely recognised as one of the finest boot makers in North America,
          producing Goodyear-welted leather boots entirely in Victoria, BC. Wohlford offers
          similarly constructed dress and casual leather shoes from Vancouver. Padraig Cottage
          makes casual wool and leather slip-ons, also produced in Vancouver. These are
          investment pieces rather than seasonal purchases.
        </p>

        <h3>Made in Canada Men's Shoes</h3>
        <p>
          Viberg, Wohlford, and Padraig Cottage all manufacture entirely in Canada. Use the
          "Made in Canada" filter to see only domestically produced men's footwear. Given
          the craftsmanship involved, prices reflect the quality, but the cost over many
          years of wear often compares well against cheaper alternatives that need replacing
          more frequently.
        </p>

        <h3>Men's Winter Boots in Canada</h3>
        <p>
          Canadian winters require footwear that actually performs. Whether you need insulated
          work boots, waterproof leather boots for city commuting, or technical boots for
          winter trails, Canadian brands tend to build with the conditions in mind. Filter
          by Boots and sort by price to compare all available options across brands.
        </p>

        <h3>Finding Deals on Canadian Men's Footwear</h3>
        <p>
          Heritage boot brands like Viberg rarely discount heavily, but other Canadian
          footwear retailers run regular sales. Sort by Best Discount to see current sale
          pricing across all brands. Spring is typically the best time to find deals on
          winter boots, and autumn is good for lighter summer footwear being cleared out.
        </p>
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
    metaDescription: "Shop all footwear deals in Canada. Sneakers, boots, and shoes for men, women, and kids from independent Canadian brands.",
    h1: "Footwear Deals Across Canada",
    introText: () => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Browse our complete collection of footwear from independent Canadian brands.
          Compare prices on boots, sneakers, dress shoes, and sandals, updated daily.
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
        <h2>Canadian Footwear Brands Built for the Climate</h2>
        <p>
          Canadian footwear brands have developed a reputation for building shoes and boots
          that hold up to the country's demanding winters. From handcrafted leather boots
          to wool slippers and waterproof dress shoes, the Canadian footwear scene spans
          heritage craftsmanship and practical everyday design.
        </p>

        <h3>Notable Canadian Footwear Brands</h3>
        <p>
          Viberg in Victoria, BC produces Goodyear-welted leather boots with a strong
          following in Canada and internationally. Boutique Martino in Quebec City has been
          making women's boots and shoes in Canada for decades. Wohlford in Vancouver makes
          welted dress and casual leather shoes. Padraig Cottage produces wool slippers and
          casual footwear in Vancouver. La Canadienne in Montreal is known for weatherproof
          leather boots for women.
        </p>

        <h3>Canadian-Made Footwear</h3>
        <p>
          Viberg, Wohlford, Boutique Martino, and Padraig Cottage all manufacture in Canada.
          Use the "Made in Canada" filter to find shoes and boots produced domestically.
          These brands typically use traditional construction methods like Goodyear welting,
          which allows for resoling and extends the life of the footwear significantly
          beyond glued alternatives.
        </p>

        <h3>Buying Footwear for Canadian Winters</h3>
        <p>
          For most of Canada, winter footwear is a serious consideration. Look for waterproof
          uppers, insulation for sub-zero temperatures, and soles with good traction on snow
          and ice. Filter by Boots and combine with size and price filters to find what works
          for you across all available Canadian footwear brands.
        </p>
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
    metaDescription: "Find the best deals on jewelry in Canada. Compare prices on necklaces, earrings, bracelets, and rings from independent Canadian retailers.",
    h1: "Jewelry - Compare Prices on Necklaces, Rings & Earrings",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Discover unique jewelry from independent Canadian designers. Compare prices on
          necklaces, rings, earrings, and bracelets, updated daily.
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
        <h2>Jewelry from Independent Canadian Designers</h2>
        <p>
          Canada has a growing independent jewelry scene, from fine jewelry designers working
          in gold and precious stones to contemporary makers using recycled metals and
          ethically sourced materials. Independent Canadian jewelers tend to offer more
          distinctive, handcrafted pieces than mass-market retailers, often at competitive
          prices when bought directly.
        </p>

        <h3>Canadian Fine Jewelry</h3>
        <p>
          Ecksand, based in Montreal, is one of Canada's best-known fine jewelry brands.
          They produce engagement rings and fine pieces in their Montreal studio using
          ethically sourced diamonds and recycled gold. Their pieces are made in Canada and
          sold directly through their own site. Use the search bar to filter by specific
          materials or styles across all available Canadian jewelry brands.
        </p>

        <h3>Ethical and Sustainable Canadian Jewelry</h3>
        <p>
          Several Canadian jewelry brands prioritise ethical sourcing, using recycled metals,
          conflict-free stones, and transparent supply chains. If this matters to you, look
          for brands that clearly state their materials and production practices on their
          product pages. Independent Canadian jewelers tend to be more open on these points
          than large chain retailers.
        </p>

        <h3>Jewelry as a Gift from Canada</h3>
        <p>
          Canadian-made jewelry makes a distinctive gift for birthdays, anniversaries, and
          weddings. Buying from an independent Canadian jeweler means you are likely getting
          something unique rather than a mass-produced piece. Use the price filter to find
          options within your budget across all available Canadian jewelry brands.
        </p>
      </div>
    ),
    filterDefaults: {
      selectedGroupedTypes: ['Accessories - Jewelry']
    }
  },

  // 8. Accessories
  'accessories': {
    slug: 'accessories',
    title: "Accessories Canada - Bags, Hats, Scarves & More | Curated Canada",
    metaDescription: "Shop accessories from independent Canadian retailers. Compare prices on bags, hats, scarves, belts, and more. Updated daily.",
    h1: "Accessories Deals",
    introText: (actions) => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Complete your look with accessories from independent Canadian brands.
          Compare prices on bags, hats, scarves, and more.
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
        <h2>Accessories from Independent Canadian Brands</h2>
        <p>
          Canadian independent brands produce a wide range of accessories, from leather bags
          to scarves, toques, and belts. Many are made in Canada with quality materials and
          construction that outlast fast fashion alternatives.
        </p>

        <h3>Canadian Bags and Leather Goods</h3>
        <p>
          Jack and Marlo in Toronto makes handcrafted leather bags and accessories, produced
          in Canada. Fellow Earthlings, based in Prince Edward Island and Nova Scotia, offers
          handmade accessories using natural materials. These brands focus on durability and
          craft rather than seasonal trends.
        </p>

        <h3>Hats, Toques, and Headwear</h3>
        <p>
          The toque is a Canadian staple, and several Canadian brands produce quality knitted
          and technical headwear. Bonnetier in Boucherville, Quebec makes unisex knitwear
          including hats and accessories, all produced in Canada. Filter by Hats and Headwear
          to compare all available options across brands at once.
        </p>

        <h3>Scarves and Knitwear Accessories</h3>
        <p>
          Canadian knitwear brands produce scarves, mittens, and wraps well suited to the
          country's winters. Simply Merino in Vancouver uses merino wool for warm, durable
          accessories. Bonnetier works with natural fibres across their knitwear range. Many
          of these are made in Canada, making them a good alternative to imported accessories.
        </p>

        <h3>Finding Deals on Canadian Accessories</h3>
        <p>
          Accessories from independent Canadian brands are often discounted at season
          transitions. Sort by Best Discount to surface current sale pricing. Combine with
          the "Made in Canada" filter if you want to focus on domestically produced pieces.
          Prices and availability update daily.
        </p>
      </div>
    ),
    filterDefaults: {
      selectedTopLevelCategories: ['Accessories']
    }
  },

  // 9. Home & Living
  'home-living': {
    slug: 'home-living',
    title: "Home & Living Canada - Decor and Lifestyle Deals | Curated Canada",
    metaDescription: "Discover unique home decor and lifestyle products from independent Canadian boutiques. Compare prices on Canadian home goods.",
    h1: "Home & Living Deals",
    introText: () => (
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Find distinctive home and lifestyle products from independent Canadian brands.
          Compare prices on decor, textiles, and everyday objects made to last.
        </p>
      </div>
    ),
    bottomContent: (
      <div className="prose dark:prose-invert max-w-none mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
        <h2>Home and Living Products from Canadian Brands</h2>
        <p>
          A number of Canadian fashion and lifestyle brands have expanded into home goods,
          bringing the same attention to materials and craft they apply to clothing into
          everyday objects for the home. From textiles to candles and ceramics, independent
          Canadian home brands offer considered alternatives to mass-produced homeware.
        </p>

        <h3>Canadian-Made Home Goods</h3>
        <p>
          KOTN and Carmico both offer home textiles alongside their clothing lines, including
          items like bedding, towels, and cushion covers made with ethical sourcing standards.
          Buying Canadian-made home goods supports domestic producers and, in many cases,
          means getting better quality materials than equivalent mass-market products.
        </p>

        <h3>Sustainable Home Products from Canada</h3>
        <p>
          Many Canadian lifestyle brands prioritise sustainability in their home collections,
          using organic cotton, recycled materials, and natural dyes. Canadian independent
          brands tend to be more open about their sourcing and production practices than
          large retailers, making it easier to make an informed purchase.
        </p>

        <h3>Home Goods as Canadian Gifts</h3>
        <p>
          Canadian-made home goods make thoughtful gifts for housewarmings, weddings, and
          holidays. A piece from an independent Canadian brand carries more meaning than a
          mass-produced equivalent, and your purchase goes directly to a Canadian business.
          Use the price filter to find options within your budget.
        </p>
      </div>
    ),
    filterDefaults: {
      selectedTopLevelCategories: ['Home & Living']
    }
  }
};