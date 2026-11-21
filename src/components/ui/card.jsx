/**
 * @file src/components/ui/card.jsx
 * @description shadcn/ui Card surface primitives styled for StartSlate Alabaster and Crisp White elevation.
 */

import * as React from 'react';

import { cn } from '../../lib/utils.js';

/**
 * Elevated white surface card container.
 *
 * @description Renders a bordered card surface with subtle elevation.
 * @param {{ className?: string, [key: string]: any }} props - Container div props.
 * @param {import('react').Ref<HTMLDivElement>} ref - Forwarded ref.
 * @returns {import('react').ReactElement} Card element.
 * @throws {Error} Never throws.
 */
export const Card = React.forwardRef(function Card({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('rounded-xl border border-slate-200 bg-white text-slate-900 shadow-sm', className)}
      {...props}
    />
  );
});

/**
 * Card header section wrapper.
 *
 * @description Provides consistent top spacing for card titles and descriptions.
 * @param {{ className?: string, [key: string]: any }} props - Header div props.
 * @param {import('react').Ref<HTMLDivElement>} ref - Forwarded ref.
 * @returns {import('react').ReactElement} CardHeader element.
 * @throws {Error} Never throws.
 */
export const CardHeader = React.forwardRef(function CardHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
});

/**
 * Card heading typography element.
 *
 * @description Renders semibold Slate-900 card title text.
 * @param {{ className?: string, [key: string]: any }} props - Heading props.
 * @param {import('react').Ref<HTMLHeadingElement>} ref - Forwarded ref.
 * @returns {import('react').ReactElement} CardTitle element.
 * @throws {Error} Never throws.
 */
export const CardTitle = React.forwardRef(function CardTitle({ className, ...props }, ref) {
  return (
    <h3
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight text-slate-900', className)}
      {...props}
    />
  );
});

/**
 * Card subtitle / supporting copy element.
 *
 * @description Renders muted slate supporting copy inside card headers.
 * @param {{ className?: string, [key: string]: any }} props - Paragraph props.
 * @param {import('react').Ref<HTMLParagraphElement>} ref - Forwarded ref.
 * @returns {import('react').ReactElement} CardDescription element.
 * @throws {Error} Never throws.
 */
export const CardDescription = React.forwardRef(function CardDescription({ className, ...props }, ref) {
  return <p ref={ref} className={cn('text-sm text-slate-500', className)} {...props} />;
});

/**
 * Card primary body wrapper.
 *
 * @description Pads main card body contents while aligning with CardHeader.
 * @param {{ className?: string, [key: string]: any }} props - Body div props.
 * @param {import('react').Ref<HTMLDivElement>} ref - Forwarded ref.
 * @returns {import('react').ReactElement} CardContent element.
 * @throws {Error} Never throws.
 */
export const CardContent = React.forwardRef(function CardContent({ className, ...props }, ref) {
  return <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />;
});

/**
 * Card footer action bar wrapper.
 *
 * @description Aligns action controls at the bottom of a Card.
 * @param {{ className?: string, [key: string]: any }} props - Footer div props.
 * @param {import('react').Ref<HTMLDivElement>} ref - Forwarded ref.
 * @returns {import('react').ReactElement} CardFooter element.
 * @throws {Error} Never throws.
 */
export const CardFooter = React.forwardRef(function CardFooter({ className, ...props }, ref) {
  return <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />;
});
