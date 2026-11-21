/**
 * @file src/app/api/auth/signup/route.js
 * @description Thin HTTP controller for corporate workspace signup (`POST /api/auth/signup`).
 */

import { getRequestContext } from '../../../../lib/http/context.js';
import { assertRateLimit } from '../../../../lib/http/rateLimit.js';
import { getClientIp, readJsonBody } from '../../../../lib/http/request.js';
import { jsonSuccess, withApiHandler } from '../../../../lib/http/response.js';
import { signupSchema } from '../../../../lib/validation/schemas.js';
import { signupCorporateWorkspace } from '../../../../services/auth.service.js';

export const runtime = 'nodejs';

/**
 * Registers a corporate StartSlate workspace and its founding `org_admin`.
 *
 * @description Applies IP rate limiting, Zod validation, corporate-domain gate, and delegates to `signupCorporateWorkspace`.
 * @param {Request} request - Incoming HTTP POST request.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response (HTTP 201 on success).
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const POST = withApiHandler(async function postSignup(request) {
  assertRateLimit(`signup:${getClientIp(request)}`, { limit: 10, windowMs: 15 * 60 * 1000 });

  const body = await readJsonBody(request);
  const input = signupSchema.parse(body);

  const { adminDb, ipHash } = await getRequestContext(request, { requireActor: false });
  const result = await signupCorporateWorkspace({ adminDb, ipHash, input });

  return jsonSuccess(result, 201);
});
