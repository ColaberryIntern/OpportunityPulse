import React, { useState } from 'react';

function TagInput({ value, onChange, suggestions, placeholder, label, highlightNew }) {
  const [input, setInput] = useState('');

  const addTag = (tag) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput('');
  };

  const removeTag = (index) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  const filteredSuggestions = suggestions
    ? suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(input.toLowerCase()))
    : [];

  const highlightSet = highlightNew ? new Set(highlightNew) : null;

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      )}
      <div className="flex flex-wrap gap-1.5 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 min-h-[42px]">
        {value.map((tag, i) => (
          <span
            key={i}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded ${
              highlightSet && highlightSet.has(tag)
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-accent/10 text-accent'
            }`}
          >
            {tag}
            <button type="button" onClick={() => removeTag(i)} className="hover:text-red-500">x</button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
        />
      </div>
      {input && filteredSuggestions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {filteredSuggestions.slice(0, 6).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-accent/10 hover:text-accent transition"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default TagInput;
