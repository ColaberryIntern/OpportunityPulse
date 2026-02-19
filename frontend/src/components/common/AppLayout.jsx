import React, { useState } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg focus:text-accent">
        Skip to main content
      </a>
      <Header onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />

      <div className="flex flex-1">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main id="main-content" className="flex-1 overflow-auto" role="main">
          {children}
        </main>
      </div>

      <Footer />
    </div>
  );
}

export default AppLayout;
