/**
 * @file src/components/dashboard/DashboardWorkspace.jsx
 * @description Role-aware HR & IT Onboarding Workspace with usage quota meter, New Hire Upload modal, HITL split-screen verification modal, and IT Provisioning checklist.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Plus,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';

import { Alert } from '../ui/alert.jsx';
import { Badge } from '../ui/badge.jsx';
import { Button } from '../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx';
import { Dialog } from '../ui/dialog.jsx';
import { Input } from '../ui/input.jsx';
import { Label } from '../ui/label.jsx';
import { Progress } from '../ui/progress.jsx';

const STATUS_BADGE_MAP = Object.freeze({
  offer_uploaded: { label: 'Offer Uploaded', variant: 'amber' },
  pending_candidate_docs: { label: 'Pending Candidate Docs', variant: 'secondary' },
  docs_verified: { label: 'Docs Verified', variant: 'emerald' },
  it_provisioning: { label: 'IT Provisioning', variant: 'default' },
  day1_ready: { label: 'Day-1 Ready', variant: 'emerald' },
});

/**
 * Interactive role-aware StartSlate dashboard workspace.
 *
 * @description Renders quota telemetry, onboarding hires table (automatically honoring PII redaction for IT & Managers),
 * Offer Letter upload modal, HITL split-screen verification modal (`confidence_score < 0.85`), PDF packet generator,
 * and IT provisioning task checklist.
 * @param {{
 *   actor: object,
 *   organization: object,
 *   initialHires: Array<object>,
 *   initialTasks: Array<object>
 * }} props - Server-loaded role-scoped dashboard data.
 * @returns {import('react').ReactElement} Dashboard workspace view.
 * @throws {Error} Never throws; API errors are displayed inline.
 */
export function DashboardWorkspace({ actor, organization, initialHires, initialTasks }) {
  const router = useRouter();
  const [hires, setHires] = useState(initialHires);
  const [tasks, setTasks] = useState(initialTasks);
  const [quota, setQuota] = useState({
    used: organization.org_monthly_hires_used,
    limit: organization.org_monthly_hires_limit,
    tier: organization.org_subscription_tier,
  });

  const canManageHires = actor.usr_role === 'org_admin' || actor.usr_role === 'hr_admin';
  const canCompleteTasks = actor.usr_role === 'org_admin' || actor.usr_role === 'it_admin';

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [createdPortalUrl, setCreatedPortalUrl] = useState('');
  const [copiedPortal, setCopiedPortal] = useState(false);

  // HITL split-screen verification modal state
  const [hitlHire, setHitlHire] = useState(null);
  const [hitlForm, setHitlForm] = useState({});
  const [hitlPreviewUrl, setHitlPreviewUrl] = useState('');
  const [hitlPreviewKind, setHitlPreviewKind] = useState('offer');
  const [hitlPreviewLoading, setHitlPreviewLoading] = useState(false);
  const [hitlBusy, setHitlBusy] = useState(false);
  const [hitlError, setHitlError] = useState('');

  // Action feedback
  const [banner, setBanner] = useState(null);
  const [busyTaskId, setBusyTaskId] = useState('');
  const [busyPacketHireId, setBusyPacketHireId] = useState('');

  const quotaPct = quota.limit > 0 ? Math.round((quota.used / quota.limit) * 100) : 0;
  const hitlCount = hires.filter((h) => h.hire_needs_hitl_review).length;
  const day1ReadyCount = hires.filter((h) => h.hire_status === 'day1_ready').length;
  const openTasksCount = tasks.filter((t) => t.task_status !== 'completed').length;

  /**
   * Opens the Human-in-the-Loop split-screen modal for a hire and requests a 60s Signed URL document preview.
   *
   * @description Pre-fills editable correction fields from the hire record and loads the private Offer Letter or Gov ID preview.
   * @param {object} hire - Target hire row.
   * @returns {Promise<void>} Resolves once preview request completes.
   * @throws {Error} Caught internally and shown in the modal.
   */
  async function openHitlModal(hire) {
    const preferredKind =
      hire.hire_status === 'pending_candidate_docs' && hire.hire_gov_id_image_path ? 'gov_id' : 'offer';

    setHitlHire(hire);
    setHitlError('');
    setHitlPreviewUrl('');
    setHitlPreviewKind(preferredKind);
    setHitlForm({
      full_name: hire.hire_full_name || '',
      personal_email: hire.hire_personal_email || '',
      job_title: hire.hire_job_title || '',
      department_name: hire.hire_department_name || '',
      expected_start_date: hire.hire_start_date || '',
      base_salary_amount:
        hire.hire_base_salary_amount !== null && hire.hire_base_salary_amount !== undefined
          ? String(hire.hire_base_salary_amount)
          : '',
      id_type: hire.hire_gov_id_type || 'philsys_id',
      id_number: '',
      address: hire.hire_extracted_pii_json?.gov_id_extraction?.address || '',
    });

    await loadPreviewUrl(hire.hire_id, preferredKind);
  }

  /**
   * Fetches a 60-second expiring Signed URL for the left pane of the HITL split-screen modal.
   *
   * @description Calls `GET /api/hires/[id]/preview?kind=...`.
   * @param {string} hireId - Onboarding hire UUID.
   * @param {'offer'|'gov_id'} kind - Document preview type.
   * @returns {Promise<void>} Resolves once URL is set.
   * @throws {Error} Caught internally.
   */
  async function loadPreviewUrl(hireId, kind) {
    setHitlPreviewKind(kind);
    setHitlPreviewLoading(true);
    setHitlPreviewUrl('');

    try {
      const response = await fetch(`/api/hires/${hireId}/preview?kind=${kind}`);
      const payload = await response.json();
      if (response.ok && payload.success) {
        setHitlPreviewUrl(payload.data.signed_url);
      }
    } catch {
      // Leave preview empty with graceful fallback copy
    } finally {
      setHitlPreviewLoading(false);
    }
  }

  /**
   * Uploads an Offer Letter PDF to `POST /api/hires/extract-offer`.
   *
   * @description Handles quota enforcement, Gemini extraction, and immediate HITL handoff when confidence < 0.85.
   * @param {File} file - Selected PDF Offer Letter.
   * @returns {Promise<void>} Resolves when upload finishes.
   * @throws {Error} Caught internally and surfaced in the upload modal.
   */
  async function handleOfferUpload(file) {
    if (!file) return;
    setUploadError('');
    setCreatedPortalUrl('');
    setUploadBusy(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/hires/extract-offer', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setUploadError(payload?.error?.message || 'Failed to upload Offer Letter PDF.');
        return;
      }

      const { hire, quota: updatedQuota, portal_url: portalUrl, needs_hitl_review: needsHitl } =
        payload.data;

      setHires((prev) => [hire, ...prev]);
      if (updatedQuota) {
        setQuota({
          used: updatedQuota.org_monthly_hires_used,
          limit: updatedQuota.org_monthly_hires_limit,
          tier: updatedQuota.org_subscription_tier,
        });
      }

      if (needsHitl) {
        setUploadOpen(false);
        setBanner({
          variant: 'amber',
          message: `Offer letter for "${hire.hire_full_name}" scored below 0.85 confidence (or had missing fields). Complete HITL review below.`,
        });
        await openHitlModal(hire);
      } else if (portalUrl) {
        setCreatedPortalUrl(portalUrl);
        setBanner({
          variant: 'emerald',
          message: `Offer extracted with high confidence! Candidate portal link is ready for ${hire.hire_full_name}.`,
        });
      }
      router.refresh();
    } catch {
      setUploadError('Network error while uploading Offer Letter.');
    } finally {
      setUploadBusy(false);
    }
  }

  /**
   * Submits HR HITL verification and field corrections to `POST /api/hires/[id]/verify`.
   *
   * @description Advances `offer_uploaded -> pending_candidate_docs` or `pending_candidate_docs -> docs_verified -> it_provisioning`.
   * @param {import('react').FormEvent<HTMLFormElement>} event - Form submit event.
   * @returns {Promise<void>} Resolves when verification completes.
   * @throws {Error} Caught internally and displayed inside the HITL modal.
   */
  async function handleVerifySubmit(event) {
    event.preventDefault();
    if (!hitlHire) return;

    setHitlError('');
    setHitlBusy(true);

    const corrections = {};
    if (hitlForm.full_name?.trim()) corrections.full_name = hitlForm.full_name.trim();
    if (hitlForm.personal_email?.trim()) corrections.personal_email = hitlForm.personal_email.trim();
    if (hitlForm.job_title?.trim()) corrections.job_title = hitlForm.job_title.trim();
    if (hitlForm.department_name?.trim()) corrections.department_name = hitlForm.department_name.trim();
    if (hitlForm.expected_start_date?.trim()) {
      corrections.expected_start_date = hitlForm.expected_start_date.trim();
    }
    if (hitlForm.base_salary_amount !== '' && !Number.isNaN(Number(hitlForm.base_salary_amount))) {
      corrections.base_salary_amount = Number(hitlForm.base_salary_amount);
    }
    if (hitlHire.hire_status === 'pending_candidate_docs') {
      if (hitlForm.id_type) corrections.id_type = hitlForm.id_type;
      if (hitlForm.id_number?.trim()) corrections.id_number = hitlForm.id_number.trim();
      if (hitlForm.address?.trim()) corrections.address = hitlForm.address.trim();
    }

    try {
      const response = await fetch(`/api/hires/${hitlHire.hire_id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corrections }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setHitlError(payload?.error?.message || 'Verification failed.');
        return;
      }

      const { hire: updatedHire, portal_url: portalUrl, provisioning } = payload.data;
      setHires((prev) => prev.map((item) => (item.hire_id === updatedHire.hire_id ? updatedHire : item)));
      setHitlHire(null);

      if (portalUrl) {
        setCreatedPortalUrl(portalUrl);
        setUploadOpen(true);
      }

      setBanner({
        variant: 'emerald',
        message: provisioning
          ? `Verified ${updatedHire.hire_full_name}! Generated ${provisioning.task_count} IT tasks (webhook: ${provisioning.webhook_status}).`
          : `Verified ${updatedHire.hire_full_name} and issued passwordless candidate portal link.`,
      });
      router.refresh();
    } catch {
      setHitlError('Network error during HITL verification.');
    } finally {
      setHitlBusy(false);
    }
  }

  /**
   * Generates a flattened onboarding packet PDF and opens the 60-second Signed URL.
   *
   * @description Calls `POST /api/hires/[id]/packet`.
   * @param {string} hireId - Onboarding hire UUID.
   * @returns {Promise<void>} Resolves after packet URL opens.
   * @throws {Error} Caught internally and surfaced in the top banner.
   */
  async function handleGeneratePacket(hireId) {
    setBusyPacketHireId(hireId);
    setBanner(null);

    try {
      const response = await fetch(`/api/hires/${hireId}/packet`, { method: 'POST' });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setBanner({
          variant: 'destructive',
          message: payload?.error?.message || 'Unable to generate onboarding packet.',
        });
        return;
      }

      window.open(payload.data.signed_url, '_blank', 'noopener,noreferrer');
      setBanner({
        variant: 'emerald',
        message: `Opened 60-second Signed URL for onboarding packet${
          payload.data.watermarked ? ' (Free Trial watermark applied).' : '.'
        }`,
      });
    } catch {
      setBanner({ variant: 'destructive', message: 'Network error while compiling onboarding packet.' });
    } finally {
      setBusyPacketHireId('');
    }
  }

  /**
   * Completes an IT provisioning task via `POST /api/tasks/[id]/complete`.
   *
   * @description Updates local task & hire readiness state when all tasks reach `completed`.
   * @param {string} taskId - Provisioning task UUID.
   * @returns {Promise<void>} Resolves once task update completes.
   * @throws {Error} Caught internally and surfaced via top banner.
   */
  async function handleCompleteTask(taskId) {
    setBusyTaskId(taskId);
    setBanner(null);

    try {
      const response = await fetch(`/api/tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setBanner({
          variant: 'destructive',
          message: payload?.error?.message || 'Unable to complete IT task.',
        });
        return;
      }

      const { task: updatedTask, hire_status: nextHireStatus, remaining_tasks: remaining } = payload.data;
      setTasks((prev) => prev.map((t) => (t.task_id === updatedTask.task_id ? updatedTask : t)));
      setHires((prev) =>
        prev.map((h) =>
          h.hire_id === updatedTask.task_hire_id ? { ...h, hire_status: nextHireStatus } : h
        )
      );

      setBanner({
        variant: 'emerald',
        message:
          remaining === 0
            ? 'All IT tasks completed! Hire automatically transitioned to Day-1 Ready.'
            : `Task marked complete. ${remaining} IT task(s) remaining for this hire.`,
      });
      router.refresh();
    } catch {
      setBanner({ variant: 'destructive', message: 'Network error while updating IT task.' });
    } finally {
      setBusyTaskId('');
    }
  }

  const isLowConfidenceHitl =
    hitlHire &&
    (hitlHire.hire_ai_confidence_score === null ||
      Number(hitlHire.hire_ai_confidence_score) < 0.85);

  const hireNameById = Object.fromEntries(hires.map((h) => [h.hire_id, h]));

  return (
    <div className="space-y-6">
      {/* Page Header & Action Bar */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Onboarding Workspace</h1>
          <p className="mt-1 text-sm text-slate-500">
            {organization.org_name} &bull; Real-time HR verification &amp; IT provisioning pipeline
          </p>
        </div>
        {canManageHires ? (
          <Button
            type="button"
            variant="emerald"
            onClick={() => {
              setUploadError('');
              setCreatedPortalUrl('');
              setUploadOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Upload New Hire Offer
          </Button>
        ) : null}
      </div>

      {/* Role PII Redaction Notice for IT & Department Managers */}
      {!canManageHires ? (
        <Alert variant="default" className="border-slate-300 bg-white">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <div className="text-xs text-slate-600">
            <span className="font-semibold text-slate-900">RA 10173 Least-Privilege View Active:</span>{' '}
            Compensation figures, Government ID images, and extracted personal identifiers are automatically
            redacted for the <code>{actor.usr_role}</code> role.
          </div>
        </Alert>
      ) : null}

      {banner ? (
        <Alert variant={banner.variant}>
          {banner.variant === 'emerald' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{banner.message}</span>
        </Alert>
      ) : null}

      {/* Usage Quota & Pipeline KPI Strip */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Monthly Hire Quota</CardDescription>
              <Badge variant={quota.tier === 'free_trial' ? 'amber' : 'emerald'}>
                {quota.tier.replace('_', ' ')}
              </Badge>
            </div>
            <CardTitle className="text-2xl font-extrabold">
              {quota.used}{' '}
              <span className="text-base font-normal text-slate-400">/ {quota.limit}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={quotaPct} />
            <p className="mt-2 text-xs text-slate-500">
              {Math.max(0, quota.limit - quota.used)} monthly hire slot(s) remaining
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>HITL Review Queue (&lt;0.85)</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl font-extrabold">
              {hitlCount}
              {hitlCount > 0 ? <Badge variant="amber">Needs Review</Badge> : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              Extractions flagged for split-screen HR confirmation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open IT Tasks</CardDescription>
            <CardTitle className="text-2xl font-extrabold">{openTasksCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              Pending hardware, IAM, SaaS, and security checklists
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Day-1 Ready Hires</CardDescription>
            <CardTitle className="text-2xl font-extrabold text-emerald-600">{day1ReadyCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">
              Docs verified &amp; all department IT tasks complete
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Onboarding Hires Pipeline Table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Onboarding Hires</CardTitle>
          <CardDescription>
            Deterministic 5-stage lifecycle: Offer Uploaded &rarr; Pending Candidate Docs &rarr; Docs Verified
            &rarr; IT Provisioning &rarr; Day-1 Ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hires.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <FileText className="mx-auto h-9 w-9 text-slate-400" />
              <p className="mt-3 text-sm font-semibold text-slate-900">No onboarding hires yet</p>
              <p className="mt-1 text-xs text-slate-500">
                {canManageHires
                  ? 'Upload your first Offer Letter PDF to start automated AI extraction and candidate onboarding.'
                  : 'Hires within your authorized scope will appear here once HR initiates onboarding.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                    <th className="pb-3 pr-4">Candidate</th>
                    <th className="pb-3 pr-4">Role &amp; Dept</th>
                    <th className="pb-3 pr-4">Start Date</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">AI Confidence</th>
                    {canManageHires ? <th className="pb-3 pr-4">Base Salary</th> : null}
                    {canManageHires ? <th className="pb-3 text-right">HR Actions</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hires.map((hire) => {
                    const statusMeta = STATUS_BADGE_MAP[hire.hire_status] || {
                      label: hire.hire_status,
                      variant: 'secondary',
                    };
                    const score =
                      hire.hire_ai_confidence_score !== null &&
                      hire.hire_ai_confidence_score !== undefined
                        ? Number(hire.hire_ai_confidence_score)
                        : null;
                    const lowScore = score !== null && score < 0.85;
                    const canVerify =
                      canManageHires &&
                      (hire.hire_status === 'offer_uploaded' ||
                        (hire.hire_status === 'pending_candidate_docs' && hire.hire_gov_id_image_path));
                    const canDownloadPacket =
                      canManageHires &&
                      ['docs_verified', 'it_provisioning', 'day1_ready'].includes(hire.hire_status) &&
                      !hire.hire_needs_hitl_review;

                    return (
                      <tr key={hire.hire_id} className="hover:bg-slate-50/80">
                        <td className="py-3.5 pr-4">
                          <p className="font-semibold text-slate-900">{hire.hire_full_name}</p>
                          <p className="text-xs text-slate-500">
                            {hire.hire_work_email || hire.hire_personal_email || 'Email redacted'}
                          </p>
                        </td>
                        <td className="py-3.5 pr-4">
                          <p className="font-medium text-slate-800">{hire.hire_job_title || 'TBD'}</p>
                          <p className="text-xs text-slate-500">{hire.hire_department_name || 'Unassigned'}</p>
                        </td>
                        <td className="py-3.5 pr-4 text-slate-700">{hire.hire_start_date || 'TBD'}</td>
                        <td className="py-3.5 pr-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                            {hire.hire_needs_hitl_review ? (
                              <Badge variant="amber">
                                <ShieldAlert className="h-3 w-3" />
                                HITL
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3.5 pr-4">
                          {score !== null ? (
                            <Badge variant={lowScore ? 'amber' : 'emerald'}>
                              {Math.round(score * 100)}%
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        {canManageHires ? (
                          <td className="py-3.5 pr-4 font-medium text-slate-800">
                            {hire.hire_base_salary_amount !== null &&
                            hire.hire_base_salary_amount !== undefined
                              ? `${hire.hire_salary_currency || 'PHP'} ${Number(
                                  hire.hire_base_salary_amount
                                ).toLocaleString()}`
                              : '—'}
                          </td>
                        ) : null}
                        {canManageHires ? (
                          <td className="py-3.5 text-right">
                            <div className="inline-flex items-center gap-2">
                              {canVerify ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={hire.hire_needs_hitl_review ? 'default' : 'outline'}
                                  onClick={() => openHitlModal(hire)}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Verify HITL
                                </Button>
                              ) : null}
                              {canDownloadPacket ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="emerald"
                                  disabled={busyPacketHireId === hire.hire_id}
                                  onClick={() => handleGeneratePacket(hire.hire_id)}
                                >
                                  {busyPacketHireId === hire.hire_id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Download className="h-3.5 w-3.5" />
                                  )}
                                  PDF Packet
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* IT Provisioning Task Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-emerald-500" />
            IT Provisioning Task Checklist
          </CardTitle>
          <CardDescription>
            Auto-generated by department once candidate documents are verified. Completing all tasks promotes
            the hire to Day-1 Ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No IT provisioning tasks queued yet. Tasks generate automatically when a hire reaches Docs
              Verified.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {tasks.map((task) => {
                const relatedHire = hireNameById[task.task_hire_id];
                const isDone = task.task_status === 'completed';

                return (
                  <div
                    key={task.task_id}
                    className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isDone ? 'text-slate-400 line-through' : 'text-slate-900'
                          }`}
                        >
                          {task.task_title}
                        </span>
                        <Badge variant="secondary">{task.task_category.toUpperCase()}</Badge>
                        <Badge
                          variant={
                            task.task_webhook_status === 'delivered'
                              ? 'emerald'
                              : task.task_webhook_status === 'failed'
                              ? 'rose'
                              : 'outline'
                          }
                        >
                          Webhook: {task.task_webhook_status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        New Hire: <strong className="text-slate-700">{relatedHire?.hire_full_name || task.task_hire_id}</strong>{' '}
                        {relatedHire?.hire_department_name ? `(${relatedHire.hire_department_name})` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {isDone ? (
                        <Badge variant="emerald">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Completed
                        </Badge>
                      ) : canCompleteTasks ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="emerald"
                          disabled={busyTaskId === task.task_id}
                          onClick={() => handleCompleteTask(task.task_id)}
                        >
                          {busyTaskId === task.task_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Mark Complete
                        </Button>
                      ) : (
                        <Badge variant="amber">{task.task_status}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Hire Offer Letter Upload Modal */}
      <Dialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload New Hire Offer Letter"
        description="PDF under 5MB. Validated via binary %PDF- magic bytes and parsed with Gemini 2.5 Flash."
      >
        <div className="space-y-4">
          {uploadError ? (
            <Alert variant="destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{uploadError}</span>
            </Alert>
          ) : null}

          {createdPortalUrl ? (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 font-semibold text-emerald-900">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Passwordless Candidate Portal Link Generated (Copy Now)
              </div>
              <p className="text-xs text-emerald-800">
                For security, raw tokens are never stored in plaintext. Share this 7-day expiring link with
                your new hire:
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly value={createdPortalUrl} className="bg-white font-mono text-xs" />
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(createdPortalUrl);
                    setCopiedPortal(true);
                    setTimeout(() => setCopiedPortal(false), 2000);
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedPortal ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center transition-colors hover:border-emerald-500 hover:bg-emerald-50/40">
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={uploadBusy}
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) handleOfferUpload(selected);
                  e.target.value = '';
                }}
              />
              {uploadBusy ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    Checking quota, encrypting &amp; extracting Offer Letter...
                  </p>
                </>
              ) : (
                <>
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-emerald-400">
                    <UploadCloud className="h-6 w-6" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-slate-900">
                    Click to select Offer Letter PDF (&lt;5MB)
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Consumes 1 hire from your monthly quota ({quota.used}/{quota.limit} used).
                  </p>
                </>
              )}
            </label>
          )}
        </div>
      </Dialog>

      {/* Human-in-the-Loop (HITL) Split-Screen Verification Modal */}
      <Dialog
        open={Boolean(hitlHire)}
        onClose={() => setHitlHire(null)}
        title="Human-in-the-Loop (HITL) Split-Screen Verification"
        description="Verify and correct AI-extracted fields side-by-side against the private 60-second Signed URL document."
        maxWidthClass="max-w-5xl"
      >
        {hitlHire ? (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left Pane: 60-Second Expiring Private Document Preview */}
            <div className="flex flex-col gap-3 lg:col-span-6">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={hitlPreviewKind === 'offer' ? 'default' : 'outline'}
                    onClick={() => loadPreviewUrl(hitlHire.hire_id, 'offer')}
                  >
                    Offer Letter
                  </Button>
                  {hitlHire.hire_gov_id_image_path ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={hitlPreviewKind === 'gov_id' ? 'default' : 'outline'}
                      onClick={() => loadPreviewUrl(hitlHire.hire_id, 'gov_id')}
                    >
                      Government ID
                    </Button>
                  ) : null}
                </div>
                {hitlPreviewUrl ? (
                  <a
                    href={hitlPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
                  >
                    Open (60s link)
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>

              <div className="flex h-[460px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                {hitlPreviewLoading ? (
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                    <span className="text-xs">Signing 60-second vault URL...</span>
                  </div>
                ) : hitlPreviewUrl ? (
                  hitlPreviewKind === 'gov_id' &&
                  !hitlHire.hire_gov_id_image_path?.endsWith('.pdf') ? (
                    <img
                      src={hitlPreviewUrl}
                      alt="Uploaded Government ID preview"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <iframe
                      src={hitlPreviewUrl}
                      title="Private onboarding document preview"
                      className="h-full w-full"
                    />
                  )
                ) : (
                  <p className="px-6 text-center text-xs text-slate-500">
                    Document preview unavailable or expired. Click the tab above to re-sign a fresh 60s URL.
                  </p>
                )}
              </div>
            </div>

            {/* Right Pane: Editable Verification Form with Amber < 0.85 Highlights */}
            <form onSubmit={handleVerifySubmit} className="space-y-4 lg:col-span-6">
              {isLowConfidenceHitl ? (
                <Alert variant="amber">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div className="text-xs">
                    <p className="font-semibold">
                      Low AI Confidence Detected (
                      {hitlHire.hire_ai_confidence_score !== null
                        ? `${Math.round(Number(hitlHire.hire_ai_confidence_score) * 100)}%`
                        : 'Pending'}
                      &nbsp;&lt; 85%)
                    </p>
                    <p className="mt-0.5">
                      Highlighted fields below require manual HR review before advancing the workflow.
                    </p>
                  </div>
                </Alert>
              ) : null}

              {hitlError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{hitlError}</span>
                </Alert>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['full_name', 'Candidate Full Name', 'text'],
                  ['personal_email', 'Personal Email', 'email'],
                  ['job_title', 'Job Title', 'text'],
                  ['department_name', 'Department (IT Rules)', 'text'],
                  ['expected_start_date', 'Start Date (YYYY-MM-DD)', 'date'],
                  ['base_salary_amount', 'Base Salary (HR Only)', 'number'],
                ].map(([fieldKey, label, inputType]) => {
                  const highlightField = isLowConfidenceHitl || !hitlForm[fieldKey];
                  return (
                    <div key={fieldKey} className="space-y-1">
                      <Label htmlFor={`hitl_${fieldKey}`} className="flex items-center justify-between text-xs">
                        <span>{label}</span>
                        {highlightField ? (
                          <span className="font-semibold text-amber-600">Check</span>
                        ) : null}
                      </Label>
                      <Input
                        id={`hitl_${fieldKey}`}
                        type={inputType}
                        value={hitlForm[fieldKey] ?? ''}
                        onChange={(e) =>
                          setHitlForm((prev) => ({ ...prev, [fieldKey]: e.target.value }))
                        }
                        className={
                          highlightField
                            ? 'border-amber-400 bg-amber-50/70 focus-visible:ring-amber-500'
                            : ''
                        }
                      />
                    </div>
                  );
                })}
              </div>

              {hitlHire.hire_status === 'pending_candidate_docs' ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Government ID Verification Overrides
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="hitl_id_type" className="text-xs">
                        ID Type
                      </Label>
                      <Input
                        id="hitl_id_type"
                        value={hitlForm.id_type ?? ''}
                        onChange={(e) =>
                          setHitlForm((prev) => ({ ...prev, id_type: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="hitl_id_number" className="text-xs">
                        Re-enter ID Number (Re-encrypted AES-256-GCM)
                      </Label>
                      <Input
                        id="hitl_id_number"
                        placeholder="Leave blank to keep existing"
                        value={hitlForm.id_number ?? ''}
                        onChange={(e) =>
                          setHitlForm((prev) => ({ ...prev, id_number: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="hitl_address" className="text-xs">
                      Residential Address
                    </Label>
                    <Input
                      id="hitl_address"
                      value={hitlForm.address ?? ''}
                      onChange={(e) =>
                        setHitlForm((prev) => ({ ...prev, address: e.target.value }))
                      }
                    />
                  </div>
                </div>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setHitlHire(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="emerald" disabled={hitlBusy}>
                  {hitlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {hitlHire.hire_status === 'offer_uploaded'
                    ? 'Approve & Issue Portal Link'
                    : 'Verify Docs & Trigger IT Provisioning'}
                </Button>
              </div>
            </form>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
