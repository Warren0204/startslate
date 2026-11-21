/**
 * @file src/app/api/hires/[id]/verify/route.js
 * @description Thin HTTP controller for HR HITL review & FSM advancement (`POST /api/hires/[id]/verify`).
 */

import { getRequestContext } from '../../../../../lib/http/context.js';
import { readJsonBody } from '../../../../../lib/http/request.js';
import { jsonSuccess, withApiHandler } from '../../../../../lib/http/response.js';
import { PERMISSIONS, authorizeAction } from '../../../../../lib/security/rbac.js';
import { idParamsSchema, verifyHireSchema } from '../../../../../lib/validation/schemas.js';
import { verifyHireAndAdvance } from '../../../../../services/onboarding.service.js';

export const runtime = 'nodejs';

/**
 * Approves HR HITL review with optional field corrections and advances the onboarding hire state.
 *
 * @description Validates UUID params and Zod corrections body, asserts `HIRE_HITL_REVIEW`, and calls `verifyHireAndAdvance`.
 * @param {Request} request - Incoming HTTP POST request with optional `{ corrections }` JSON body.
 * @param {{ params: Promise<{ id: string }> }} context - Next.js dynamic route context.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response.
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const POST = withApiHandler(async function postVerifyHire(request, context) {
  const { id } = idParamsSchema.parse(await context.params);
  const rawBody = await readJsonBody(request, { allowEmpty: true });
  const { corrections } = verifyHireSchema.parse(rawBody);

  const { actor, adminDb, ipHash } = await getRequestContext(request, { requireActor: true });
  authorizeAction(actor, PERMISSIONS.HIRE_HITL_REVIEW);

  const result = await verifyHireAndAdvance({
    adminDb,
    actor,
    ipHash,
    hireId: id,
    corrections,
  });

  return jsonSuccess(result, 200);
});
