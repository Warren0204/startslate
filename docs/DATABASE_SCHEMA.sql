-- ============================================================================
-- StartSlate — PostgreSQL Multi-Tenant Schema, B-Tree Indexes, RLS & Storage
-- Target Platform: Supabase PostgreSQL 15+
-- Compliance Baseline: Philippine Data Privacy Act of 2012 (RA 10173)
-- Table Prefixes:
--   organizations         -> org_
--   user_profiles         -> usr_
--   onboarding_hires      -> hire_
--   it_provisioning_tasks -> task_
--   system_audit_logs     -> log_
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Core Multi-Tenant Tables
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organizations (
  org_id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_name                  TEXT NOT NULL CHECK (length(btrim(org_name)) > 0),
  org_domain                TEXT NOT NULL UNIQUE CHECK (org_domain = lower(btrim(org_domain))),
  org_subscription_tier     TEXT NOT NULL DEFAULT 'free_trial'
                            CHECK (org_subscription_tier IN ('free_trial', 'starter', 'growth', 'enterprise')),
  org_monthly_hires_used    INTEGER NOT NULL DEFAULT 0 CHECK (org_monthly_hires_used >= 0),
  org_monthly_hires_limit   INTEGER NOT NULL DEFAULT 3 CHECK (org_monthly_hires_limit > 0),
  org_quota_reset_at        TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', now()) + INTERVAL '1 month'),
  org_it_webhook_url        TEXT,
  org_it_webhook_secret_enc TEXT,
  org_it_rules_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  org_dpo_email             TEXT,
  org_retention_days        INTEGER NOT NULL DEFAULT 90 CHECK (org_retention_days BETWEEN 30 AND 3650),
  org_created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  usr_id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  usr_org_id                UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  usr_email                 TEXT NOT NULL UNIQUE CHECK (usr_email = lower(btrim(usr_email))),
  usr_full_name             TEXT NOT NULL CHECK (length(btrim(usr_full_name)) > 0),
  usr_role                  TEXT NOT NULL
                            CHECK (usr_role IN ('org_admin', 'hr_admin', 'it_admin', 'department_manager')),
  usr_department_name       TEXT,
  usr_status                TEXT NOT NULL DEFAULT 'active'
                            CHECK (usr_status IN ('invited', 'active', 'disabled')),
  usr_created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  usr_updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_usr_department_required_for_manager CHECK (
    usr_role <> 'department_manager'
    OR (usr_department_name IS NOT NULL AND length(btrim(usr_department_name)) > 0)
  )
);

CREATE TABLE IF NOT EXISTS public.onboarding_hires (
  hire_id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hire_org_id                  UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  hire_created_by_usr_id       UUID NOT NULL REFERENCES public.user_profiles(usr_id),
  hire_status                  TEXT NOT NULL DEFAULT 'offer_uploaded'
                               CHECK (hire_status IN (
                                 'offer_uploaded',
                                 'pending_candidate_docs',
                                 'docs_verified',
                                 'it_provisioning',
                                 'day1_ready'
                               )),
  hire_full_name               TEXT NOT NULL CHECK (length(btrim(hire_full_name)) > 0),
  -- Nullable while in offer_uploaded: AI extraction may miss fields, which
  -- forces HITL review. chk_hire_required_after_offer enforces them afterwards.
  hire_personal_email          TEXT,
  hire_work_email              TEXT,
  hire_job_title               TEXT,
  hire_department_name         TEXT,
  hire_start_date              DATE,
  hire_employment_type         TEXT NOT NULL DEFAULT 'full_time',
  hire_base_salary_amount      NUMERIC(14, 2),
  hire_salary_currency         TEXT NOT NULL DEFAULT 'PHP',
  hire_offer_letter_path       TEXT,
  hire_gov_id_image_path       TEXT,
  hire_gov_id_type             TEXT,
  hire_gov_id_number_enc       TEXT,
  hire_extracted_pii_json      JSONB,
  hire_ai_confidence_score     NUMERIC(4, 3)
                               CHECK (
                                 hire_ai_confidence_score IS NULL
                                 OR (hire_ai_confidence_score >= 0 AND hire_ai_confidence_score <= 1)
                               ),
  hire_needs_hitl_review       BOOLEAN NOT NULL DEFAULT false,
  hire_hitl_reviewed_by_usr_id UUID REFERENCES public.user_profiles(usr_id),
  hire_hitl_reviewed_at        TIMESTAMPTZ,
  hire_portal_token_hash       TEXT UNIQUE,
  hire_portal_token_expires_at TIMESTAMPTZ,
  hire_consent_accepted_at     TIMESTAMPTZ,
  hire_consent_version         TEXT,
  hire_packet_pdf_path         TEXT,
  hire_created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  hire_updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_hire_required_after_offer CHECK (
    hire_status = 'offer_uploaded'
    OR (
      hire_personal_email IS NOT NULL
      AND hire_job_title IS NOT NULL
      AND hire_department_name IS NOT NULL
      AND hire_start_date IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS public.it_provisioning_tasks (
  task_id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_org_id                  UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE CASCADE,
  task_hire_id                 UUID NOT NULL REFERENCES public.onboarding_hires(hire_id) ON DELETE CASCADE,
  task_title                   TEXT NOT NULL CHECK (length(btrim(task_title)) > 0),
  task_category                TEXT NOT NULL CHECK (task_category IN ('hardware', 'iam', 'saas', 'security')),
  task_status                  TEXT NOT NULL DEFAULT 'pending'
                               CHECK (task_status IN ('pending', 'in_progress', 'completed', 'blocked')),
  task_assigned_to_usr_id      UUID REFERENCES public.user_profiles(usr_id),
  task_completed_by_usr_id     UUID REFERENCES public.user_profiles(usr_id),
  task_completed_at            TIMESTAMPTZ,
  task_notes                   TEXT,
  task_webhook_status          TEXT NOT NULL DEFAULT 'not_configured'
                               CHECK (task_webhook_status IN ('not_configured', 'pending', 'delivered', 'failed')),
  task_webhook_last_attempt_at TIMESTAMPTZ,
  task_created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  task_updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_audit_logs (
  log_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT (not CASCADE): the append-only RULEs below would rewrite a cascaded
  -- DELETE into a no-op and raise an RI error. Tenant offboarding must use a
  -- deliberate, privileged retention-purge procedure instead.
  log_org_id        UUID NOT NULL REFERENCES public.organizations(org_id) ON DELETE RESTRICT,
  -- Intentionally NOT a foreign key: ON DELETE SET NULL would issue an UPDATE
  -- that the append-only rule blocks. Audit history must outlive user accounts.
  log_actor_usr_id  UUID,
  log_actor_role    TEXT NOT NULL
                    CHECK (log_actor_role IN (
                      'org_admin',
                      'hr_admin',
                      'it_admin',
                      'department_manager',
                      'candidate_portal',
                      'system'
                    )),
  log_action        TEXT NOT NULL CHECK (length(btrim(log_action)) > 0),
  log_entity_type   TEXT NOT NULL
                    CHECK (log_entity_type IN (
                      'organization',
                      'user_profile',
                      'onboarding_hire',
                      'it_provisioning_task'
                    )),
  log_entity_id     UUID NOT NULL,
  log_ip_hash       TEXT,
  log_metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  log_created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. B-Tree Indexes for Multi-Tenant Query Performance
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_organizations_domain
  ON public.organizations USING btree (org_domain);

CREATE INDEX IF NOT EXISTS idx_user_profiles_org_role
  ON public.user_profiles USING btree (usr_org_id, usr_role);

CREATE INDEX IF NOT EXISTS idx_user_profiles_org_dept
  ON public.user_profiles USING btree (usr_org_id, usr_department_name);

CREATE INDEX IF NOT EXISTS idx_onboarding_hires_org_status
  ON public.onboarding_hires USING btree (hire_org_id, hire_status);

CREATE INDEX IF NOT EXISTS idx_onboarding_hires_org_dept
  ON public.onboarding_hires USING btree (hire_org_id, hire_department_name);

CREATE INDEX IF NOT EXISTS idx_onboarding_hires_hitl_queue
  ON public.onboarding_hires USING btree (hire_org_id, hire_needs_hitl_review, hire_created_at);

CREATE INDEX IF NOT EXISTS idx_onboarding_hires_start_date
  ON public.onboarding_hires USING btree (hire_org_id, hire_start_date);

CREATE INDEX IF NOT EXISTS idx_onboarding_hires_portal_token_hash
  ON public.onboarding_hires USING btree (hire_portal_token_hash);

CREATE INDEX IF NOT EXISTS idx_it_tasks_org_status
  ON public.it_provisioning_tasks USING btree (task_org_id, task_status);

CREATE INDEX IF NOT EXISTS idx_it_tasks_hire_status
  ON public.it_provisioning_tasks USING btree (task_hire_id, task_status);

CREATE INDEX IF NOT EXISTS idx_it_tasks_assigned_usr
  ON public.it_provisioning_tasks USING btree (task_assigned_to_usr_id, task_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_it_tasks_hire_title
  ON public.it_provisioning_tasks USING btree (task_hire_id, lower(task_title));

CREATE INDEX IF NOT EXISTS idx_system_audit_logs_org_created
  ON public.system_audit_logs USING btree (log_org_id, log_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_audit_logs_entity
  ON public.system_audit_logs USING btree (log_entity_type, log_entity_id);

CREATE INDEX IF NOT EXISTS idx_system_audit_logs_action
  ON public.system_audit_logs USING btree (log_org_id, log_action);

-- ----------------------------------------------------------------------------
-- 3. Automatic Timestamp Triggers (Mutable Tables Only)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'organizations' THEN
    NEW.org_updated_at := now();
  ELSIF TG_TABLE_NAME = 'user_profiles' THEN
    NEW.usr_updated_at := now();
  ELSIF TG_TABLE_NAME = 'onboarding_hires' THEN
    NEW.hire_updated_at := now();
  ELSIF TG_TABLE_NAME = 'it_provisioning_tasks' THEN
    NEW.task_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_onboarding_hires_updated_at ON public.onboarding_hires;
CREATE TRIGGER trg_onboarding_hires_updated_at
  BEFORE UPDATE ON public.onboarding_hires
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_it_provisioning_tasks_updated_at ON public.it_provisioning_tasks;
CREATE TRIGGER trg_it_provisioning_tasks_updated_at
  BEFORE UPDATE ON public.it_provisioning_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Atomic Monthly Hire Quota RPC
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_org_hire_quota(p_org_id UUID)
RETURNS TABLE (
  org_monthly_hires_used  INTEGER,
  org_monthly_hires_limit INTEGER,
  org_subscription_tier   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset monthly counter if the billing window has elapsed
  UPDATE public.organizations
     SET org_monthly_hires_used = 0,
         org_quota_reset_at     = date_trunc('month', now()) + INTERVAL '1 month'
   WHERE org_id = p_org_id
     AND org_quota_reset_at <= now();

  RETURN QUERY
  UPDATE public.organizations o
     SET org_monthly_hires_used = o.org_monthly_hires_used + 1
   WHERE o.org_id = p_org_id
     AND o.org_monthly_hires_used < o.org_monthly_hires_limit
  RETURNING o.org_monthly_hires_used, o.org_monthly_hires_limit, o.org_subscription_tier;
END;
$$;

-- The quota RPC is SECURITY DEFINER and accepts any org id, so it must never be
-- callable with the public anon key or a tenant session. Server-side only.
REVOKE EXECUTE ON FUNCTION public.consume_org_hire_quota(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_org_hire_quota(UUID) TO service_role;

-- Compensating refund used when hire creation fails after quota was consumed.
CREATE OR REPLACE FUNCTION public.release_org_hire_quota(p_org_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.organizations
     SET org_monthly_hires_used = GREATEST(org_monthly_hires_used - 1, 0)
   WHERE org_id = p_org_id;
$$;

REVOKE EXECUTE ON FUNCTION public.release_org_hire_quota(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_org_hire_quota(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Strict Append-Only Immutability on system_audit_logs
-- ----------------------------------------------------------------------------

REVOKE UPDATE, DELETE, TRUNCATE ON public.system_audit_logs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE RULE prevent_system_audit_logs_update AS
  ON UPDATE TO public.system_audit_logs
  DO INSTEAD NOTHING;

CREATE OR REPLACE RULE prevent_system_audit_logs_delete AS
  ON DELETE TO public.system_audit_logs
  DO INSTEAD NOTHING;

-- ----------------------------------------------------------------------------
-- 6. Row-Level Security (RLS) Helpers & Policies
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_usr_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT usr_org_id
    FROM public.user_profiles
   WHERE usr_id = auth.uid()
     AND usr_status = 'active'
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_usr_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT usr_role
    FROM public.user_profiles
   WHERE usr_id = auth.uid()
     AND usr_status = 'active'
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_usr_department()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT usr_department_name
    FROM public.user_profiles
   WHERE usr_id = auth.uid()
     AND usr_status = 'active'
   LIMIT 1;
$$;

-- Department membership check that bypasses onboarding_hires RLS (which is
-- restricted to HR). Used by the it_provisioning_tasks policy for managers.
CREATE OR REPLACE FUNCTION public.hire_in_current_usr_department(p_hire_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.onboarding_hires h
     WHERE h.hire_id = p_hire_id
       AND h.hire_org_id = public.current_usr_org_id()
       AND lower(h.hire_department_name) = lower(public.current_usr_department())
  );
$$;

ALTER TABLE public.organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_hires      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_provisioning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_audit_logs     ENABLE ROW LEVEL SECURITY;

-- organizations policies
DROP POLICY IF EXISTS org_select_own ON public.organizations;
CREATE POLICY org_select_own ON public.organizations
  FOR SELECT
  USING (org_id = public.current_usr_org_id());

DROP POLICY IF EXISTS org_update_admin ON public.organizations;
CREATE POLICY org_update_admin ON public.organizations
  FOR UPDATE
  USING (
    org_id = public.current_usr_org_id()
    AND public.current_usr_role() IN ('org_admin', 'hr_admin', 'it_admin')
  )
  WITH CHECK (
    org_id = public.current_usr_org_id()
    AND public.current_usr_role() IN ('org_admin', 'hr_admin', 'it_admin')
  );

-- Column-level guard: tenants must never self-edit billing, quota, or the
-- encrypted webhook secret. Those columns are written only via service_role.
REVOKE UPDATE ON public.organizations FROM anon, authenticated;
GRANT UPDATE (org_name, org_it_webhook_url, org_it_rules_json, org_dpo_email, org_retention_days)
  ON public.organizations TO authenticated;

-- user_profiles policies
DROP POLICY IF EXISTS usr_select_same_org ON public.user_profiles;
CREATE POLICY usr_select_same_org ON public.user_profiles
  FOR SELECT
  USING (usr_org_id = public.current_usr_org_id());

DROP POLICY IF EXISTS usr_manage_org_hr ON public.user_profiles;
-- hr_admin may manage non-org_admin members only (no self-promotion to org_admin).
CREATE POLICY usr_manage_org_hr ON public.user_profiles
  FOR ALL
  USING (
    usr_org_id = public.current_usr_org_id()
    AND (
      public.current_usr_role() = 'org_admin'
      OR (public.current_usr_role() = 'hr_admin' AND usr_role <> 'org_admin')
    )
  )
  WITH CHECK (
    usr_org_id = public.current_usr_org_id()
    AND (
      public.current_usr_role() = 'org_admin'
      OR (public.current_usr_role() = 'hr_admin' AND usr_role <> 'org_admin')
    )
  );

-- onboarding_hires policies
-- RLS is row-level only: any role allowed to SELECT the base table can read
-- every column (salary, Gov ID paths, extracted PII). Base-table reads are
-- therefore HR-only; it_admin and department_manager read the redacted view.
DROP POLICY IF EXISTS hire_select_scoped ON public.onboarding_hires;
DROP POLICY IF EXISTS hire_select_hr ON public.onboarding_hires;
CREATE POLICY hire_select_hr ON public.onboarding_hires
  FOR SELECT
  USING (
    hire_org_id = public.current_usr_org_id()
    AND public.current_usr_role() IN ('org_admin', 'hr_admin')
  );

DROP POLICY IF EXISTS hire_insert_hr ON public.onboarding_hires;
CREATE POLICY hire_insert_hr ON public.onboarding_hires
  FOR INSERT
  WITH CHECK (
    hire_org_id = public.current_usr_org_id()
    AND public.current_usr_role() IN ('org_admin', 'hr_admin')
  );

DROP POLICY IF EXISTS hire_update_hr ON public.onboarding_hires;
CREATE POLICY hire_update_hr ON public.onboarding_hires
  FOR UPDATE
  USING (
    hire_org_id = public.current_usr_org_id()
    AND public.current_usr_role() IN ('org_admin', 'hr_admin')
  )
  WITH CHECK (
    hire_org_id = public.current_usr_org_id()
    AND public.current_usr_role() IN ('org_admin', 'hr_admin')
  );

DROP POLICY IF EXISTS hire_delete_hr ON public.onboarding_hires;
CREATE POLICY hire_delete_hr ON public.onboarding_hires
  FOR DELETE
  USING (
    hire_org_id = public.current_usr_org_id()
    AND public.current_usr_role() IN ('org_admin', 'hr_admin')
  );

-- it_provisioning_tasks policies
DROP POLICY IF EXISTS task_select_scoped ON public.it_provisioning_tasks;
CREATE POLICY task_select_scoped ON public.it_provisioning_tasks
  FOR SELECT
  USING (
    task_org_id = public.current_usr_org_id()
    AND (
      public.current_usr_role() IN ('org_admin', 'hr_admin', 'it_admin')
      OR (
        public.current_usr_role() = 'department_manager'
        AND public.hire_in_current_usr_department(task_hire_id)
      )
    )
  );

DROP POLICY IF EXISTS task_insert_hr_it ON public.it_provisioning_tasks;
CREATE POLICY task_insert_hr_it ON public.it_provisioning_tasks
  FOR INSERT
  WITH CHECK (
    task_org_id = public.current_usr_org_id()
    AND public.current_usr_role() IN ('org_admin', 'hr_admin', 'it_admin')
  );

DROP POLICY IF EXISTS task_update_it ON public.it_provisioning_tasks;
CREATE POLICY task_update_it ON public.it_provisioning_tasks
  FOR UPDATE
  USING (
    task_org_id = public.current_usr_org_id()
    AND public.current_usr_role() IN ('org_admin', 'it_admin')
  )
  WITH CHECK (
    task_org_id = public.current_usr_org_id()
    AND public.current_usr_role() IN ('org_admin', 'it_admin')
  );

-- system_audit_logs policies (append-only: SELECT + INSERT only)
DROP POLICY IF EXISTS log_select_admins ON public.system_audit_logs;
CREATE POLICY log_select_admins ON public.system_audit_logs
  FOR SELECT
  USING (
    log_org_id = public.current_usr_org_id()
    AND public.current_usr_role() IN ('org_admin', 'hr_admin', 'it_admin')
  );

DROP POLICY IF EXISTS log_insert_org_actor ON public.system_audit_logs;
-- Sessions may only log as themselves (no forged actors). candidate_portal and
-- system events are written server-side via service_role.
CREATE POLICY log_insert_org_actor ON public.system_audit_logs
  FOR INSERT
  WITH CHECK (
    log_org_id = public.current_usr_org_id()
    AND log_actor_usr_id = auth.uid()
    AND log_actor_role = public.current_usr_role()
  );

-- ----------------------------------------------------------------------------
-- 7. Restricted Redaction View for Non-HR Operational Queries
-- ----------------------------------------------------------------------------

-- Definer-rights view (owner bypasses base-table RLS) with tenant + department
-- scoping embedded in the WHERE clause. security_barrier prevents predicate
-- push-down leaks. This is the ONLY hire read path for it_admin / managers.
CREATE OR REPLACE VIEW public.onboarding_hires_redacted_v
WITH (security_barrier = true) AS
SELECT
  hire_id,
  hire_org_id,
  hire_created_by_usr_id,
  hire_status,
  hire_full_name,
  NULL::text        AS hire_personal_email,
  hire_work_email,
  hire_job_title,
  hire_department_name,
  hire_start_date,
  hire_employment_type,
  NULL::numeric     AS hire_base_salary_amount,
  NULL::text        AS hire_salary_currency,
  NULL::text        AS hire_offer_letter_path,
  NULL::text        AS hire_gov_id_image_path,
  NULL::text        AS hire_gov_id_type,
  NULL::text        AS hire_gov_id_number_enc,
  NULL::jsonb       AS hire_extracted_pii_json,
  hire_ai_confidence_score,
  hire_needs_hitl_review,
  hire_hitl_reviewed_by_usr_id,
  hire_hitl_reviewed_at,
  hire_consent_accepted_at,
  hire_consent_version,
  NULL::text        AS hire_packet_pdf_path,
  hire_created_at,
  hire_updated_at
FROM public.onboarding_hires
WHERE hire_org_id = public.current_usr_org_id()
  AND (
    public.current_usr_role() IN ('org_admin', 'hr_admin', 'it_admin')
    OR (
      public.current_usr_role() = 'department_manager'
      AND lower(hire_department_name) = lower(public.current_usr_department())
    )
  );

REVOKE ALL ON public.onboarding_hires_redacted_v FROM PUBLIC, anon;
GRANT SELECT ON public.onboarding_hires_redacted_v TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Private Supabase Storage Bucket (onboarding-docs) & Object RLS
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-docs',
  'onboarding-docs',
  false,
  5242880,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS onboarding_docs_hr_select ON storage.objects;
CREATE POLICY onboarding_docs_hr_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'onboarding-docs'
    AND (storage.foldername(name))[1] = public.current_usr_org_id()::text
    AND public.current_usr_role() IN ('org_admin', 'hr_admin')
  );

DROP POLICY IF EXISTS onboarding_docs_hr_insert ON storage.objects;
CREATE POLICY onboarding_docs_hr_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'onboarding-docs'
    AND (storage.foldername(name))[1] = public.current_usr_org_id()::text
    AND public.current_usr_role() IN ('org_admin', 'hr_admin')
  );

DROP POLICY IF EXISTS onboarding_docs_hr_delete ON storage.objects;
CREATE POLICY onboarding_docs_hr_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'onboarding-docs'
    AND (storage.foldername(name))[1] = public.current_usr_org_id()::text
    AND public.current_usr_role() IN ('org_admin', 'hr_admin')
  );
