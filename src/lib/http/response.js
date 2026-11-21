/**
 * @file src/lib/http/response.js
 * @description Standardized `{ success, data, error }` JSON envelope helpers and API error handling wrapper.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AppError } from '../errors.js';

const NO_STORE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
});

/**
 * Builds a successful standardized JSON response.
 *
 * @description Returns `{ success: true, data, error: null }` with `Cache-Control: no-store`.
 * @param {unknown} data - Response payload.
 * @param {number} [status=200] - HTTP status code.
 * @returns {NextResponse} JSON response.
 * @throws {Error} Never throws for serializable data.
 */
export function jsonSuccess(data, status = 200) {
  return NextResponse.json(
    { success: true, data: data ?? null, error: null },
    { status, headers: NO_STORE_HEADERS }
  );
}

/**
 * Builds a failed standardized JSON response.
 *
 * @description Returns `{ success: false, data: null, error: { code, message, details? } }`.
 * @param {string} code - Machine-readable error code.
 * @param {string} message - Client-safe message.
 * @param {number} status - HTTP status code.
 * @param {object} [details] - Optional client-safe details.
 * @returns {NextResponse} JSON response.
 * @throws {Error} Never throws.
 */
export function jsonError(code, message, status, details = undefined) {
  const error = { code, message };
  if (details !== undefined) {
    error.details = details;
  }
  return NextResponse.json({ success: false, data: null, error }, { status, headers: NO_STORE_HEADERS });
}

/**
 * Maps any thrown value to a client-safe error descriptor.
 *
 * @description Zod errors become 400s; typed errors with `statusCode`/`code` keep their status; unknown
 * errors and non-AppError 5xx errors become generic 500s so internals are never leaked.
 * @param {unknown} error - Thrown value.
 * @returns {{ status: number, code: string, message: string, details?: object }} Normalized descriptor.
 * @throws {Error} Never throws.
 */
export function normalizeError(error) {
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: error.flatten(),
    };
  }

  const rawStatus = error && typeof error === 'object' ? error.statusCode : undefined;
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;

  if (status >= 500 && !(error instanceof AppError)) {
    return { status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' };
  }

  return {
    status,
    code: typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
    message: typeof error.message === 'string' && error.message ? error.message : 'Request failed.',
    details: error.details,
  };
}

/**
 * Converts a thrown value into a standardized JSON error response and logs server faults.
 *
 * @description Logs only the error code/name for 5xx responses to avoid writing PII to server logs.
 * @param {unknown} error - Thrown value.
 * @returns {NextResponse} Standardized error response.
 * @throws {Error} Never throws.
 */
export function errorResponse(error) {
  const normalized = normalizeError(error);
  if (normalized.status >= 500) {
    console.error('[StartSlate API]', normalized.code, error?.name ?? typeof error);
  }
  return jsonError(normalized.code, normalized.message, normalized.status, normalized.details);
}

/**
 * Wraps a Next.js route handler so every failure returns the standardized JSON envelope.
 *
 * @description Catches all thrown errors (Zod, RBAC, validation, upstream) and serializes them via `errorResponse`.
 * @param {(request: Request, context: object) => Promise<Response>} handler - Route handler implementation.
 * @returns {(request: Request, context: object) => Promise<Response>} Wrapped handler.
 * @throws {Error} Never throws; failures are converted to JSON responses.
 */
export function withApiHandler(handler) {
  return async function wrappedHandler(request, context) {
    try {
      return await handler(request, context ?? {});
    } catch (error) {
      return errorResponse(error);
    }
  };
}
