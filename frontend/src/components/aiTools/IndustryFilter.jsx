import React from 'react';

const INDUSTRIES = [
  'All', 'Technology', 'Education', 'Finance', 'Healthcare', 'Marketing',
  'Research', 'Media', 'Design', 'E-commerce', 'Entertainment',
  'Legal', 'Government', 'Advertising', 'Gaming',
  'Corporate', 'Consulting', 'Sales', 'Publishing', 'Small Business',
  'Startups', 'SaaS', 'Social Media', 'Retail', 'Manufacturing',
  'Real Estate', 'Human Resources', 'Customer Service',
];

function IndustryFilter({ selected, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {INDUSTRIES.map((industry) => {
        const isSelected = (industry === 'All' && !selected) || selected === industry;
        return (
          <button
            key={industry}
            onClick={() => onChange(industry === 'All' ? '' : industry)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              isSelected
                ? 'bg-accent text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {industry}
          </button>
        );
      })}
    </div>
  );
}

export default IndustryFilter;
