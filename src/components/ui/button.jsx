/**
 * @file src/components/ui/button.jsx
 * @description shadcn/ui Button primitive styled with StartSlate Deep Slate Navy and Crisp Emerald variants.
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '../../lib/utils.js';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-slate-900 text-slate-50 shadow-sm hover:bg-slate-800',
        emerald: 'bg-emerald-500 text-white shadow-sm hover:bg-emerald-600',
        destructive: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
        outline: 'border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-100',
        secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
        ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
        link: 'text-emerald-600 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-lg px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

/**
 * Interactive button primitive supporting StartSlate variants and Radix Slot polymorphism.
 *
 * @description Renders a styled `<button>` or polymorphic child element via `asChild`.
 * @param {{ className?: string, variant?: string, size?: string, asChild?: boolean, [key: string]: any }} props - Button props.
 * @param {import('react').Ref<HTMLButtonElement>} ref - Forwarded ref.
 * @returns {import('react').ReactElement} Rendered button element.
 * @throws {Error} Never throws under standard React usage.
 */
export const Button = React.forwardRef(function Button(
  { className, variant, size, asChild = false, ...props },
  ref
) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
