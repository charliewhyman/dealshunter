import { Link } from 'react-router-dom';
import { Search, Tag } from 'lucide-react';

export function Header() {
  return (
      <header className="bg-white shadow-sm">
          <div className="mx-auto">
              <div className="flex items-center justify-between">
                  <div className="flex items-center">
                      <Link to="/" className="flex items-center">
                          <Tag className="" />
                          <span className="font-bold">DealHunt</span>
                      </Link>
                      <div className="flex items-center">
                          <div className="relative">
                              <div className="absolute flex items-center ">
                                  <Search className="text-gray-400" />
                              </div>
                              <input
                                  type="text"
                                  placeholder="Search deals..."
                                  className="block w-full"
                              />
                          </div>
                          <a>Submit a Deal</a>
                          <a>Login</a>
                      </div>
                  </div>
              </div>
          </div>
      </header>
  )
}
