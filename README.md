# StartSlate

> **A clean slate for every new hire.**

StartSlate is a multi-tenant, mobile-responsive B2B SaaS application for **Automated New-Hire Onboarding Paperwork & IT Provisioning**, designed around the **Philippine Data Privacy Act of 2012 (RA 10173)**.

## Core Capabilities

- **AI Document Extraction & HITL Verification:** Parses Offer Letter PDFs and Government IDs via Google Gemini 2.5 Flash (`gemini-2.5-flash`) with strict JSON schemas and Zod validation. Low-confidence extractions (`< 0.85`) automatically pause for split-screen HR verification.
- **Deterministic Onboarding Lifecycle:** Enforces a 5-stage Finite State Machine (`offer_uploaded` -> `pending_candidate_docs` -> `docs_verified` -> `it_provisioning` -> `day1_ready`) with atomic monthly hire quota controls.
- **Passwordless Candidate Portal:** Mobile-first self-service portal (`/portal/[token]`) gated by 256-bit expiring tokens, explicit RA 10173 consent capture, and Government ID upload (`< 5MB`, binary magic-byte verified).
- **Automated IT Provisioning:** Maps new-hire departments to IT checklists and dispatches zero-PII, HMAC-SHA256 signed webhooks (`X-StartSlate-Signature`), automatically marking hires `day1_ready` upon checklist completion.
- **Flattened Onboarding Packets:** Compiles tamper-evident Employee Onboarding Summary & NDA PDFs via `pdf-lib` (watermarked `"SAMPLE - FREE TRIAL"` on trial plans) served through 60-second expiring Signed URLs.

## Tech Stack

- **Framework:** Next.js 15 (App Router, plain JavaScript `.js` / `.jsx`)
- **UI:** Tailwind CSS, `shadcn/ui`, `lucide-react`
- **Database, Auth & Storage:** Supabase PostgreSQL (RLS + private `onboarding-docs` bucket)
- **AI & PDF:** Google Gemini 2.5 Flash (`@google/genai`), `pdf-lib`, `zod`

## Architecture & Security

StartSlate follows a decoupled 4-layer architecture (detailed in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/DATABASE_SCHEMA.sql`](docs/DATABASE_SCHEMA.sql)):

- `src/app/` & `src/components/` — Pages, mobile portal, and thin `/api/**` controllers
- `src/services/` — Onboarding FSM, quota enforcement, IT provisioning, and packet compilation
- `src/integrations/` — Gemini 2.5 Flash, `pdf-lib`, and Supabase Storage adapters
- `src/repositories/` — Prefixed PostgreSQL repositories (`org_`, `usr_`, `hire_`, `task_`, `log_`) with automatic PII redaction for `it_admin` and `department_manager`
- `src/lib/security/` — Corporate domain signup guard, 4-role RBAC (`org_admin`, `hr_admin`, `it_admin`, `department_manager`), binary magic-byte validator, and AES-256-GCM field encryption

## Quickstart

```bash
cp .env.example .env.local   # Configure Supabase, Gemini API, and PII_ENCRYPTION_KEY
npm install
npm test
npm run dev
```
