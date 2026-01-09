// src/components/DocumentHead.tsx
import React from 'react';

interface DocumentHeadProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
}

export function DocumentHead({
  title = 'Curated Canada | Discover Best Deals & Products Across Canadian Retailers',
  description = 'Discover the best deals and curated products in Canada. Find discounts, compare prices, and shop smart.',
  canonical = 'https://curatedcanada.ca',
  ogImage = 'https://curatedcanada.ca/tag.svg'
}: DocumentHeadProps) {
  // Update document title
  React.useEffect(() => {
    document.title = title;
    
    // Update meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', description);
    
    // Update canonical link
    let linkCanonical = document.querySelector('link[rel="canonical"]');
    if (!linkCanonical) {
      linkCanonical = document.createElement('link');
      linkCanonical.setAttribute('rel', 'canonical');
      document.head.appendChild(linkCanonical);
    }
    linkCanonical.setAttribute('href', canonical);
    
    // Update OG tags
    const ogTags = {
      'og:title': title,
      'og:description': description,
      'og:image': ogImage,
      'og:url': canonical
    };
    
    Object.entries(ogTags).forEach(([property, content]) => {
      let tag = document.querySelector(`meta[property="${property}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute('property', property);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    });
  }, [title, description, canonical, ogImage]);

  return null; // This component doesn't render anything
}