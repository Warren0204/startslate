/**
 * @file src/integrations/storage.adapter.js
 * @description Private Supabase Storage adapter for the `onboarding-docs` bucket with tenant path isolation and 60s Signed URLs.
 */

import { AppError, ExternalServiceError, ValidationError } from '../lib/errors.js';

export const ONBOARDING_BUCKET = 'onboarding-docs';
export const MAX_SIGNED_URL_TTL_SECONDS = 60;

/**
 * Validates that a storage object path is strictly scoped under `{orgId}/` without traversal sequences.
 *
 * @description Enforces deterministic tenant folder isolation on every private bucket operation.
 * @param {string} orgId - Tenant organization UUID.
 * @param {string} objectPath - Bucket-relative storage path.
 * @returns {string} Verified storage path.
 * @throws {ValidationError} When the path is malformed, traverses directories, or escapes `{orgId}/`.
 */
function assertTenantObjectPath(orgId, objectPath) {
  if (typeof orgId !== 'string' || !orgId.trim()) {
    throw new ValidationError('Organization ID is required for storage access.');
  }
  if (typeof objectPath !== 'string' || !objectPath.trim()) {
    throw new ValidationError('Storage object path is required.');
  }

  const clean = objectPath.trim();
  if (clean.includes('..') || clean.startsWith('/') || clean.includes('\\')) {
    throw new ValidationError('Invalid storage object path.');
  }

  const expectedPrefix = `${orgId.trim()}/`;
  if (!clean.startsWith(expectedPrefix)) {
    throw new AppError('Cross-tenant storage path access is prohibited.', 'FORBIDDEN', 403);
  }

  return clean;
}

/**
 * Builds a deterministic tenant-isolated object path inside `onboarding-docs`.
 *
 * @description Formats `{orgId}/{hireId}/{fileName}` with safe characters only.
 * @param {string} orgId - Tenant organization UUID.
 * @param {string} hireId - Onboarding hire UUID.
 * @param {string} fileName - Safe filename (e.g., `offer-letter.pdf`).
 * @returns {string} Tenant-scoped storage path.
 * @throws {ValidationError} When any path segment is missing or invalid.
 */
export function buildOnboardingObjectPath(orgId, hireId, fileName) {
  if (!orgId || !hireId || !fileName) {
    throw new ValidationError('orgId, hireId, and fileName are required to build a storage path.');
  }
  const safeFile = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return assertTenantObjectPath(orgId, `${orgId}/${hireId}/${safeFile}`);
}

/**
 * Uploads a private binary file to the `onboarding-docs` Supabase Storage bucket.
 *
 * @description Enforces `{orgId}/` path scoping and writes the object with the verified binary MIME type.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {{ orgId: string, objectPath: string, fileBytes: Buffer|Uint8Array, contentType: string, upsert?: boolean }} params - Upload parameters.
 * @returns {Promise<{ path: string, bucket: string }>} Stored object path metadata.
 * @throws {ExternalServiceError} STORAGE_UPLOAD_FAILED (502) when Supabase Storage rejects the upload.
 */
export async function uploadPrivateDocument(
  adminDb,
  { orgId, objectPath, fileBytes, contentType, upsert = true }
) {
  const safePath = assertTenantObjectPath(orgId, objectPath);

  const { data, error } = await adminDb.storage
    .from(ONBOARDING_BUCKET)
    .upload(safePath, fileBytes, { contentType, upsert });

  if (error || !data?.path) {
    throw new ExternalServiceError('Failed to store document in private vault.', 'STORAGE_UPLOAD_FAILED');
  }

  return { path: data.path, bucket: ONBOARDING_BUCKET };
}

/**
 * Downloads a private binary file from `onboarding-docs` as a Node.js Buffer.
 *
 * @description Verifies tenant path scoping before reading object bytes from Supabase Storage.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Tenant organization UUID.
 * @param {string} objectPath - Tenant-scoped storage path.
 * @returns {Promise<Buffer>} Raw file contents.
 * @throws {ExternalServiceError} STORAGE_DOWNLOAD_FAILED (502) when download fails.
 */
export async function downloadPrivateDocument(adminDb, orgId, objectPath) {
  const safePath = assertTenantObjectPath(orgId, objectPath);

  const { data, error } = await adminDb.storage.from(ONBOARDING_BUCKET).download(safePath);
  if (error || !data) {
    throw new ExternalServiceError('Failed to retrieve private document.', 'STORAGE_DOWNLOAD_FAILED');
  }

  return Buffer.from(await data.arrayBuffer());
}

/**
 * Generates a short-lived Signed URL (strictly capped at 60 seconds) for a private `onboarding-docs` object.
 *
 * @description Enforces `{orgId}/` path scoping and clamps expiry to `MAX_SIGNED_URL_TTL_SECONDS` (60s).
 * @param {import('@supabase/supabase-js').SupabaseClient} adminDb - Service-role Supabase client.
 * @param {string} orgId - Tenant organization UUID.
 * @param {string} objectPath - Tenant-scoped storage path.
 * @param {number} [expiresInSeconds=60] - Requested expiry in seconds (clamped to 1..60).
 * @returns {Promise<{ signedUrl: string, expiresInSeconds: number }>} Short-lived Signed URL and actual TTL.
 * @throws {ExternalServiceError} SIGNED_URL_FAILED (502) when Supabase cannot sign the URL.
 */
export async function createSignedDocumentUrl(
  adminDb,
  orgId,
  objectPath,
  expiresInSeconds = MAX_SIGNED_URL_TTL_SECONDS
) {
  const safePath = assertTenantObjectPath(orgId, objectPath);
  const clampedTtl = Math.max(1, Math.min(Math.floor(expiresInSeconds), MAX_SIGNED_URL_TTL_SECONDS));

  const { data, error } = await adminDb.storage
    .from(ONBOARDING_BUCKET)
    .createSignedUrl(safePath, clampedTtl);

  if (error || !data?.signedUrl) {
    throw new ExternalServiceError('Failed to generate temporary document link.', 'SIGNED_URL_FAILED');
  }

  return {
    signedUrl: data.signedUrl,
    expiresInSeconds: clampedTtl,
  };
}
