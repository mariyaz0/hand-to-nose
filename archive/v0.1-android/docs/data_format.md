# Data format (schema version 1)

The contract between the Android app (`android/.../core/Formats.kt`) and the analysis
(`analysis/handtonose/io.py`). `handtonose validate <folder or zip>` checks a session
against it.

A session is a folder `<participant>_<yyyyMMdd-HHmmss>/` (inside the exported `.zip`):

| File | Content |
|---|---|
| `session.json` | participant, device, sensors, plan, progress, clock check |
| `acc.csv` | accelerometer, m/s², **includes gravity** (`Sensor.TYPE_ACCELEROMETER`) |
| `gyro.csv` | gyroscope, rad/s (`Sensor.TYPE_GYROSCOPE`, calibrated) |
| `events.csv` | everything that happened, in time order |
| `ground_truth.csv` | **simulated sessions only** |

## Time
All `t_ns` are integer nanoseconds since phone boot: `SensorEvent.timestamp` for sensors,
`SystemClock.elapsedRealtimeNanos()` for events. `session.json → recording.clock_check`
stores the median difference between the moment a sample arrived and its timestamp;
a value of a few ms (`same_time_base: true`) confirms that sensors and cues share one clock.
Cue times are when playback was *requested*; the sound comes out a few ms later
(output latency, measured per phone: [validation_video.md](validation_video.md)).

## acc.csv / gyro.csv

```
t_ns,x,y,z
5000001100000,0.0123,9.80665,0.0441
```
Axes: the Android device frame (x to the right of the screen, y up along the screen,
z out of the screen). Numbers use `.` as decimal separator in every locale.

## events.csv

```
t_ns,event,block_index,attempt,trial_index,is_practice,hand,speed,grip,note
```

| event | when | fields filled |
|---|---|---|
| `session_start` / `session_end` | session begins / ends | note |
| `block_start` / `block_end` | block begins / ends normally | block_index, attempt, hand, speed, grip |
| `block_aborted` | block stopped (note = reason) | as above |
| `block_skipped` | block skipped by the experimenter | as above |
| `trial_start` | "keep still" shown | + trial_index, is_practice |
| `cue_to_nose` | HIGH beep requested | + trial_index, is_practice |
| `cue_from_nose` | LOW beep requested | + trial_index, is_practice |
| `trial_end` | end of the rest after return | + trial_index, is_practice |
| `sensor_accuracy` | Android reported an accuracy change | note = sensor=value |

`attempt` counts restarts of the same block (1, 2, ...). The analysis uses the last attempt
that reached `block_end`.

## session.json (main keys)

```json
{
  "schema_version": 1,
  "app": {"name": "HandToNose", "version": "0.1.0"},
  "participant": {"id": "P001", "age": 24, "sex": "female",
    "ehi_sf": {"answers": [...], "scores": [...], "laterality_quotient": 87.5,
               "category": "right", "dominant_hand": "right"}},
  "device": {"manufacturer": "...", "model": "...", "android_release": "14", "sdk_int": 34},
  "audio": {"sample_rate_hz": 48000, "output_frames_per_buffer": "192", ...},
  "sensors": {"accelerometer": {"name": "...", "vendor": "...", "resolution": ..., "min_delay_us": ..., ...},
              "gyroscope": {...}},
  "requested_sampling_period_us": 5000,
  "recording": {"sample_counts": {...}, "effective_rate_hz": {...}, "clock_check": {...}},
  "plan": {"seed": "-5808556873153909620", "config": {...}, "blocks": [{"block_index": 0, "hand": "right", ...,
           "trials": [{"trial_index": 0, "is_practice": true, "foreperiod_ms": 2210, "hold_ms": 3540, "rest_ms": 3000}, ...]}]},
  "progress": {"completed_blocks": [...], "skipped_blocks": [...], "attempts": [...], "finished": true}
}
```

`plan.seed` is the FNV-1a 64-bit hash of the participant ID as a signed integer string
(Python: `handtonose.io.seed_for`; reference: `seed_for("a") == -5808556873153909620`).
Simulated sessions add a `"simulation"` block; the validator then warns "SYNTHETIC".
