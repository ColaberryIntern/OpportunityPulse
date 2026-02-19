import React from 'react';
import { Link } from 'react-router-dom';

function Footer() {
  return (
    <footer className="bg-primary text-gray-400 text-xs py-3 px-4 text-center border-t border-secondary" role="contentinfo">
      &copy; {new Date().getFullYear()} Opportunity Pulse &mdash; AI-powered government contract insights
      <span className="mx-2">|</span>
      <Link to="/privacy" className="text-gray-400 hover:text-gray-200 underline transition">
        Privacy Policy
      </Link>
    </footer>
  );
}

export default Footer;
