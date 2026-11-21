/**
 * @file src/components/ui/badge.jsx
 * @description shadcn/ui Badge primitive for StartSlate FSM statuses, roles, and HITL indicators.
 */

import { cva } from 'class-variance-authority';

import { cn } from '../../lib/utils.js';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-slate-900 text-slate-50',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-800',
        rose: 'border-rose-200 bg-rose-50 text-rose-700',
        secondary: 'border-slate-200 bg-slate-100 text-slate-700',
        outline: 'border-slate-300 bg-white text-slate-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/**
 * Status pill badge primitive.
 *
 * @description Renders compact inline badges for roles, onboarding states, and AI confidence thresholds.
 * @param {{ className?: string, variant?: string, [key: string]: any }} props - Badge element props.
 * @returns {import('react').ReactElement} Rendered span badge.
 * @throws {Error} Never throws.
 */
export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
