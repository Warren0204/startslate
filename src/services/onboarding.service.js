/**
 * @file src/services/onboarding.service.js
 * @description Onboarding Finite State Machine (FSM), monthly hire quota enforcement, AI HITL gating, and candidate portal submission service.
 */

import crypto from 'node:crypto';

import { extractGovernmentId, extractOfferLetter } from '../integrations/gemini.adapter.js';
import {
  buildOnboardingObjectPath,
  createSignedDocumentUrl,
  uploadPrivateDocument,
} from '../integrations/storage.adapter.js';
import { getOrganizationById } from '../repositories/organizations.repo.js';
import { ConflictError, NotFoundError, QuotaExceededError, ValidationError } from '../lib/errors.js';
import { encryptPII, generateOpaqueToken, hashToken, maskPII } from '../lib/security/crypto.js';
import { validateFileUpload } from '../lib/security/fileValidator.js';
import { PERMISSIONS, authorizeAction } from '../lib/security/rbac.js';
import { recordAuditEvent } from '../repositories/audit.repo.js';
import {
  createHire,
  getHireByIdAdmin,
  getHireByPortalTokenHash,
  updateHire,
} from '../repositories/hires.repo.js';
import { consumeOrgHireQuota, releaseOrgHireQuota } from '../repositories/organizations.repo.js';
import { provisionHireIT } from './provisioning.service.js';

/**
 * Confidence score threshold below which Human-in-the-Loop (HITL) HR review is mandatory.
 *
 * @type {number}
 */
export const HITL_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Default passwordless candidate portal link TTL (7 days).
 *
 * @type {number}
 */
const PORTAL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Canonical onboarding Finite State Machine transition graph.
 *
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const VALID_FSM_TRANSITIONS = Object.freeze({
  offer_uploaded: Object.freeze(['pending_candidate_docs']),
  pending_candidate_docs: Object.freeze(['docs_verified']),
  docs_verified: Object.freeze(['it_provisioning']),
  it_provisioning: Object.freeze(['day1_ready']),
  day1_ready: Object.freeze([]),
});

/**
 * Asserts that a requested onboarding FSM state transition is valid.
 *
 * @description Prevents skipping lifecycle stages or performing illegal backward transitions.
 * @param {string} fromStatus - Current `hire_status`.
 * @param {string} toStatus - Desired next `hire_status`.
 * @returns {true} Returns `true` when the transition is permitted.
 * @throws {ConflictError} INVALID_STATE_TRANSITION (409) when the transition is disallowed.
 */
export function assertValidTransition(fromStatus, toStatus) {
  const allowed = VALID_FSM_TRANSITIONS[fromStatus];
  if (!allowed || !allowed.includes(toStatus)) {
    throw new ConflictError(
      `Illegal onboarding state transition from "${fromStatus}" to "${toStatus}".`,
      'INVALID_STATE_TRANSITION'
    );
  }
  return true;
}

/**
 * Builds the passwordless candidate portal URL for a freshly generated opaque token.
 *
 * @description Joins `NEXT_PUBLIC_APP_URL` (default `http://localhost:3000`) with `/portal/{rawToken}`.
 * @param {string} rawToken - Raw 256-bit base64url token (returned once, never stored in plaintext).
 * @returns {string} Full candidate portal URL.
 * @throws {Error} Never throws.
 */
function buildPortalUrl(rawToken) {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${baseUrl}/portal/${rawToken}`;
}

/**
 * Ingests an Offer Letter PDF, enforces monthly hire quota, extracts structured fields via Gemini 2.5 Flash, and creates the hire.
 *
 * @description Validates `HIRE_CREATE` RBAC and PDF magic bytes (<5MB), atomically consumes monthly quota
 * (`org_monthly_hires_used < org_monthly_hires_limit`), uploads the PDF to private bucket `onboarding-docs`,
 * triggers HITL review if `confidence_score < 0.85` or required fields are missing, and otherwise advances
 * directly to `pending_candidate_docs` with a 256-bit portal link.
 * @param {{
 *   adminDb: import('@supabase/supabase-js').SupabaseClient,
 *   actor: object,
 *   ipHash: string,
 *   fileBytes: Buffer,
 *   fileName: string,
 *   extractOfferFn?: typeof extractOfferLetter
 * }} params - Offer extraction parameters.
 * @returns {Promise<{ hire: object, quota: object, portal_url: string|null, needs_hitl_review: boolean }>} Created hire and metadata.
 * @throws {import('../lib/security/rbac.js').AuthorizationError} When caller lacks `HIRE_CREATE`.
 * @throws {import('../lib/security/fileValidator.js').FileValidationError} When file is invalid or >= 5MB.
 * @throws {QuotaExceededError} QUOTA_EXCEEDED (402) when monthly hire limit is reached.
 */
export async function extractAndCreateHire({
  adminDb,
  actor,
  ipHash,
  fileBytes,
  fileName,
  extractOfferFn = extractOfferLetter,
}) {
  authorizeAction(actor, PERMISSIONS.HIRE_CREATE);

  const validatedFile = validateFileUpload(fileBytes, {
    originalName: fileName,
    allowedTypes: ['pdf'],
  });

  const quota = await consumeOrgHireQuota(adminDb, actor.usr_org_id);
  if (!quota) {
    throw new QuotaExceededError(
      'Monthly onboarding hire quota has been reached for your current plan. Upgrade to onboard more hires.'
    );
  }

  try {
    const extracted = await extractOfferFn(fileBytes);
    const hireId = crypto.randomUUID();
    const offerPath = buildOnboardingObjectPath(actor.usr_org_id, hireId, 'offer-letter.pdf');

    await uploadPrivateDocument(adminDb, {
      orgId: actor.usr_org_id,
      objectPath: offerPath,
      fileBytes,
      contentType: validatedFile.mimeType,
    });

    const missingRequired =
      !extracted.full_name ||
      !extracted.personal_email ||
      !extracted.job_title ||
      !extracted.department_name ||
      !extracted.expected_start_date;

    const needsHitl = extracted.confidence_score < HITL_CONFIDENCE_THRESHOLD || missingRequired;

    let initialStatus = 'offer_uploaded';
    let portalTokenHash = null;
    let portalTokenExpiresAt = null;
    let portalUrl = null;

    if (!needsHitl) {
      assertValidTransition('offer_uploaded', 'pending_candidate_docs');
      initialStatus = 'pending_candidate_docs';
      const rawToken = generateOpaqueToken(32);
      portalTokenHash = hashToken(rawToken);
      portalTokenExpiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_MS).toISOString();
      portalUrl = buildPortalUrl(rawToken);
    }

    const hire = await createHire(adminDb, {
      hire_id: hireId,
      hire_org_id: actor.usr_org_id,
      hire_created_by_usr_id: actor.usr_id,
      hire_status: initialStatus,
      hire_full_name: extracted.full_name || 'Pending HR Verification',
      hire_personal_email: extracted.personal_email,
      hire_job_title: extracted.job_title,
      hire_department_name: extracted.department_name,
      hire_start_date: extracted.expected_start_date,
      hire_base_salary_amount: extracted.base_salary_amount,
      hire_offer_letter_path: offerPath,
      hire_extracted_pii_json: {
        offer_extraction: extracted,
      },
      hire_ai_confidence_score: extracted.confidence_score,
      hire_needs_hitl_review: needsHitl,
      hire_portal_token_hash: portalTokenHash,
      hire_portal_token_expires_at: portalTokenExpiresAt,
    });

    await recordAuditEvent(adminDb, {
      orgId: actor.usr_org_id,
      actorUsrId: actor.usr_id,
      actorRole: actor.usr_role,
      action: 'HIRE_OFFER_EXTRACTED',
      entityType: 'onboarding_hire',
      entityId: hire.hire_id,
      ipHash,
      metadata: {
        hire_status: hire.hire_status,
        hire_ai_confidence_score: extracted.confidence_score,
        hire_needs_hitl_review: needsHitl,
      },
    });

    return {
      hire,
      quota,
      portal_url: portalUrl,
      needs_hitl_review: needsHitl,
    };
  } catch (error) {
    await releaseOrgHireQuota(adminDb, actor.usr_org_id);
    throw error;
  }
}

/**
 * Processes a passwordless candidate Government ID submission from `/portal/[token]`.
 *
 * @description Validates the opaque portal token hash and TTL, enforces explicit RA 10173 consent, verifies
 * binary magic bytes (PDF/JPEG/PNG < 5MB), extracts ID fields via Gemini 2.5 Flash, encrypts the ID number
 * with AES-256-GCM bound to `${orgId}:${hireId}`, and triggers HITL if `confidence_score < 0.85` (otherwise
 * transitions `pending_candidate_docs` -> `docs_verified` -> `it_provisioning`).
 * @param {{
 *   adminDb: import('@supabase/supabase-js').SupabaseClient,
 *   ipHash: string,
 *   rawToken: string,
 *   consentAccepted: boolean,
 *   consentVersion: string,
 *   fileBytes: Buffer,
 *   fileName: string,
 *   extractGovIdFn?: typeof extractGovernmentId
 * }} params - Portal submission parameters.
 * @returns {Promise<{ hire_id: string, hire_status: string, needs_hitl_review: boolean, masked_id_number: string|null }>} Safe candidate confirmation.
 * @throws {NotFoundError} PORTAL_TOKEN_INVALID (404) when the token is unknown or expired.
 * @throws {ConflictError} PORTAL_ALREADY_SUBMITTED (409) when the hire is no longer awaiting candidate docs.
 * @throws {ValidationError} When RA 10173 consent is not accepted.
 */
export async function submitCandidateGovernmentId({
  adminDb,
  ipHash,
  rawToken,
  consentAccepted,
  consentVersion,
  fileBytes,
  fileName,
  extractGovIdFn = extractGovernmentId,
}) {
  if (!consentAccepted) {
    throw new ValidationError(
      'Explicit informed consent under RA 10173 is required before uploading a Government ID.'
    );
  }

  const tokenHash = hashToken(rawToken);
  const hire = await getHireByPortalTokenHash(adminDb, tokenHash);

  if (!hire) {
    throw new NotFoundError('This onboarding link is invalid or has expired.', 'PORTAL_TOKEN_INVALID');
  }
  if (hire.hire_portal_token_expires_at && new Date(hire.hire_portal_token_expires_at).getTime() < Date.now()) {
    throw new NotFoundError('This onboarding link has expired. Contact HR for a new link.', 'PORTAL_TOKEN_EXPIRED');
  }
  if (hire.hire_status !== 'pending_candidate_docs') {
    throw new ConflictError(
      'Documents have already been submitted for this onboarding link.',
      'PORTAL_ALREADY_SUBMITTED'
    );
  }

  const validatedFile = validateFileUpload(fileBytes, {
    originalName: fileName,
    allowedTypes: ['pdf', 'jpeg', 'png'],
  });

  const extracted = await extractGovIdFn(fileBytes, validatedFile.mimeType);
  const govIdPath = buildOnboardingObjectPath(
    hire.hire_org_id,
    hire.hire_id,
    `gov-id.${validatedFile.extension}`
  );

  await uploadPrivateDocument(adminDb, {
    orgId: hire.hire_org_id,
    objectPath: govIdPath,
    fileBytes,
    contentType: validatedFile.mimeType,
  });

  const aad = `${hire.hire_org_id}:${hire.hire_id}`;
  const encryptedIdNumber = extracted.id_number ? encryptPII(extracted.id_number, aad) : null;
  const maskedId = extracted.id_number ? maskPII(extracted.id_number, 4) : null;

  const needsHitl =
    extracted.confidence_score < HITL_CONFIDENCE_THRESHOLD ||
    !extracted.id_number ||
    !extracted.full_name;

  const existingPii =
    hire.hire_extracted_pii_json && typeof hire.hire_extracted_pii_json === 'object'
      ? hire.hire_extracted_pii_json
      : {};

  // Store sanitized extraction preview without raw plaintext ID number
  const mergedPii = {
    ...existingPii,
    gov_id_extraction: {
      id_type: extracted.id_type,
      masked_id_number: maskedId,
      full_name: extracted.full_name,
      address: extracted.address,
      confidence_score: extracted.confidence_score,
    },
  };

  let nextStatus = hire.hire_status;
  if (!needsHitl) {
    assertValidTransition('pending_candidate_docs', 'docs_verified');
    nextStatus = 'docs_verified';
  }

  let updatedHire = await updateHire(adminDb, hire.hire_org_id, hire.hire_id, {
    hire_status: nextStatus,
    hire_gov_id_image_path: govIdPath,
    hire_gov_id_type: extracted.id_type,
    hire_gov_id_number_enc: encryptedIdNumber,
    hire_extracted_pii_json: mergedPii,
    hire_ai_confidence_score: extracted.confidence_score,
    hire_needs_hitl_review: needsHitl,
    hire_consent_accepted_at: new Date().toISOString(),
    hire_consent_version: consentVersion,
    // Invalidate portal link once docs are verified cleanly
    ...(nextStatus === 'docs_verified' ? { hire_portal_token_hash: null } : {}),
  });

  await recordAuditEvent(adminDb, {
    orgId: hire.hire_org_id,
    actorUsrId: null,
    actorRole: 'candidate_portal',
    action: 'CANDIDATE_ID_SUBMITTED',
    entityType: 'onboarding_hire',
    entityId: hire.hire_id,
    ipHash,
    metadata: {
      consent_version: consentVersion,
      hire_ai_confidence_score: extracted.confidence_score,
      hire_needs_hitl_review: needsHitl,
    },
  });

  if (updatedHire.hire_status === 'docs_verified') {
    const provisioningResult = await provisionHireIT({
      adminDb,
      actorUsrId: null,
      actorRole: 'system',
      ipHash,
      hire: updatedHire,
    });
    updatedHire = provisioningResult.hire;
  }

  return {
    hire_id: updatedHire.hire_id,
    hire_status: updatedHire.hire_status,
    needs_hitl_review: updatedHire.hire_needs_hitl_review,
    masked_id_number: maskedId,
  };
}

/**
 * Performs HR/Org Admin Human-in-the-Loop (HITL) verification and advances the hire through the FSM.
 *
 * @description Applies optional HR corrections, clears `hire_needs_hitl_review`, and advances either:
 * - `offer_uploaded` -> `pending_candidate_docs` (issuing a 256-bit candidate portal URL), OR
 * - `pending_candidate_docs` -> `docs_verified` -> `it_provisioning` (triggering IT checklist + signed webhook).
 * @param {{
 *   adminDb: import('@supabase/supabase-js').SupabaseClient,
 *   actor: object,
 *   ipHash: string,
 *   hireId: string,
 *   corrections?: object
 * }} params - Verification parameters.
 * @returns {Promise<{ hire: object, portal_url: string|null, provisioning: object|null }>} Updated hire and side-effect metadata.
 * @throws {import('../lib/security/rbac.js').AuthorizationError} When caller lacks `HIRE_HITL_REVIEW`.
 * @throws {NotFoundError} HIRE_NOT_FOUND (404) when the hire does not belong to the caller's org.
 * @throws {ConflictError} INVALID_STATE_TRANSITION (409) when the hire is not in a verifiable stage.
 */
export async function verifyHireAndAdvance({ adminDb, actor, ipHash, hireId, corrections = {} }) {
  authorizeAction(actor, PERMISSIONS.HIRE_HITL_REVIEW);

  const hire = await getHireByIdAdmin(adminDb, actor.usr_org_id, hireId);
  if (!hire) {
    throw new NotFoundError('Onboarding hire not found.', 'HIRE_NOT_FOUND');
  }

  const patch = {
    hire_needs_hitl_review: false,
    hire_hitl_reviewed_by_usr_id: actor.usr_id,
    hire_hitl_reviewed_at: new Date().toISOString(),
  };

  if (corrections.full_name !== undefined) patch.hire_full_name = corrections.full_name;
  if (corrections.personal_email !== undefined) patch.hire_personal_email = corrections.personal_email;
  if (corrections.job_title !== undefined) patch.hire_job_title = corrections.job_title;
  if (corrections.department_name !== undefined) patch.hire_department_name = corrections.department_name;
  if (corrections.expected_start_date !== undefined) patch.hire_start_date = corrections.expected_start_date;
  if (corrections.base_salary_amount !== undefined) {
    patch.hire_base_salary_amount = corrections.base_salary_amount;
  }
  if (corrections.id_type !== undefined) patch.hire_gov_id_type = corrections.id_type;
  if (corrections.id_number !== undefined) {
    patch.hire_gov_id_number_enc = encryptPII(corrections.id_number, `${hire.hire_org_id}:${hire.hire_id}`);
  }
  if (corrections.address !== undefined) {
    const existingPii =
      hire.hire_extracted_pii_json && typeof hire.hire_extracted_pii_json === 'object'
        ? hire.hire_extracted_pii_json
        : {};
    patch.hire_extracted_pii_json = {
      ...existingPii,
      hr_verified_address: corrections.address,
    };
  }

  if (hire.hire_status === 'offer_uploaded') {
    const effectiveEmail = patch.hire_personal_email ?? hire.hire_personal_email;
    const effectiveTitle = patch.hire_job_title ?? hire.hire_job_title;
    const effectiveDept = patch.hire_department_name ?? hire.hire_department_name;
    const effectiveStart = patch.hire_start_date ?? hire.hire_start_date;

    if (!effectiveEmail || !effectiveTitle || !effectiveDept || !effectiveStart) {
      throw new ValidationError(
        'Personal email, job title, department name, and expected start date are required before inviting the candidate.'
      );
    }

    assertValidTransition('offer_uploaded', 'pending_candidate_docs');
    const rawToken = generateOpaqueToken(32);
    patch.hire_status = 'pending_candidate_docs';
    patch.hire_portal_token_hash = hashToken(rawToken);
    patch.hire_portal_token_expires_at = new Date(Date.now() + PORTAL_TOKEN_TTL_MS).toISOString();

    const updated = await updateHire(adminDb, actor.usr_org_id, hire.hire_id, patch);

    await recordAuditEvent(adminDb, {
      orgId: actor.usr_org_id,
      actorUsrId: actor.usr_id,
      actorRole: actor.usr_role,
      action: 'HIRE_OFFER_VERIFIED',
      entityType: 'onboarding_hire',
      entityId: hire.hire_id,
      ipHash,
      metadata: {
        previous_status: 'offer_uploaded',
        next_status: 'pending_candidate_docs',
      },
    });

    return {
      hire: updated,
      portal_url: buildPortalUrl(rawToken),
      provisioning: null,
    };
  }

  if (hire.hire_status === 'pending_candidate_docs') {
    if (!hire.hire_consent_accepted_at || !hire.hire_gov_id_image_path) {
      throw new ConflictError(
        'Candidate must accept RA 10173 consent and upload a Government ID before HR can verify documents.',
        'CANDIDATE_DOCS_MISSING'
      );
    }

    assertValidTransition('pending_candidate_docs', 'docs_verified');
    patch.hire_status = 'docs_verified';
    patch.hire_portal_token_hash = null;

    const verifiedHire = await updateHire(adminDb, actor.usr_org_id, hire.hire_id, patch);

    await recordAuditEvent(adminDb, {
      orgId: actor.usr_org_id,
      actorUsrId: actor.usr_id,
      actorRole: actor.usr_role,
      action: 'HIRE_DOCS_VERIFIED',
      entityType: 'onboarding_hire',
      entityId: hire.hire_id,
      ipHash,
      metadata: {
        previous_status: 'pending_candidate_docs',
        next_status: 'docs_verified',
      },
    });

    const provisioning = await provisionHireIT({
      adminDb,
      actorUsrId: actor.usr_id,
      actorRole: actor.usr_role,
      ipHash,
      hire: verifiedHire,
    });

    return {
      hire: provisioning.hire,
      portal_url: null,
      provisioning: {
        task_count: provisioning.tasks.length,
        webhook_status: provisioning.webhook_status,
      },
    };
  }

  throw new ConflictError(
    `Hire in status "${hire.hire_status}" does not require verification.`,
    'INVALID_STATE_TRANSITION'
  );
}

/**
 * Runs an ephemeral, zero-persistence Offer Letter AI extraction for the public `/` landing demo.
 *
 * @description Validates binary PDF magic bytes (< 5MB) and invokes Gemini 2.5 Flash strictly in memory without writing to Supabase DB or Storage.
 * @param {{ fileBytes: Buffer, fileName: string, extractOfferFn?: typeof extractOfferLetter }} params - Ephemeral demo parameters.
 * @returns {Promise<{ extracted: object, needs_hitl_review: boolean, ephemeral: true }>} Extracted preview payload.
 * @throws {import('../lib/security/fileValidator.js').FileValidationError} When uploaded bytes are not a valid PDF under 5MB.
 * @throws {import('../lib/errors.js').ExternalServiceError} When Gemini extraction fails.
 */
export async function runEphemeralOfferDemo({
  fileBytes,
  fileName,
  extractOfferFn = extractOfferLetter,
}) {
  validateFileUpload(fileBytes, {
    originalName: fileName,
    allowedTypes: ['pdf'],
  });

  const extracted = await extractOfferFn(fileBytes);
  return {
    extracted,
    needs_hitl_review: extracted.confidence_score < HITL_CONFIDENCE_THRESHOLD,
    ephemeral: true,
  };
}

/**
 * Validates a passwordless candidate portal token and returns non-sensitive offer preview data for SSR.
 *
 * @description Hashes `rawToken`, checks `hire_portal_token_hash`, `hire_portal_token_expires_at`, and `hire_status`,
 * and strips all sensitive HR/compensation fields before returning the portal session descriptor.
 * @param {{ adminDb: import('@supabase/supabase-js').SupabaseClient, rawToken: string }} params - Lookup inputs.
 * @returns {Promise<{ state: 'valid'|'invalid'|'expired'|'completed', offerSummary?: object }>} Portal session state.
 * @throws {Error} Never throws on invalid tokens; returns `{ state: 'invalid' }`.
 */
export async function getCandidatePortalSession({ adminDb, rawToken }) {
  if (typeof rawToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) {
    return { state: 'invalid' };
  }

  const tokenHash = hashToken(rawToken);
  const hire = await getHireByPortalTokenHash(adminDb, tokenHash);
  if (!hire) {
    return { state: 'invalid' };
  }

  if (hire.hire_portal_token_expires_at && new Date(hire.hire_portal_token_expires_at).getTime() < Date.now()) {
    return { state: 'expired' };
  }

  if (hire.hire_status !== 'pending_candidate_docs') {
    return { state: 'completed' };
  }

  const org = await getOrganizationById(adminDb, hire.hire_org_id);

  return {
    state: 'valid',
    offerSummary: {
      org_name: org?.org_name ?? 'Your Employer',
      hire_full_name: hire.hire_full_name,
      hire_job_title: hire.hire_job_title,
      hire_department_name: hire.hire_department_name,
      hire_start_date: hire.hire_start_date,
      hire_employment_type: hire.hire_employment_type,
      expires_at: hire.hire_portal_token_expires_at,
    },
  };
}

/**
 * Generates a 60-second expiring Signed URL for HR HITL split-screen document review.
 *
 * @description Enforces `HIRE_READ_PII` (`org_admin` or `hr_admin`), resolves the offer letter or Gov ID path,
 * signs a 60s URL in `onboarding-docs`, and logs `PII_DOCUMENT_PREVIEWED`.
 * @param {{ adminDb: import('@supabase/supabase-js').SupabaseClient, actor: object, ipHash: string, hireId: string, kind: 'offer'|'gov_id' }} params - Preview request inputs.
 * @returns {Promise<{ signed_url: string, expires_in_seconds: number, kind: string }>} Short-lived document URL.
 * @throws {import('../lib/security/rbac.js').AuthorizationError} When caller lacks `HIRE_READ_PII`.
 * @throws {NotFoundError} When hire or target document does not exist.
 */
export async function getHireDocumentPreviewUrl({ adminDb, actor, ipHash, hireId, kind }) {
  authorizeAction(actor, PERMISSIONS.HIRE_READ_PII);

  const hire = await getHireByIdAdmin(adminDb, actor.usr_org_id, hireId);
  if (!hire) {
    throw new NotFoundError('Onboarding hire not found.', 'HIRE_NOT_FOUND');
  }

  const objectPath = kind === 'gov_id' ? hire.hire_gov_id_image_path : hire.hire_offer_letter_path;
  if (!objectPath) {
    throw new NotFoundError('Requested onboarding document has not been uploaded yet.', 'DOCUMENT_NOT_FOUND');
  }

  const { signedUrl, expiresInSeconds } = await createSignedDocumentUrl(
    adminDb,
    actor.usr_org_id,
    objectPath,
    60
  );

  await recordAuditEvent(adminDb, {
    orgId: actor.usr_org_id,
    actorUsrId: actor.usr_id,
    actorRole: actor.usr_role,
    action: 'PII_DOCUMENT_PREVIEWED',
    entityType: 'onboarding_hire',
    entityId: hire.hire_id,
    ipHash,
    metadata: { document_kind: kind, expires_in_seconds: expiresInSeconds },
  });

  return {
    signed_url: signedUrl,
    expires_in_seconds: expiresInSeconds,
    kind,
  };
}
