# Decision log (v2)

Short record of what was decided and why. Newest decisions are at the bottom.
Decisions about the archived v0.1 Android app are not repeated here.

| # | Date | Decision | Why |
|---|---|---|---|
| D-01 | 9 Nov | **Goal:** from one movement (to the nose and back), tell which hand made it. | Meeting with Prof. Bar-Gad. |
| D-02 | 9 Nov | A high sampling rate is not needed; ~60 samples per second is enough. | The movement is slow. |
| D-03 | 10 Nov | **Web app** instead of the Android app, for both data collection and the final test. The Android app v0.1 goes to `archive/`. | One code for everything; works on Android and iPhone; participants join by link; ~60 Hz in the browser is enough (D-02). |
| D-04 | 10 Nov | Low beep **at the moment the nose touches** the screen. | Simple and clear for the participant. |
| D-05 | 10 Nov | Next trial starts after the phone is still + a **fixed 2 s pause** (no random wait). The only button is "Start" at the beginning. | Reaction time is not needed for the goal. Movements that start before the beep are caught and repeated (D-09). |
| D-06 | 10 Nov | **One grip for everyone:** phone upright, lying in the palm, screen to the face. | The sensor axes must mean the same thing for all people. |
| D-07 | 10 Nov | Nose-to-dot alignment only by instruction and the dot (no camera). | Simple; no camera permission. |
| D-08 | 10 Nov | A touch counts only **inside a zone around the dot**; other touches are logged and ignored. | Fingers holding the phone can touch the edge of the screen. |
| D-09 | 10 Nov | Moved before the beep, or no touch within **10 s** → attempt discarded, message, repeat. Movement duration is not filtered. | Keep only valid trials; the classifier must work at any speed. |
| D-10 | 10 Nov | **6 trials per hand, 2 per speed** (slow / normal / fast), random order. Two blocks: one hand, rest, the other hand; first hand random. | Speeds vary on purpose, so the classifier does not depend on speed. Short session, the extended arm gets tired. |
| D-11 | 10 Nov | Participant data: consent, age, sex, short Edinburgh inventory; device info automatic; anonymous random code. | Describe the sample and handedness without names. |
| D-12 | 10 Nov | Explanation: animated diagram + 1–2 practice trials (not saved). | People do the task alone, by link. |
| D-13 | 10 Nov | Interface in English with a switch to Russian (top-right). | Participants. |
| D-14 | 10 Nov | **Final test:** Prof. Bar-Gad does one movement there and back on the S24 Ultra; the screen shows the hand + confidence; no calibration. If time allows, also make it work on his own phone. | This is the final exam of the trial task. |
| D-15 | 10 Nov | Analysis: explicit features + a simple model (logistic regression / decision tree), tested leave-one-subject-out. A small neural network only for comparison. | 10–30 participants expected; the result should be explainable. |
| D-16 | 11 Nov | **Storage: Supabase.** The browser may only insert data; it cannot read, change or delete it. A trial can be added only to an existing session younger than 3 hours. | Data from many phones in one place, safe even though the link is public. |
| D-17 | 11 Nov | Participant data never go into git. | Privacy. |
| D-18 | 11 Nov | A trial starts only when the phone is **still and upright** for 1 s. | A phone lying on a table must not start a trial (e.g. during the rest). |
| D-19 | 11 Nov | Detection thresholds (stillness, movement before the beep) are first guesses, kept in `web/js/config.js`; check them on the first real recordings with `?debug=1`. | No real web recordings yet. |
| D-20 | 11 Nov | Practice: 2 trials at normal speed with the hand of block 1. Rest between blocks: 20 s countdown, then automatic start. | Only one button ("Start practice") during the task. |
| D-21 | 11 Nov | Web app in plain HTML/CSS/JavaScript (no framework, no build step), published on GitHub Pages from the `gh-pages` branch. | Simple to read and to change; nothing to install. |
| D-22 | 11 Nov | **Pilot run** on the S24 Ultra (session `B34CF91D`, app 2.0.0): 12 trials, 60 Hz, every nose touch inside the zone, 2 attempts discarded as too early. Kept in the database but marked as a pilot (excluded from the analysis). App version raised to 2.1.0. | First real test of the web app. |
| D-23 | 11 Nov | A **new hand or speed is announced** in the centre of the darkened screen before the trial (speed name + seconds). | In the pilot, speed changes were not noticed: "fast" and "slow" trials took similar times. |
| D-24 | 11 Nov | **Every error**: short vibration + a centred card with the reason ("Too early", "No nose touch", "Interrupted"). | In the pilot it was unclear what had happened after an error. |
| D-25 | 11 Nov | Rest between the hands: **10 s** (was 20 s). | Pilot feedback. |
| D-26 | 11 Nov | Thresholds tuned on the pilot: stillness gyro RMS 15 → **10** deg/s, SD of \|a\| 0.5 → **0.25** m/s²; movement before the beep gyro 45 → **20** deg/s, \|a\| change 1.5 → **1.0** m/s². | Pilot: still = 2–6 deg/s, 0.06–0.10 m/s²; pause noise ≤ 13 deg/s, ≤ 0.43 m/s²; real movements always > 20 deg/s but often < 45 deg/s and < 1 m/s² → the old values would miss an early slow movement (now a test case). |
| D-27 | 11 Nov | **Participants so far:** P1 = `F50F9F36`, P2 = `A56549CD` (iPhone, app 2.1.0, 12 trials each). Pilot `B34CF91D` is excluded. | First two people who did the final protocol. |
| D-28 | 11 Nov | iPhone acceleration has the opposite sign to Android; flip it in the analysis (see data_format.md). | Found in P1 and P2: at rest `ay` ≈ −9.6 vs +9.8 on the S24. |
| D-29 | 11 Nov | The "too early" check stays as it is (rotation > 20 deg/s for 3 samples). | On iPhones the rotation while waiting for the beep sometimes reached 19–20 deg/s, so some of the 4 discarded attempts may have been hand sway; an extra repeat does not harm the data. A check based on the net rotation angle was proposed and can be added later. |

