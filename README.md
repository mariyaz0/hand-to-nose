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
| Web app: data collection | next |
| Analysis and classifier | after the data |
| Web app: test mode | after the classifier |

## Repository

```
docs/        protocol, decision log, data format
supabase/    database schema (SQL migrations)
archive/     earlier versions (v0.1 Android app)
```

## Data and privacy

No names are collected; each session has a random code. The web page can only add data
to the database; it cannot read it. Raw recordings are not stored in this repository.
