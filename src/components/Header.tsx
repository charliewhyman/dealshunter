import { Link } from 'react-router-dom';
import AsyncLucideIcon from './AsyncLucideIcon';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import React from 'react';

interface HeaderProps {
  searchQuery: string;
  handleSearchChange: (e: ChangeEvent<HTMLInputElement>) => void;
  handleSearchSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

export const Header = React.memo(({ searchQuery, handleSearchChange, handleSearchSubmit }: HeaderProps) => {
  const [localQuery, setLocalQuery] = useState<string>(searchQuery || '');
  const debounceRef = useRef<number | null>(null);
  const DEBOUNCE_MS = 300;

  // keep local input in sync when parent updates searchQuery
  useEffect(() => {
    setLocalQuery(searchQuery || '');
  }, [searchQuery]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  const scheduleChange = (value: string) => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      // construct a minimal event-like object that callers expect
      const fakeEvent = { target: { value } } as unknown as ChangeEvent<HTMLInputElement>;
      handleSearchChange(fakeEvent);
      debounceRef.current = null;
    }, DEBOUNCE_MS) as unknown as number;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 shadow-sm w-full h-16">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
      <div className="flex items-center justify-between h-full">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <AsyncLucideIcon name="Tag" className="w-6 h-6 text-yellow-600 dark:text-yellow-500" />
            <span className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Curated Canada
            </span>
          </Link>

          {/* Search */}
          <form
            onSubmit={handleSearchSubmit}
            className="relative flex-1 max-w-xs sm:max-w-md ml-2 sm:ml-4"
            role = "search"
            aria-label="Search"
          >
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <AsyncLucideIcon name="Search" className="h-4 w-4 text-gray-400 dark:text-gray-500" />
            </div>
            <input
              type="text"
              placeholder="Search..."
              value={localQuery}
              onChange={(e) => {
                const v = (e.target as HTMLInputElement).value;
                setLocalQuery(v);
                scheduleChange(v);
              }}
              className="w-full pl-10 pr-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-gray-900 dark:text-gray-100"
            />
          </form>
        </div>
      </div>
    </header>
  );
}
)