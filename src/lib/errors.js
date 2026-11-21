/**
 * @file src/lib/errors.js
 * @description Shared typed application errors carrying machine-readable codes and HTTP status codes.
 */

/**
 * Base application error understood by the standardized API response helper.
 *
 * @description Carries a machine-readable `code`, an HTTP `statusCode`, and optional client-safe `details`.
 */
export class AppError extends Error {
  /**
   * Creates an AppError instance.
   *
   * @description Initializes a typed error with HTTP metadata.
   * @param {string} message - Client-safe, human-readable message.
   * @param {string} [code='INTERNAL_ERROR'] - Machine-readable error code.
   * @param {number} [statusCode=500] - HTTP status code.
   * @param {object} [details] - Optional client-safe structured details (never include PII).
   * @returns {AppError} Constructed error instance.
   * @throws {Error} Never throws during construction.
   */
  constructor(message, code = 'INTERNAL_ERROR', statusCode = 500, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/**
 * Error for invalid client input (HTTP 400).
 *
 * @description Raised when request data fails business-level validation beyond Zod schemas.
 */
export class ValidationError extends AppError {
  /**
   * Creates a ValidationError.
   *
   * @description Initializes a 400 VALIDATION_ERROR.
   * @param {string} message - Client-safe validation message.
   * @param {object} [details] - Optional field-level details.
   * @returns {ValidationError} Constructed error instance.
   * @throws {Error} Never throws during construction.
   */
  constructor(message, details = undefined) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Error for missing or out-of-scope resources (HTTP 404).
 *
 * @description Also used for cross-tenant lookups so resource existence is never leaked.
 */
export class NotFoundError extends AppError {
  /**
   * Creates a NotFoundError.
   *
   * @description Initializes a 404 error with an optional custom code.
   * @param {string} [message='Resource not found.'] - Client-safe message.
   * @param {string} [code='NOT_FOUND'] - Machine-readable error code.
   * @returns {NotFoundError} Constructed error instance.
   * @throws {Error} Never throws during construction.
   */
  constructor(message = 'Resource not found.', code = 'NOT_FOUND') {
    super(message, code, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Error for state conflicts such as invalid FSM transitions or concurrent edits (HTTP 409).
 *
 * @description Signals that the request is valid but conflicts with current resource state.
 */
export class ConflictError extends AppError {
  /**
   * Creates a ConflictError.
   *
   * @description Initializes a 409 error.
   * @param {string} message - Client-safe message.
   * @param {string} [code='CONFLICT'] - Machine-readable error code.
   * @param {object} [details] - Optional client-safe details.
   * @returns {ConflictError} Constructed error instance.
   * @throws {Error} Never throws during construction.
   */
  constructor(message, code = 'CONFLICT', details = undefined) {
    super(message, code, 409, details);
    this.name = 'ConflictError';
  }
}

/**
 * Error raised when the organization's monthly hire quota is exhausted (HTTP 402).
 *
 * @description Prompts the tenant to upgrade or wait for the monthly reset.
 */
export class QuotaExceededError extends AppError {
  /**
   * Creates a QuotaExceededError.
   *
   * @description Initializes a 402 QUOTA_EXCEEDED error.
   * @param {string} message - Client-safe message.
   * @param {object} [details] - Quota usage details.
   * @returns {QuotaExceededError} Constructed error instance.
   * @throws {Error} Never throws during construction.
   */
  constructor(message, details = undefined) {
    super(message, 'QUOTA_EXCEEDED', 402, details);
    this.name = 'QuotaExceededError';
  }
}

/**
 * Error raised when a caller exceeds a rate limit (HTTP 429).
 *
 * @description Used by the in-memory limiter guarding signup, upload, and portal endpoints.
 */
export class RateLimitError extends AppError {
  /**
   * Creates a RateLimitError.
   *
   * @description Initializes a 429 RATE_LIMITED error.
   * @param {string} message - Client-safe message.
   * @param {object} [details] - Retry metadata.
   * @returns {RateLimitError} Constructed error instance.
   * @throws {Error} Never throws during construction.
   */
  constructor(message, details = undefined) {
    super(message, 'RATE_LIMITED', 429, details);
    this.name = 'RateLimitError';
  }
}

/**
 * Error raised when an upstream dependency (Gemini, Supabase Storage, Auth) fails (HTTP 502).
 *
 * @description Wraps third-party failures without leaking upstream error bodies.
 */
export class ExternalServiceError extends AppError {
  /**
   * Creates an ExternalServiceError.
   *
   * @description Initializes a 502 error with a client-safe message.
   * @param {string} message - Client-safe message.
   * @param {string} [code='UPSTREAM_ERROR'] - Machine-readable error code.
   * @returns {ExternalServiceError} Constructed error instance.
   * @throws {Error} Never throws during construction.
   */
  constructor(message, code = 'UPSTREAM_ERROR') {
    super(message, code, 502);
    this.name = 'ExternalServiceError';
  }
}
