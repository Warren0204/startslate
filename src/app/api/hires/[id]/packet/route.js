/**
 * @file src/app/api/hires/[id]/packet/route.js
 * @description Thin HTTP controller for flattened onboarding PDF packet compilation (`POST /api/hires/[id]/packet`).
 */

import { getRequestContext } from '../../../../../lib/http/context.js';
import { jsonSuccess, withApiHandler } from '../../../../../lib/http/response.js';
import { PERMISSIONS, authorizeAction } from '../../../../../lib/security/rbac.js';
import { idParamsSchema } from '../../../../../lib/validation/schemas.js';
import { generateOnboardingPacket } from '../../../../../services/packet.service.js';

export const runtime = 'nodejs';

/**
 * Compiles a flattened onboarding packet PDF and returns a 60-second expiring Signed URL.
 *
 * @description Enforces `PACKET_GENERATE` RBAC (`org_admin` or `hr_admin`) and delegates to `generateOnboardingPacket`.
 * @param {Request} request - Incoming HTTP POST request.
 * @param {{ params: Promise<{ id: string }> }} context - Next.js dynamic route context.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response.
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const POST = withApiHandler(async function postGeneratePacket(request, context) {
  const { id } = idParamsSchema.parse(await context.params);

  const { actor, adminDb, ipHash } = await getRequestContext(request, { requireActor: true });
  authorizeAction(actor, PERMISSIONS.PACKET_GENERATE);

  const result = await generateOnboardingPacket({
    adminDb,
    actor,
    ipHash,
    hireId: id,
  });

  return jsonSuccess(result, 200);
});
