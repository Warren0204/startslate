/**
 * @file src/components/landing/OfferDemoDropzone.jsx
 * @description Interactive no-signup Offer Letter PDF extraction demo powered by `/api/demo/extract`.
 */

'use client';

import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react';

import { Alert } from '../ui/alert.jsx';
import { Badge } from '../ui/badge.jsx';
import { Button } from '../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx';

const SAMPLE_OFFER_PREVIEW = Object.freeze({
  extracted: {
    full_name: 'Camille Reyes',
    personal_email: 'camille.reyes.personal@gmail.com',
    job_title: 'Senior Full-Stack Engineer',
    department_name: 'Engineering',
    expected_start_date: '2026-12-01',
    base_salary_amount: 145000,
    confidence_score: 0.94,
  },
  needs_hitl_review: false,
  ephemeral: true,
  isSimulatedSample: true,
});

/**
 * Interactive Offer Letter extraction dropzone for the public StartSlate landing page.
 *
 * @description Accepts a PDF under 5MB, submits it to `POST /api/demo/extract` in ephemeral memory-only mode,
 * and displays parsed onboarding fields plus confidence/HITL status.
 * @param {void} _unused - Takes no props.
 * @returns {import('react').ReactElement} Interactive demo card.
 * @throws {Error} Never throws; upload and API failures render inline alerts.
 */
export function OfferDemoDropzone(_unused) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);

  /**
   * Validates and submits an Offer Letter PDF to `/api/demo/extract`.
   *
   * @description Performs client-side size check (<5MB), posts multipart FormData, and updates UI state.
   * @param {File} file - Selected PDF file from drag-and-drop or file picker.
   * @returns {Promise<void>} Resolves once extraction finishes.
   * @throws {Error} Caught internally and surfaced as an inline error alert.
   */
  async function handleFileUpload(file) {
    setErrorMessage('');
    if (!file) return;

    if (file.size >= 5 * 1024 * 1024) {
      setErrorMessage('File must be strictly under 5MB.');
      return;
    }

    setFileName(file.name);
    setIsLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/demo/extract', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setErrorMessage(payload?.error?.message || 'Unable to parse Offer Letter PDF.');
        return;
      }

      setResult({ ...payload.data, isSimulatedSample: false });
    } catch {
      setErrorMessage('Network error while contacting the extraction service.');
    } finally {
      setIsLoading(false);
    }
  }

  const confidencePercent = result?.extracted
    ? Math.round((result.extracted.confidence_score ?? 0) * 100)
    : null;

  return (
    <Card className="overflow-hidden border-slate-200 shadow-lg">
      <CardHeader className="border-b border-slate-100 bg-slate-900 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <Sparkles className="h-5 w-5 text-emerald-400" />
              No-Signup Offer Letter AI Demo
            </CardTitle>
            <CardDescription className="mt-1 text-slate-300">
              Drop any PDF Offer Letter (&lt;5MB). Parsed by Gemini 2.5 Flash in memory — zero data stored.
            </CardDescription>
          </div>
          <Badge variant="emerald" className="border-emerald-400/40 bg-emerald-500/15 text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Ephemeral Zero-Retention
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) handleFileUpload(dropped);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all ${
            isDragging
              ? 'border-emerald-500 bg-emerald-50/70'
              : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/70'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) handleFileUpload(selected);
              e.target.value = '';
            }}
          />

          {isLoading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-9 w-9 animate-spin text-emerald-500" />
              <p className="text-sm font-medium text-slate-900">
                Validating PDF magic bytes &amp; extracting fields with Gemini 2.5 Flash...
              </p>
              <p className="text-xs text-slate-500">{fileName}</p>
            </div>
          ) : (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-emerald-400">
                <UploadCloud className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                Drop your Offer Letter PDF here, or click to browse
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Strict binary <code className="rounded bg-slate-200/80 px-1 py-0.5">%PDF-</code> check &bull;
                Under 5MB &bull; Automatically discarded after response
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>No PDF handy right now?</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setErrorMessage('');
              setFileName('Sample_Offer_Camille_Reyes.pdf');
              setResult(SAMPLE_OFFER_PREVIEW);
            }}
          >
            <FileText className="h-3.5 w-3.5 text-emerald-600" />
            Preview Sample Extraction
          </Button>
        </div>

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Extraction Blocked</p>
              <p className="mt-0.5 text-xs">{errorMessage}</p>
            </div>
          </Alert>
        ) : null}

        {result?.extracted ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-700" />
                <span className="text-sm font-semibold text-slate-900">{fileName}</span>
                {result.isSimulatedSample ? (
                  <Badge variant="secondary">Sample Output</Badge>
                ) : null}
              </div>
              <Badge variant={result.needs_hitl_review ? 'amber' : 'emerald'}>
                {result.needs_hitl_review ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Confidence: {confidencePercent}%{' '}
                {result.needs_hitl_review ? '(HITL Review Required)' : '(Auto-Ready)'}
              </Badge>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {[
                ['Candidate Full Name', result.extracted.full_name],
                ['Personal Email', result.extracted.personal_email],
                ['Job Title', result.extracted.job_title],
                ['Department (IT Mapping)', result.extracted.department_name],
                ['Expected Start Date', result.extracted.expected_start_date],
                [
                  'Base Salary (HR-Only Field)',
                  result.extracted.base_salary_amount !== null
                    ? `PHP ${Number(result.extracted.base_salary_amount).toLocaleString()}`
                    : null,
                ],
              ].map(([label, val]) => (
                <div
                  key={label}
                  className={`rounded-lg border p-3 ${
                    !val || result.needs_hitl_review
                      ? 'border-amber-300 bg-amber-50/70'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <dt className="text-xs font-medium text-slate-500">{label}</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{val || 'Missing — Flagged for HR'}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
