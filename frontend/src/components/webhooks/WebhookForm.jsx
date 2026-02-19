import React, { useState, useEffect } from 'react';

const EVENT_TYPES = [
  { value: 'opportunity.created', label: 'Opportunity Created' },
  { value: 'alert.created', label: 'Alert Created' },
  { value: 'ingestion.completed', label: 'Ingestion Completed' },
  { value: 'content.published', label: 'Content Published' },
];

function WebhookForm({ open, onClose, onSubmit, editingWebhook, newSecret, onClearSecret }) {
  const [url, setUrl] = useState('');
  const [eventTypes, setEventTypes] = useState([]);
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const isEditing = Boolean(editingWebhook);

  useEffect(() => {
    if (editingWebhook) {
      setUrl(editingWebhook.url || '');
      setEventTypes(editingWebhook.eventTypes || []);
      setDescription(editingWebhook.description || '');
      setIsActive(editingWebhook.isActive !== undefined ? editingWebhook.isActive : true);
    } else {
      setUrl('');
      setEventTypes([]);
      setDescription('');
      setIsActive(true);
    }
  }, [editingWebhook, open]);

  const handleToggleEventType = (value) => {
    setEventTypes((prev) =>
      prev.includes(value)
        ? prev.filter((et) => et !== value)
        : [...prev, value]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isEditing) {
        await onSubmit({ id: editingWebhook.id, url, eventTypes, description, isActive });
      } else {
        await onSubmit({ url, eventTypes, description });
      }
      if (!isEditing) {
        // Keep modal open to show secret; reset form fields
      } else {
        onClose();
      }
    } catch {
      // error handled by Redux
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (newSecret) {
      onClearSecret();
    }
    onClose();
  };

  const handleCopySecret = () => {
    if (newSecret) {
      navigator.clipboard.writeText(newSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={handleClose} aria-label="Webhook form modal">
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEditing ? 'Edit webhook' : 'Create webhook'}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {newSecret ? 'Webhook Created' : isEditing ? 'Edit Webhook' : 'Create Webhook'}
          </h2>
        </div>

        {newSecret ? (
          <div className="p-6">
            <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-amber-800 dark:text-amber-300 text-sm">
              Store this secret securely. It will not be shown again.
            </div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Webhook Secret
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs font-mono text-gray-900 dark:text-gray-100 break-all select-all">
                {newSecret}
              </code>
              <button
                onClick={handleCopySecret}
                className="px-3 py-2 text-xs bg-accent text-white rounded hover:bg-accent/90 transition-colors shrink-0"
                aria-label="Copy secret to clipboard"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                aria-label="Close"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* URL Input */}
            <div>
              <label htmlFor="webhook-url" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                URL <span className="text-red-500">*</span>
              </label>
              <input
                id="webhook-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/webhook"
                required
                maxLength={512}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-colors"
                aria-label="Webhook URL"
              />
            </div>

            {/* Event Types Checkboxes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Event Types <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {EVENT_TYPES.map((et) => (
                  <label key={et.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eventTypes.includes(et.value)}
                      onChange={() => handleToggleEventType(et.value)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-accent focus:ring-accent dark:bg-gray-800"
                      aria-label={et.label}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{et.label}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">({et.value})</span>
                  </label>
                ))}
              </div>
              {eventTypes.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Select at least one event type.</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="webhook-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Description
              </label>
              <input
                id="webhook-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                maxLength={255}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-accent focus:border-accent outline-none transition-colors"
                aria-label="Webhook description"
              />
            </div>

            {/* Active Toggle (only for editing) */}
            {isEditing && (
              <div className="flex items-center gap-3">
                <label htmlFor="webhook-active" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Active
                </label>
                <button
                  id="webhook-active"
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isActive ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  role="switch"
                  aria-checked={isActive}
                  aria-label="Toggle webhook active status"
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      isActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                aria-label="Cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || eventTypes.length === 0 || !url}
                className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label={isEditing ? 'Save changes' : 'Create webhook'}
              >
                {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Webhook'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default WebhookForm;
