# Hand-to-Nose: measuring the hand-to-nose movement with a phone

A tool to record and analyse a phone-based version of the finger-to-nose test.
The person holds a phone with the arm extended; on a high beep they touch the nose
with that hand, on a low beep they return. The phone's motion sensors record the
movement. No camera and no names are used.

**Why.** Parkinson's disease usually starts on one side of the body. To tell whether a
patient's difference between the hands is abnormal, we first need to know how large
this difference is in healthy right- and left-handed people. This project is a first
step towards measuring that with an ordinary phone.

Trial project for the Integrative Basal Ganglia lab (Prof. Izhar Bar-Gad), Bar-Ilan University.
Author: Mariya Zastenskaya.

## Status

| Part | State |
|---|---|
| Recording app (`android/`) | v0.1, works; tested on Samsung S24 Ultra (Android 16) |
| Analysis (Python) | next step, in progress |

## Recording app (Android, Kotlin)

What a session looks like:
1. Participant code (e.g. P001), age, sex (optional) and a 4-question handedness
   questionnaire (Edinburgh Handedness Inventory - Short Form).
2. Blocks of trials. One block = one condition: hand (right / left) × speed
   (slow / natural / fast) × way of holding the phone (upright / flat). Hands alternate
   between blocks; the order of conditions is random but reproducible from the participant code.
3. Each trial: arm straight forward, keep still → after a **random** wait, a high beep
   → touch the nose and stay → low beep → return and keep still. The random wait means
   the beep cannot be anticipated, so reaction time is meaningful.
4. At the end the session is saved as a ZIP file in `Download/HandToNose/` on the phone.

What is recorded:
- accelerometer and gyroscope with hardware timestamps (over 200 samples per second);
- the time of every beep and event, on the same clock as the sensors;
- device and sensor details, so every recording documents its own quality.

The exact file format is described in [docs/data_format.md](docs/data_format.md).

**How to run:** open the folder `android/` in Android Studio (Ladybug 2024.2 or newer),
connect an Android phone (Android 10+) with USB debugging on, press Run.

## Analysis (planned)

```
recording (.zip) → check data quality → resample and filter → find the start and end
of every movement → measures per movement → summary per condition → left vs right hand
```

- **Per movement:** reaction time (beep → start), duration, peak speed, smoothness,
  tremor while the hand is still.
- **Per condition:** median, variability and change over repetitions (slowing down is
  typical in Parkinson's disease).
- **Per person:** asymmetry index between the dominant and non-dominant hand, (D − ND) / (D + ND).
- **Checking the method:** first on simulated movements with known true values, then on
  my own recordings against slow-motion video.

## Data and privacy

Participants are identified only by a code. Raw recordings are not stored in this repository.

## Documents
- [docs/proposal.md](docs/proposal.md) - one-page plan of the project
- [docs/data_format.md](docs/data_format.md) - file format of a recording
