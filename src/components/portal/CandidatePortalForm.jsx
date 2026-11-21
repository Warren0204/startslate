/**
 * @file src/components/portal/CandidatePortalForm.jsx
 * @description Mobile-first passwordless candidate self-service onboarding form with RA 10173 consent and Government ID uploader.
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Briefcase,
  Calendar,
  Camera,
  CheckCircle2,
  FileCheck2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

import { CURRENT_CONSENT_VERSION } from '../../lib/validation/schemas.js';
import { Alert } from '../ui/alert.jsx';
import { Badge } from '../ui/badge.jsx';
import { Button } from '../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx';

/**
 * Mobile-first candidate onboarding submission form (`/portal/[token]`).
 *
 * @description Displays pre-filled offer metadata, captures explicit RA 10173 informed consent, accepts a
 * camera/file Government ID upload (<5MB), and submits multipart FormData to `POST /api/portal/[token]/submit-id`.
 * @param {{ token: string, offerSummary: object }} props - Validated portal token and non-sensitive offer preview.
 * @returns {import('react').ReactElement} Mobile candidate form or post-submission receipt card.
 * @throws {Error} Never throws; upload and API errors render inline.
 */
export function CandidatePortalForm({ token, offerSummary }) {
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewSrc, setPreviewSrc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [submissionResult, setSubmissionResult] = useState(null);

  /**
   * Handles mobile camera/file selection for the Government ID uploader.
   *
   * @description Verifies `< 5MB` size client-side and builds an object URL thumbnail for image files.
   * @param {import('react').ChangeEvent<HTMLInputElement>} event - File input change event.
   * @returns {void} Nothing.
   * @throws {Error} Never throws.
   */
  function handleFileChange(event) {
    setErrorMessage('');
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size >= 5 * 1024 * 1024) {
      setErrorMessage('File is too large. Please upload a clear photo or PDF under 5MB.');
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      setPreviewSrc(URL.createObjectURL(file));
    } else {
      setPreviewSrc('');
    }
  }

  /**
   * Submits RA 10173 consent and Government ID binary to `POST /api/portal/[token]/submit-id`.
   *
   * @description Posts multipart FormData and displays an Emerald confirmation card upon completion.
   * @param {import('react').FormEvent<HTMLFormElement>} event - Form submission event.
   * @returns {Promise<void>} Resolves when submission finishes.
   * @throws {Error} Caught internally and surfaced inline.
   */
  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');

    if (!consentAccepted) {
      setErrorMessage('Please accept the RA 10173 Data Privacy consent statement before submitting.');
      return;
    }
    if (!selectedFile) {
      setErrorMessage('Please capture or upload a valid Government ID photo (JPG, PNG, or PDF under 5MB).');
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('consent_accepted', 'true');
      formData.append('consent_version', CURRENT_CONSENT_VERSION);
      formData.append('file', selectedFile);

      const response = await fetch(`/api/portal/${encodeURIComponent(token)}/submit-id`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setErrorMessage(payload?.error?.message || 'Unable to submit your Government ID.');
        return;
      }

      setSubmissionResult(payload.data);
    } catch {
      setErrorMessage('Network error while uploading your document. Please retry on a stable connection.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submissionResult) {
    return (
      <Card className="border-emerald-200 shadow-md">
        <CardContent className="flex flex-col items-center p-8 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h2 className="mt-4 text-xl font-bold text-slate-900">Onboarding Documents Received!</h2>
          <p className="mt-2 text-sm text-slate-600">
            Thank you, <strong>{offerSummary.hire_full_name}</strong>. Your Government ID has been encrypted
            using AES-256-GCM and securely transmitted to {offerSummary.org_name}&apos;s HR team.
          </p>

          <div className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs text-slate-600">
            <div className="flex justify-between py-1">
              <span>Current Status</span>
              <Badge variant={submissionResult.needs_hitl_review ? 'amber' : 'emerald'}>
                {submissionResult.needs_hitl_review ? 'Under HR Review' : 'Verified — IT Provisioning Started'}
              </Badge>
            </div>
            {submissionResult.masked_id_number ? (
              <div className="flex justify-between py-1">
                <span>Encrypted ID Reference</span>
                <code className="font-semibold text-slate-900">{submissionResult.masked_id_number}</code>
              </div>
            ) : null}
          </div>

          <p className="mt-5 text-xs text-slate-400">
            You may safely close this window. HR will reach out with your Day-1 schedule.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Pre-Filled Offer Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="emerald">Welcome to {offerSummary.org_name}</Badge>
            <span className="text-[11px] text-slate-400">Passwordless Portal</span>
          </div>
          <CardTitle className="pt-2 text-xl">Hi, {offerSummary.hire_full_name}</CardTitle>
          <CardDescription>
            Confirm your pre-filled offer details below and upload one valid Government ID to kick off Day-1
            IT provisioning.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div className="flex items-start gap-2.5">
              <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <dt className="text-xs text-slate-500">Role &amp; Department</dt>
                <dd className="font-semibold text-slate-900">
                  {offerSummary.hire_job_title} &bull; {offerSummary.hire_department_name}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <dt className="text-xs text-slate-500">Expected Start Date</dt>
                <dd className="font-semibold text-slate-900">{offerSummary.hire_start_date}</dd>
              </div>
            </div>
          </dl>
        </CardContent>
      </Card>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </Alert>
      ) : null}

      {/* Government ID Upload Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">1. Upload Valid Government ID</CardTitle>
          <CardDescription>
            Accepted: PhilSys National ID, Passport, Driver&apos;s License, UMID, PRC, or SSS ID (JPG, PNG,
            or PDF under 5MB).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:border-emerald-500 hover:bg-emerald-50/40">
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
            {previewSrc ? (
              <img
                src={previewSrc}
                alt="Selected Government ID preview"
                className="max-h-48 rounded-lg border border-slate-200 object-contain"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-emerald-400">
                <Camera className="h-6 w-6" />
              </span>
            )}
            <p className="mt-3 text-sm font-semibold text-slate-900">
              {selectedFile ? selectedFile.name : 'Tap to take a photo or choose ID file'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedFile
                ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB — Tap to replace`
                : 'Ensure all text and your ID number are sharp and well-lit'}
            </p>
          </label>
        </CardContent>
      </Card>

      {/* Explicit RA 10173 Informed Consent Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            2. Philippine Data Privacy Act (RA 10173) Consent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              I voluntarily consent to the collection, AI-assisted extraction, AES-256-GCM encryption, and
              verification of my Government ID by <strong>{offerSummary.org_name}</strong> (Personal
              Information Controller) via StartSlate solely for employment onboarding, in accordance with{' '}
              <strong>Republic Act No. 10173</strong> and the{' '}
              <Link href="/privacy" target="_blank" className="font-semibold text-emerald-600 underline">
                StartSlate Privacy Notice
              </Link>
              .
            </span>
          </label>
        </CardContent>
      </Card>

      <Button
        type="submit"
        variant="emerald"
        size="lg"
        className="w-full"
        disabled={isSubmitting || !consentAccepted || !selectedFile}
      >
        {isSubmitting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <FileCheck2 className="h-5 w-5" />
        )}
        Confirm &amp; Submit Onboarding ID
      </Button>
    </form>
  );
}
