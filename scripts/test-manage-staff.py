"""End-to-end test of manage-staff's reset_password, against the LIVE project.

    python3 scripts/test-manage-staff.py

**This writes to production.** It creates two disposable accounts (a
temporary admin and a target), exercises the deployed Edge Function through
the same call the Staff screen makes, then deletes both. Cleanup runs in a
`finally` block, so a failure part-way through still tears down — but if the
process is killed outright, look for `zz-test-*@toothco.invalid` in
Authentication → Users and in `staff`, and remove them.

It exists because the Edge Function is Deno and sits outside vitest, so
nothing else covers it. The UI half is unit-tested in
`src/features/admin/StaffManagementPage.test.tsx`; this covers the half that
only runs on Supabase.

Two side effects worth knowing about:

- It briefly creates an **admin** account. That is needed because the
  function verifies the caller is an active admin, so there is no way to
  test the real path without one. The password is random, used once, and the
  account is deleted at the end.
- It leaves **six rows in `audit_log`** (2 insert, 2 update, 2 delete on
  `staff`). Those are permanent: the log has no delete policy for any role,
  by design. That is correct behaviour, not residue to clean up.

Needs `.env.local` for the project URL and anon key, and the Supabase CLI
logged in so the service-role key can be fetched. The service-role key is
never printed.
"""


import json
import subprocess
import sys
import urllib.request
import urllib.error
import uuid

PROJECT = "xzpheuvthmsucvhytdjh"
MARK = "ZZ-TEST-DELETE-ME"

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

def env(name):
    for line in open(".env.local"):
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip("\"'")
    raise SystemExit(f"{name} not in .env.local")

URL = env("VITE_SUPABASE_URL")
ANON = env("VITE_SUPABASE_ANON_KEY")
SRK = next(
    k["api_key"]
    for k in json.loads(sh(f"supabase projects api-keys --project-ref {PROJECT}"))["keys"]
    if k["id"] == "service_role"
)

def call(path, body=None, token=None, method="POST"):
    req = urllib.request.Request(
        f"{URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "apikey": token or ANON,
            "Authorization": f"Bearer {token or ANON}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"{}")
        except Exception:
            return e.code, {"raw": raw.decode()[:200]}

def admin(path, body=None, method="POST"):
    return call(path, body, token=SRK, method=method)

def mask(p):
    return p[:3] + "…" * 4

def make_account(label, role):
    email = f"zz-test-{uuid.uuid4().hex[:8]}@toothco.invalid"
    pw = "Zz!" + uuid.uuid4().hex[:14]
    st, body = admin("/auth/v1/admin/users", {"email": email, "password": pw, "email_confirm": True})
    assert st == 200, f"create {label} auth user: {st} {body}"
    uid = body["id"]
    st, body = call(
        "/rest/v1/staff",
        {"id": uid, "name": f"{MARK} {label}", "email": email, "role": role, "active": True},
        token=SRK,
    )
    assert st in (200, 201), f"create {label} staff row: {st} {body}"
    return {"id": uid, "email": email, "password": pw, "label": label}

def sign_in(email, password):
    return call("/auth/v1/token?grant_type=password", {"email": email, "password": password})

def set_active(uid, value):
    req = urllib.request.Request(
        f"{URL}/rest/v1/staff?id=eq.{uid}",
        data=json.dumps({"active": value}).encode(),
        method="PATCH",
        headers={"apikey": SRK, "Authorization": f"Bearer {SRK}", "Content-Type": "application/json"},
    )
    urllib.request.urlopen(req).read()

def destroy(acct):
    """Deletes the login, which cascades to the staff row.

    Deleting the staff row first is what an earlier version did, and it
    fails silently: eleven tables reference `staff` with NO ACTION, so if
    the throwaway account has created anything the delete is refused — and
    a fire-and-forget call never notices. That is how seven ZZ TEST logins
    accumulated on the live project. The status is checked now, and a
    failure is reported rather than swallowed.
    """
    st, body = admin(f"/auth/v1/admin/users/{acct['id']}", method="DELETE")
    if st not in (200, 204):
        print(f"  WARNING: could not delete {acct['email']}: {st} {body}")
        print("           run scripts/clear-staff.py to see what is holding it")
        return False
    return True

results = []
def check(name, ok, detail=""):
    results.append(ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    if detail:
        print(f"        {detail}")

created = []
try:
    print("Setting up two disposable accounts…")
    temp_admin = make_account("admin", "admin")
    created.append(temp_admin)
    target = make_account("target", "receptionist")
    created.append(target)
    print(f"  admin  {temp_admin['email']}")
    print(f"  target {target['email']}  password {mask(target['password'])}")
    print()

    st, tok = sign_in(temp_admin["email"], temp_admin["password"])
    assert st == 200, f"temp admin sign-in failed: {st} {tok}"
    admin_jwt = tok["access_token"]

    print("Exercising the deployed reset_password branch:")

    # 1 — the happy path, exactly the call the Staff screen makes.
    st, body = call(
        "/functions/v1/manage-staff",
        {"action": "reset_password", "staffId": target["id"]},
        token=admin_jwt,
    )
    new_pw = body.get("tempPassword")
    check("an admin gets a new temporary password back", st == 200 and bool(new_pw), f"HTTP {st}, password {mask(new_pw) if new_pw else body}")
    check("the response says what to do with it", "share this" in (body.get("note") or "").lower())
    check("it warns that an open session survives", "session" in (body.get("note") or "").lower())

    # 2 — the password must actually work. A reset that returns a string the
    #     staff member cannot log in with is the failure mode that matters.
    if new_pw:
        st, _ = sign_in(target["email"], new_pw)
        check("the new password actually signs in", st == 200, f"HTTP {st}")

    # 3 — and the old one must stop working.
    st, _ = sign_in(target["email"], target["password"])
    check("the old password stops working", st != 200, f"HTTP {st}")

    # 4 — a deactivated account is refused, with a message pointing somewhere.
    set_active(target["id"], False)
    st, body = call(
        "/functions/v1/manage-staff",
        {"action": "reset_password", "staffId": target["id"]},
        token=admin_jwt,
    )
    msg = (body.get("error") or "").lower()
    check("a deactivated account is refused", st == 400 and "deactivated" in msg, f"HTTP {st}: {body.get('error')}")
    check("the refusal points at Restore access", "restore" in msg)
    set_active(target["id"], True)

    # 5 — a non-admin cannot reset anyone, including themselves.
    st, tok2 = sign_in(target["email"], new_pw)
    if st == 200:
        st, body = call(
            "/functions/v1/manage-staff",
            {"action": "reset_password", "staffId": temp_admin["id"]},
            token=tok2["access_token"],
        )
        check("a receptionist cannot reset an admin", st == 403, f"HTTP {st}: {body.get('error')}")

    # 6 — an unknown staff id is a clean 404, not a bare admin-API error.
    st, body = call(
        "/functions/v1/manage-staff",
        {"action": "reset_password", "staffId": str(uuid.uuid4())},
        token=admin_jwt,
    )
    check("an unknown staff id gives a clear 404", st == 404, f"HTTP {st}: {body.get('error')}")

    # 7 — missing argument.
    st, body = call("/functions/v1/manage-staff", {"action": "reset_password"}, token=admin_jwt)
    check("a missing staffId is rejected", st == 400, f"HTTP {st}: {body.get('error')}")

finally:
    print()
    print("Cleaning up…")
    for a in created:
        if destroy(a):
            print(f"  deleted {a['label']} {a['email']}")

print()
print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) and results else 1)
