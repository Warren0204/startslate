/**
 * @file src/services/packet.service.js
 * @description Flattened onboarding packet compilation service with free-trial watermarking and 60s Signed URLs.
 */

import { generateOnboardingPacketPdf } from '../integrations/pdf.adapter.js';
import {
  buildOnboardingObjectPath,
  createSignedDocumentUrl,
  downloadPrivateDocument,
  uploadPrivateDocument,
} from '../integrations/storage.adapter.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { decryptPII, maskPII } from '../lib/security/crypto.js';
import { PERMISSIONS, authorizeAction } from '../lib/security/rbac.js';
import { recordAuditEvent } from '../repositories/audit.repo.js';
import { getHireByIdAdmin, updateHire } from '../repositories/hires.repo.js';
import { getOrganizationById } from '../repositories/organizations.repo.js';

const PACKET_ELIGIBLE_STATUSES = new Set(['docs_verified', 'it_provisioning', 'day1_ready']);

/**
 * Compiles a flattened StartSlate Employee Onboarding Summary & NDA PDF and returns a 60-second Signed URL.
 *
 * @description Enforces `PACKET_GENERATE` RBAC (`org_admin` or `hr_admin`), verifies documents are verified and
 * HITL review is cleared, stamps a diagonal `"SAMPLE - FREE TRIAL"` watermark when `org_subscription_tier === 'free_trial'`,
 * uploads the packet to private bucket `onboarding-docs`, and logs `PACKET_GENERATED`.
 * @param {{
 *   adminDb: import('@supabase/supabase-js').SupabaseClient,
 *   actor: object,
 *   ipHash: string,
 *   hireId: string
 * }} params - Packet generation parameters.
 * @returns {Promise<{ hire_id: string, signed_url: string, expires_in_seconds: number, watermarked: boolean }>} Temporary download link and metadata.
 * @throws {import('../lib/security/rbac.js').AuthorizationError} When caller lacks `PACKET_GENERATE`.
 * @throws {NotFoundError} HIRE_NOT_FOUND (404) or ORG_NOT_FOUND (404).
 * @throws {ConflictError} PACKET_NOT_READY (409) when the hire is not yet verified or still awaits HITL review.
 */
export async function generateOnboardingPacket({ adminDb, actor, ipHash, hireId }) {
  authorizeAction(actor, PERMISSIONS.PACKET_GENERATE);

  const hire = await getHireByIdAdmin(adminDb, actor.usr_org_id, hireId);
  if (!hire) {
    throw new NotFoundError('Onboarding hire not found.', 'HIRE_NOT_FOUND');
  }

  if (!PACKET_ELIGIBLE_STATUSES.has(hire.hire_status) || hire.hire_needs_hitl_review) {
    throw new ConflictError(
      'Onboarding packet can only be generated once candidate documents are verified and HITL review is complete.',
      'PACKET_NOT_READY'
    );
  }

  const org = await getOrganizationById(adminDb, actor.usr_org_id);
  if (!org) {
    throw new NotFoundError('Organization workspace not found.', 'ORG_NOT_FOUND');
  }

  let maskedGovId = '****';
  if (hire.hire_gov_id_number_enc) {
    try {
      const plaintextId = decryptPII(hire.hire_gov_id_number_enc, `${hire.hire_org_id}:${hire.hire_id}`);
      maskedGovId = maskPII(plaintextId, 4);
    } catch {
      maskedGovId = '****';
    }
  }

  let offerPdfBuffer = null;
  if (hire.hire_offer_letter_path) {
    try {
      offerPdfBuffer = await downloadPrivateDocument(adminDb, actor.usr_org_id, hire.hire_offer_letter_path);
    } catch {
      offerPdfBuffer = null;
    }
  }

  const pdfBuffer = await generateOnboardingPacketPdf({
    orgName: org.org_name,
    orgSubscriptionTier: org.org_subscription_tier,
    hire: {
      ...hire,
      masked_gov_id_number: maskedGovId,
    },
    offerPdfBuffer,
  });

  const packetPath = buildOnboardingObjectPath(actor.usr_org_id, hire.hire_id, 'onboarding-packet.pdf');
  await uploadPrivateDocument(adminDb, {
    orgId: actor.usr_org_id,
    objectPath: packetPath,
    fileBytes: pdfBuffer,
    contentType: 'application/pdf',
  });

  await updateHire(adminDb, actor.usr_org_id, hire.hire_id, {
    hire_packet_pdf_path: packetPath,
  });

  const { signedUrl, expiresInSeconds } = await createSignedDocumentUrl(
    adminDb,
    actor.usr_org_id,
    packetPath,
    60
  );

  const watermarked = org.org_subscription_tier === 'free_trial';

  await recordAuditEvent(adminDb, {
    orgId: actor.usr_org_id,
    actorUsrId: actor.usr_id,
    actorRole: actor.usr_role,
    action: 'PACKET_GENERATED',
    entityType: 'onboarding_hire',
    entityId: hire.hire_id,
    ipHash,
    metadata: {
      org_subscription_tier: org.org_subscription_tier,
      watermarked,
      expires_in_seconds: expiresInSeconds,
    },
  });

  return {
    hire_id: hire.hire_id,
    signed_url: signedUrl,
    expires_in_seconds: expiresInSeconds,
    watermarked,
  };
}
