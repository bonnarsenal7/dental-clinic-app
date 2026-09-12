"""Proves the chairside billing rules hold in the database, not just the UI.

    python3 scripts/test-chairside-billing.py

**This writes to production.** It creates a dentist, a receptionist, an
admin and a patient, walks one appointment through the whole lifecycle
while trying every move each role should not be allowed, and deletes it all
in a finally block.

It exists because the UI is not where these rules matter. A receptionist
with the anon key and curl bypasses every React guard in the app; the only
answer that counts is the one Postgres gives. Every check below is a real
HTTP call as a real signed-in user of that role.

Leaves rows in audit_log, which is append-only by design and is itself part
of what this verifies.
"""

import json
import subprocess
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta

PROJECT = "xzpheuvthmsucvhytdjh"
MARK = "ZZ BILLING"


def env(name):
    for line in open(".env.local"):
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip("\"'")
    raise SystemExit(f"{name} not in .env.local")


URL, ANON = env("VITE_SUPABASE_URL"), env("VITE_SUPABASE_ANON_KEY")
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


def call(path, body=None, token=None, method="POST", prefer=None):
    headers = {
        "apikey": SRK if token == SRK else ANON,
        "Authorization": f"Bearer {token or ANON}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(
        f"{URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method, headers=headers,
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
            return e.code, {"raw": raw.decode()[:200]}


results = []
def check(name, ok, detail=""):
    results.append(ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    if detail:
        print(f"        {detail}")


def refused(status, body, needle=None):
    """RLS refuses a write two ways: an error, or silently matching no rows.

    A PATCH or DELETE that RLS filters out returns 204 having changed
    nothing, so a status code alone proves nothing — the caller has to look
    at whether the row actually moved. Used only where that is checked.
    """
    if status >= 400:
        return True if needle is None else needle.lower() in json.dumps(body).lower()
    return False


accounts = []
patient_id = None
try:
    def make(role):
        email = f"zz-bill-{uuid.uuid4().hex[:8]}@toothco.invalid"
        pw = "Zz!" + uuid.uuid4().hex[:14]
        st, u = call("/auth/v1/admin/users",
                     {"email": email, "password": pw, "email_confirm": True}, token=SRK)
        assert st == 200, u
        call("/rest/v1/staff", {"id": u["id"], "name": f"{MARK} {role}", "email": email,
                                "role": role, "active": True}, token=SRK)
        st, tok = call("/auth/v1/token?grant_type=password", {"email": email, "password": pw})
        assert st == 200, tok
        accounts.append(u["id"])
        return u["id"], tok["access_token"]

    dentist_id, DENTIST = make("dentist")
    recep_id, RECEP = make("receptionist")
    admin_id, ADMIN = make("admin")
    print("Signed in as a dentist, a receptionist and an admin.\n")

    st, rows = call("/rest/v1/patients", {"name": f"{MARK} Patient", "created_by": recep_id},
                    token=SRK, prefer="return=representation")
    patient_id = rows[0]["id"]

    when = (datetime.now() + timedelta(hours=1)).astimezone().isoformat()
    st, rows = call("/rest/v1/appointments",
                    {"patient_id": patient_id, "dentist_id": dentist_id, "scheduled_at": when,
                     "duration_minutes": 30, "reason": "Filling", "status": "arrived",
                     "created_by": recep_id}, token=SRK, prefer="return=representation")
    appt = rows[0]
    st, rows = call("/rest/v1/visits", {"patient_id": patient_id, "staff_id": dentist_id,
                                        "visit_date": when}, token=SRK, prefer="return=representation")
    visit = rows[0]
    call(f"/rest/v1/appointments?id=eq.{appt['id']}",
         {"status": "in_chair", "visit_id": visit["id"]}, token=SRK, method="PATCH")

    # --- 1. the dentist bills from the chair -----------------------------
    print("While the patient is in the chair:")
    st, rows = call("/rest/v1/invoices",
                    {"patient_id": patient_id, "visit_id": visit["id"], "status": "draft",
                     "created_by": dentist_id}, token=DENTIST, prefer="return=representation")
    check("a dentist can raise a draft invoice", st in (200, 201), f"HTTP {st}")
    invoice = rows[0] if st in (200, 201) else None
    if not invoice:
        raise SystemExit(1)

    st, _ = call("/rest/v1/invoice_items",
                 {"invoice_id": invoice["id"], "description": "Composite filling",
                  "amount": 1800, "tooth_number": 36}, token=DENTIST, prefer="return=representation")
    check("a dentist can add line items to the draft", st in (200, 201), f"HTTP {st}")

    st, inv = call(f"/rest/v1/invoices?select=status,total_amount&id=eq.{invoice['id']}",
                   token=DENTIST, method="GET")
    check("the draft keeps a running total without leaving draft",
          inv and inv[0]["status"] == "draft" and float(inv[0]["total_amount"]) == 1800.0,
          f"{inv[0]['status'] if inv else '?'}, total {inv[0]['total_amount'] if inv else '?'}")

    # --- 2. reception cannot touch the figures ---------------------------
    print("\nReception, going straight at the database:")
    st, body = call("/rest/v1/invoice_items",
                    {"invoice_id": invoice["id"], "description": "Sneaky discount line",
                     "amount": -500}, token=RECEP, prefer="return=representation")
    check("cannot add a line item", refused(st, body), f"HTTP {st}")

    st, items = call(f"/rest/v1/invoice_items?select=id,amount&invoice_id=eq.{invoice['id']}",
                     token=RECEP, method="GET")
    item_id = items[0]["id"]
    call(f"/rest/v1/invoice_items?id=eq.{item_id}", {"amount": 1}, token=RECEP, method="PATCH")
    st, after = call(f"/rest/v1/invoice_items?select=amount&id=eq.{item_id}", token=SRK, method="GET")
    check("cannot change a line item's amount",
          float(after[0]["amount"]) == 1800.0, f"still {after[0]['amount']}")

    call(f"/rest/v1/invoices?id=eq.{invoice['id']}", {"total_amount": 1}, token=RECEP, method="PATCH")
    st, after = call(f"/rest/v1/invoices?select=total_amount&id=eq.{invoice['id']}",
                     token=SRK, method="GET")
    check("cannot rewrite the invoice total",
          float(after[0]["total_amount"]) == 1800.0, f"still {after[0]['total_amount']}")

    call(f"/rest/v1/invoice_items?id=eq.{item_id}", token=RECEP, method="DELETE")
    st, after = call(f"/rest/v1/invoice_items?select=id&id=eq.{item_id}", token=SRK, method="GET")
    check("cannot delete a line item", bool(after), "line item survived")

    # --- 3. only the dentist finishes treatment --------------------------
    print("\nFinishing treatment:")
    st, body = call(f"/rest/v1/appointments?id=eq.{appt['id']}",
                    {"status": "pending_payment"}, token=RECEP, method="PATCH")
    check("reception cannot finish treatment",
          refused(st, body, "only the dentist"), f"HTTP {st}")

    st, body = call(f"/rest/v1/appointments?id=eq.{appt['id']}",
                    {"status": "pending_payment"}, token=DENTIST, method="PATCH")
    check("the dentist can finish treatment", st in (200, 204), f"HTTP {st}")
    call(f"/rest/v1/invoices?id=eq.{invoice['id']}", {"status": "unpaid"},
         token=DENTIST, method="PATCH")

    st, inv = call(f"/rest/v1/invoices?select=status&id=eq.{invoice['id']}", token=SRK, method="GET")
    check("the invoice has left draft", inv[0]["status"] != "draft", inv[0]["status"])

    # --- 4. the figures are now locked to the dentist too ----------------
    st, body = call("/rest/v1/invoice_items",
                    {"invoice_id": invoice["id"], "description": "Afterthought", "amount": 900},
                    token=DENTIST, prefer="return=representation")
    check("the dentist cannot add to it afterwards", refused(st, body), f"HTTP {st}")

    call(f"/rest/v1/invoice_items?id=eq.{item_id}", {"amount": 50}, token=DENTIST, method="PATCH")
    st, after = call(f"/rest/v1/invoice_items?select=amount&id=eq.{item_id}", token=SRK, method="GET")
    check("nor change what is already on it", float(after[0]["amount"]) == 1800.0,
          f"still {after[0]['amount']}")

    st, body = call(f"/rest/v1/appointments?id=eq.{appt['id']}",
                    {"status": "completed"}, token=DENTIST, method="PATCH")
    # 0015 answers this from the dentist branch now — "bookings are managed
    # by reception" rather than "only reception can accept payment", which
    # is the more useful thing to tell them.
    check("the dentist cannot check the patient out",
          refused(st, body, "a dentist can finish treatment"), f"HTTP {st}")

    # --- 5. reception takes the money ------------------------------------
    print("\nAt the front desk:")
    st, _ = call("/rest/v1/payments",
                 {"invoice_id": invoice["id"], "amount": 1800, "method": "cash",
                  "reference": "OR-99001", "received_by": recep_id},
                 token=RECEP, prefer="return=representation")
    check("reception can record the payment", st in (200, 201), f"HTTP {st}")

    st, inv = call(f"/rest/v1/invoices?select=status&id=eq.{invoice['id']}", token=SRK, method="GET")
    check("the invoice moves itself to paid", inv[0]["status"] == "paid",
          f"{inv[0]['status']} — the totals trigger outranks the caller")

    st, body = call(f"/rest/v1/appointments?id=eq.{appt['id']}",
                    {"status": "completed"}, token=RECEP, method="PATCH")
    check("reception can check the patient out", st in (200, 204), f"HTTP {st}")

    st, body = call(f"/rest/v1/appointments?id=eq.{appt['id']}",
                    {"status": "in_chair"}, token=RECEP, method="PATCH")
    check("a finished appointment cannot be reopened",
          refused(st, body, "book the extra procedure separately"), f"HTTP {st}")

    # --- 6. a further procedure is its own booking -----------------------
    print("\nA second procedure in the same visit:")
    st, rows = call("/rest/v1/appointments",
                    {"patient_id": patient_id, "dentist_id": dentist_id,
                     "scheduled_at": (datetime.now() + timedelta(hours=3)).astimezone().isoformat(),
                     "duration_minutes": 30, "reason": "Extraction, same day",
                     "status": "booked", "created_by": recep_id},
                    token=RECEP, prefer="return=representation")
    check("reception books it separately", st in (200, 201), f"HTTP {st}")
    second = rows[0] if st in (200, 201) else None

    st, rows = call("/rest/v1/invoices",
                    {"patient_id": patient_id, "status": "draft", "created_by": dentist_id},
                    token=DENTIST, prefer="return=representation")
    check("it gets its own invoice, leaving the paid one alone",
          st in (200, 201) and rows[0]["id"] != invoice["id"], f"HTTP {st}")
    second_invoice = rows[0] if st in (200, 201) else None

    st, inv = call(f"/rest/v1/invoices?select=status,total_amount&id=eq.{invoice['id']}",
                   token=SRK, method="GET")
    check("the first invoice is untouched by any of it",
          inv[0]["status"] == "paid" and float(inv[0]["total_amount"]) == 1800.0,
          f"{inv[0]['status']}, {inv[0]['total_amount']}")

    # --- 6b. a finished appointment stops holding the chair --------------
    #
    # Reported from the clinic as "That dentist is already with another
    # patient at this time" when the dentist was plainly free. The exclusion
    # constraint excluded only cancelled and no-show, so every completed
    # appointment reserved its slot for ever and the day filled with phantom
    # conflicts as it went on (0014).
    st, rows = call("/rest/v1/appointments",
                    {"patient_id": patient_id, "dentist_id": dentist_id,
                     "scheduled_at": when, "duration_minutes": 30,
                     "reason": "Same slot, same dentist, after the first finished",
                     "status": "booked", "created_by": recep_id},
                    token=RECEP, prefer="return=representation")
    check("the same dentist can be booked into a finished appointment's slot",
          st in (200, 201), f"HTTP {st}" + ("" if st in (200, 201) else f" {rows}"))
    reused = rows[0] if st in (200, 201) else None

    # And the protection it exists for still holds: two live appointments
    # for one dentist at one time is still refused.
    st, body = call("/rest/v1/appointments",
                    {"patient_id": patient_id, "dentist_id": dentist_id,
                     "scheduled_at": when, "duration_minutes": 30,
                     "reason": "Genuine clash", "status": "booked", "created_by": recep_id},
                    token=RECEP, prefer="return=representation")
    check("but two live appointments at once are still refused",
          st >= 400 and "appointments_no_double_booking" in json.dumps(body), f"HTTP {st}")
    if reused:
        call(f"/rest/v1/appointments?id=eq.{reused['id']}", token=SRK, method="DELETE")

    # --- 6c. the diary belongs to reception ------------------------------
    #
    # A dentist reads the whole diary and writes nothing to it except
    # finishing treatment (0015). Tried here with a valid dentist token
    # straight at PostgREST, because the UI is not where this holds.
    print("\nA dentist, going straight at the database:")

    st, all_appts = call("/rest/v1/appointments?select=id,scheduled_at,status",
                         token=DENTIST, method="GET")
    check("can read the whole diary", st == 200 and len(all_appts or []) > 0,
          f"{len(all_appts or [])} appointment(s) visible")

    st, body = call("/rest/v1/appointments",
                    {"patient_id": patient_id, "dentist_id": dentist_id,
                     "scheduled_at": (datetime.now() + timedelta(days=2)).astimezone().isoformat(),
                     "duration_minutes": 30, "reason": "Booked by the dentist",
                     "status": "booked", "created_by": dentist_id},
                    token=DENTIST, prefer="return=representation")
    check("cannot create a booking", refused(st, body), f"HTTP {st}")

    # Reschedule: change the time on the one they just could not create.
    if second:
        st, body = call(f"/rest/v1/appointments?id=eq.{second['id']}",
                        {"scheduled_at": (datetime.now() + timedelta(days=4)).astimezone().isoformat()},
                        token=DENTIST, method="PATCH")
        moved = refused(st, body, "cannot change the booking") or refused(st, body)
        check("cannot reschedule one", moved, f"HTTP {st}")

        st, body = call(f"/rest/v1/appointments?id=eq.{second['id']}",
                        {"reason": "Rewritten by the dentist"}, token=DENTIST, method="PATCH")
        check("cannot edit the reason", refused(st, body), f"HTTP {st}")

        st, body = call(f"/rest/v1/appointments?id=eq.{second['id']}",
                        {"status": "cancelled"}, token=DENTIST, method="PATCH")
        check("cannot cancel one", refused(st, body, "bookings are managed by reception"),
              f"HTTP {st}")

        call(f"/rest/v1/appointments?id=eq.{second['id']}", token=DENTIST, method="DELETE")
        st, still = call(f"/rest/v1/appointments?select=id&id=eq.{second['id']}",
                         token=SRK, method="GET")
        check("cannot delete one", bool(still), "the booking survived")

        st, after = call(f"/rest/v1/appointments?select=reason,scheduled_at&id=eq.{second['id']}",
                         token=SRK, method="GET")
        check("and none of it got through",
              after and after[0]["reason"] == "Extraction, same day",
              f"reason still {after[0]['reason'] if after else '?'}")

    # Reception's diary is unaffected.
    st, body = call(f"/rest/v1/appointments?id=eq.{second['id']}",
                    {"reason": "Moved by reception"}, token=RECEP, method="PATCH")
    check("reception can still edit a booking", st in (200, 204), f"HTTP {st}")

    # --- 7. admin overrides, and the log catches it ----------------------
    print("\nAdmin override:")
    st, body = call(f"/rest/v1/invoice_items?id=eq.{item_id}", {"amount": 1500},
                    token=ADMIN, method="PATCH")
    st, after = call(f"/rest/v1/invoice_items?select=amount&id=eq.{item_id}", token=SRK, method="GET")
    check("an admin can correct a line item on a paid invoice",
          float(after[0]["amount"]) == 1500.0, f"now {after[0]['amount']}")

    # Asked for by record id rather than by counting rows: a count is
    # relative to whatever earlier runs left behind, and this script has
    # already been failed once by exactly that.
    st, entry = call(
        f"/rest/v1/audit_log?select=changed_fields,staff_id,operation"
        f"&table_name=eq.invoice_items&operation=eq.update&record_id=eq.{item_id}"
        f"&order=created_at.desc&limit=1",
        token=ADMIN, method="GET")
    check("the override is in the audit log, against that line item",
          bool(entry) and "amount" in json.dumps(entry[0].get("changed_fields")),
          f"changed_fields {entry[0].get('changed_fields') if entry else 'no entry'}")
    check("and it names who did it",
          bool(entry) and entry[0].get("staff_id") == admin_id,
          "staff_id matches the admin")

    st, body = call(f"/rest/v1/appointments?id=eq.{appt['id']}",
                    {"status": "in_chair"}, token=ADMIN, method="PATCH")
    check("an admin can correct a status an hour later", st in (200, 204), f"HTTP {st}")

    st, body = call(f"/rest/v1/invoices?id=eq.{invoice['id']}", {"status": "void"},
                    token=ADMIN, method="PATCH")
    st, inv = call(f"/rest/v1/invoices?select=status&id=eq.{invoice['id']}", token=SRK, method="GET")
    check("an admin can void an invoice", inv[0]["status"] == "void", inv[0]["status"])

finally:
    print()
    if patient_id:
        call(f"/rest/v1/patients?id=eq.{patient_id}", token=SRK, method="DELETE")
        print("  removed the test patient and everything billed to them")
    for uid in accounts:
        st, body = call(f"/auth/v1/admin/users/{uid}", method="DELETE", token=SRK)
        if st not in (200, 204):
            print(f"  WARNING: could not remove staff {uid}: {st} {body}")
    print("  removed the temporary dentist, receptionist and admin")

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if results and all(results) else 1)
