/**
 * @file src/lib/utils.js
 * @description Shared UI className merging utility for StartSlate JSX components and shadcn/ui primitives.
 */

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditionally joins CSS class names and resolves conflicting Tailwind CSS utility classes.
 *
 * @description Merges arbitrary clsx-compatible class inputs and deduplicates conflicting Tailwind classes via tailwind-merge.
 * @param {...(string|Array<string>|Record<string, boolean>|null|undefined)} inputs - Class values to combine.
 * @returns {string} Merged, conflict-free Tailwind class string.
 * @throws {Error} Never throws on standard string/array/object class inputs.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
