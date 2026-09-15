-- Live updates for reception's "Awaiting payment" queue.
--
-- The first real-time sync in the app. Until now every screen fetched on
-- load and polled. The queue has to move the moment a dentist finishes
-- treatment and the moment a payment lands, on every receptionist's tablet
-- at once, so the dashboard subscribes to Supabase Realtime's postgres
-- changes for the three tables that decide what the queue shows:
--
--   appointments  a dentist finishing treatment; a patient checked out
--   invoices      the totals trigger moving a bill to paid
--   payments      money recorded
--
-- Realtime delivers a change only to a subscriber whose RLS SELECT policy
-- admits the row, so this widens nobody's access: a subscriber receives
-- exactly the rows they could already query. Reception already reads all
-- three (0002).
--
-- The client treats an event as "something changed, refetch", never as data
-- to apply — the queue is always rebuilt from a normal query, so a missed or
-- duplicated event can make it late, never wrong.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['appointments', 'invoices', 'payments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
