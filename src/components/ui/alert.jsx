/**
 * @file src/components/ui/alert.jsx
 * @description shadcn/ui Alert banner primitive for StartSlate validation errors, HITL notices, and confirmations.
 */

import { cva } from 'class-variance-authority';

import { cn } from '../../lib/utils.js';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 text-sm flex items-start gap-3',
  {
    variants: {
      variant: {
        default: 'border-slate-200 bg-white text-slate-900',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        amber: 'border-amber-300 bg-amber-50 text-amber-950',
        destructive: 'border-rose-200 bg-rose-50 text-rose-900',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/**
 * Contextual status alert banner.
 *
 * @description Renders an accessible `role="alert"` notification box.
 * @param {{ className?: string, variant?: string, children: import('react').ReactNode, [key: string]: any }} props - Alert props.
 * @returns {import('react').ReactElement} Alert element.
 * @throws {Error} Never throws.
 */
export function Alert({ className, variant, children, ...props }) {
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {children}
    </div>
  );
}
