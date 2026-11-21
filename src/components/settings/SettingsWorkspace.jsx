/**
 * @file src/components/settings/SettingsWorkspace.jsx
 * @description Workspace settings UI covering team member role management, IT webhook configuration, and billing overview.
 */

'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  CreditCard,
  KeyRound,
  Loader2,
  UserPlus,
  Users,
  Webhook,
} from 'lucide-react';

import { Alert } from '../ui/alert.jsx';
import { Badge } from '../ui/badge.jsx';
import { Button } from '../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx';
import { Input } from '../ui/input.jsx';
import { Label } from '../ui/label.jsx';
import { Progress } from '../ui/progress.jsx';

const ROLE_OPTIONS = [
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'hr_admin', label: 'HR Admin' },
  { value: 'it_admin', label: 'IT Admin' },
  { value: 'department_manager', label: 'Department Manager' },
];

/**
 * Interactive StartSlate workspace settings panel (`/settings`).
 *
 * @description Manages corporate team invites/role assignments, HTTPS IT provisioning webhook URLs + HMAC-SHA256
 * secret rotation, and hybrid subscription/quota visibility.
 * @param {{ actor: object, organization: object, initialMembers: Array<object> }} props - Sanitized settings state.
 * @returns {import('react').ReactElement} Settings workspace UI.
 * @throws {Error} Never throws; validation and server errors render inline.
 */
export function SettingsWorkspace({ actor, organization, initialMembers }) {
  const canManageUsers = actor.usr_role === 'org_admin' || actor.usr_role === 'hr_admin';
  const canManageWebhooks = actor.usr_role === 'org_admin' || actor.usr_role === 'it_admin';

  const [members, setMembers] = useState(initialMembers);
  const [inviteForm, setInviteForm] = useState({
    full_name: '',
    email: '',
    role: 'hr_admin',
    department_name: '',
  });
  const [inviteBusy, setInviteBusy] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState(organization.org_it_webhook_url || '');
  const [hasWebhookSecret, setHasWebhookSecret] = useState(organization.has_webhook_secret);
  const [newSigningSecret, setNewSigningSecret] = useState('');
  const [webhookBusy, setWebhookBusy] = useState(false);

  const [feedback, setFeedback] = useState(null);

  const quotaPct =
    organization.org_monthly_hires_limit > 0
      ? Math.round((organization.org_monthly_hires_used / organization.org_monthly_hires_limit) * 100)
      : 0;

  /**
   * Invites a new corporate team member via `POST /api/settings/users`.
   *
   * @description Validates role and optional department scope, appends the new profile to state on success.
   * @param {import('react').FormEvent<HTMLFormElement>} event - Form submit event.
   * @returns {Promise<void>} Resolves once invite finishes.
   * @throws {Error} Caught internally and surfaced as an alert.
   */
  async function handleInviteSubmit(event) {
    event.preventDefault();
    setFeedback(null);
    setInviteBusy(true);

    try {
      const response = await fetch('/api/settings/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: inviteForm.full_name,
          email: inviteForm.email,
          role: inviteForm.role,
          department_name:
            inviteForm.role === 'department_manager' ? inviteForm.department_name : null,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setFeedback({
          variant: 'destructive',
          message: payload?.error?.message || 'Unable to invite team member.',
        });
        return;
      }

      setMembers((prev) => [...prev, payload.data.member]);
      setInviteForm({ full_name: '', email: '', role: 'hr_admin', department_name: '' });
      setFeedback({
        variant: 'emerald',
        message: `Invitation sent to ${payload.data.member.usr_email} (${payload.data.member.usr_role}).`,
      });
    } catch {
      setFeedback({ variant: 'destructive', message: 'Network error while inviting team member.' });
    } finally {
      setInviteBusy(false);
    }
  }

  /**
   * Updates an existing team member's workspace role via `PATCH /api/settings/users`.
   *
   * @description Sends role change and updates local team roster.
   * @param {object} member - Target `user_profiles` row.
   * @param {string} nextRole - Selected role enum value.
   * @returns {Promise<void>} Resolves once role update finishes.
   * @throws {Error} Caught internally.
   */
  async function handleRoleChange(member, nextRole) {
    setFeedback(null);
    const dept =
      nextRole === 'department_manager'
        ? member.usr_department_name || 'Engineering'
        : null;

    try {
      const response = await fetch('/api/settings/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usr_id: member.usr_id,
          usr_role: nextRole,
          usr_department_name: dept,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setFeedback({
          variant: 'destructive',
          message: payload?.error?.message || 'Unable to update role.',
        });
        return;
      }

      setMembers((prev) =>
        prev.map((m) => (m.usr_id === member.usr_id ? payload.data.member : m))
      );
      setFeedback({
        variant: 'emerald',
        message: `Updated ${member.usr_full_name} to ${nextRole}.`,
      });
    } catch {
      setFeedback({ variant: 'destructive', message: 'Network error while updating role.' });
    }
  }

  /**
   * Saves the HTTPS IT webhook URL and optionally rotates the HMAC-SHA256 signing secret via `PATCH /api/settings`.
   *
   * @description Displays newly generated `whsec_*` signing secrets once for safe copy.
   * @param {boolean} rotateSecret - Whether to generate a new HMAC signing secret.
   * @returns {Promise<void>} Resolves once webhook settings save.
   * @throws {Error} Caught internally.
   */
  async function handleSaveWebhook(rotateSecret) {
    setFeedback(null);
    setNewSigningSecret('');
    setWebhookBusy(true);

    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhook_url: webhookUrl.trim() || null,
          rotate_secret: rotateSecret,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        setFeedback({
          variant: 'destructive',
          message: payload?.error?.message || 'Unable to save webhook configuration.',
        });
        return;
      }

      setWebhookUrl(payload.data.org_it_webhook_url || '');
      setHasWebhookSecret(payload.data.has_webhook_secret);
      if (payload.data.new_signing_secret) {
        setNewSigningSecret(payload.data.new_signing_secret);
      }

      setFeedback({
        variant: 'emerald',
        message: rotateSecret
          ? 'Webhook configuration saved and HMAC-SHA256 signing secret rotated.'
          : 'IT provisioning webhook URL saved.',
      });
    } catch {
      setFeedback({ variant: 'destructive', message: 'Network error while saving webhook settings.' });
    } finally {
      setWebhookBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Workspace Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          {organization.org_name} (<code className="text-xs">@{organization.org_domain}</code>) &bull; Team
          RBAC, IT provisioning webhooks, and hybrid billing overview
        </p>
      </div>

      {feedback ? (
        <Alert variant={feedback.variant}>
          {feedback.variant === 'emerald' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </Alert>
      ) : null}

      {/* 1. Billing Plan Overview */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-500" />
                Billing Plan &amp; Monthly Hire Quota
              </CardTitle>
              <CardDescription>
                Hybrid subscription + pay-as-you-go Credit Packs. Unlimited workspace seats included.
              </CardDescription>
            </div>
            <Badge variant={organization.org_subscription_tier === 'free_trial' ? 'amber' : 'emerald'}>
              Current Plan: {organization.org_subscription_tier.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-900">
                Active Monthly Usage: {organization.org_monthly_hires_used} /{' '}
                {organization.org_monthly_hires_limit} hires
              </span>
              <span className="text-xs text-slate-500">
                Resets:{' '}
                {organization.org_quota_reset_at
                  ? new Date(organization.org_quota_reset_at).toLocaleDateString()
                  : 'Monthly'}
              </span>
            </div>
            <Progress value={quotaPct} className="mt-3" />
            {organization.org_subscription_tier === 'free_trial' ? (
              <p className="mt-2.5 text-xs text-amber-800">
                Free Trial packets include a diagonal <code>SAMPLE - FREE TRIAL</code> watermark. Upgrade to
                Starter, Growth, or add a Credit Pack for clean production packets.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Starter', 'PHP 4,900/mo', '15 hires/month • Unwatermarked packets'],
              ['Growth', 'PHP 12,900/mo', '50 hires/month • Signed IT webhooks'],
              ['Credit Pack', 'PHP 4,500 once', '+10 roll-over hire credits (12 mos)'],
            ].map(([planName, price, detail]) => (
              <div key={planName} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">{planName}</p>
                <p className="mt-1 text-lg font-extrabold text-emerald-600">{price}</p>
                <p className="mt-1 text-xs text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 2. IT Provisioning Webhook Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-emerald-500" />
            IT Provisioning Webhook Configuration
          </CardTitle>
          <CardDescription>
            Receive zero-PII JSON events signed with HMAC-SHA256 in the{' '}
            <code>X-StartSlate-Signature</code> header when candidate documents are verified.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook_url">HTTPS Webhook Endpoint URL</Label>
            <Input
              id="webhook_url"
              type="url"
              disabled={!canManageWebhooks || webhookBusy}
              placeholder="https://it-automation.yourcompany.com/webhooks/startslate"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Strict SSRF policy: HTTPS only; localhost and private RFC1918 IP addresses are rejected.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-600" />
              <span className="font-medium text-slate-700">
                HMAC-SHA256 Secret Status:{' '}
                <strong className={hasWebhookSecret ? 'text-emerald-600' : 'text-amber-600'}>
                  {hasWebhookSecret ? 'Configured (AES-256-GCM Encrypted)' : 'Not generated yet'}
                </strong>
              </span>
            </div>
            {canManageWebhooks ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={webhookBusy}
                  onClick={() => handleSaveWebhook(true)}
                >
                  Rotate Signing Secret
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="emerald"
                  disabled={webhookBusy}
                  onClick={() => handleSaveWebhook(false)}
                >
                  {webhookBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Save Endpoint
                </Button>
              </div>
            ) : (
              <Badge variant="secondary">Managed by Org / IT Admin</Badge>
            )}
          </div>

          {newSigningSecret ? (
            <Alert variant="emerald" className="flex-col items-stretch">
              <p className="font-semibold">New Signing Secret (Shown Once — Store Securely)</p>
              <div className="mt-2 flex items-center gap-2">
                <Input readOnly value={newSigningSecret} className="bg-white font-mono text-xs" />
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={() => navigator.clipboard?.writeText(newSigningSecret)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </Button>
              </div>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {/* 3. Team Member Role Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-emerald-500" />
            Team Member Role Management
          </CardTitle>
          <CardDescription>
            Enforce least-privilege access across <code>org_admin</code>, <code>hr_admin</code>,{' '}
            <code>it_admin</code>, and department-scoped <code>department_manager</code> accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {canManageUsers ? (
            <form
              onSubmit={handleInviteSubmit}
              className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-12"
            >
              <div className="space-y-1 md:col-span-3">
                <Label htmlFor="invite_name" className="text-xs">
                  Full Name
                </Label>
                <Input
                  id="invite_name"
                  required
                  placeholder="Alex Cruz"
                  value={inviteForm.full_name}
                  onChange={(e) => setInviteForm((p) => ({ ...p, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label htmlFor="invite_email" className="text-xs">
                  Corporate Email (@{organization.org_domain})
                </Label>
                <Input
                  id="invite_email"
                  type="email"
                  required
                  placeholder={`alex@${organization.org_domain}`}
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="invite_role" className="text-xs">
                  Role
                </Label>
                <select
                  id="invite_role"
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value }))}
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {ROLE_OPTIONS.filter(
                    (opt) => actor.usr_role === 'org_admin' || opt.value !== 'org_admin'
                  ).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="invite_dept" className="text-xs">
                  Department (Managers)
                </Label>
                <Input
                  id="invite_dept"
                  disabled={inviteForm.role !== 'department_manager'}
                  required={inviteForm.role === 'department_manager'}
                  placeholder="Engineering"
                  value={inviteForm.department_name}
                  onChange={(e) => setInviteForm((p) => ({ ...p, department_name: e.target.value }))}
                />
              </div>
              <div className="flex items-end md:col-span-2">
                <Button type="submit" variant="default" className="w-full" disabled={inviteBusy}>
                  {inviteBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Invite
                </Button>
              </div>
            </form>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                  <th className="pb-3 pr-4">Member</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Department Scope</th>
                  <th className="pb-3 text-right">Assigned Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((member) => {
                  const isSelf = member.usr_id === actor.usr_id;
                  const canEditRow =
                    canManageUsers &&
                    !isSelf &&
                    (actor.usr_role === 'org_admin' || member.usr_role !== 'org_admin');

                  return (
                    <tr key={member.usr_id}>
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-slate-900">
                          {member.usr_full_name} {isSelf ? '(You)' : ''}
                        </p>
                        <p className="text-xs text-slate-500">{member.usr_email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={member.usr_status === 'active' ? 'emerald' : 'secondary'}>
                          {member.usr_status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-xs text-slate-600">
                        {member.usr_department_name || 'Organization-wide'}
                      </td>
                      <td className="py-3 text-right">
                        {canEditRow ? (
                          <select
                            aria-label={`Change role for ${member.usr_full_name}`}
                            value={member.usr_role}
                            onChange={(e) => handleRoleChange(member, e.target.value)}
                            className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            {ROLE_OPTIONS.filter(
                              (opt) => actor.usr_role === 'org_admin' || opt.value !== 'org_admin'
                            ).map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge variant="default">{member.usr_role}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
