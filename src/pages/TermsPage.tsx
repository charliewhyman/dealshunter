import { useEffect } from 'react';

export function TermsPage() {
  useEffect(() => {
    document.title = 'Terms of Service - Curated Canada';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Terms of Service for Curated Canada. Learn about user responsibilities, limitations, and conditions for using our product comparison platform.');
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

  const lastUpdated = new Date().toLocaleDateString('en-CA', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Last updated: {lastUpdated}</p>
      
      <div className="space-y-8">
        <section>
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 mb-6">
            <p className="text-blue-800 dark:text-blue-300">
              <strong>Please read these Terms of Service carefully before using Curated Canada.</strong> By accessing 
              or using our website, you agree to be bound by these Terms. If you disagree with any part of the terms, 
              then you may not access the Service.
            </p>
          </div>
          
          <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
          <p className="text-gray-700 dark:text-gray-300">
            By accessing and using Curated Canada ("the Service"), you accept and agree to be bound by the terms 
            and provisions of this agreement. If you do not agree to these terms, please do not use our Service.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Curated Canada is an independent platform that aggregates publicly available product information 
            from various Canadian retailers. Our service includes:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-2 text-gray-700 dark:text-gray-300">
            <li>Product price comparison across multiple retailers</li>
            <li>Product availability information</li>
            <li>Search and filtering capabilities</li>
            <li>User preference saving (via browser storage)</li>
          </ul>
          <p className="text-gray-700 dark:text-gray-300 mt-3">
            We do not sell products directly, process transactions, or handle customer service for retailers.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">3. User Responsibilities</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-2">By using our Service, you agree to:</p>
          <ul className="list-disc pl-5 space-y-2 text-gray-700 dark:text-gray-300">
            <li>Use the Service only for lawful purposes and in accordance with these Terms</li>
            <li>Not attempt to circumvent any security measures or access unauthorized areas</li>
            <li>Not use automated systems, bots, or scraping tools to access the Service</li>
            <li>Not interfere with other users' enjoyment of the Service</li>
            <li>Not use the Service in any manner that could damage, disable, or impair the Service</li>
            <li>Comply with all applicable laws and regulations</li>
            <li>Provide accurate information if creating an account (currently not available)</li>
          </ul>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">4. Product Information Disclaimer</h2>
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800 mb-4">
            <h3 className="font-medium text-red-800 dark:text-red-300 mb-2">Important Notice</h3>
            <p className="text-red-800 dark:text-red-300 text-sm">
              While we strive for accuracy, we cannot guarantee that all product information, prices, and 
              availability are current or correct. Prices and availability may change without notice.
            </p>
          </div>
          
          <p className="text-gray-700 dark:text-gray-300 mb-3">
            Curated Canada aggregates product information from publicly available sources. We make reasonable 
            efforts to ensure information is accurate but cannot guarantee:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
            <li>Real-time pricing accuracy</li>
            <li>Current stock availability</li>
            <li>Complete product specifications</li>
            <li>Shipping costs or delivery times</li>
            <li>Retailer promotions or discount codes</li>
          </ul>
          
          <p className="text-gray-700 dark:text-gray-300 mt-4 font-medium">
            ALWAYS verify product details, pricing, and availability directly with the retailer before making a purchase.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">5. Third-Party Links and Services</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-3">
            Our Service contains links to third-party websites and services. You acknowledge and agree that:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-gray-700 dark:text-gray-300">
            <li>We are not responsible for the content, privacy policies, or practices of any third-party sites</li>
            <li>We do not endorse any third-party websites or services linked from our Service</li>
            <li>We are not responsible for any transactions between you and third-party retailers</li>
            <li>Third-party sites have their own terms and privacy policies that govern your use</li>
            <li>We shall not be liable for any damage or loss caused by or in connection with use of any third-party content</li>
          </ul>
          
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Advertising</h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              We use Google AdSense to display advertisements. These third-party advertisers may use cookies 
              and similar technologies. We have no control over these third-party advertisers or their practices.
            </p>
          </div>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">6. Intellectual Property</h2>
          <div className="space-y-4 text-gray-700 dark:text-gray-300">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Our Intellectual Property</h4>
              <p>
                The Service and its original content, features, and functionality are owned by Curated Canada 
                and are protected by international copyright, trademark, and other intellectual property laws.
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Website design, layout, and user interface</li>
                <li>Software code and algorithms</li>
                <li>Brand names, logos, and trademarks</li>
                <li>Original content and compilations</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Third-Party Intellectual Property</h4>
              <p>
                Product information displayed on our site may include intellectual property owned by others:
              </p>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Product images and descriptions belong to their respective retailers</li>
                <li>Brand logos and trademarks belong to their respective owners</li>
                <li>Third-party software components have their own licenses</li>
              </ul>
            </div>
            
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Limited License</h4>
              <p className="text-sm">
                We grant you a limited, non-exclusive, non-transferable, revocable license to use our Service 
                for personal, non-commercial purposes subject to these Terms.
              </p>
            </div>
          </div>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">7. Limitation of Liability</h2>
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-800 mb-4">
            <p className="text-red-800 dark:text-red-300 font-medium mb-2">
              To the maximum extent permitted by applicable law:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-red-800 dark:text-red-300">
              <li>Curated Canada shall not be liable for any indirect, incidental, special, consequential or punitive damages</li>
              <li>We are not liable for loss of profits, data, use, goodwill, or other intangible losses</li>
              <li>We are not liable for damages resulting from your use of or inability to use the Service</li>
              <li>We are not liable for any conduct or content of any third party on the Service</li>
              <li>We are not liable for unauthorized access, use, or alteration of your transmissions or content</li>
            </ul>
          </div>
          
          <p className="text-gray-700 dark:text-gray-300 text-sm">
            This limitation applies regardless of whether the liability arises from contract, tort, negligence, 
            strict liability, or any other legal theory, and whether or not we have been informed of the 
            possibility of such damage.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">8. Disclaimer of Warranties</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-3">
            The Service is provided on an "AS IS" and "AS AVAILABLE" basis. Curated Canada makes no representations 
            or warranties of any kind, express or implied, as to the operation of the Service or the information, 
            content, materials, or products included on the Service.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            We do not warrant that the Service will be uninterrupted, timely, secure, or error-free, or that 
            defects will be corrected. We do not warrant the accuracy, completeness, or usefulness of information 
            on the Service.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">9. Indemnification</h2>
          <p className="text-gray-700 dark:text-gray-300">
            You agree to defend, indemnify, and hold harmless Curated Canada and its affiliates from and against 
            any and all claims, damages, obligations, losses, liabilities, costs, or debt, and expenses arising from:
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-gray-700 dark:text-gray-300">
            <li>Your use of and access to the Service</li>
            <li>Your violation of any term of these Terms</li>
            <li>Your violation of any third-party right, including without limitation any copyright, property, or privacy right</li>
            <li>Any claim that your use of the Service caused damage to a third party</li>
          </ul>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">10. Termination</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We may terminate or suspend your access to the Service immediately, without prior notice or liability, 
            for any reason whatsoever, including without limitation if you breach the Terms. Upon termination, 
            your right to use the Service will immediately cease.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">11. Changes to Terms</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We reserve the right to modify or replace these Terms at any time. We will provide notice of 
            significant changes by posting the new Terms on this page and updating the "Last updated" date. 
            Your continued use of the Service after any changes constitutes acceptance of those changes.
          </p>
          <p className="text-gray-700 dark:text-gray-300 mt-2 text-sm">
            It is your responsibility to review these Terms periodically for changes.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">12. Governing Law</h2>
          <p className="text-gray-700 dark:text-gray-300">
            These Terms shall be governed and construed in accordance with the laws of Ontario, Canada, 
            without regard to its conflict of law provisions. Any disputes arising from these Terms or your 
            use of the Service shall be resolved in the courts of Toronto, Ontario.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">13. Severability</h2>
          <p className="text-gray-700 dark:text-gray-300">
            If any provision of these Terms is held to be invalid or unenforceable by a court, the remaining 
            provisions of these Terms will remain in effect. The invalid or unenforceable provision will be 
            replaced by a valid, enforceable provision that most closely matches the intent of the original provision.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-3">14. Contact Us</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            If you have any questions about these Terms, please contact us:
          </p>
          
          <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg">
            <div className="space-y-3">
              <div>
                <span className="font-medium text-gray-900 dark:text-white">By email:</span>{' '}
                <a 
                  href="mailto:legal@curatedcanada.ca" 
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  legal@curatedcanada.ca
                </a>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We will respond to your inquiry within a reasonable timeframe.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}