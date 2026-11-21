/**
 * @file src/app/api/tasks/[id]/complete/route.js
 * @description Thin HTTP controller for completing an IT provisioning task (`POST /api/tasks/[id]/complete`).
 */

import { getRequestContext } from '../../../../../lib/http/context.js';
import { readJsonBody } from '../../../../../lib/http/request.js';
import { jsonSuccess, withApiHandler } from '../../../../../lib/http/response.js';
import { PERMISSIONS, authorizeAction } from '../../../../../lib/security/rbac.js';
import { completeTaskSchema, idParamsSchema } from '../../../../../lib/validation/schemas.js';
import { completeProvisioningTask } from '../../../../../services/provisioning.service.js';

export const runtime = 'nodejs';

/**
 * Marks an IT provisioning task as completed and auto-transitions the hire to `day1_ready` if all tasks are done.
 *
 * @description Validates UUID params and optional completion notes, asserts `TASK_UPDATE` RBAC, and delegates to `completeProvisioningTask`.
 * @param {Request} request - Incoming HTTP POST request with optional `{ notes }` JSON body.
 * @param {{ params: Promise<{ id: string }> }} context - Next.js dynamic route context.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response.
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const POST = withApiHandler(async function postCompleteTask(request, context) {
  const { id } = idParamsSchema.parse(await context.params);
  const rawBody = await readJsonBody(request, { allowEmpty: true });
  const { notes } = completeTaskSchema.parse(rawBody);

  const { actor, db, adminDb, ipHash } = await getRequestContext(request, { requireActor: true });
  authorizeAction(actor, PERMISSIONS.TASK_UPDATE);

  const result = await completeProvisioningTask({
    db,
    adminDb,
    actor,
    ipHash,
    taskId: id,
    notes,
  });

  return jsonSuccess(result, 200);
});
