import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export function Footer() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  
  const handleNavigation = (path: string, hash?: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (location.pathname === path) {
      // Already on the page, scroll to section or top
      if (hash) {
        const element = document.getElementById(hash);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        } else {
          // If element not found, scroll to top
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        // No hash, just scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      // Navigate to new page
      if (hash) {
        navigate(`${path}#${hash}`);
      } else {
        navigate(path);
      }
    }
  };

  return (
    <footer className="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-12">
      <div className="max-w-screen-2xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center space-x-2 mb-4">
              <img src="/tag.svg" alt="Curated Canada" className="h-8 w-8" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">Curated Canada</span>
            </Link>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Discover and compare products across Canadian retailers. 
              Find the best deals, track prices, and shop smarter.
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Site Links</h3>
            <ul className="space-y-2">
              <li>
                <a 
                  href="/" 
                  onClick={handleNavigation('/')}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200 cursor-pointer"
                >
                  Home
                </a>
              </li>
              <li>
                <a 
                  href="/about" 
                  onClick={handleNavigation('/about')}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200 cursor-pointer"
                >
                  About
                </a>
              </li>
              <li>
                <a 
                  href="/contact" 
                  onClick={handleNavigation('/contact')}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200 cursor-pointer"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Legal & Privacy</h3>
            <ul className="space-y-2">
              <li>
                <a 
                  href="/privacy" 
                  onClick={handleNavigation('/privacy')}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200 cursor-pointer"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a 
                  href="/terms" 
                  onClick={handleNavigation('/terms')}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200 cursor-pointer"
                >
                  Terms of Service
                </a>
              </li>
              <li>
                <a 
                  href="/privacy#cookies" 
                  onClick={handleNavigation('/privacy', 'cookies')}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200 cursor-pointer"
                >
                  Cookie Policy
                </a>
              </li>
              <li>
                <a 
                  href="/privacy#user-consent" 
                  onClick={handleNavigation('/privacy', 'user-consent')}
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200 cursor-pointer"
                >
                  Your Privacy Choices
                </a>
              </li>
              <li>
                <a 
                  href="https://adssettings.google.com" 
                  target="_blank" 
                  rel="noopener noreferrer nofollow"
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200"
                >
                  Google Ad Settings
                </a>
              </li>
              <li>
                <a 
                  href="https://optout.aboutads.info/?c=2&lang=EN" 
                  target="_blank" 
                  rel="noopener noreferrer nofollow"
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200"
                >
                  Opt Out of Ads (US)
                </a>
              </li>
              <li>
                <a 
                  href="https://youradchoices.ca/en/" 
                  target="_blank" 
                  rel="noopener noreferrer nofollow"
                  className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors duration-200"
                >
                  Your Ad Choices (CA)
                </a>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                © {currentYear} Curated Canada. All rights reserved.
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                All trademarks, logos, and brand names are property of their respective owners.
              </p>
            </div>
            
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-6">
                <div>
                  <span className="font-medium">Contact:</span>{' '}
                  <a 
                    href="mailto:contact@curatedcanada.ca" 
                    className="hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
                  >
                    contact@curatedcanada.ca
                  </a>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500">
                  Based in Canada
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}