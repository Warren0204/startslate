/**
 * @file src/components/ui/dialog.jsx
 * @description Accessible modal dialog primitive used for New Hire Upload and HITL Split-Screen Verification modals.
 */

'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

import { cn } from '../../lib/utils.js';

/**
 * Controlled modal dialog overlay and container.
 *
 * @description Renders a centered accessible dialog with backdrop dismiss and Escape key handling.
 * @param {{ open: boolean, onClose: () => void, title: string, description?: string, maxWidthClass?: string, children: import('react').ReactNode }} props - Modal properties.
 * @returns {import('react').ReactElement|null} Rendered dialog overlay or `null` when closed.
 * @throws {Error} Never throws.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  maxWidthClass = 'max-w-2xl',
  children,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl',
          maxWidthClass
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
