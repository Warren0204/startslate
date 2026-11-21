/**
 * @file src/app/api/portal/[token]/submit-id/route.js
 * @description Thin HTTP controller for passwordless candidate Government ID upload (`POST /api/portal/[token]/submit-id`).
 */

import { getRequestContext } from '../../../../../lib/http/context.js';
import { assertRateLimit } from '../../../../../lib/http/rateLimit.js';
import { extractUploadedFile, getClientIp, readMultipartForm } from '../../../../../lib/http/request.js';
import { jsonSuccess, withApiHandler } from '../../../../../lib/http/response.js';
import { portalSubmitFieldsSchema, portalTokenParamsSchema } from '../../../../../lib/validation/schemas.js';
import { submitCandidateGovernmentId } from '../../../../../services/onboarding.service.js';

export const runtime = 'nodejs';

/**
 * Accepts a candidate's RA 10173 consent and Government ID upload via a passwordless portal token.
 *
 * @description Validates token format, consent fields, and multipart upload, then delegates to `submitCandidateGovernmentId`.
 * @param {Request} request - Incoming multipart HTTP POST request (`consent_accepted`, `consent_version`, `file`).
 * @param {{ params: Promise<{ token: string }> }} context - Next.js dynamic route context.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response.
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const POST = withApiHandler(async function postSubmitCandidateId(request, context) {
  assertRateLimit(`portal-submit:${getClientIp(request)}`, { limit: 10, windowMs: 15 * 60 * 1000 });

  const { token } = portalTokenParamsSchema.parse(await context.params);
  const formData = await readMultipartForm(request);

  const fields = portalSubmitFieldsSchema.parse({
    consent_accepted: String(formData.get('consent_accepted') ?? ''),
    consent_version: formData.get('consent_version')
      ? String(formData.get('consent_version'))
      : undefined,
  });
  const { bytes, fileName } = await extractUploadedFile(formData, 'file');

  const { adminDb, ipHash } = await getRequestContext(request, { requireActor: false });
  const result = await submitCandidateGovernmentId({
    adminDb,
    ipHash,
    rawToken: token,
    consentAccepted: fields.consent_accepted === 'true',
    consentVersion: fields.consent_version,
    fileBytes: bytes,
    fileName,
  });

  return jsonSuccess(result, 200);
});
