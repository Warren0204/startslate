/**
 * @file tests/security/security.test.js
 * @description Unit test suite for StartSlate cybersecurity guardrails (domainGuard, rbac, fileValidator, crypto).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DomainGuardError,
  assertCorporateEmail,
  extractCorporateDomain,
  isPublicWebmailDomain,
} from '../../src/lib/security/domainGuard.js';
import {
  AuthorizationError,
  PERMISSIONS,
  ROLES,
  assertDepartmentScope,
  authorizeAction,
  canViewHirePII,
  redactHireForRole,
} from '../../src/lib/security/rbac.js';
import {
  FileValidationError,
  MAX_FILE_SIZE_BYTES,
  detectFileSignature,
  validateFileUpload,
} from '../../src/lib/security/fileValidator.js';
import {
  CryptoError,
  decryptPII,
  encryptPII,
  hashToken,
  maskPII,
  signWebhookPayload,
  verifyWebhookSignature,
} from '../../src/lib/security/crypto.js';

/**
 * Generates deterministic 64-char hex encryption key for isolated security unit tests.
 *
 * @description Supplies a non-production test key to `process.env.PII_ENCRYPTION_KEY`.
 * @param {void} _unused - Takes no arguments.
 * @returns {string} 64-character lowercase hex test key.
 * @throws {Error} Never throws.
 */
function setupTestEncryptionKey(_unused) {
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.PII_ENCRYPTION_KEY = testKey;
  return testKey;
}

test('domainGuard blocks public webmail domains and extracts corporate domains', () => {
  const valid = assertCorporateEmail('Maria.Santos@AcmeCorp.PH');
  assert.deepEqual(valid, { email: 'maria.santos@acmecorp.ph', domain: 'acmecorp.ph' });
  assert.equal(isPublicWebmailDomain('acmecorp.ph'), false);
  assert.equal(isPublicWebmailDomain('gmail.com'), true);

  for (const blocked of ['hr@gmail.com', 'user@yahoo.com', 'ops@hotmail.com', 'lead@outlook.com']) {
    assert.throws(() => assertCorporateEmail(blocked), (err) => {
      assert.ok(err instanceof DomainGuardError);
      assert.equal(err.code, 'PUBLIC_WEBMAIL_BLOCKED');
      assert.equal(err.statusCode, 403);
      return true;
    });
  }

  assert.throws(() => extractCorporateDomain('not-an-email'), DomainGuardError);
});

test('rbac authorizeAction and redactHireForRole enforce strict 4-role boundaries', () => {
  const orgAdmin = { usr_id: 'u1', usr_org_id: 'org1', usr_role: ROLES.ORG_ADMIN, usr_status: 'active' };
  const hrAdmin = { usr_id: 'u2', usr_org_id: 'org1', usr_role: ROLES.HR_ADMIN, usr_status: 'active' };
  const itAdmin = { usr_id: 'u3', usr_org_id: 'org1', usr_role: ROLES.IT_ADMIN, usr_status: 'active' };
  const deptMgr = {
    usr_id: 'u4',
    usr_org_id: 'org1',
    usr_role: ROLES.DEPARTMENT_MANAGER,
    usr_department_name: 'Engineering',
    usr_status: 'active',
  };

  assert.equal(authorizeAction(orgAdmin, PERMISSIONS.ORG_MANAGE), true);
  assert.equal(authorizeAction(hrAdmin, PERMISSIONS.HIRE_CREATE), true);
  assert.equal(authorizeAction(itAdmin, PERMISSIONS.TASK_UPDATE), true);
  assert.equal(authorizeAction(deptMgr, PERMISSIONS.HIRE_READ_OPERATIONAL), true);

  assert.throws(() => authorizeAction(itAdmin, PERMISSIONS.HIRE_READ_PII), AuthorizationError);
  assert.throws(() => authorizeAction(hrAdmin, PERMISSIONS.ORG_MANAGE), AuthorizationError);
  assert.throws(() => authorizeAction(deptMgr, PERMISSIONS.TASK_UPDATE), AuthorizationError);

  assert.equal(canViewHirePII(orgAdmin), true);
  assert.equal(canViewHirePII(hrAdmin), true);
  assert.equal(canViewHirePII(itAdmin), false);
  assert.equal(canViewHirePII(deptMgr), false);

  const rawHire = {
    hire_id: 'h1',
    hire_org_id: 'org1',
    hire_full_name: 'Juan Dela Cruz',
    hire_department_name: 'Engineering',
    hire_personal_email: 'juan@gmail.com',
    hire_base_salary_amount: 95000,
    hire_gov_id_image_path: 'org1/h1/id.png',
    hire_gov_id_number_enc: 'v1:aa:bb:cc',
    hire_extracted_pii_json: { address: 'Makati' },
  };

  const hrView = redactHireForRole(hrAdmin, rawHire);
  assert.equal(hrView.hire_base_salary_amount, 95000);

  const itView = redactHireForRole(itAdmin, rawHire);
  assert.equal(itView.hire_full_name, 'Juan Dela Cruz');
  assert.equal('hire_base_salary_amount' in itView, false);
  assert.equal('hire_gov_id_image_path' in itView, false);
  assert.equal('hire_extracted_pii_json' in itView, false);

  assert.equal(assertDepartmentScope(deptMgr, rawHire), true);
  assert.throws(
    () => assertDepartmentScope(deptMgr, { ...rawHire, hire_department_name: 'Finance' }),
    AuthorizationError
  );
});

test('fileValidator inspects binary magic bytes and rejects oversized or spoofed files', () => {
  const validPdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const spoofedExeAsPdf = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]); // MZ header

  assert.equal(detectFileSignature(validPdf)?.type, 'pdf');
  assert.equal(detectFileSignature(validJpg)?.type, 'jpeg');
  assert.equal(detectFileSignature(validPng)?.type, 'png');
  assert.equal(detectFileSignature(spoofedExeAsPdf), null);

  const pdfResult = validateFileUpload(validPdf, { originalName: '../../offer.pdf', allowedTypes: ['pdf'] });
  assert.equal(pdfResult.valid, true);
  assert.equal(pdfResult.mimeType, 'application/pdf');
  assert.equal(pdfResult.sanitizedName, 'offer.pdf');

  assert.throws(
    () => validateFileUpload(spoofedExeAsPdf, { originalName: 'fake.pdf' }),
    (err) => err instanceof FileValidationError && err.code === 'INVALID_MAGIC_BYTES'
  );

  const exact5Mb = Buffer.alloc(MAX_FILE_SIZE_BYTES);
  validPdf.copy(exact5Mb);
  assert.throws(
    () => validateFileUpload(exact5Mb),
    (err) => err instanceof FileValidationError && err.code === 'FILE_TOO_LARGE'
  );
});

test('crypto encryptPII/decryptPII and webhook signatures resist tampering', () => {
  setupTestEncryptionKey();

  const ciphertext = encryptPII('CRN-0112-3456789-0', 'org1:hire1');
  assert.match(ciphertext, /^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
  assert.equal(decryptPII(ciphertext, 'org1:hire1'), 'CRN-0112-3456789-0');

  // Wrong AAD must fail GCM tag verification
  assert.throws(() => decryptPII(ciphertext, 'org2:hire1'), CryptoError);

  // Tampered ciphertext must fail GCM tag verification
  const tampered = `${ciphertext.slice(0, -2)}ff`;
  assert.throws(() => decryptPII(tampered, 'org1:hire1'), CryptoError);

  assert.equal(maskPII('1234567890', 4), '******7890');
  assert.equal(hashToken('sample-token').length, 64);

  const body = JSON.stringify({ hire_id: 'h1', tasks: [] });
  const sigHeader = signWebhookPayload('whsec_test_123', 1732200000, body);
  assert.equal(verifyWebhookSignature('whsec_test_123', body, sigHeader), true);
  assert.equal(verifyWebhookSignature('whsec_wrong', body, sigHeader), false);
});
