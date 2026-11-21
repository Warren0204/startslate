/**
 * @file src/lib/security/rbac.js
 * @description Role-Based Access Control (RBAC) permission matrix, action guard, and role-aware PII redaction helpers.
 */

/**
 * Canonical workspace roles supported by StartSlate.
 *
 * @type {Readonly<{ ORG_ADMIN: string, HR_ADMIN: string, IT_ADMIN: string, DEPARTMENT_MANAGER: string }>}
 */
export const ROLES = Object.freeze({
  ORG_ADMIN: 'org_admin',
  HR_ADMIN: 'hr_admin',
  IT_ADMIN: 'it_admin',
  DEPARTMENT_MANAGER: 'department_manager',
});

/**
 * Granular RBAC permission identifiers used by API controllers and domain services.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const PERMISSIONS = Object.freeze({
  ORG_MANAGE: 'org:manage',
  USERS_MANAGE: 'users:manage',
  IT_RULES_MANAGE: 'it_rules:manage',
  WEBHOOK_MANAGE: 'webhook:manage',
  WEBHOOK_RETRY: 'webhook:retry',
  HIRE_CREATE: 'hire:create',
  HIRE_HITL_REVIEW: 'hire:hitl_review',
  HIRE_READ_OPERATIONAL: 'hire:read_operational',
  HIRE_READ_PII: 'hire:read_pii',
  HIRE_PURGE_PII: 'hire:purge_pii',
  PACKET_GENERATE: 'packet:generate',
  TASK_READ: 'task:read',
  TASK_UPDATE: 'task:update',
  AUDIT_READ: 'audit:read',
});

/**
 * Sensitive hire fields stripped automatically for non-HR roles (it_admin, department_manager).
 *
 * @type {ReadonlyArray<string>}
 */
export const SENSITIVE_HIRE_FIELDS = Object.freeze([
  'hire_personal_email',
  'hire_base_salary_amount',
  'hire_salary_currency',
  'hire_offer_letter_path',
  'hire_gov_id_image_path',
  'hire_gov_id_type',
  'hire_gov_id_number_enc',
  'hire_extracted_pii_json',
  'hire_packet_pdf_path',
]);

/**
 * Central RBAC permission matrix mapping each role to its authorized permission set.
 *
 * @type {Readonly<Record<string, ReadonlySet<string>>>}
 */
export const ROLE_PERMISSION_MATRIX = Object.freeze({
  [ROLES.ORG_ADMIN]: Object.freeze(
    new Set([
      PERMISSIONS.ORG_MANAGE,
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.IT_RULES_MANAGE,
      PERMISSIONS.WEBHOOK_MANAGE,
      PERMISSIONS.WEBHOOK_RETRY,
      PERMISSIONS.HIRE_CREATE,
      PERMISSIONS.HIRE_HITL_REVIEW,
      PERMISSIONS.HIRE_READ_OPERATIONAL,
      PERMISSIONS.HIRE_READ_PII,
      PERMISSIONS.HIRE_PURGE_PII,
      PERMISSIONS.PACKET_GENERATE,
      PERMISSIONS.TASK_READ,
      PERMISSIONS.TASK_UPDATE,
      PERMISSIONS.AUDIT_READ,
    ])
  ),
  [ROLES.HR_ADMIN]: Object.freeze(
    new Set([
      PERMISSIONS.USERS_MANAGE,
      PERMISSIONS.IT_RULES_MANAGE,
      PERMISSIONS.WEBHOOK_RETRY,
      PERMISSIONS.HIRE_CREATE,
      PERMISSIONS.HIRE_HITL_REVIEW,
      PERMISSIONS.HIRE_READ_OPERATIONAL,
      PERMISSIONS.HIRE_READ_PII,
      PERMISSIONS.HIRE_PURGE_PII,
      PERMISSIONS.PACKET_GENERATE,
      PERMISSIONS.TASK_READ,
      PERMISSIONS.AUDIT_READ,
    ])
  ),
  [ROLES.IT_ADMIN]: Object.freeze(
    new Set([
      PERMISSIONS.IT_RULES_MANAGE,
      PERMISSIONS.WEBHOOK_MANAGE,
      PERMISSIONS.WEBHOOK_RETRY,
      PERMISSIONS.HIRE_READ_OPERATIONAL,
      PERMISSIONS.TASK_READ,
      PERMISSIONS.TASK_UPDATE,
      PERMISSIONS.AUDIT_READ,
    ])
  ),
  [ROLES.DEPARTMENT_MANAGER]: Object.freeze(
    new Set([
      PERMISSIONS.HIRE_READ_OPERATIONAL,
      PERMISSIONS.TASK_READ,
    ])
  ),
});

/**
 * Custom error thrown when authentication context is missing or RBAC permission is denied.
 *
 * @description Provides HTTP status codes (401/403) and machine-readable RBAC failure codes.
 */
export class AuthorizationError extends Error {
  /**
   * Creates an AuthorizationError instance.
   *
   * @description Initializes an authorization failure carrying code and HTTP status metadata.
   * @param {string} message - Human-readable denial reason.
   * @param {string} code - Machine-readable authorization error code.
   * @param {number} [statusCode=403] - HTTP status code (401 for unauthenticated, 403 for forbidden).
   * @returns {AuthorizationError} Constructed error instance.
   * @throws {Error} Never throws during construction.
   */
  constructor(message, code, statusCode = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Normalizes a database user_profiles row or session actor object into canonical fields.
 *
 * @description Supports both snake_case DB columns (`usr_*`) and camelCase actor objects.
 * @param {object} userProfile - Authenticated user profile record.
 * @returns {{ id: string, orgId: string, role: string, departmentName: string|null, status: string }} Normalized actor attributes.
 * @throws {AuthorizationError} Throws UNAUTHENTICATED (401) if profile is missing required identity fields or ACCOUNT_DISABLED (403) if inactive.
 */
function normalizeUserProfile(userProfile) {
  if (!userProfile || typeof userProfile !== 'object') {
    throw new AuthorizationError('Authentication required.', 'UNAUTHENTICATED', 401);
  }

  const id = userProfile.usr_id ?? userProfile.id;
  const orgId = userProfile.usr_org_id ?? userProfile.orgId;
  const role = userProfile.usr_role ?? userProfile.role;
  const departmentName = userProfile.usr_department_name ?? userProfile.departmentName ?? null;
  const status = userProfile.usr_status ?? userProfile.status ?? 'active';

  if (!id || !orgId || !role) {
    throw new AuthorizationError('Incomplete authenticated user profile.', 'UNAUTHENTICATED', 401);
  }

  if (status !== 'active') {
    throw new AuthorizationError('User account is not active.', 'ACCOUNT_DISABLED', 403);
  }

  return {
    id: String(id),
    orgId: String(orgId),
    role: String(role),
    departmentName: departmentName ? String(departmentName) : null,
    status: String(status),
  };
}

/**
 * Enforces RBAC permission for an authenticated workspace user profile.
 *
 * @description Validates active user profile identity, resolves role permissions from ROLE_PERMISSION_MATRIX, and denies unauthorized actions.
 * @param {object} userProfile - User profile record (`usr_id`, `usr_org_id`, `usr_role`, `usr_status`).
 * @param {string} permission - Granular permission constant from `PERMISSIONS`.
 * @returns {boolean} Returns `true` when the user's role grants the requested permission.
 * @throws {AuthorizationError} Throws UNAUTHENTICATED (401) if missing session, UNKNOWN_PERMISSION (403) for invalid permission, or FORBIDDEN (403) when denied.
 */
export function authorizeAction(userProfile, permission) {
  const actor = normalizeUserProfile(userProfile);

  if (typeof permission !== 'string' || !Object.values(PERMISSIONS).includes(permission)) {
    throw new AuthorizationError('Requested permission is not recognized.', 'UNKNOWN_PERMISSION', 403);
  }

  const allowedSet = ROLE_PERMISSION_MATRIX[actor.role];
  if (!allowedSet) {
    throw new AuthorizationError(`Unrecognized workspace role "${actor.role}".`, 'FORBIDDEN', 403);
  }

  if (!allowedSet.has(permission)) {
    throw new AuthorizationError(
      `Role "${actor.role}" is not authorized to perform "${permission}".`,
      'FORBIDDEN',
      403
    );
  }

  return true;
}

/**
 * Determines whether a user profile is authorized to inspect sensitive candidate PII and salary records.
 *
 * @description Grants PII access strictly to active `org_admin` and `hr_admin` roles.
 * @param {object} userProfile - User profile record or session actor.
 * @returns {boolean} True if user is an active `org_admin` or `hr_admin`; otherwise false.
 * @throws {Error} Never throws; invalid or disabled profiles safely evaluate to `false`.
 */
export function canViewHirePII(userProfile) {
  try {
    return authorizeAction(userProfile, PERMISSIONS.HIRE_READ_PII);
  } catch {
    return false;
  }
}

/**
 * Returns a redacted copy of an onboarding hire record when queried by non-HR roles.
 *
 * @description Strips salary, Government ID paths/ciphertexts, Offer Letter paths, and extracted PII JSON for `it_admin` and `department_manager`.
 * @param {object} userProfile - Authenticated user profile executing the read.
 * @param {object|null} hireRecord - Raw onboarding_hires row object.
 * @returns {object|null} Original record clone for HR/Org Admins, redacted object for IT/Managers, or `null` if input is nullish.
 * @throws {AuthorizationError} Throws UNAUTHENTICATED (401) or ACCOUNT_DISABLED (403) if userProfile is invalid.
 */
export function redactHireForRole(userProfile, hireRecord) {
  normalizeUserProfile(userProfile);

  if (!hireRecord || typeof hireRecord !== 'object') {
    return null;
  }

  if (canViewHirePII(userProfile)) {
    return { ...hireRecord };
  }

  const sanitized = { ...hireRecord };
  for (const sensitiveKey of SENSITIVE_HIRE_FIELDS) {
    delete sanitized[sensitiveKey];
  }

  return sanitized;
}

/**
 * Enforces tenant isolation and department-level access for `department_manager` actors.
 *
 * @description Verifies matching organization ID and, for department managers, requires case-insensitive equality on `hire_department_name`.
 * @param {object} userProfile - Authenticated user profile.
 * @param {object} hireRecord - Target onboarding_hires record containing `hire_org_id` and `hire_department_name`.
 * @returns {boolean} True when tenant and department scope checks pass.
 * @throws {AuthorizationError} Throws FORBIDDEN (403) on cross-tenant or cross-department access.
 */
export function assertDepartmentScope(userProfile, hireRecord) {
  const actor = normalizeUserProfile(userProfile);

  if (!hireRecord || typeof hireRecord !== 'object') {
    throw new AuthorizationError('Target hire record is missing.', 'FORBIDDEN', 403);
  }

  const hireOrgId = String(hireRecord.hire_org_id ?? hireRecord.orgId ?? '');
  if (!hireOrgId || hireOrgId !== actor.orgId) {
    throw new AuthorizationError('Cross-tenant resource access is prohibited.', 'FORBIDDEN', 403);
  }

  if (actor.role === ROLES.DEPARTMENT_MANAGER) {
    const hireDept = String(hireRecord.hire_department_name ?? hireRecord.departmentName ?? '')
      .trim()
      .toLowerCase();
    const actorDept = String(actor.departmentName ?? '').trim().toLowerCase();

    if (!actorDept || !hireDept || hireDept !== actorDept) {
      throw new AuthorizationError(
        'Department managers may only access hires within their assigned department.',
        'DEPARTMENT_SCOPE_VIOLATION',
        403
      );
    }
  }

  return true;
}
