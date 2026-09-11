-- Phase 5: audit logging.
--
-- The audit_log table has existed since 0001_schema.sql, but nothing wrote
-- to it. This migration makes it real, and makes it trustworthy.
--
-- The central decision: **writes are logged by database triggers, not by
-- the app.** A client-written audit log is worthless for compliance —
-- the client that skips the log entry is exactly the client you need the
-- log for. A trigger fires no matter what wrote the row: this app, a
-- future app, the Supabase SQL editor, or a psql session.
--
-- Reads are the exception. PostgreSQL has no SELECT trigger, so a "who
-- looked at this record" entry can only come from the client. Those
-- entries carry a genuinely weaker guarantee than the write entries, and
-- the operation column keeps the two distinguishable rather than blurring
-- them into one undifferentiated log.

alter table audit_log
  add column operation text not null default 'view'
    check (operation in ('insert', 'update', 'delete', 'view')),
  -- Answers the question the Data Privacy Act actually asks: who has
  -- touched this patient's record? Resolved through the owning row for
  -- tables that don't carry patient_id themselves.
  --
  -- Deliberately NOT a foreign key. An audit entry has to outlive its
  -- subject: the AFTER DELETE trigger on patients writes a row naming the
  -- patient that was just deleted, which a foreign key would reject —
  -- making patients undeletable. And a cascade would erase the very
  -- evidence that the deletion happened.
  add column patient_id uuid,
  -- Field NAMES only, never values. Storing before/after values would
  -- turn the audit log into a second copy of every medical history ever
  -- written — a larger breach surface, in the name of protecting it.
  -- "Which fields changed, by whom, when" plus a restorable backup covers
  -- the forensic need without duplicating the PHI.
  add column changed_fields text[];

alter table audit_log alter column operation drop default;

create index audit_log_patient_id_idx on audit_log (patient_id, created_at desc);
create index audit_log_staff_id_idx on audit_log (staff_id, created_at desc);
create index audit_log_table_name_idx on audit_log (table_name, created_at desc);

-- --- The trigger ---------------------------------------------------------
--
-- SECURITY DEFINER so the insert cannot be refused by the acting user's own
-- policies: nobody gets to opt out of being logged. It deliberately does
-- NOT swallow errors — if the log can't be written the transaction fails,
-- because an unaudited write to a health record is worse than a failed one.

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_changed text[];
  v_patient_id uuid;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
      from jsonb_each(to_jsonb(new)) n
      where n.value is distinct from (to_jsonb(old) -> n.key);
    -- An update that changed nothing is not an event worth recording.
    if v_changed is null then
      return null;
    end if;
  end if;

  -- Tables that don't carry patient_id are resolved through their parent,
  -- so a patient's full access history is one indexed query rather than a
  -- join across ten tables.
  v_patient_id := case tg_table_name
    when 'patients' then (v_row ->> 'id')::uuid
    when 'visit_notes' then (select patient_id from visits where id = (v_row ->> 'visit_id')::uuid)
    when 'invoice_items' then (select patient_id from invoices where id = (v_row ->> 'invoice_id')::uuid)
    when 'payments' then (select patient_id from invoices where id = (v_row ->> 'invoice_id')::uuid)
    else nullif(v_row ->> 'patient_id', '')::uuid
  end;

  insert into audit_log (staff_id, action, operation, table_name, record_id, patient_id, changed_fields)
  values (
    auth.uid(),
    lower(tg_op) || ' ' || tg_table_name,
    lower(tg_op),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    v_patient_id,
    v_changed
  );

  return null;
end;
$$;

-- Every table holding patient data, money, or access control. clinic_settings
-- is deliberately excluded: its id is a smallint rather than a uuid, and it
-- holds no personal data.
do $$
declare
  t text;
begin
  foreach t in array array[
    'patients', 'medical_histories', 'dental_histories', 'consents',
    'visits', 'visit_notes', 'tooth_records', 'patient_files',
    'invoices', 'invoice_items', 'payments',
    'staff', 'procedures'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on %I
         for each row execute function public.audit_row_change()',
      'audit_' || t, t
    );
  end loop;
end;
$$;

-- --- Tightening the log's own policies ----------------------------------
--
-- 0002_rls.sql let any active staff member insert any audit row for
-- themselves. That let a client forge an 'update' entry that no update
-- caused. Writes now come from the trigger (which bypasses RLS as a
-- definer), so the client's insert right narrows to view entries only.

drop policy "active staff insert audit_log" on audit_log;

create policy "active staff log own views" on audit_log for insert
  with check (
    current_staff_role() is not null
    and staff_id = auth.uid()
    and operation = 'view'
  );

-- Same reasoning for staff_id, which 0001_schema.sql declared as a foreign
-- key to staff: staff.id cascades from auth.users, so deleting an auth user
-- would have been blocked by their own audit trail. The audit log keeps the
-- uuid; who it belonged to is resolved at read time, and survives if the
-- staff row is gone.
alter table audit_log drop constraint audit_log_staff_id_fkey;

-- There is deliberately no update or delete policy on audit_log for any
-- role, admin included — default-deny makes the log append-only, so it
-- cannot be quietly edited after the fact. Removing entries means dropping
-- to the service role, which is itself an auditable act.
