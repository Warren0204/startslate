/**
 * @file src/app/api/settings/route.js
 * @description Thin HTTP controller for workspace settings and HTTPS IT webhook configuration (`GET/PATCH /api/settings`).
 */

import { z } from 'zod';

import { getRequestContext } from '../../../lib/http/context.js';
import { readJsonBody } from '../../../lib/http/request.js';
import { jsonSuccess, withApiHandler } from '../../../lib/http/response.js';
import { PERMISSIONS, authorizeAction } from '../../../lib/security/rbac.js';
import { getWorkspaceSettings, updateWebhookSettings } from '../../../services/settings.service.js';

export const runtime = 'nodejs';

const patchWebhookSchema = z
  .object({
    webhook_url: z.string().trim().max(500).nullable().optional(),
    rotate_secret: z.boolean().optional(),
  })
  .strict();

/**
 * Retrieves sanitized workspace settings, billing usage, and team members.
 *
 * @description Authenticates the caller and delegates to `getWorkspaceSettings`.
 * @param {Request} request - Incoming HTTP GET request.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response.
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const GET = withApiHandler(async function getSettings(request) {
  const { actor, db, adminDb } = await getRequestContext(request, { requireActor: true });
  const result = await getWorkspaceSettings({ db, adminDb, actor });
  return jsonSuccess(result, 200);
});

/**
 * Updates the organization's IT provisioning webhook URL and optionally rotates the HMAC-SHA256 secret.
 *
 * @description Validates Zod payload, checks `WEBHOOK_MANAGE`, and calls `updateWebhookSettings`.
 * @param {Request} request - Incoming HTTP PATCH request.
 * @returns {Promise<Response>} Standardized `{ success, data, error }` JSON response.
 * @throws {Error} All errors are intercepted and serialized by `withApiHandler`.
 */
export const PATCH = withApiHandler(async function patchSettings(request) {
  const { actor, adminDb, ipHash } = await getRequestContext(request, { requireActor: true });
  authorizeAction(actor, PERMISSIONS.WEBHOOK_MANAGE);

  const rawBody = await readJsonBody(request);
  const input = patchWebhookSchema.parse(rawBody);
  const result = await updateWebhookSettings({ adminDb, actor, ipHash, input });

  return jsonSuccess(result, 200);
});
