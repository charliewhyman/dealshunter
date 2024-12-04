import { Link } from 'react-router-dom';
import { Search, Tag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { signOut } from '../lib/auth';

interface HeaderProps {
    onAuthClick: () => void;
  }

export function Header({}: HeaderProps) {
  const { user, refreshUser } = useAuth();

  async function handleSignOut() {
    await signOut();
    await refreshUser();
  }

  return (
      <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                  <div className="flex items-center">
                      <Link to="/" className="flex items-center">
                          <Tag className="w-8 h-8 text-blue-600" />
                          <span className="ml-2 text-xl font-bold text-gray-900">DealHunt</span>
                      </Link>
                      <div className="ml-10 flex items-center">
                          <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Search className="h-5 w-5 text-gray-400" />
                              </div>
                              <input
                                  type="text"
                                  placeholder="Search deals..."
                                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                              />
                            </div>
                            <div className="flex items-center">
                            <Link
                                to="/submit"
                                className="ml-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                                >
                                Submit a Deal
                            </Link>
                            {/* Add auth buttons here */}
                            </div>
                      </div>
                  </div>
              </div>
          </div>
      </header>
  )
}
