import React from 'react';

function Footer() {
  return (
    <footer className="bg-primary text-gray-400 text-xs py-3 px-4 text-center border-t border-secondary">
      &copy; {new Date().getFullYear()} Opportunity Pulse &mdash; AI-powered government contract insights
    </footer>
  );
}

export default Footer;
