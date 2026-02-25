import { FormEvent, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AsyncLucideIcon from './AsyncLucideIcon';

interface HeaderProps {
  searchQuery: string;
  handleSearchSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

export const Header = ({ searchQuery, handleSearchSubmit }: HeaderProps) => {
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

  useEffect(() => {
    setLocalSearchQuery(searchQuery);
  }, [searchQuery]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 shadow-sm w-full h-16">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full">
          <Link to="/" className="flex items-center space-x-2">
            <AsyncLucideIcon name="Tag" className="w-6 h-6 text-yellow-600 dark:text-yellow-500" />
            <span className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
              Curated Canada
            </span>
          </Link>

          <form
            onSubmit={handleSearchSubmit}
            className="relative flex flex-1 items-center max-w-xs sm:max-w-md ml-2 sm:ml-4"
            role="search"
            aria-label="Search"
          >
            <input
              type="text"
              id="search-input"
              name="search"
              placeholder="Search..."
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              className="w-full pl-4 pr-10 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100"
            />
            <button
              type="submit"
              className="absolute inset-y-0 right-0 px-3 bg-transparent border-none hover:border-transparent hover:bg-transparent focus:outline-none flex items-center text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              aria-label="Submit search"
            >
              <AsyncLucideIcon name="Search" className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
};
