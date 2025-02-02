import { Link } from 'react-router-dom';
import { LogOut, Search, Tag, User } from 'lucide-react';
import { signOut } from '../lib/auth';
import { useState } from 'react';
import { useAuth } from '../contexts/useAuth';

interface HeaderProps {
  onAuthClick: () => void;
}

export function Header({ onAuthClick }: HeaderProps) {
  // Authentication context and loading state
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);

  // Handle user sign out with loading state management
  async function handleSignOut() {
    setLoading(true);
    try {
      await signOut();
      await refreshUser();
    } finally {
      setLoading(false);
    }
  }

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

          {/* Center Section - Search and Submit 
              - Search bar is hidden on mobile (sm:block)
              - Submit button is hidden on mobile (sm:block) */}
          <div className="flex items-center space-x-4 flex-shrink-0">
            {/* Search Bar */}
            <div className="relative hidden sm:block">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search Products..."
                className="block w-60 pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>

          {/* Right Section - User Authentication
              - Shows loading spinner during sign out
              - Displays user email when logged in
              - Shows sign in button when logged out */}
          <div className="flex items-center space-x-5 flex-shrink-0">
            {user ? (
              <div className="flex items-center">
                {loading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-gray-900"></div>
                ) : (
                  <Link 
                    to="/user" 
                    className="text-sm text-blue-600 hover:underline mr-4"
                  >
                    {user.email || 'Guest'}
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="p-2 text-gray-400 hover:text-gray-500"
                >
                  <LogOut className="w-6 h-6" />
                </button>
              </div>
            ) : (
              <button
                onClick={onAuthClick}
                className="p-2 text-gray-400 hover:text-gray-500"
              >
                <User className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}