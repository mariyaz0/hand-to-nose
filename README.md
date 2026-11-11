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
| Database (Supabase) | done — [schema](supabase/migrations/20261111000000_initial_schema.sql), [data format](docs/data_format.md) |
| Web app: data collection | v2.0 ready for the first real test — [web/](web/) |
| Analysis and classifier | after the data |
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
Publish: `scripts/publish_pages.sh` (copies `web/` to the `gh-pages` branch).

## Repository

```
web/         data-collection web app
docs/        protocol, decision log, data format
supabase/    database schema (SQL migrations)
scripts/     publishing
archive/     earlier versions (v0.1 Android app)
```

## Data and privacy

No names are collected; each session has a random code. The web page can only add data
to the database; it cannot read it. Raw recordings are not stored in this repository.
