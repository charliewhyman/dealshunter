import { Link } from 'react-router-dom';
import { Tag } from 'lucide-react';

export function Header() {

  return (
    <header className="bg-white shadow-sm w-full h-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full flex-nowrap space-x-4">
          {/* Logo Section - Brand identity with icon and text */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <Tag className="w-8 h-8 text-blue-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">
                ProductHunt
              </span>
            </Link>
          </div>
          </div>
      </div>
    </header>
  )
};