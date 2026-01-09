import { useEffect } from 'react';

export function AboutPage() {
  useEffect(() => {
    document.title = 'About Us - Curated Canada';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Learn about Curated Canada - an independent platform helping Canadians compare prices and find the best deals across retailers.');
    }
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">About Curated Canada</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Helping Canadian shoppers make informed decisions since 2024</p>
      
      <div className="space-y-8">
        <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Our Mission</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Curated Canada was founded with a simple but important mission: to help Canadian consumers 
            navigate the complex world of online shopping by providing comprehensive, accurate, and 
            up-to-date product comparisons across major Canadian retailers.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            In today's digital marketplace, shoppers face information overload. With hundreds of 
            retailers offering similar products at different prices, it's challenging to know where 
            to find the best deal. Our platform solves this problem by aggregating product information 
            in one convenient location, saving you time and money on every purchase.
          </p>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">What We Do</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Curated Canada is an independent product discovery and comparison platform specifically 
            designed for the Canadian market. We focus exclusively on Canadian retailers and products 
            available to Canadian consumers, taking into account factors like local pricing, 
            availability, shipping considerations, and currency.
          </p>
          
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">Price Comparison</h3>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                We track prices across multiple retailers so you can instantly see where to get 
                the best deal on any product.
              </p>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">Availability Tracking</h3>
              <p className="text-sm text-green-700 dark:text-green-400">
                Real-time stock information helps you avoid disappointment when products are out 
                of stock at your preferred retailer.
              </p>
            </div>
            
            <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <h3 className="font-semibold text-purple-800 dark:text-purple-300 mb-2">Product Discovery</h3>
              <p className="text-sm text-purple-700 dark:text-purple-400">
                Our intelligent filtering and search tools help you discover products that match 
                your specific needs and budget.
              </p>
            </div>
            
            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg">
              <h3 className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Deal Alerts</h3>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Set up price drop notifications and be the first to know when products you're 
                interested in go on sale.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Our Values</h2>
          
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Transparency</h3>
              <p className="text-gray-700 dark:text-gray-300">
                We believe in complete transparency. We clearly disclose how we collect and display 
                product information, and we're upfront about our relationships (or lack thereof) 
                with retailers. We don't accept payments to feature certain products or manipulate 
                search results. Our goal is to provide unbiased information that helps you make 
                the best decision for your needs.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Accuracy</h3>
              <p className="text-gray-700 dark:text-gray-300">
                We're committed to providing the most accurate and current information possible. 
                Our systems regularly update product data, prices, and availability. While we 
                strive for perfection, we acknowledge that retail websites can change information 
                rapidly, so we encourage users to verify critical details directly with retailers 
                before making final purchasing decisions.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">User Privacy</h3>
              <p className="text-gray-700 dark:text-gray-300">
                Your privacy matters to us. We collect minimal personal information and are 
                transparent about how we use it. We comply with Canadian privacy laws including 
                PIPEDA and provide clear opt-out options for advertising cookies. Our detailed 
                <a href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline mx-1">
                  Privacy Policy
                </a> 
                explains exactly what data we collect and how we protect it.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">How We Work</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Curated Canada operates as an independent platform. We aggregate publicly available 
            product information from Canadian retailers to create comprehensive comparisons. 
            Our process involves:
          </p>
          
          <ol className="list-decimal pl-5 space-y-3 text-gray-700 dark:text-gray-300">
            <li className="pl-2">
              <span className="font-medium">Data Collection:</span> We gather product information, 
              prices, and availability data from retailer websites using automated systems that 
              respect robots.txt files and terms of service.
            </li>
            <li className="pl-2">
              <span className="font-medium">Data Processing:</span> Our systems normalize and 
              organize the data, matching identical products across different retailers and 
              standardizing specifications for easy comparison.
            </li>
            <li className="pl-2">
              <span className="font-medium">Quality Assurance:</span> We implement multiple 
              validation checks to ensure data accuracy and flag potential discrepancies for 
              manual review when necessary.
            </li>
            <li className="pl-2">
              <span className="font-medium">User Presentation:</span> We present the information 
              through an intuitive interface with powerful filtering, sorting, and search 
              capabilities tailored to Canadian shoppers' needs.
            </li>
          </ol>
          
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Important Note:</strong> While we strive for accuracy, prices and availability 
              can change rapidly. We recommend verifying critical information directly with the 
              retailer before completing any purchase.
            </p>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
          <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">Our Commitment to Canadian Shoppers</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            As a platform built specifically for Canadians, we understand the unique challenges 
            of shopping in the Canadian market. We focus on:
          </p>
          
          <ul className="list-disc pl-5 space-y-2 text-gray-700 dark:text-gray-300 mb-6">
            <li>Canadian retailers with shipping to all provinces and territories</li>
            <li>Prices in Canadian dollars with applicable taxes considered</li>
            <li>Products that meet Canadian standards and regulations</li>
            <li>Retailers with reliable shipping across Canada's vast geography</li>
            <li>Bilingual content support where available</li>
            <li>Consideration of regional availability differences</li>
          </ul>
          
          <p className="text-gray-700 dark:text-gray-300">
            We're constantly expanding our retailer coverage and improving our platform based on 
            user feedback. Our goal is to become the most comprehensive and trusted resource for 
            Canadian online shoppers.
          </p>
        </section>

        <section className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6">
          <h2 className="text-2xl font-semibold mb-4 text-blue-900 dark:text-blue-300">Contact & Feedback</h2>
          <p className="text-blue-800 dark:text-blue-400 mb-4">
            We value your feedback and are always looking for ways to improve. Whether you have 
            suggestions for new features, found an error in our data, or just want to share your 
            experience, we'd love to hear from you.
          </p>
          
          <div className="mt-4">
            <a 
              href="/contact" 
              className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors duration-200"
            >
              Contact Us
              <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </div>
          
          <div className="mt-6 pt-6 border-t border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-500">
              Curated Canada is an independent project based in Toronto, Ontario. We're passionate 
              about helping Canadian consumers make smarter shopping decisions and saving money 
              in the process.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}