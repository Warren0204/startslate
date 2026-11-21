/**
 * @file src/app/api/settings/users/route.js
 * @description Thin HTTP controller for corporate team invites and role updates (`POST/PATCH /api/settings/users`).
 */

import { z } from 'zod';

import { getRequestContext } from '../../../../lib/http/context.js';
import { readJsonBody } from '../../../../lib/http/request.js';
import { jsonSuccess, withApiHandler } from '../../../../lib/http/response.js';
import { PERMISSIONS, ROLES, authorizeAction } from '../../../../lib/security/rbac.js';
import { uuidSchema } from '../../../../lib/validation/schemas.js';
import { inviteTeamMember, updateTeamMemberRole } from '../../../../services/settings.service.js';

export const runtime = 'nodejs';

const roleEnum = z.enum([
  ROLES.ORG_ADMIN,
  ROLES.HR_ADMIN,
  ROLES.IT_ADMIN,
  ROLES.DEPARTMENT_MANAGER,
]);

const inviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(320),
    full_name: z.string().trim().min(2).max(120),
    role: roleEnum,
    department_name: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

const updateRoleSchema = z
  .object({
    usr_id: uuidSchema,
    usr_role: roleEnum,
    usr_department_name: z.string().trim().max(120).nullable().optional(),
  })
  .strict();

/**
 * Invites a corporate user to the organization workspace with an assigned RBAC role.
 *
 * @description Checks `USERS_MANAGE`, validates Zod input, and delegates to `inviteTeamMember`.
 * @param {Request} request - Incoming HTTP POST request.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response (HTTP 201).
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const POST = withApiHandler(async function postInviteUser(request) {
  const { actor, adminDb, ipHash } = await getRequestContext(request, { requireActor: true });
  authorizeAction(actor, PERMISSIONS.USERS_MANAGE);

  const input = inviteSchema.parse(await readJsonBody(request));
  const result = await inviteTeamMember({ adminDb, actor, ipHash, input });

  return jsonSuccess(result, 201);
});

/**
 * Updates an existing team member's workspace role and optional department scope.
 *
 * @description Checks `USERS_MANAGE`, validates Zod input, and delegates to `updateTeamMemberRole`.
 * @param {Request} request - Incoming HTTP PATCH request.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response.
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const PATCH = withApiHandler(async function patchUserRole(request) {
  const { actor, adminDb, ipHash } = await getRequestContext(request, { requireActor: true });
  authorizeAction(actor, PERMISSIONS.USERS_MANAGE);

  const input = updateRoleSchema.parse(await readJsonBody(request));
  const result = await updateTeamMemberRole({ adminDb, actor, ipHash, input });

  return jsonSuccess(result, 200);
});
