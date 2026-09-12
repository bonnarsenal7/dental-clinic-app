"""Removes staff accounts — the `staff` row and the login behind it.

    python3 scripts/clear-staff.py                      # dry run, keeps an admin
    python3 scripts/clear-staff.py --delete
    python3 scripts/clear-staff.py --keep you@clinic.com --delete
    python3 scripts/clear-staff.py --all --delete       # keeps nobody. Read below.

**Deletes the auth user, not the staff row.** `staff.id` references
`auth.users` with ON DELETE CASCADE, so removing the login takes the staff
row with it. Doing it the other way round leaves a login that still exists
in GoTrue with no staff record behind it — which cannot reach any data
(`current_staff_role()` is null, every policy denies) but is still an
account nobody can see in the app and nobody thought to remove.

**It will refuse anyone whose work is still in the database.** Eleven tables
reference `staff` with NO ACTION — patients.created_by, visits.staff_id,
consents.staff_id, invoices.created_by, payments.received_by,
appointments.dentist_id and the rest. That is deliberate: a consent has to
keep saying who witnessed it, and an invoice who raised it. Clear the
clinical data first with scripts/clear-clinical-data.sql if you want these
accounts gone, or keep the accounts.

**Keeping an admin is the default, and you want it.** With no active admin
nobody can reach /admin/staff to create one, and recovery means adding a row
by hand in the Supabase SQL editor against a user created in the dashboard —
the bootstrap described in CLAUDE.md. `--all` is there for a project being
wound down, not for tidying up.

Needs `.env.local` for the project URL and the Supabase CLI logged in, so
the service-role key can be fetched. The key is never printed.
"""

import json
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "xzpheuvthmsucvhytdjh"

DELETE = "--delete" in sys.argv
ALL = "--all" in sys.argv
KEEP_EMAIL = None
if "--keep" in sys.argv:
    KEEP_EMAIL = sys.argv[sys.argv.index("--keep") + 1].lower()

# Every foreign key pointing at staff, as (table, column). Checked against
# pg_constraint; if a migration adds another, add it here or the script will
# cheerfully report an account as safe to delete and then fail on it.
REFERENCES = [
    ("patients", "created_by"),
    ("consents", "staff_id"),
    ("visits", "staff_id"),
    ("visit_notes", "created_by"),
    ("tooth_records", "created_by"),
    ("invoices", "created_by"),
    ("payments", "received_by"),
    ("patient_files", "uploaded_by"),
    ("appointments", "created_by"),
    ("appointments", "dentist_id"),
    ("recalls", "created_by"),
]


def env(name):
    for line in open(".env.local"):
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip("\"'")
    raise SystemExit(f"{name} not found in .env.local")


URL = env("VITE_SUPABASE_URL")
SRK = next(
    k["api_key"]
    for k in json.loads(
        subprocess.run(
            f"supabase projects api-keys --project-ref {PROJECT}",
            shell=True, capture_output=True, text=True,
        ).stdout
    )["keys"]
    if k["id"] == "service_role"
)


def call(path, method="GET", body=None):
    req = urllib.request.Request(
        f"{URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "apikey": SRK,
            "Authorization": f"Bearer {SRK}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except Exception:
            return e.code, {"raw": raw.decode()[:300]}


st, staff = call("/rest/v1/staff?select=id,name,email,role,active&order=created_at")
if st != 200:
    raise SystemExit(f"Could not read staff: {st} {staff}")
if not staff:
    print("No staff accounts.")
    raise SystemExit(0)

# Who still has work in the database, and where.
blocked: dict[str, list[str]] = {}
for table, column in REFERENCES:
    st, rows = call(f"/rest/v1/{table}?select={column}")
    if st != 200:
        raise SystemExit(f"Could not read {table}.{column}: {st} {rows}")
    for row in rows or []:
        sid = row.get(column)
        if sid:
            blocked.setdefault(sid, [])
            if table not in blocked[sid]:
                blocked[sid].append(table)

# Who survives.
keep = None
if not ALL:
    if KEEP_EMAIL:
        keep = next((s for s in staff if s["email"].lower() == KEEP_EMAIL), None)
        if not keep:
            raise SystemExit(f"No staff account with the email {KEEP_EMAIL!r}.")
    else:
        keep = next((s for s in staff if s["role"] == "admin" and s["active"]), None)
        if not keep:
            raise SystemExit(
                "No active admin to keep. Pass --keep <email> to choose one, or\n"
                "--all if you really mean to leave the clinic with no way in."
            )

print(f"{len(staff)} staff account(s):\n")
to_delete = []
for s in staff:
    refs = blocked.get(s["id"], [])
    if keep and s["id"] == keep["id"]:
        verdict = "KEEP    (this is the account that stays)"
    elif refs:
        verdict = f"BLOCKED (work in: {', '.join(sorted(refs))})"
    else:
        verdict = "DELETE"
        to_delete.append(s)
    state = "active" if s["active"] else "deactivated"
    print(f"  {verdict}")
    print(f"          {s['name']} <{s['email']}>  {s['role']}, {state}")

if any(blocked.get(s["id"]) for s in staff if not (keep and s["id"] == keep["id"])):
    print(
        "\nBlocked accounts have patients, visits, invoices or appointments\n"
        "attributed to them. Those references are NO ACTION on purpose — a\n"
        "consent has to keep saying who witnessed it. Run\n"
        "scripts/clear-clinical-data.sql first if you want them gone."
    )

if not to_delete:
    print("\nNothing to delete.")
    raise SystemExit(0)

if not DELETE:
    print(f"\nDry run. Re-run with --delete to remove {len(to_delete)} account(s).")
    raise SystemExit(0)

if ALL:
    print(
        "\n*** --all: no admin will remain. Nobody will be able to reach\n"
        "    /admin/staff, and getting back in means creating a user in the\n"
        "    Supabase dashboard and inserting a staff row by hand. ***"
    )

print("\nDeleting…")
failed = []
for s in to_delete:
    # The auth user, not the staff row: staff.id references auth.users with
    # ON DELETE CASCADE, so this takes both and leaves no orphan login.
    st, body = call(f"/auth/v1/admin/users/{s['id']}", method="DELETE")
    ok = st in (200, 204)
    print(f"  {'removed' if ok else 'FAILED '}  {s['name']} <{s['email']}>"
          + ("" if ok else f"  {st} {body}"))
    if not ok:
        failed.append(s)

st, remaining = call("/rest/v1/staff?select=id,role,active")
admins = [s for s in remaining or [] if s["role"] == "admin" and s["active"]]
print(f"\n{len(remaining or [])} staff account(s) remain, {len(admins)} active admin(s).")
if not admins:
    print("There is no active admin. Recovery is the bootstrap in CLAUDE.md.")
sys.exit(1 if failed else 0)
