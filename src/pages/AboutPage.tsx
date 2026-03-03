import { useEffect } from 'react';

export function AboutPage() {
  useEffect(() => {
    document.title = 'About Us - Curated Canada';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Learn about Curated Canada - a platform dedicated to discovering and comparing products from independent Canadian fashion and footwear brands.');
    }

    // Add index, follow meta tag
    const metaRobots = document.createElement('meta');
    metaRobots.name = 'robots';
    metaRobots.content = 'index, follow';
    document.head.appendChild(metaRobots);

    return () => {
      if (document.head.contains(metaRobots)) {
        document.head.removeChild(metaRobots);
      }
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">About Curated Canada</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Celebrating Canadian fashion and design since 2025</p>
      
      <div className="space-y-8">
        <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Our Mission</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Curated Canada was created to help shoppers discover and support 
            independent Canadian fashion, footwear, and accessory brands.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            Our platform makes it easy to find quality Canadian clothing, compare products across 
            different vendors, and support Canadian businesses.
          </p>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">What We Focus On</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Unlike generic shopping platforms, Curated Canada specializes exclusively in 
            Canadian-owned businesses. We feature independent brands that manufacture or sell in Canada, 
            offering everything from premium footwear to sustainable clothing and unique accessories.
          </p>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Why Buy Canadian?</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Supporting Local Economies</h3>
              <p className="text-gray-700 dark:text-gray-300">
                When you purchase from independent Canadian brands, your money stays within 
                Canadian communities. These businesses create local jobs, support Canadian 
                manufacturers, and contribute to the economic health of our cities and towns.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Quality Craftsmanship</h3>
              <p className="text-gray-700 dark:text-gray-300">
                Canadian fashion brands often emphasize quality over quantity. From the 
                premium leather used by Canadian shoemakers to the carefully sourced fabrics 
                of clothing designers, there's a focus on durability and craftsmanship that 
                fast fashion can't match.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Designed for Canadians</h3>
              <p className="text-gray-700 dark:text-gray-300">
                Canadian clothing is designed with our climate and lifestyle in mind. Whether 
                it's winter coats that handle -30°C temperatures or versatile pieces that 
                work for both urban and outdoor settings, Canadian designers understand what 
                Canadians need from their clothing.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Featured Canadian Brands</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            We proudly feature independent Canadian businesses from coast to coast, for example:
          </p>
          
          <div className="grid md:grid-cols-2 gap-6 mt-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Footwear Specialists</h3>
              <ul className="space-y-1 text-gray-700 dark:text-gray-300">
                <li>• La Canadienne Shoes - Premium Canadian-made footwear</li>
                <li>• Viberg - Heritage work boots crafted in Canada</li>
                <li>• Padraig Cottage - Handcrafted leather shoes</li>
                <li>• Wohlford - Contemporary Canadian footwear</li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Clothing Trendsetters</h3>
              <ul className="space-y-1 text-gray-700 dark:text-gray-300">
                <li>• Reigning Champ - Athletic wear manufactured in Canada</li>
                <li>• Naked & Famous - Japanese denim crafted in Montreal</li>
                <li>• Ecologyst - Sustainable outdoor clothing</li>
                <li>• Free Label - Ethical basics from Vancouver</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Our Promise:</strong> We only feature genuine Canadian businesses. 
              We aim to ensure that every brand on our platform is independently owned and operated in Canada, 
              with products made or designed here whenever possible.
            </p>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">How We Work</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Curated Canada operates as an independent discovery platform. We:
          </p>
          
          <ol className="list-decimal pl-5 space-y-3 text-gray-700 dark:text-gray-300">
            <li className="pl-2">
              <span className="font-medium">Research Canadian Brands:</span> We identify and verify 
              independent Canadian fashion and footwear businesses across the country.
            </li>
            <li className="pl-2">
              <span className="font-medium">Showcase Products:</span> We collate current collections 
              and products from these brands in an easy-to-browse format.
            </li>
            <li className="pl-2">
              <span className="font-medium">Enable Discovery:</span> Our search and filtering tools 
              help you find exactly what you're looking for across multiple Canadian brands.
            </li>
            <li className="pl-2">
              <span className="font-medium">Support Direct Sales:</span> When you find something you love, 
              you purchase directly from the brand's website - your money goes straight to the Canadian business, without ads.
            </li>
          </ol>
          
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              <strong>Transparency Note:</strong> We are not affiliated with any brands we feature, and do not display ads. 
              We don't accept payments for placement or favorable treatment. Our goal is simply 
              to help Canadian shoppers discover Canadian brands.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}