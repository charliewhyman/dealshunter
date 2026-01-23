import React, { memo } from 'react';
import DOMPurify from 'dompurify';

interface SafeHtmlRendererProps {
  html: string;
  className?: string;
  maxHeight?: string;
  showReadMore?: boolean;
}

const SafeHtmlRenderer = memo(function SafeHtmlRenderer({ 
  html, 
  className = '',
  maxHeight,
  showReadMore = false
}: SafeHtmlRendererProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  
  // Sanitize HTML with DOMPurify (client-side defense in depth)
  const sanitizedHtml = React.useMemo(() => {
    if (!html) return '';
    
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ins', 'del',
        'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'div', 'span', 'a', 'img', 'table', 'tr', 'td', 'th',
        'tbody', 'thead', 'tfoot', 'blockquote', 'hr', 'pre',
        'code', 'sup', 'sub'
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel', 'src', 'alt', 'title',
        'width', 'height', 'class', 'style'
      ],
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['target', 'rel'], // Ensure rel="noopener noreferrer"
      ADD_TAGS: ['iframe'], // Only if needed
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    });
  }, [html]);
  
  if (!sanitizedHtml) return null;
  
  return (
    <div className={`safe-html-renderer ${className}`}>
      <div
        className={`prose prose-gray dark:prose-invert max-w-none 
          ${showReadMore && !isExpanded ? 'line-clamp-6' : ''}
          ${maxHeight && !isExpanded ? 'overflow-hidden' : ''}`}
        style={maxHeight && !isExpanded ? { maxHeight } : undefined}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
      {showReadMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 
            hover:text-blue-700 dark:hover:text-blue-300 
            inline-flex items-center gap-1 focus:outline-none focus:ring-2 
            focus:ring-blue-500 focus:ring-offset-2 rounded"
        >
          {isExpanded ? 'Show less' : 'Read more'}
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
    </div>
  );
});

export default SafeHtmlRenderer;