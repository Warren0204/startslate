/**
 * @file src/app/page.jsx
 * @description Public B2B landing page for StartSlate featuring an interactive no-signup demo, features, and hybrid pricing.
 */

import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Cpu,
  FileCheck2,
  Lock,
  ShieldCheck,
  Smartphone,
  Webhook,
} from 'lucide-react';

import { OfferDemoDropzone } from '../components/landing/OfferDemoDropzone.jsx';
import { SiteFooter } from '../components/layout/SiteFooter.jsx';
import { SiteHeader } from '../components/layout/SiteHeader.jsx';
import { Badge } from '../components/ui/badge.jsx';
import { Button } from '../components/ui/button.jsx';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card.jsx';

const FEATURES = [
  {
    icon: Cpu,
    title: 'Gemini 2.5 Flash + HITL Guardrail',
    description:
      'Strict JSON schema extraction for Offer Letters and Government IDs. Confidence scores below 0.85 automatically trigger split-screen HR verification.',
  },
  {
    icon: Smartphone,
    title: 'Passwordless Mobile Candidate Portal',
    description:
      'Candidates verify pre-filled offer details, grant RA 10173 consent, and snap their Government ID via a 256-bit expiring link — no account needed.',
  },
  {
    icon: Webhook,
    title: 'Zero-PII IT Provisioning & Webhooks',
    description:
      'Maps hire department to custom IT checklists and dispatches HMAC-SHA256 signed webhooks (X-StartSlate-Signature) without leaking salary or ID data.',
  },
  {
    icon: Lock,
    title: '3-Layer Role-Based PII Redaction',
    description:
      'PostgreSQL RLS, security-barrier redacted views, and repository guards ensure IT admins and managers never see compensation or Gov ID scans.',
  },
  {
    icon: FileCheck2,
    title: 'Flattened Audit-Ready Onboarding Packets',
    description:
      'Compiles a tamper-evident Employee Onboarding Summary & Mutual NDA PDF served strictly through 60-second expiring Signed URLs.',
  },
  {
    icon: ShieldCheck,
    title: 'Built for RA 10173 & Enterprise Security',
    description:
      'AES-256-GCM field-level encryption, binary magic-byte upload inspection (<5MB), corporate-domain signup gates, and append-only audit logs.',
  },
];

const PRICING_TIERS = [
  {
    name: 'Free Trial',
    badge: 'No Credit Card',
    price: 'PHP 0',
    cadence: '3 hires / month',
    description: 'Validate StartSlate end-to-end with your HR and IT team.',
    highlight: false,
    cta: 'Start Free Trial',
    features: [
      'Up to 3 active hires per month',
      'Gemini 2.5 Flash Offer & Gov ID parsing',
      'Passwordless candidate mobile portal',
      'Sample watermarked onboarding PDF packets',
      'Corporate domain & RLS tenant isolation',
    ],
  },
  {
    name: 'Starter',
    badge: 'Growing Teams',
    price: 'PHP 4,900',
    cadence: 'per month • 15 hires',
    description: 'Production onboarding automation for high-velocity SMEs.',
    highlight: false,
    cta: 'Choose Starter',
    features: [
      '15 onboarded hires per month',
      'Clean unwatermarked flattened PDF packets',
      'Department-to-IT checklist automation',
      'Role-based access (Org, HR, IT, Manager)',
      'Append-only RA 10173 compliance audit log',
    ],
  },
  {
    name: 'Growth',
    badge: 'Most Popular',
    price: 'PHP 12,900',
    cadence: 'per month • 50 hires',
    description: 'Full IT automation and enterprise webhook orchestration.',
    highlight: true,
    cta: 'Launch Growth',
    features: [
      '50 onboarded hires per month',
      'HMAC-SHA256 signed IT provisioning webhooks',
      'Custom department IT task templates',
      'Split-screen HITL verification workflow',
      'Dedicated DPO retention controls & priority SLA',
    ],
  },
  {
    name: 'Credit Pack',
    badge: 'Hybrid Pay-As-You-Go',
    price: 'PHP 4,500',
    cadence: 'per 10 hire credits',
    description: 'Top-up seasonal hiring surges with never-expiring hire credits.',
    highlight: false,
    cta: 'Buy Credit Pack',
    features: [
      '10 roll-over hire credits (valid 12 months)',
      'Stacks cleanly on Starter or Growth plans',
      'Unwatermarked NDA & summary PDF packets',
      'Full AI extraction + AES-256-GCM encryption',
      'Zero seat fees for HR, IT, or Managers',
    ],
  },
];

/**
 * StartSlate public marketing landing page.
 *
 * @description Renders hero section, interactive no-signup Offer Letter demo, feature grid, and hybrid pricing table.
 * @param {void} _unused - Takes no props.
 * @returns {import('react').ReactElement} Full landing page.
 * @throws {Error} Never throws.
 */
export default function LandingPage(_unused) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-slate-900 pb-20 pt-16 text-white sm:pt-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <Badge
                  variant="emerald"
                  className="border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                >
                  RA 10173 Compliant B2B Onboarding &amp; IT Provisioning
                </Badge>
                <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                  A clean slate for every new hire.
                </h1>
                <p className="mt-5 text-lg leading-relaxed text-slate-300">
                  Turn signed Offer Letters into verified employee packets and Day-1 IT checklists in
                  minutes — with Human-in-the-Loop AI verification and strict salary &amp; Gov ID redaction
                  for non-HR roles.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button variant="emerald" size="lg" asChild>
                    <Link href="/signup">
                      Start Free Trial
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white"
                    asChild
                  >
                    <Link href="#demo">Try Offer Letter Demo</Link>
                  </Button>
                </div>

                <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-800 pt-6 text-xs text-slate-400">
                  <div>
                    <p className="text-base font-bold text-white">AES-256-GCM</p>
                    <p>Gov ID field encryption</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-emerald-400">60-Second</p>
                    <p>Expiring Signed URLs</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">Zero PII</p>
                    <p>In IT webhooks &amp; views</p>
                  </div>
                </div>
              </div>

              <div id="demo" className="lg:col-span-6">
                <OfferDemoDropzone />
              </div>
            </div>
          </div>
        </section>

        {/* Feature Highlights */}
        <section id="features" className="py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="secondary">4-Layer Decoupled Security Architecture</Badge>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Built for HR speed, IT precision, and DPO peace of mind
              </h2>
              <p className="mt-3 text-base text-slate-600">
                Every onboarding moves cleanly through a deterministic 5-stage Finite State Machine from
                Offer Uploaded to Day-1 Ready.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title} className="transition-shadow hover:shadow-md">
                    <CardHeader>
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-emerald-400">
                        <Icon className="h-5 w-5" />
                      </span>
                      <CardTitle className="pt-3 text-base">{feature.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed text-slate-600">{feature.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Hybrid Pricing Table */}
        <section id="pricing" className="border-t border-slate-200 bg-white py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="emerald">Hybrid SaaS + Top-Up Credits</Badge>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Predictable monthly plans with flexible Credit Packs
              </h2>
              <p className="mt-3 text-base text-slate-600">
                Unlimited HR, IT, and Department Manager seats included on every tier. Pay only for active
                monthly onboardings.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {PRICING_TIERS.map((tier) => (
                <Card
                  key={tier.name}
                  className={`flex flex-col justify-between ${
                    tier.highlight
                      ? 'border-2 border-emerald-500 ring-4 ring-emerald-500/10'
                      : 'border-slate-200'
                  }`}
                >
                  <div>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle>{tier.name}</CardTitle>
                        <Badge variant={tier.highlight ? 'emerald' : 'secondary'}>{tier.badge}</Badge>
                      </div>
                      <div className="pt-4">
                        <span className="text-3xl font-extrabold text-slate-900">{tier.price}</span>
                        <span className="ml-1.5 text-xs font-medium text-slate-500">{tier.cadence}</span>
                      </div>
                      <CardDescription className="pt-2">{tier.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2.5 text-sm text-slate-700">
                        {tier.features.map((item) => (
                          <li key={item} className="flex items-start gap-2">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </div>
                  <CardFooter className="pt-4">
                    <Button
                      variant={tier.highlight ? 'emerald' : 'default'}
                      className="w-full"
                      asChild
                    >
                      <Link href="/signup">{tier.cta}</Link>
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
