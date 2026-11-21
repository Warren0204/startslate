/**
 * @file src/components/ui/label.jsx
 * @description shadcn/ui Label primitive for accessible StartSlate form fields.
 */

import * as React from 'react';

import { cn } from '../../lib/utils.js';

/**
 * Accessible form field label component.
 *
 * @description Renders a Slate-700 label associated with a form control.
 * @param {{ className?: string, [key: string]: any }} props - Standard label props.
 * @param {import('react').Ref<HTMLLabelElement>} ref - Forwarded ref.
 * @returns {import('react').ReactElement} Rendered label element.
 * @throws {Error} Never throws.
 */
export const Label = React.forwardRef(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      className={cn('text-sm font-medium leading-none text-slate-700 peer-disabled:opacity-70', className)}
      {...props}
    />
  );
});
