# Protocol (v2)

## One trial

1. **Start position.** The phone is upright (portrait) and lies in the palm: the palm is
   behind the phone, the fingers are on its sides. The screen faces the person. The arm
   is fully extended forward, and the dot in the centre of the screen is in front of the nose.
2. The phone is still → after a fixed pause of **2 s** a **high beep** sounds.
3. The person bends the elbow and brings the phone to the face at the instructed speed.
4. The nose touches the screen inside the zone around the dot (a circle of about 2–3 cm).
   At the moment of the touch a **low beep** sounds. Touches outside the zone (for
   example, a finger on the edge of the screen) are logged and ignored.
5. The person moves the arm back to the extended position, screen facing the person.
6. When the phone is still again, the screen shows "Recorded ✓" and the progress
   (e.g. "3 of 12"). The next trial starts automatically.

Beeps: high 1000 Hz, low 600 Hz, 120 ms each (the same as in v0.1).

### Failed attempts

| Problem | What happens |
|---|---|
| The phone moved before the high beep | attempt discarded, message with the reason, the trial is repeated |
| No nose touch within 10 s after the high beep | attempt discarded, message with the reason, the trial is repeated |

The duration of the movement is not filtered: people move at different speeds, and the
classifier must work for all of them.

## One session (data collection)

1. Language: English by default; switch to Russian in the top-right corner.
2. Short consent screen. No names are collected; each session gets a random code.
3. Questionnaire: age, sex, short Edinburgh Handedness Inventory (writing, throwing,
   toothbrush, spoon).
4. Permission for the motion sensors (needed on iPhone).
5. Explanation: an animated diagram of the movement, then 1–2 practice trials
   (not saved).
6. **Block 1:** 6 trials with one hand — 2 slow, 2 normal, 2 fast, in random order.
7. Rest.
8. **Block 2:** 6 trials with the other hand, the same way.
9. Thank-you screen.

Which hand comes first is random. The app shows the hand and the speed in large letters
before every trial. Speed guide: fast ≈ under 1 s, normal ≈ 1–2 s, slow ≈ 3–4 s.

Each trial is uploaded right after it is recorded, so a closed tab does not lose the
trials already done.

## Test mode (final exam)

One movement to the nose and back, done with an unknown hand. The screen shows the
predicted hand and the confidence, e.g. "Right hand (87%)". There is no calibration:
the model is trained only on other people.
