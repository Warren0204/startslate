/**
 * @file src/lib/validation/schemas.js
 * @description Shared Zod request schemas and constants used by StartSlate API controllers and adapters.
 */

import { z } from 'zod';

/**
 * Supported Philippine government ID classifications.
 *
 * @type {ReadonlyArray<string>}
 */
export const GOV_ID_TYPES = Object.freeze([
  'philsys_id',
  'passport',
  'drivers_license',
  'umid',
  'sss_id',
  'prc_id',
  'postal_id',
  'voters_id',
  'tin_id',
  'other',
]);

/**
 * Current RA 10173 privacy notice / consent version presented in the candidate portal.
 *
 * @type {string}
 */
export const CURRENT_CONSENT_VERSION = 'ra10173-v1';

/**
 * Checks whether a string is a real calendar date in strict `YYYY-MM-DD` format.
 *
 * @description Rejects impossible dates such as `2026-02-30` by round-tripping through UTC.
 * @param {unknown} value - Candidate date string.
 * @returns {boolean} True if the value is a valid ISO calendar date.
 * @throws {Error} Never throws.
 */
export function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** UUID path parameter schema. */
export const uuidSchema = z.string().uuid('Invalid identifier.');

/** `{ id }` route params schema. */
export const idParamsSchema = z.object({ id: uuidSchema });

/** Portal token route params schema (256-bit base64url token = 43 chars). */
export const portalTokenParamsSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid onboarding link.'),
});

/** Strict ISO date schema. */
export const isoDateSchema = z
  .string()
  .refine(isValidIsoDate, 'Date must be a valid YYYY-MM-DD calendar date.');

/** POST /api/auth/signup body. Corporate-domain enforcement happens in domainGuard. */
export const signupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid work email.').max(320),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters.')
      .max(128, 'Password must be at most 128 characters.'),
    full_name: z.string().trim().min(2).max(120),
    org_name: z.string().trim().min(2).max(160),
  })
  .strict();

/** POST /api/hires/[id]/verify body (HITL approval with optional corrections). */
export const verifyHireSchema = z
  .object({
    corrections: z
      .object({
        full_name: z.string().trim().min(2).max(200).optional(),
        personal_email: z.string().trim().toLowerCase().email().max(320).optional(),
        job_title: z.string().trim().min(1).max(200).optional(),
        department_name: z.string().trim().min(1).max(120).optional(),
        expected_start_date: isoDateSchema.optional(),
        base_salary_amount: z.number().finite().nonnegative().max(1_000_000_000).optional(),
        id_type: z.enum(GOV_ID_TYPES).optional(),
        id_number: z
          .string()
          .trim()
          .min(3)
          .max(64)
          .regex(/^[A-Za-z0-9 -]+$/, 'ID number may contain only letters, digits, spaces, and hyphens.')
          .optional(),
        address: z.string().trim().max(500).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

/** POST /api/portal/[token]/submit-id multipart text fields. */
export const portalSubmitFieldsSchema = z.object({
  consent_accepted: z.literal('true', {
    errorMap: () => ({
      message: 'Explicit consent under RA 10173 is required before uploading a Government ID.',
    }),
  }),
  consent_version: z
    .literal(CURRENT_CONSENT_VERSION, {
      errorMap: () => ({ message: 'The privacy notice has been updated. Please reload the page.' }),
    })
    .default(CURRENT_CONSENT_VERSION),
});

/** POST /api/tasks/[id]/complete body. */
export const completeTaskSchema = z
  .object({
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();
