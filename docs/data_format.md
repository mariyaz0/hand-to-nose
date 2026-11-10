# Data format (v2, web app)

Data are stored in Supabase (project `hand-to-nose`, region eu-central-1).
Schema: [`supabase/migrations/20261111000000_initial_schema.sql`](../supabase/migrations/20261111000000_initial_schema.sql).

## Access model

| Who | Can do |
|---|---|
| Browser (publishable key, role `anon`) | **insert only** into `sessions` and `trials` |
| Browser | cannot read, update or delete anything |
| Analysis (service key / dashboard) | read everything |

Extra guards:
- a collection session cannot be stored without consent;
- a trial can only be added to a session that exists, is < 3 h old and has < 40 trials;
- size limits on JSON columns (raw samples < 2 MB per trial).

Verified on 2026-11-11: anon insert works; anon select is denied; a trial for an unknown session is rejected by RLS; a collect session without consent is rejected; Supabase security and performance advisors report no issues.

## `sessions` — one run of the app

| Column | Meaning |
|---|---|
| `id` | UUID generated in the browser; also the anonymous participant code |
| `mode` | `collect` (data collection) or `test` (final exam) |
| `language` | `en` / `ru` |
| `consent_given` | must be true in `collect` mode |
| `age`, `sex` | questionnaire |
| `edinburgh` | short Edinburgh Handedness Inventory answers: writing, throwing, toothbrush, spoon; each −100 (always left), −50, 0, 50, 100 (always right) |
| `edinburgh_lq` | laterality quotient = mean of the four answers |
| `first_hand` | which hand the app asked for in block 1 (chosen at random) |
| `device` | user agent, platform, screen size, pixel ratio, touch-zone radius, sensor availability |

## `trials` — one successful movement (to the nose and back)

Failed attempts (moved before the high beep, or no nose touch within 10 s) are **not stored**; the app shows the reason and repeats. Their reasons are kept in `failed_before` of the next successful trial.

| Column | Meaning |
|---|---|
| `block_index`, `trial_index` | position in the session |
| `hand` | label: `right` / `left` (NULL in test mode) |
| `speed` | instructed speed: `slow` (≈3–4 s), `normal` (≈1–2 s), `fast` (< 1 s); NULL in test mode |
| `t_beep_high_ms` | high beep (go signal) |
| `t_touch_start_ms` | nose touched the zone around the dot (= low beep) |
| `t_touch_end_ms` | nose left the screen (start of the way back) |
| `t_rest_ms` | phone still again after the return |
| `touch_x_px`, `touch_y_px` | touch position relative to the dot centre (CSS px) |
| `touch_events` | all touches, including ignored ones outside the zone |
| `sample_rate_hz`, `n_samples` | measured mean sampling rate and sample count |
| `samples` | raw sensor data, columnar JSON (below) |
| `predicted_hand`, `predicted_prob`, `model_version` | test mode only |

All times are in milliseconds on the same clock as `samples.t`.

### `samples` (columnar arrays of equal length)

| Key | Source (browser API) | Unit |
|---|---|---|
| `t` | event timestamp | ms |
| `ax`, `ay`, `az` | `DeviceMotionEvent.accelerationIncludingGravity` | m/s² |
| `lx`, `ly`, `lz` | `DeviceMotionEvent.acceleration` (without gravity; may be null on some devices) | m/s² |
| `gx`, `gy`, `gz` | `DeviceMotionEvent.rotationRate` (alpha, beta, gamma) | deg/s |
| `oa`, `ob`, `og` | `DeviceOrientationEvent` (alpha, beta, gamma) | deg |

The recording of a trial covers the still period before the high beep, the movement to the nose, the touch, the way back and the still period after it.
