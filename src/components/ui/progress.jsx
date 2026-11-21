/**
 * @file src/components/ui/progress.jsx
 * @description Accessible horizontal progress bar primitive for StartSlate monthly hire quota meters.
 */

import { cn } from '../../lib/utils.js';

/**
 * Linear usage progress bar component.
 *
 * @description Displays percentage fill clamped between 0 and 100 with automatic warning color shift near capacity.
 * @param {{ value?: number, className?: string, indicatorClassName?: string }} props - Progress bar properties.
 * @returns {import('react').ReactElement} Progress bar element.
 * @throws {Error} Never throws.
 */
export function Progress({ value = 0, className, indicatorClassName }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const autoColor =
    clamped >= 100 ? 'bg-rose-500' : clamped >= 80 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200', className)}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-300', autoColor, indicatorClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
