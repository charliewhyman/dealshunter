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
    <header className="bg-white dark:bg-gray-800 shadow-sm w-full h-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
      <div className="flex items-center justify-between h-full">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <Tag className="w-6 h-6 text-yellow-600 dark:text-yellow-500" />
            <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              The Canadian Edit
            </span>
          </Link>

          {/* Search */}
          <form
            onSubmit={handleSearchSubmit}
            className="relative flex-grow max-w-md ml-4"
          >
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100"
            />
          </form>
        </div>
      </div>
    </header>
  );
}
