import { Link } from 'react-router-dom';
import { LogOut, Search, Tag, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { signOut } from '../lib/auth';

interface HeaderProps {
    onAuthClick: () => void;
  }

export function Header({ onAuthClick }: HeaderProps) {
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
                            {user ? (
                                <div className="ml-4 flex items-center">
                                    <span className="text-sm text-gray-700 mr-4">
                                    {user.username}
                                    </span>
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
                                    className="ml-4 p-2 text-gray-400 hover:text-gray-500"
                                >
                                    <User className="w-6 h-6" />
                                </button>
                                )}
                            </div>
                      </div>
                  </div>
              </div>
          </div>
      </header>
  )
}
