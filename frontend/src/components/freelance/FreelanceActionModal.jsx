import React from 'react';

function FreelanceActionModal({ action, loading, onClose }) {
  if (!action && !loading) return null;

  const handleCopy = () => {
    if (action?.content) {
      navigator.clipboard.writeText(action.content);
    }
  };

  const handleDownload = () => {
    if (!action?.content) return;
    const blob = new Blob([action.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(action.actionType || 'action').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {loading ? 'Generating...' : (action?.actionType || 'Action').replace('_', ' ')}
          </h2>
          <div className="flex items-center gap-2">
            {!loading && action?.content && (
              <>
                <button
                  onClick={handleCopy}
                  className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                >
                  Copy
                </button>
                <button
                  onClick={handleDownload}
                  className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                >
                  Download .md
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
              <span className="ml-3 text-sm text-gray-500">Generating content with AI...</span>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {action?.content || 'No content generated.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FreelanceActionModal;
