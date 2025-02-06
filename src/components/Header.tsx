import { Link } from 'react-router-dom';
import { Tag, Search } from 'lucide-react';
import { ChangeEvent, FormEvent } from 'react';

interface HeaderProps {
  searchQuery: string;
  handleSearchChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleSearchSubmit: (e: FormEvent<HTMLFormElement>) => void;
}


export function Header({ searchQuery, handleSearchChange, handleSearchSubmit }: HeaderProps) {
  return (
    <header className="bg-white shadow-sm w-full h-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full flex-nowrap space-x-4">
          {/* Logo Section - Brand identity with icon and text */}
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <Tag className="w-8 h-8 text-yellow-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">
                The Canadian Edit
              </span>
            </Link>
          </div>
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative hidden sm:block">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search Products..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="block w-60 pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
            />
          </form>
        </div>
      </div>
    </header>
  );
}