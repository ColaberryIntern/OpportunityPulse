import React, { useState, useCallback } from 'react';

function CreateApiKeyModal({ open, onClose, onCreate, newKey, onClearNewKey }) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['read']);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleScopeToggle = (scope) => {
    setScopes((prev) =>
      prev.includes(scope)
        ? prev.filter((s) => s !== scope)
        : [...prev, scope]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || scopes.length === 0) return;
    setSubmitting(true);
    try {
      await onCreate({ name: name.trim(), scopes });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = useCallback(async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      const textarea = document.createElement('textarea');
      textarea.value = newKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [newKey]);

  const handleClose = () => {
    setName('');
    setScopes(['read']);
    setCopied(false);
    if (onClearNewKey) onClearNewKey();
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleClose}
      aria-label="Create API key dialog"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {newKey ? 'API Key Created' : 'Create New API Key'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {newKey ? (
          /* Key created — show plaintext key */
          <div>
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded text-sm text-yellow-800 dark:text-yellow-300">
              <strong>Important:</strong> Copy your API key now. You will not be able to see it again.
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Your API Key
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newKey}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-mono bg-gray-50 dark:bg-gray-700 dark:text-gray-100 select-all"
                  aria-label="Generated API key"
                  onClick={(e) => e.target.select()}
                />
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors"
                  aria-label="Copy API key to clipboard"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Form to create a new key */
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="apiKeyName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Key Name
              </label>
              <input
                id="apiKeyName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., My Integration"
                maxLength={100}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
                aria-label="API key name"
              />
            </div>

            <div className="mb-6">
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Scopes
              </span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes('read')}
                    onChange={() => handleScopeToggle('read')}
                    className="rounded border-gray-300 dark:border-gray-600 text-accent focus:ring-accent"
                    aria-label="Read scope"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Read</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes('write')}
                    onChange={() => handleScopeToggle('write')}
                    className="rounded border-gray-300 dark:border-gray-600 text-accent focus:ring-accent"
                    aria-label="Write scope"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Write</span>
                </label>
              </div>
              {scopes.length === 0 && (
                <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                  At least one scope is required.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !name.trim() || scopes.length === 0}
                className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Create API key"
              >
                {submitting ? 'Creating...' : 'Create Key'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default CreateApiKeyModal;
