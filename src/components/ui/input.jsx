/**
 * @file src/components/ui/input.jsx
 * @description shadcn/ui Input primitive styled for StartSlate forms and HITL verification fields.
 */

import * as React from 'react';

import { cn } from '../../lib/utils.js';

/**
 * Styled HTML input primitive.
 *
 * @description Renders an accessible text/email/password/date input with Emerald focus ring styling.
 * @param {{ className?: string, type?: string, [key: string]: any }} props - Standard input props.
 * @param {import('react').Ref<HTMLInputElement>} ref - Forwarded input ref.
 * @returns {import('react').ReactElement} Rendered input element.
 * @throws {Error} Never throws.
 */
export const Input = React.forwardRef(function Input({ className, type = 'text', ...props }, ref) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
