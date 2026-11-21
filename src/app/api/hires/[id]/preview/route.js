/**
 * @file src/app/api/hires/[id]/preview/route.js
 * @description Thin HTTP controller returning 60s Signed URLs for HR HITL split-screen verification (`GET /api/hires/[id]/preview`).
 */

import { z } from 'zod';

import { getRequestContext } from '../../../../../lib/http/context.js';
import { jsonSuccess, withApiHandler } from '../../../../../lib/http/response.js';
import { PERMISSIONS, authorizeAction } from '../../../../../lib/security/rbac.js';
import { idParamsSchema } from '../../../../../lib/validation/schemas.js';
import { getHireDocumentPreviewUrl } from '../../../../../services/onboarding.service.js';

export const runtime = 'nodejs';

const kindQuerySchema = z.enum(['offer', 'gov_id']).default('offer');

/**
 * Returns a 60-second expiring Signed URL to preview an offer letter or Government ID inside the HITL modal.
 *
 * @description Enforces `HIRE_READ_PII` (`org_admin` or `hr_admin`) and delegates to `getHireDocumentPreviewUrl`.
 * @param {Request} request - Incoming HTTP GET request (`?kind=offer|gov_id`).
 * @param {{ params: Promise<{ id: string }> }} context - Next.js dynamic route context.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response.
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const GET = withApiHandler(async function getHirePreview(request, context) {
  const { id } = idParamsSchema.parse(await context.params);
  const url = new URL(request.url);
  const kind = kindQuerySchema.parse(url.searchParams.get('kind') ?? 'offer');

  const { actor, adminDb, ipHash } = await getRequestContext(request, { requireActor: true });
  authorizeAction(actor, PERMISSIONS.HIRE_READ_PII);

  const result = await getHireDocumentPreviewUrl({
    adminDb,
    actor,
    ipHash,
    hireId: id,
    kind,
  });

  return jsonSuccess(result, 200);
});
