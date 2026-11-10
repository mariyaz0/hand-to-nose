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
