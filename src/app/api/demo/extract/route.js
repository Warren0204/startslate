/**
 * @file src/app/api/demo/extract/route.js
 * @description Thin HTTP controller for the ephemeral, no-signup Offer Letter demo (`POST /api/demo/extract`).
 */

import { assertRateLimit } from '../../../../lib/http/rateLimit.js';
import { extractUploadedFile, getClientIp, readMultipartForm } from '../../../../lib/http/request.js';
import { jsonSuccess, withApiHandler } from '../../../../lib/http/response.js';
import { runEphemeralOfferDemo } from '../../../../services/onboarding.service.js';

export const runtime = 'nodejs';

/**
 * Extracts structured fields from a demo Offer Letter PDF in memory with zero database or storage persistence.
 *
 * @description Applies strict IP rate limiting and delegates to `runEphemeralOfferDemo`.
 * @param {Request} request - Incoming multipart HTTP POST request containing `file`.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response.
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const POST = withApiHandler(async function postDemoExtract(request) {
  assertRateLimit(`demo-extract:${getClientIp(request)}`, { limit: 8, windowMs: 15 * 60 * 1000 });

  const formData = await readMultipartForm(request);
  const { bytes, fileName } = await extractUploadedFile(formData, 'file');

  const result = await runEphemeralOfferDemo({ fileBytes: bytes, fileName });
  return jsonSuccess(result, 200);
});
