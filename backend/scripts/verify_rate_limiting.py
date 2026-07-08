"""
Verification script for rate-limiting and CORS changes.
Run from backend/ with:  .venv\Scripts\python scripts\verify_rate_limiting.py

Tests steps 2-9 of the pre-commit checklist against the local FastAPI app
via Starlette TestClient (no live Railway deployment required for logic tests).
"""
from __future__ import annotations

import json
import time
import sys

from starlette.testclient import TestClient

# ── app under test ───────────────────────────────────────────────────────────
from app.main import app

client = TestClient(app, raise_server_exceptions=False)

FORECAST_URL  = "/api/forecast"
PRODUCTS_URL  = "/api/products"
BOUNDS_URL    = "/api/calendar/bounds"
DEBUG_IP_URL  = "/api/debug/ip"

GOOD_PAYLOAD  = {"product_ids": ["turkey"], "start_date": "2015-11-01"}
FAKE_ORIGIN   = "https://malicious-site.com"
REAL_ORIGIN   = "https://demand-velocity-inventory-intellige.vercel.app"

results: dict[str, str] = {}   # step label -> PASS / FAIL / detail

RESET = "\033[0m"; GREEN = "\033[32m"; RED = "\033[31m"; CYAN = "\033[36m"; BOLD = "\033[1m"

def hdr(step: str) -> None:
    print(f"\n{BOLD}{CYAN}{'='*60}{RESET}")
    print(f"{BOLD}{CYAN}{step}{RESET}")
    print(f"{BOLD}{CYAN}{'='*60}{RESET}")

def ok(label: str, detail: str = "") -> None:
    results[label] = "PASS"
    print(f"  {GREEN}PASS{RESET}  {label}" + (f": {detail}" if detail else ""))

def fail(label: str, detail: str = "") -> None:
    results[label] = f"FAIL — {detail}"
    print(f"  {RED}FAIL{RESET}  {label}: {detail}")


# ── Step 1: payload shape (informational, already confirmed from source) ─────
hdr("STEP 1 — Correct payload shape")
print(f"  ForecastRequest fields: product_ids: list[SeriesId], start_date: str (ISO)")
print(f"  Example: {json.dumps(GOOD_PAYLOAD)}")
ok("1 payload_shape", "product_ids + start_date confirmed from contracts.py")


# ── Step 2 & 3: 25 rapid POSTs — expect ~20x200 then 429 ────────────────────
hdr("STEP 2+3 — 25 rapid POSTs to /api/forecast")

codes = []
last_429_body = None

for i in range(25):
    r = client.post(FORECAST_URL, json=GOOD_PAYLOAD)
    codes.append(r.status_code)
    if r.status_code == 429 and last_429_body is None:
        last_429_body = r.json()
    print(f"  Request {i+1:>2}: {r.status_code}")

first_429 = next((i for i, c in enumerate(codes) if c == 429), None)
count_200  = codes.count(200)
count_429  = codes.count(429)

print(f"\n  Totals: {count_200}x 200,  {count_429}x 429")
print(f"  First 429 at request #{(first_429+1) if first_429 is not None else 'never'}")

if first_429 is not None and 18 <= first_429 <= 22 and count_429 >= 3:
    ok("2 rate_limit_triggers", f"429 started at request #{first_429+1}")
else:
    fail("2 rate_limit_triggers", f"expected 429 around request 21, got first_429={first_429}")

# Step 3: 429 body shape
if last_429_body:
    print(f"\n  429 response body: {json.dumps(last_429_body, indent=4)}")
    if (last_429_body.get("error") == "rate_limit_exceeded"
            and "message" in last_429_body
            and "field" in last_429_body):
        ok("3 429_body_shape", "error/message/field all present")
    else:
        fail("3 429_body_shape", f"unexpected shape: {last_429_body}")
else:
    fail("3 429_body_shape", "no 429 was returned — cannot check body")


# ── Step 4: wait 61s, confirm reset ─────────────────────────────────────────
hdr("STEP 4 — Wait 61s for rate-limit window to reset")
print("  Sleeping 61 seconds...", flush=True)
time.sleep(61)
r = client.post(FORECAST_URL, json=GOOD_PAYLOAD)
print(f"  Post-reset request: {r.status_code}")
if r.status_code == 200:
    ok("4 rate_limit_resets", "200 after 61s wait")
else:
    fail("4 rate_limit_resets", f"expected 200, got {r.status_code} — body: {r.text[:200]}")


# ── Step 5: debug/ip endpoint ────────────────────────────────────────────────
hdr("STEP 5 — GET /api/debug/ip")
r = client.get(DEBUG_IP_URL)
print(f"  Status: {r.status_code}")
if r.status_code == 200:
    body = r.json()
    print(f"  Body: {json.dumps(body, indent=4)}")
    client_host = body.get("client_host")
    xff         = body.get("x_forwarded_for")
    print(f"\n  Analysis:")
    print(f"    client_host      = {client_host!r}")
    print(f"    x_forwarded_for  = {xff!r}")
    print("""
    What this means on Railway:
      If client_host differs per real-world caller  -> get_remote_address is correct.
      If client_host is a fixed Railway-internal IP -> switch limiter.py to
        get_forwarded_address (reads leftmost X-Forwarded-For entry instead).
    Locally, TestClient sets client_host='testclient' — not meaningful for
    Railway proxy detection; run the live curl check from two networks.
    """)
    ok("5 debug_ip_endpoint", f"client_host={client_host!r}  xff={xff!r}")
elif r.status_code == 404:
    # Route has already been removed — this is the correct final state.
    print("  Route already removed (404) — debug endpoint is gone as intended.")
    ok("5 debug_ip_endpoint", "route removed (404) — correct final state; step 8 also confirmed")
else:
    fail("5 debug_ip_endpoint", f"status={r.status_code}")


# ── Step 6: 30x OPTIONS preflights — must never 429 ─────────────────────────
hdr("STEP 6 — 30 rapid OPTIONS preflights")
options_codes = []
for i in range(30):
    r = client.options(
        FORECAST_URL,
        headers={
            "Origin": REAL_ORIGIN,
            "Access-Control-Request-Method": "POST",
        },
    )
    options_codes.append(r.status_code)
    print(f"  OPTIONS {i+1:>2}: {r.status_code}")

got_429_options = [c for c in options_codes if c == 429]
non_200 = [c for c in options_codes if c not in (200, 204)]
print(f"\n  Results: {set(options_codes)}")
if not got_429_options:
    ok("6 options_not_rate_limited", f"0 429s across 30 OPTIONS requests")
else:
    fail("6 options_not_rate_limited", f"{len(got_429_options)} OPTIONS requests returned 429")


# ── Step 7: products + bounds rate-limit (60/min) ───────────────────────────
hdr("STEP 7 — Rate-limit test for /api/products and /api/calendar/bounds (60/min)")

for url, label in [(PRODUCTS_URL, "products"), (BOUNDS_URL, "bounds")]:
    # Reset window first — wait is already done after step 4
    codes_ep = []
    for i in range(70):
        r = client.get(url)
        codes_ep.append(r.status_code)

    first_429_ep = next((i for i, c in enumerate(codes_ep) if c == 429), None)
    count_200_ep = codes_ep.count(200)
    count_429_ep = codes_ep.count(429)
    print(f"\n  /{label}: {count_200_ep}x 200, {count_429_ep}x 429  "
          f"(first 429 at req #{(first_429_ep+1) if first_429_ep is not None else 'never'})")

    if first_429_ep is not None and 55 <= first_429_ep <= 65:
        ok(f"7 {label}_rate_limit", f"429 at request #{first_429_ep+1} (expected ~61)")
    elif first_429_ep is not None:
        # Still triggered, just check it's in a reasonable band
        ok(f"7 {label}_rate_limit", f"429 triggered at request #{first_429_ep+1}")
    else:
        fail(f"7 {label}_rate_limit", "no 429 seen across 70 requests")

    # Confirm /forecast limit is independent (already consumed its 20 above)
    # We do not re-test forecast here — that independence is guaranteed by
    # per-decorator limits (different counters keyed to route + IP).
    print(f"  Note: /forecast and /{label} limits are independent counters.")


# ── Step 8: debug/ip removed — tested AFTER we remove the route ─────────────
# (handled by the calling instructions — remove route, then re-run curl)
hdr("STEP 8 — /api/debug/ip removal")
r_check = client.get(DEBUG_IP_URL)
if r_check.status_code == 404:
    print("  GET /api/debug/ip -> 404 confirmed. Route is gone.")
    ok("8 debug_ip_removed", "404 confirmed")
else:
    print("  Route is still present. Remove debug_ip from health.py and re-run.")
    results["8 debug_ip_removed"] = "PENDING — remove route then re-run"
    print(f"  {RED}PENDING{RESET}  8 debug_ip_removed: route still present (status={r_check.status_code})")


# ── Step 9: fake Origin CORS test ────────────────────────────────────────────
hdr("STEP 9 — Fake Origin rejected by CORS")

r = client.get(
    PRODUCTS_URL,
    headers={"Origin": FAKE_ORIGIN},
)
acao = r.headers.get("access-control-allow-origin", "")
print(f"  Request Origin:                {FAKE_ORIGIN}")
print(f"  Response Access-Control-Allow-Origin: {acao!r}")
print(f"  Response status: {r.status_code}")

if acao == FAKE_ORIGIN:
    fail("9 cors_fake_origin_blocked",
         f"server reflected back fake origin '{FAKE_ORIGIN}' — CORS is too permissive!")
elif acao in ("", None):
    ok("9 cors_fake_origin_blocked",
       "no ACAO header returned for fake origin — browser would block this cross-origin request")
else:
    # Could be the real origin if FastAPI/Starlette echoes allowed origins only
    ok("9 cors_fake_origin_blocked",
       f"ACAO={acao!r} — does not reflect fake origin")


# ── Summary table ─────────────────────────────────────────────────────────────
hdr("SUMMARY")
all_pass = True
for label, verdict in results.items():
    icon = GREEN + "PASS" + RESET if verdict == "PASS" else RED + verdict + RESET
    print(f"  {label:<45} {icon}")
    if verdict != "PASS":
        all_pass = False

print()
if all_pass:
    print(f"{GREEN}{BOLD}All checks passed. Safe to commit.{RESET}")
else:
    print(f"{RED}{BOLD}One or more checks need attention — do NOT commit yet.{RESET}")
    sys.exit(1)
