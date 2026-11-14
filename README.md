# Hand-to-Nose: which hand made the movement?

A web app that tells, from one movement, whether a person used the **right** or the
**left** hand. The person holds a phone in one hand with the arm extended, brings it to
the nose on a high beep, touches the screen with the nose (low beep) and moves the arm
back. The phone's motion sensors record the movement. No camera and no names are used.

Trial project for the Integrative Basal Ganglia lab (Prof. Izhar Bar-Gad), Bar-Ilan University.
Author: Mariya Zastenskaya.

## Plan

1. **Collect data** — a web app that anyone can open by link on their own phone
   (Android or iPhone). Each person does 6 movements with each hand at three speeds.
2. **Find the patterns** — compare how people move the phone with the right and the
   left hand; choose clear features.
3. **Classify** — a simple model on these features, tested on people it has never seen.
4. **Final test** — one movement there and back → "Right hand (87%)".

## Status

| Part | State |
|---|---|
| Protocol and decisions | done — [docs/protocol.md](docs/protocol.md), [docs/decisions.md](docs/decisions.md) |
| Database (Supabase) | done — [schema](supabase/migrations/20261110231615_initial_schema.sql), [data format](docs/data_format.md) |
| Web app: data collection | v2.2 — [web/](web/) |
| Looking at the data | export + overview notebook — [analysis/](analysis/), [notebooks/](notebooks/) |
| Features and classifier | first model: 94 % of reaches correct on unseen people (22 people, leave-one-subject-out) — [notebooks/02_hand_model.ipynb](notebooks/02_hand_model.ipynb) |
| Web app: test mode | after the classifier |

## Web app

Link for participants: **https://mariyaz0.github.io/hand-to-nose/**
(add `?debug=1` to see live sensor values and the detection thresholds).

| File | What it does |
|---|---|
| `web/index.html`, `web/css/style.css` | screens |
| `web/js/app.js` | order of screens, plan of trials, upload |
| `web/js/trial.js` | one trial as a state machine (still → pause → beep → touch → back) |
| `web/js/motion.js` | stillness and movement detection, sample buffer |
| `web/js/config.js` | all settings and thresholds |
| `web/js/i18n.js` | English and Russian texts |
| `web/js/sensors.js`, `audio.js`, `db.js`, `demo.js` | sensors, beeps, Supabase, animation |

Run locally: `npm run serve` → http://localhost:8000 (sensors need a phone; on a computer
use `?debug=1`). Tests of the trial logic on simulated movements: `npm test`.
A whole simulated session in headless Chrome (fake sensors and touches, database calls
intercepted): `npm install`, `npm run serve`, then `npm run test:e2e`.
Publish: `scripts/publish_pages.sh` (copies `web/` to the `gh-pages` branch and adds `?v=<commit>` to every CSS/JS address, so phones never mix cached old files with a new page).

## Looking at the data

The recordings are in Supabase: table `sessions` (one row per person) and table `trials`
(one row per movement). The raw sensor data of a movement are in the JSON field
`trials.samples` (arrays `t`, `ax ay az`, `lx ly lz`, `gx gy gz`, `oa ob og`), see
[docs/data_format.md](docs/data_format.md).

1. `pip install -r analysis/requirements.txt`
2. Create `.env` in the repository root with `SUPABASE_SECRET_KEY=sb_secret_...`
   (Supabase → Project Settings → API Keys). `.env` is ignored by git.
3. `python analysis/export_data.py` → `data/raw/` (ignored by git).
4. Open [notebooks/01_data_overview.ipynb](notebooks/01_data_overview.ipynb) (VS Code or
   `jupyter lab`) and run all cells.

| File | What it does |
|---|---|
| `analysis/export_data.py` | downloads all sessions and trials from Supabase into `data/raw/` |
| `analysis/loading.py` | turns the export into pandas tables: sessions → trials → samples; flips iPhone acceleration |
| `analysis/plots.py` | plots used by the notebooks |
| `analysis/features.py` | one reach (high beep → nose touch) → features; 50 Hz grid, smoothing, real rotation axes |
| `analysis/model.py` | analysis rules, logistic regression, leave-one-subject-out test |
| `notebooks/01_data_overview.ipynb` | what is recorded, where, how it looks; right vs left hand |
| `notebooks/02_hand_model.ipynb` | features, the rules applied, test on unseen people, simpler versions |

## Repository

```
web/         data-collection web app
analysis/    export from Supabase, loading into pandas, plots, features, model
notebooks/   Jupyter notebooks (looking at the data; features and model)
docs/        protocol, decision log, data format
supabase/    database schema (SQL migrations)
scripts/     publishing
archive/     earlier versions (v0.1 Android app)
```

## Data and privacy

No names are collected; each session has a random code. The web page can only add data
to the database; it cannot read it. Raw recordings and the secret key are not stored in this
repository (`data/` and `.env` are in `.gitignore`); the notebooks show participants only in
aggregate.
