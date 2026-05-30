# MT-00 — Repo Scaffold, `.gitignore`, README stub

## 1. Context
We are building **Demand Velocity & Inventory Intelligence**, a web dashboard that forecasts 28 days of demand for 8 retail products using a pre-trained LightGBM model (FastAPI backend + React/Vite frontend). This is the very first build task: it creates the empty repository folder tree, the data/model directories, the `.gitignore`, and a README stub — nothing else exists yet. The exact folder layout and the git/data strategy are already locked in `04_BACKEND_ARCHITECTURE.md` §1 and §7; this task simply materializes them on disk. After this task, every later micro-task (MT-01 onward) can drop its files into the correct, already-existing directories.

## 2. Prerequisites
**Foundation docs to load into the session:**
- `docs/04_BACKEND_ARCHITECTURE.md` (especially §1 repo tree, §7 git/data strategy, §8 local-dev)
- `docs/06_UIUX_SPEC.md` (§10 frontend tree)
- `docs/01_PROJECT_SPEC.md` (§7 deliverables checklist)

**Prior MT artifacts/paths that must already exist:**
- The `docs/` directory already exists with the full documentation set (provided). Do **not** modify it.
- No other prior micro-task is required — MT-00 is the first task (per `MT-INDEX.md` Phase 0).

**Tooling assumed installed on the dev PC:** `git`, Python 3.11, Node 20. (They are not exercised here beyond `git`.)

## 3. Goal
Create the complete repository folder tree, the canonical `.gitignore`, a `README.md` stub, and `.gitkeep` placeholders so that the repo matches `04_BACKEND_ARCHITECTURE.md` §1 exactly and `git status` never lists the large raw CSVs or `official_docs/`.

## 4. Design
All decisions here are already locked — do **not** invent paths or change the ignore rules.

- **Canonical repository layout:** exactly as in `04_BACKEND_ARCHITECTURE.md` §1. The repo root is the current project directory (referred to as `demand-velocity/` in §1). `docs/` already exists.
- **Git & data strategy (per `04_BACKEND_ARCHITECTURE.md` §7, LOCKED):**
  - **Committed** (small, needed at runtime): all source code + `docs/`, `data/raw/calendar.csv` (102 KB), `data/processed/series_daily.parquet` (< 1 MB), and the model artifacts `backend/app/models/model.pkl`, `feature_meta.json`, `profiles.json`.
  - **Gitignored** (large or private): `data/raw/sales_train_evaluation.csv`, `data/raw/sell_prices.csv`, `data/raw/sales_train_validation.csv`, `data/raw/sample_submission.csv`, the `official_docs/` folder (interns' private appointment letters — must NOT be public), and standard junk (`__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `.pytest_cache/`, `node_modules/`, `frontend/dist/`, `.env`, `*.local`).
  - **Consequence (per §7):** because `series_daily.parquet`, `calendar.csv`, and the model artifacts are committed, a student who clones the repo can run the backend immediately — they never need the raw CSVs and never retrain. `data_prep.py` (MT-10) and `train.py` (MT-13) are run **once on the dev PC** that has the raw data; their outputs are committed.
- **`.gitignore` content is fixed** — use the canonical block printed verbatim in `04_BACKEND_ARCHITECTURE.md` §7 (reproduced below in §5). The `data/raw/*` + `!data/raw/calendar.csv` pair is what keeps `calendar.csv` tracked while ignoring every other raw file.
- **README is a stub only.** The full README is authored later in MT-46 (per §1 of the repo tree and `01_PROJECT_SPEC.md` §7). Keep this stub short and clearly marked as a placeholder.
- **`.gitkeep` files** are used so empty directories (`data/raw/`, `data/processed/`, `backend/app/models/`, and the empty backend package/test dirs that have no content yet) are tracked by git. Directories that will receive a real committed file from a later MT still get a `.gitkeep` now so the folder exists immediately; the `.gitkeep` can be deleted later when real files land (optional, harmless to leave).

## 5. Implementation
All paths below are relative to the **repo root** (the project directory). Create directories first, then the files.

### 5.1 Folder tree to create
Create exactly these directories (per `04_BACKEND_ARCHITECTURE.md` §1 and `06_UIUX_SPEC.md` §10). `docs/` already exists.

```
data/
data/raw/
data/processed/
backend/
backend/app/
backend/app/api/
backend/app/ml/
backend/app/services/
backend/app/schemas/
backend/app/models/
backend/tests/
backend/tests/golden/
frontend/
frontend/mock/
frontend/mock/fixtures/
frontend/src/
frontend/src/theme/
frontend/src/lib/
frontend/src/hooks/
frontend/src/components/
frontend/src/components/ui/
frontend/src/components/controls/
frontend/src/components/panels/
```

> Note: `backend/tests/golden/` holds the committed golden vector (`expected_turkey_1300.json`) created in MT-15 (per `07_TESTING_STRATEGY.md` §2). Create the folder now.

**Run from the repo root.**

PowerShell (Windows — primary dev environment):
```powershell
$dirs = @(
  "data/raw","data/processed",
  "backend/app/api","backend/app/ml","backend/app/services","backend/app/schemas","backend/app/models",
  "backend/tests/golden",
  "frontend/mock/fixtures",
  "frontend/src/theme","frontend/src/lib","frontend/src/hooks",
  "frontend/src/components/ui","frontend/src/components/controls","frontend/src/components/panels"
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
```

Bash (macOS/Linux equivalent):
```bash
mkdir -p \
  data/raw data/processed \
  backend/app/api backend/app/ml backend/app/services backend/app/schemas backend/app/models \
  backend/tests/golden \
  frontend/mock/fixtures \
  frontend/src/theme frontend/src/lib frontend/src/hooks \
  frontend/src/components/ui frontend/src/components/controls frontend/src/components/panels
```

### 5.2 `.gitignore` (repo root) — EXACT content
Create `.gitignore` at the repo root with **exactly** this content (verbatim from `04_BACKEND_ARCHITECTURE.md` §7):

```gitignore
# raw M5 data (too large for GitHub) — keep calendar.csv (small, needed at runtime)
data/raw/*
!data/raw/calendar.csv
# private documents
official_docs/
# python
__pycache__/
*.pyc
.venv/
venv/
.pytest_cache/
# node / frontend
node_modules/
frontend/dist/
# env / secrets
.env
*.local
```

### 5.3 `README.md` stub (repo root)
Create `README.md` at the repo root with exactly this content. It is intentionally a stub; the full README is written in MT-46.

```markdown
# Demand Velocity & Inventory Intelligence

A web dashboard that forecasts 28-day demand for 8 retail products (Walmart M5 data) using a
pre-trained LightGBM model, with a FastAPI backend and a React + TypeScript dashboard frontend.

> **This is a stub README.** The full quickstart, screenshots, and run instructions are added in
> **MT-46**. For now, see the documentation set in [`docs/`](docs/) — start with
> [`docs/00_INDEX.md`](docs/00_INDEX.md).

## Status
Project scaffold created (MT-00). Backend and frontend are built across micro-tasks MT-01…MT-46
(see [`docs/micro-tasks/MT-INDEX.md`](docs/micro-tasks/MT-INDEX.md)).

## Stack
- **Backend:** Python 3.11 · FastAPI · Uvicorn · LightGBM
- **Frontend:** React 18 · TypeScript · Vite · TailwindCSS
- **Packaging:** local-dev (primary) · Docker Compose (optional, MT-45)
```

### 5.4 `.gitkeep` placeholders
Create an empty `.gitkeep` file in each directory that currently has no committed content, so git tracks the empty folders. Create these files:

```
data/raw/.gitkeep
data/processed/.gitkeep
backend/app/models/.gitkeep
backend/tests/golden/.gitkeep
frontend/mock/fixtures/.gitkeep
```

> `data/raw/.gitkeep` is **not** excluded by `.gitignore` because the rule is `data/raw/*` with the negation `!data/raw/calendar.csv`; a `.gitkeep` here would be ignored. To guarantee `data/raw/` exists in the clone, the negation only un-ignores `calendar.csv`. Therefore: keep `data/raw/.gitkeep` on disk for local convenience, but rely on `data/raw/calendar.csv` (committed later) to materialize the folder in clones. Do **not** force-add `data/raw/.gitkeep`. All other `.gitkeep` files above are in non-ignored directories and will be committed normally.

PowerShell:
```powershell
$keeps = @(
  "data/processed/.gitkeep",
  "backend/app/models/.gitkeep",
  "backend/tests/golden/.gitkeep",
  "frontend/mock/fixtures/.gitkeep"
)
foreach ($f in $keeps) { if (-not (Test-Path $f)) { New-Item -ItemType File -Path $f | Out-Null } }
# local-only convenience marker for data/raw (do NOT force-add; it is gitignored):
if (-not (Test-Path "data/raw/.gitkeep")) { New-Item -ItemType File -Path "data/raw/.gitkeep" | Out-Null }
```

Bash:
```bash
touch data/processed/.gitkeep \
      backend/app/models/.gitkeep \
      backend/tests/golden/.gitkeep \
      frontend/mock/fixtures/.gitkeep
touch data/raw/.gitkeep   # local-only; gitignored, do not force-add
```

### 5.5 Git init + first commit
Run from the repo root. (If the project is already a git repo, skip `git init`.)

PowerShell:
```powershell
git init
git add .gitignore README.md
git add data/processed/.gitkeep backend/app/models/.gitkeep backend/tests/golden/.gitkeep frontend/mock/fixtures/.gitkeep
git add docs
git commit -m "MT-00: repo scaffold, .gitignore, README stub"
```

Bash:
```bash
git init
git add .gitignore README.md
git add data/processed/.gitkeep backend/app/models/.gitkeep backend/tests/golden/.gitkeep frontend/mock/fixtures/.gitkeep
git add docs
git commit -m "MT-00: repo scaffold, .gitignore, README stub"
```

> **Important:** Do **not** run `git add data/raw/` and do **not** `git add -f` any raw file. The large CSVs (`sales_train_evaluation.csv`, `sell_prices.csv`, etc.) and `official_docs/` must never be committed (per `04_BACKEND_ARCHITECTURE.md` §7). `calendar.csv` is committed later when it is placed in `data/raw/` (it is the only un-ignored raw file).

## 6. Tests / Verification
Run all commands from the repo root.

1. **Folder tree exists.** Verify the directories from §5.1 are present:
   ```powershell
   $dirs = @("data/raw","data/processed","backend/app/api","backend/app/ml","backend/app/services","backend/app/schemas","backend/app/models","backend/tests/golden","frontend/mock/fixtures","frontend/src/theme","frontend/src/lib","frontend/src/hooks","frontend/src/components/ui","frontend/src/components/controls","frontend/src/components/panels")
   $dirs | ForEach-Object { "{0}  {1}" -f (Test-Path $_), $_ }
   ```
   Every line must start with `True`.

2. **`.gitignore` content is exact.** Open `.gitignore` and confirm it matches the block in §5.2 byte-for-byte (the `data/raw/*` and `!data/raw/calendar.csv` pair must both be present, in that order).

3. **Large CSVs are ignored.** Simulate raw files and confirm git ignores them but would keep `calendar.csv`:
   ```powershell
   New-Item -ItemType File -Force -Path "data/raw/sales_train_evaluation.csv" | Out-Null
   New-Item -ItemType File -Force -Path "data/raw/sell_prices.csv" | Out-Null
   New-Item -ItemType File -Force -Path "data/raw/calendar.csv" | Out-Null
   git status --porcelain
   git check-ignore -v data/raw/sales_train_evaluation.csv data/raw/sell_prices.csv
   git check-ignore data/raw/calendar.csv   # expect: NO output (calendar.csv is NOT ignored)
   ```
   - `git status --porcelain` must **not** list `sales_train_evaluation.csv` or `sell_prices.csv`.
   - `git check-ignore -v` must show both large files matched by the `data/raw/*` rule.
   - `git check-ignore data/raw/calendar.csv` must print **nothing** (exit code 1) — meaning it is tracked-eligible.

4. **`official_docs/` is ignored.** 
   ```powershell
   New-Item -ItemType Directory -Force -Path "official_docs" | Out-Null
   New-Item -ItemType File -Force -Path "official_docs/letter.pdf" | Out-Null
   git check-ignore official_docs/letter.pdf   # expect: official_docs/letter.pdf (it IS ignored)
   git status --porcelain                        # must NOT list official_docs/
   ```

5. **First commit succeeded.**
   ```powershell
   git log --oneline -1
   ```
   Must show the `MT-00: repo scaffold, .gitignore, README stub` commit.

> Clean-up: the dummy files created in steps 3–4 (`sales_train_evaluation.csv`, `sell_prices.csv`, `official_docs/letter.pdf`) can be deleted; `data/raw/calendar.csv` will be replaced by the real file later.

## 7. Acceptance checklist
- [ ] All directories from §5.1 exist and match `04_BACKEND_ARCHITECTURE.md` §1 + `06_UIUX_SPEC.md` §10.
- [ ] `docs/` was left unchanged (not deleted or modified).
- [ ] `.gitignore` exists at repo root with the **exact** content from `04_BACKEND_ARCHITECTURE.md` §7 (§5.2).
- [ ] `README.md` stub exists at repo root and clearly says the full README comes in MT-46.
- [ ] `.gitkeep` files exist in `data/processed/`, `backend/app/models/`, `backend/tests/golden/`, `frontend/mock/fixtures/`.
- [ ] `git status` does **not** list the large raw CSVs (`sales_train_evaluation.csv`, `sell_prices.csv`).
- [ ] `git check-ignore data/raw/calendar.csv` prints nothing (calendar.csv is committable).
- [ ] `official_docs/` is ignored (`git check-ignore official_docs/<file>` matches; not in `git status`).
- [ ] First commit `MT-00: repo scaffold, .gitignore, README stub` exists (`git log --oneline -1`).
- [ ] No raw CSV and no `official_docs/` content was committed.
