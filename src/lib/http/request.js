/**
 * @file src/lib/http/request.js
 * @description Request parsing helpers: client IP resolution, bounded JSON parsing, and bounded multipart uploads.
 */

import { AppError, ValidationError } from '../errors.js';
import { MAX_FILE_SIZE_BYTES } from '../security/fileValidator.js';

const MAX_JSON_BODY_BYTES = 64 * 1024;
const MULTIPART_OVERHEAD_BYTES = 512 * 1024;

/**
 * Resolves the best-effort client IP address for rate limiting and hashed audit logging.
 *
 * @description Uses the first `X-Forwarded-For` entry, then `X-Real-IP`. These headers are only trustworthy
 * behind a proxy that overwrites them (e.g., Vercel); the value is never stored unhashed.
 * @param {Request} request - Incoming request.
 * @returns {string} Client IP string or `'unknown'`.
 * @throws {Error} Never throws.
 */
export function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) {
      return first.slice(0, 64);
    }
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim().slice(0, 64);
  }
  return 'unknown';
}

/**
 * Reads and parses a bounded JSON request body.
 *
 * @description Rejects bodies over 64KB and malformed JSON. Empty bodies return `{}` when `allowEmpty` is set.
 * @param {Request} request - Incoming request.
 * @param {{ allowEmpty?: boolean }} [options={}] - Parsing options.
 * @returns {Promise<unknown>} Parsed JSON value.
 * @throws {AppError} PAYLOAD_TOO_LARGE (413) when the body exceeds the limit.
 * @throws {ValidationError} When the body is empty (and not allowed) or not valid JSON.
 */
export async function readJsonBody(request, { allowEmpty = false } = {}) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_JSON_BODY_BYTES) {
    throw new AppError('Request body is too large.', 'PAYLOAD_TOO_LARGE', 413);
  }

  const text = await request.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_JSON_BODY_BYTES) {
    throw new AppError('Request body is too large.', 'PAYLOAD_TOO_LARGE', 413);
  }

  if (!text.trim()) {
    if (allowEmpty) {
      return {};
    }
    throw new ValidationError('Request body must be valid JSON.');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Request body must be valid JSON.');
  }
}

/**
 * Validates multipart headers before the body is buffered.
 *
 * @description Cheap pre-check (content type + declared length) run before authentication-dependent work.
 * @param {Request} request - Incoming request.
 * @returns {void} Nothing.
 * @throws {ValidationError} When the content type is not multipart/form-data.
 * @throws {AppError} FILE_TOO_LARGE (413) when the declared length exceeds 5MB plus form overhead.
 */
export function assertMultipartHeaders(request) {
  const contentType = (request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('multipart/form-data')) {
    throw new ValidationError('Expected a multipart/form-data upload.');
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_FILE_SIZE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    throw new AppError('Upload exceeds the 5MB limit.', 'FILE_TOO_LARGE', 413);
  }
}

/**
 * Parses multipart form data after header validation.
 *
 * @description Wraps `request.formData()` and converts parser failures into validation errors.
 * @param {Request} request - Incoming request.
 * @returns {Promise<FormData>} Parsed form data.
 * @throws {ValidationError} When the multipart body is malformed.
 */
export async function readMultipartForm(request) {
  assertMultipartHeaders(request);
  try {
    return await request.formData();
  } catch {
    throw new ValidationError('Malformed multipart form data.');
  }
}

/**
 * Extracts an uploaded file from form data as a Node.js Buffer.
 *
 * @description Enforces presence and the strict under-5MB size limit before reading bytes. Binary magic-byte
 * validation is performed later by `fileValidator.js` inside the service layer.
 * @param {FormData} formData - Parsed multipart form data.
 * @param {string} [fieldName='file'] - Form field name.
 * @returns {Promise<{ bytes: Buffer, fileName: string }>} File bytes and client-supplied name.
 * @throws {ValidationError} When the field is missing or not a file.
 * @throws {AppError} FILE_TOO_LARGE (413) when the file is 5MB or larger.
 */
export async function extractUploadedFile(formData, fieldName = 'file') {
  const file = formData.get(fieldName);
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    throw new ValidationError(`A file must be provided in the "${fieldName}" field.`);
  }
  if (typeof file.size === 'number' && file.size >= MAX_FILE_SIZE_BYTES) {
    throw new AppError('File must be smaller than 5MB.', 'FILE_TOO_LARGE', 413);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  return {
    bytes,
    fileName: typeof file.name === 'string' && file.name ? file.name : 'upload',
  };
}
