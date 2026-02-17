import React from "react";

export function Header() {
  return (
    <header className="bg-blue-500 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-semibold">
              <span className="text-white">Meta</span><span className="text-black">View</span>
            </h1>
          </div>
          <nav className="flex space-x-4">
            <a href="/" className="text-black hover:text-white px-3 py-2 rounded-md text-sm font-medium">
              Home
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}

export default Header;
