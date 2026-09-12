"""Removes every object from the private `patient-files` bucket.

    python3 scripts/clear-storage-objects.py          # dry run, lists only
    python3 scripts/clear-storage-objects.py --delete # actually removes

Run this AFTER scripts/clear-clinical-data.sql, not before. The database
rows are what point at these files; clearing the files first leaves the app
rendering consents and attachments whose images 404. The script refuses to
run if patients still exist unless you pass --force, for that reason.

**Goes through the Storage API, not SQL.** Deleting rows from
`storage.objects` directly removes the metadata and leaves the actual file
in the backing store — an orphan nobody can see or clean up afterwards. The
API removes both.

Needs `.env.local` for the project URL and the Supabase CLI logged in, so
the service-role key can be fetched. The key is never printed.

The bucket holds three prefixes (0003_storage.sql, 0004_charting.sql):
  signatures/<patient_id>/   consent signature PNGs
  attachments/<patient_id>/  X-rays, ID scans
  tooth/<patient_id>/        per-tooth images, dentist/admin only

There is no backup of Storage. scripts/backup.sh dumps the database only —
that gap is docs/TECHNICAL_REVIEW.md F-3. Once these are gone they are gone.
"""

import json
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT = "xzpheuvthmsucvhytdjh"
BUCKET = "patient-files"

DELETE = "--delete" in sys.argv
FORCE = "--force" in sys.argv


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
            shell=True,
            capture_output=True,
            text=True,
        ).stdout
    )["keys"]
    if k["id"] == "service_role"
)


def call(path, body=None, method="POST"):
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
            return r.status, json.loads(r.read() or b"[]")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def list_prefix(prefix):
    """One level at a time — the API lists a folder, not a tree."""
    found = []
    status, entries = call(
        f"/storage/v1/object/list/{BUCKET}",
        {"prefix": prefix, "limit": 1000, "offset": 0},
    )
    if status != 200:
        raise SystemExit(f"list {prefix!r} failed: {status} {entries}")
    for e in entries:
        name = f"{prefix}{e['name']}"
        # A folder comes back with no id; recurse into it.
        if e.get("id") is None:
            found += list_prefix(name + "/")
        else:
            found.append((name, (e.get("metadata") or {}).get("size", 0)))
    return found


# Ordering guard: the rows are what reference these files.
status, patients = call("/rest/v1/patients?select=id&limit=1", method="GET")
if status == 200 and patients and not FORCE:
    raise SystemExit(
        "Patients still exist. Run scripts/clear-clinical-data.sql first, or\n"
        "pass --force if you really mean to strip the files out from under\n"
        "records that still point at them."
    )

objects = []
for prefix in ("signatures/", "attachments/", "tooth/"):
    objects += list_prefix(prefix)

if not objects:
    print("Bucket is already empty.")
    raise SystemExit(0)

total = sum(size or 0 for _, size in objects)
print(f"{len(objects)} object(s), {total / 1024:.0f} kB:")
for name, size in objects:
    print(f"  {name}  ({(size or 0) / 1024:.0f} kB)")

if not DELETE:
    print("\nDry run. Re-run with --delete to remove these permanently.")
    raise SystemExit(0)

print("\nDeleting…")
status, body = call(
    f"/storage/v1/object/{BUCKET}",
    {"prefixes": [name for name, _ in objects]},
    method="DELETE",
)
if status != 200:
    raise SystemExit(f"delete failed: {status} {body}")

remaining = []
for prefix in ("signatures/", "attachments/", "tooth/"):
    remaining += list_prefix(prefix)
print(f"Removed {len(objects)}. {len(remaining)} object(s) remaining.")
sys.exit(0 if not remaining else 1)
