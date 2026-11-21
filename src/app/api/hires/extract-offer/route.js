/**
 * @file src/app/api/hires/extract-offer/route.js
 * @description Thin HTTP controller for Offer Letter PDF upload & AI extraction (`POST /api/hires/extract-offer`).
 */

import { getRequestContext } from '../../../../lib/http/context.js';
import { assertRateLimit } from '../../../../lib/http/rateLimit.js';
import { extractUploadedFile, readMultipartForm } from '../../../../lib/http/request.js';
import { jsonSuccess, withApiHandler } from '../../../../lib/http/response.js';
import { PERMISSIONS, authorizeAction } from '../../../../lib/security/rbac.js';
import { extractAndCreateHire } from '../../../../services/onboarding.service.js';

export const runtime = 'nodejs';

/**
 * Accepts a multipart Offer Letter PDF, checks RBAC & quota, extracts fields via Gemini 2.5 Flash, and creates the hire.
 *
 * @description Delegates magic-byte validation, atomic quota consumption, and HITL gating to `extractAndCreateHire`.
 * @param {Request} request - Incoming multipart HTTP POST request containing `file`.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response (HTTP 201 on success).
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const POST = withApiHandler(async function postExtractOffer(request) {
  const { actor, adminDb, ipHash } = await getRequestContext(request, { requireActor: true });
  authorizeAction(actor, PERMISSIONS.HIRE_CREATE);

  assertRateLimit(`extract-offer:${actor.usr_org_id}`, { limit: 30, windowMs: 10 * 60 * 1000 });

  const formData = await readMultipartForm(request);
  const { bytes, fileName } = await extractUploadedFile(formData, 'file');

  const result = await extractAndCreateHire({
    adminDb,
    actor,
    ipHash,
    fileBytes: bytes,
    fileName,
  });

  return jsonSuccess(result, 201);
});
