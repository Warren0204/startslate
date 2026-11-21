/**
 * @file src/lib/security/fileValidator.js
 * @description Binary magic-byte inspection and strict size/filename validation for uploaded onboarding files.
 */

/**
 * Maximum permitted upload size in bytes (strictly under 5MB = 5,242,880 bytes).
 *
 * @type {number}
 */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Supported binary magic-byte file signatures.
 *
 * @type {ReadonlyArray<{ type: string, mimeType: string, extension: string, signature: ReadonlyArray<number> }>}
 */
export const ALLOWED_FILE_SIGNATURES = Object.freeze([
  Object.freeze({
    type: 'pdf',
    mimeType: 'application/pdf',
    extension: 'pdf',
    // %PDF-
    signature: Object.freeze([0x25, 0x50, 0x44, 0x46, 0x2d]),
  }),
  Object.freeze({
    type: 'jpeg',
    mimeType: 'image/jpeg',
    extension: 'jpg',
    // FFD8FF
    signature: Object.freeze([0xff, 0xd8, 0xff]),
  }),
  Object.freeze({
    type: 'png',
    mimeType: 'image/png',
    extension: 'png',
    // 89504E47 0D0A1A0A
    signature: Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  }),
]);

/**
 * Custom error thrown when uploaded file binary signatures, sizes, or types fail validation.
 *
 * @description Captures HTTP 400/413/415 validation error details for API controller responses.
 */
export class FileValidationError extends Error {
  /**
   * Creates a new FileValidationError instance.
   *
   * @description Initializes a file validation failure with machine-readable code and HTTP status.
   * @param {string} message - Human-readable validation error message.
   * @param {string} code - Machine-readable validation failure code.
   * @param {number} [statusCode=400] - Suggested HTTP status code.
   * @returns {FileValidationError} Constructed error instance.
   * @throws {Error} Never throws during construction.
   */
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = 'FileValidationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Converts supported binary payloads into a Uint8Array view without copying unnecessarily.
 *
 * @description Normalizes Buffer, Uint8Array, or ArrayBuffer inputs into Uint8Array.
 * @param {Buffer|Uint8Array|ArrayBuffer} fileInput - Raw binary payload.
 * @returns {Uint8Array} Normalized byte array view.
 * @throws {FileValidationError} Throws INVALID_FILE_INPUT (400) when input is not a valid binary buffer.
 */
function toUint8Array(fileInput) {
  if (Buffer.isBuffer(fileInput)) {
    return new Uint8Array(fileInput.buffer, fileInput.byteOffset, fileInput.byteLength);
  }
  if (fileInput instanceof Uint8Array) {
    return fileInput;
  }
  if (fileInput instanceof ArrayBuffer) {
    return new Uint8Array(fileInput);
  }
  throw new FileValidationError(
    'Uploaded file payload must be a Buffer, Uint8Array, or ArrayBuffer.',
    'INVALID_FILE_INPUT',
    400
  );
}

/**
 * Inspects the leading magic bytes of a binary file to detect PDF, JPEG, or PNG format.
 *
 * @description Completely ignores file extensions and HTTP Content-Type headers, verifying actual binary signatures.
 * @param {Buffer|Uint8Array|ArrayBuffer} fileBytes - Raw file contents.
 * @returns {{ type: string, mimeType: string, extension: string }|null} Detected format descriptor or `null` if unknown.
 * @throws {FileValidationError} Throws INVALID_FILE_INPUT (400) if `fileBytes` is not a supported binary container.
 */
export function detectFileSignature(fileBytes) {
  const bytes = toUint8Array(fileBytes);

  for (const entry of ALLOWED_FILE_SIGNATURES) {
    if (bytes.byteLength < entry.signature.length) {
      continue;
    }

    let matched = true;
    for (let i = 0; i < entry.signature.length; i += 1) {
      if (bytes[i] !== entry.signature[i]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return {
        type: entry.type,
        mimeType: entry.mimeType,
        extension: entry.extension,
      };
    }
  }

  return null;
}

/**
 * Sanitizes an uploaded filename by stripping path traversal segments and unsafe characters.
 *
 * @description Extracts only the base filename, replaces unsafe characters with underscores, and enforces a safe length cap.
 * @param {string} [originalName='upload'] - Client-provided filename.
 * @returns {string} Path-safe filename string.
 * @throws {Error} Never throws; falls back to `'upload'` when input is empty or non-string.
 */
export function sanitizeFileName(originalName = 'upload') {
  if (typeof originalName !== 'string' || !originalName.trim()) {
    return 'upload';
  }

  const normalized = originalName.replace(/\\/g, '/');
  const baseName = normalized.split('/').pop() || 'upload';
  const cleaned = baseName
    .replace(/\0/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '');

  const bounded = cleaned.slice(0, 120);
  return bounded || 'upload';
}

/**
 * Validates an uploaded onboarding document against strict size and magic-byte allowlists.
 *
 * @description Rejects empty files, rejects files >= 5MB (`MAX_FILE_SIZE_BYTES`), verifies binary magic bytes (PDF `%PDF-`, JPEG `FFD8FF`, PNG `89504E470D0A1A0A`), and filters allowed formats.
 * @param {Buffer|Uint8Array|ArrayBuffer} fileInput - Raw binary file buffer.
 * @param {{ originalName?: string, allowedTypes?: Array<'pdf'|'jpeg'|'png'>, maxBytes?: number }} [options={}] - Validation options.
 * @returns {{ valid: true, type: string, mimeType: string, extension: string, sizeBytes: number, sanitizedName: string }} Verified file metadata.
 * @throws {FileValidationError} Throws EMPTY_FILE (400), FILE_TOO_LARGE (413), or INVALID_MAGIC_BYTES (415).
 */
export function validateFileUpload(fileInput, options = {}) {
  const bytes = toUint8Array(fileInput);
  const maxBytes = typeof options.maxBytes === 'number' ? options.maxBytes : MAX_FILE_SIZE_BYTES;
  const allowedTypes = Array.isArray(options.allowedTypes)
    ? options.allowedTypes
    : ['pdf', 'jpeg', 'png'];

  if (bytes.byteLength === 0) {
    throw new FileValidationError('Uploaded file cannot be empty.', 'EMPTY_FILE', 400);
  }

  if (bytes.byteLength >= maxBytes) {
    throw new FileValidationError(
      `File exceeds the maximum allowed size under ${Math.round(maxBytes / (1024 * 1024))}MB.`,
      'FILE_TOO_LARGE',
      413
    );
  }

  const detected = detectFileSignature(bytes);
  if (!detected) {
    throw new FileValidationError(
      'Unsupported or spoofed file content. Only valid PDF, JPEG, and PNG files are allowed.',
      'INVALID_MAGIC_BYTES',
      415
    );
  }

  if (!allowedTypes.includes(detected.type)) {
    throw new FileValidationError(
      `Detected file type "${detected.type}" is not permitted for this upload endpoint.`,
      'DISALLOWED_FILE_TYPE',
      415
    );
  }

  return {
    valid: true,
    type: detected.type,
    mimeType: detected.mimeType,
    extension: detected.extension,
    sizeBytes: bytes.byteLength,
    sanitizedName: sanitizeFileName(options.originalName),
  };
}
