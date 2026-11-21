/**
 * @file src/lib/security/domainGuard.js
 * @description Corporate email domain extraction and public/disposable webmail blocker for StartSlate signup gates.
 */

/**
 * Set of blocked public consumer webmail and disposable email domains.
 *
 * @type {ReadonlySet<string>}
 */
export const PUBLIC_WEBMAIL_DOMAINS = Object.freeze(
  new Set([
    'gmail.com',
    'googlemail.com',
    'yahoo.com',
    'yahoo.com.ph',
    'ymail.com',
    'rocketmail.com',
    'hotmail.com',
    'outlook.com',
    'live.com',
    'msn.com',
    'icloud.com',
    'me.com',
    'mac.com',
    'proton.me',
    'protonmail.com',
    'aol.com',
    'mail.com',
    'zoho.com',
    'gmx.com',
    'yandex.com',
    'mailinator.com',
    'yopmail.com',
    'guerrillamail.com',
    'tempmail.com',
    'sharklasers.com',
    '10minutemail.com',
  ])
);

const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

/**
 * Custom error thrown when corporate email validation or domain policy fails.
 *
 * @description Represents deterministic domain validation failures with machine-readable error codes and HTTP statuses.
 */
export class DomainGuardError extends Error {
  /**
   * Creates a new DomainGuardError instance.
   *
   * @description Initializes a domain validation error carrying HTTP status metadata.
   * @param {string} message - Human-readable explanation of the failure.
   * @param {string} code - Machine-readable error identifier.
   * @param {number} [statusCode=400] - Suggested HTTP response status code.
   * @returns {DomainGuardError} Constructed error instance.
   * @throws {Error} Never throws during construction.
   */
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = 'DomainGuardError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Validates email syntax, normalizes casing, and extracts the corporate domain segment.
 *
 * @description Trims whitespace, lowercases the address, enforces basic RFC-style email format, and splits local/domain parts.
 * @param {string} email - Raw email address supplied during registration or user invitation.
 * @returns {{ email: string, domain: string }} Normalized email address and lowercase domain name.
 * @throws {DomainGuardError} Throws INVALID_EMAIL_FORMAT (400) when the input is missing or malformed.
 */
export function extractCorporateDomain(email) {
  if (typeof email !== 'string') {
    throw new DomainGuardError('Email address must be a non-empty string.', 'INVALID_EMAIL_FORMAT', 400);
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail.length > 320 || !EMAIL_PATTERN.test(normalizedEmail)) {
    throw new DomainGuardError('Please enter a valid corporate email address.', 'INVALID_EMAIL_FORMAT', 400);
  }

  const atIndex = normalizedEmail.lastIndexOf('@');
  const domain = normalizedEmail.slice(atIndex + 1);
  if (!domain || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    throw new DomainGuardError('Email domain syntax is invalid.', 'INVALID_EMAIL_FORMAT', 400);
  }

  return {
    email: normalizedEmail,
    domain,
  };
}

/**
 * Checks whether a domain belongs to a blocked public webmail or disposable email provider.
 *
 * @description Performs case-insensitive lookup against PUBLIC_WEBMAIL_DOMAINS.
 * @param {string} domain - Hostname portion of an email address.
 * @returns {boolean} True when the domain is a blocked public/disposable provider; otherwise false.
 * @throws {DomainGuardError} Throws INVALID_EMAIL_FORMAT (400) when domain is not a non-empty string.
 */
export function isPublicWebmailDomain(domain) {
  if (typeof domain !== 'string' || !domain.trim()) {
    throw new DomainGuardError('Domain must be a non-empty string.', 'INVALID_EMAIL_FORMAT', 400);
  }

  const normalizedDomain = domain.trim().toLowerCase();
  return PUBLIC_WEBMAIL_DOMAINS.has(normalizedDomain);
}

/**
 * Enforces StartSlate's corporate-domain-only signup gate.
 *
 * @description Extracts the normalized corporate domain and rejects public consumer webmail providers (e.g., gmail.com, yahoo.com, hotmail.com, outlook.com).
 * @param {string} email - User-supplied email address.
 * @returns {{ email: string, domain: string }} Verified corporate email and extracted organization domain.
 * @throws {DomainGuardError} Throws INVALID_EMAIL_FORMAT (400) on bad syntax or PUBLIC_WEBMAIL_BLOCKED (403) for consumer webmail domains.
 */
export function assertCorporateEmail(email) {
  const parsed = extractCorporateDomain(email);

  if (isPublicWebmailDomain(parsed.domain)) {
    throw new DomainGuardError(
      `Public webmail domain "${parsed.domain}" is not permitted. Please sign up with your corporate work email.`,
      'PUBLIC_WEBMAIL_BLOCKED',
      403
    );
  }

  return parsed;
}
