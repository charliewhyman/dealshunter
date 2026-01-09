import React, { useEffect } from 'react';

export function ContactPage() {
  useEffect(() => {
    document.title = 'Contact - Curated Canada';
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">Contact</h1>
      
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-3">Email</h2>
          <p className="text-gray-700 dark:text-gray-300">
            For general inquiries: <a href="mailto:contact@curatedcanada.ca" className="text-blue-600 hover:underline">contact@curatedcanada.ca</a>
          </p>
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-3">Location</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Toronto, Ontario, Canada
          </p>
        </div>
        
        <div className="pt-4 border-t">
          <p className="text-sm text-gray-600">
            We're an independent platform helping Canadians compare products and find deals.
          </p>
        </div>
      </div>
    </div>
  );
}