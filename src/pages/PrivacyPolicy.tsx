import React, { useEffect } from 'react';

export function PrivacyPolicy() {
  useEffect(() => {
    document.title = 'Privacy Policy - Curated Canada';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Privacy Policy for Curated Canada detailing data collection, cookies, user rights, and GDPR/CCPA compliance. Learn about our use of Google AdSense and your privacy choices.');
    }
  }, []);

  const lastUpdated = new Date().toLocaleDateString('en-CA', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Last updated: {lastUpdated}</p>
      
      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Curated Canada ("we," "our," or "us") operates the curatedcanada.ca website. This Privacy Policy 
            explains how we collect, use, disclose, and safeguard your information when you visit our website.
            Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, 
            please do not access the site.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
          
          <h3 className="text-lg font-medium mb-2">Personal Data</h3>
          <p className="text-gray-700 dark:text-gray-300 mb-3">
            We may collect personally identifiable information that you voluntarily provide to us when you:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300 mb-4">
            <li>Use our search functionality</li>
            <li>Save preferences or filters</li>
            <li>Contact us through our contact form</li>
            <li>Subscribe to newsletters or alerts (if available)</li>
          </ul>
          
          <h3 className="text-lg font-medium mb-2">Usage Data</h3>
          <p className="text-gray-700 dark:text-gray-300 mb-2">
            We automatically collect certain information when you visit, use, or navigate the Site:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
            <li>IP address and device information</li>
            <li>Browser type and operating system</li>
            <li>Pages visited, time spent on pages, and navigation patterns</li>
            <li>Search queries and filters used</li>
            <li>Referring website addresses</li>
          </ul>
        </section>

        <section id="cookies">
          <h2 className="text-xl font-semibold mb-3">3. Cookies and Tracking Technologies</h2>
          
          <h3 className="text-lg font-medium mb-2">What Are Cookies?</h3>
          <p className="text-gray-700 dark:text-gray-300 mb-3">
            Cookies are small data files that are placed on your computer or mobile device when you visit a website. 
            Cookies are widely used by website owners to make their websites work, or to work more efficiently, 
            as well as to provide reporting information.
          </p>
          
          <h3 className="text-lg font-medium mb-2">Types of Cookies We Use</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Essential Cookies</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Required for the website to function properly. These cookies enable basic functions like page navigation and access to secure areas.
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Preference Cookies</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Remember your settings and preferences, such as language preferences or region.
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Analytics Cookies</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Help us understand how visitors interact with our website by collecting and reporting information anonymously.
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">Advertising Cookies</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Used by Google AdSense and other advertising partners to deliver relevant advertisements.
              </p>
            </div>
          </div>
          
          <h3 className="text-lg font-medium mb-2">How We Use Cookies</h3>
          <ul className="list-disc pl-5 space-y-2 text-gray-700 dark:text-gray-300 mb-4">
            <li>To enable Google AdSense to display personalized advertisements</li>
            <li>To remember your preferences and settings (like sort order, filters, etc.)</li>
            <li>To understand how users interact with our site and improve user experience</li>
            <li>To maintain website security and prevent fraud</li>
            <li>To analyze site performance and identify technical issues</li>
          </ul>
          
          <h3 className="text-lg font-medium mb-2">Managing Cookies</h3>
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
            <p className="text-gray-700 dark:text-gray-300 mb-3">
              Most web browsers allow you to control cookies through their settings preferences. However, 
              if you limit the ability of websites to set cookies, you may worsen your overall user experience.
            </p>
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              You can usually find these settings in the "options" or "preferences" menu of your browser. 
              To understand these settings, the following links may be helpful:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
              <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Chrome settings</a></li>
              <li><a href="https://support.mozilla.org/en-US/kb/enable-and-disable-cookies-website-preferences" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Firefox settings</a></li>
              <li><a href="https://support.apple.com/guide/safari/manage-cookies-and-website-data-sfri11471/mac" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Safari settings</a></li>
              <li><a href="https://support.microsoft.com/en-us/windows/microsoft-edge-browsing-data-and-privacy-bb8174ba-9d73-dcf2-9b4a-c582b4e640dd" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Edge settings</a></li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">4. Use of Your Information</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-3">
            We may use the information we collect for various business purposes, including to:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-gray-700 dark:text-gray-300">
            <li>Provide, operate, and maintain our website</li>
            <li>Improve, personalize, and expand our website</li>
            <li>Understand and analyze how you use our website</li>
            <li>Develop new products, services, features, and functionality</li>
            <li>Communicate with you, either directly or through one of our partners</li>
            <li>Send you emails</li>
            <li>Find and prevent fraud</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">5. Third-Party Advertising and Google AdSense</h2>
          
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800 mb-4">
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">Google AdSense</h4>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
              We use Google AdSense to display advertisements on our website. Google AdSense is an advertising 
              service provided by Google LLC. This service uses cookies to serve ads based on your prior visits 
              to our website or other websites.
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Google's use of advertising cookies enables it and its partners to serve ads to you based on your 
              visit to our site and/or other sites on the Internet. You may opt out of personalized advertising 
              by visiting <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer nofollow" className="text-blue-600 dark:text-blue-400 hover:underline">Google Ads Settings</a>.
            </p>
          </div>
          
          <h3 className="text-lg font-medium mb-2">Other Third-Party Services</h3>
          <p className="text-gray-700 dark:text-gray-300 mb-2">
            We may use other third-party services for various purposes:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
            <li><strong>Analytics Services:</strong> To understand how users interact with our website</li>
            <li><strong>Hosting Services:</strong> To host our website and data</li>
            <li><strong>CDN Services:</strong> To deliver content efficiently</li>
          </ul>
          
          <p className="text-gray-700 dark:text-gray-300 mt-3">
            These third parties have access to your Personal Data only to perform these tasks on our behalf and 
            are obligated not to disclose or use it for any other purpose.
          </p>
        </section>

        <section id="user-consent">
          <h2 className="text-xl font-semibold mb-3">6. Your Privacy Choices and Rights</h2>
          
          <h3 className="text-lg font-medium mb-2">Opt-Out Options</h3>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-1">
                <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <a 
                  href="https://adssettings.google.com" 
                  target="_blank" 
                  rel="noopener noreferrer nofollow"
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Google AdSense Opt-Out
                </a>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Control how Google uses your information to show you ads
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-1">
                <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <a 
                  href="https://optout.aboutads.info/?c=2&lang=EN" 
                  target="_blank" 
                  rel="noopener noreferrer nofollow"
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Digital Advertising Alliance (DAA) Opt-Out
                </a>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Opt out from participating companies in the Digital Advertising Alliance
                </p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="flex-shrink-0 mt-1">
                <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <a 
                  href="https://youradchoices.ca/en/" 
                  target="_blank" 
                  rel="noopener noreferrer nofollow"
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Your Ad Choices (Canada)
                </a>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Canadian Digital Advertising Alliance's opt-out page
                </p>
              </div>
            </div>
          </div>
          
          <h3 className="text-lg font-medium mt-4 mb-2">Your Data Protection Rights</h3>
          <p className="text-gray-700 dark:text-gray-300 mb-3">
            Depending on your location, you may have certain rights regarding your personal information:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
            <li>The right to access – You have the right to request copies of your personal data</li>
            <li>The right to rectification – You have the right to request correction of inaccurate data</li>
            <li>The right to erasure – You have the right to request deletion of your personal data</li>
            <li>The right to restrict processing – You have the right to request restriction of processing</li>
            <li>The right to data portability – You have the right to request transfer of your data</li>
          </ul>
          
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              To exercise any of these rights, please contact us using the contact information provided below. 
              We may need to verify your identity before processing your request.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">7. Data Security</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We have implemented appropriate technical and organizational security measures designed to protect 
            the security of any personal information we process. However, despite our safeguards and efforts to 
            secure your information, no electronic transmission over the Internet or information storage technology 
            can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, 
            or other unauthorized third parties will not be able to defeat our security and improperly collect, 
            access, steal, or modify your information.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">8. Children's Privacy</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Our Service does not address anyone under the age of 13. We do not knowingly collect personally 
            identifiable information from anyone under the age of 13. If you are a parent or guardian and you are 
            aware that your child has provided us with Personal Data, please contact us. If we become aware that 
            we have collected Personal Data from anyone under the age of 13 without verification of parental consent, 
            we take steps to remove that information from our servers.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">9. Changes to This Privacy Policy</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We may update our Privacy Policy from time to time. We will notify you of any changes by posting 
            the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review 
            this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when 
            they are posted on this page.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">10. Contact Us</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            If you have any questions about this Privacy Policy, please contact us:
          </p>
          
          <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg">
            <div className="space-y-3">
              <div>
                <span className="font-medium text-gray-900 dark:text-white">By email:</span>{' '}
                <a 
                  href="mailto:privacy@curatedcanada.ca" 
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  privacy@curatedcanada.ca
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