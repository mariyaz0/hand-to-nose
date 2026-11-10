# Archive

Earlier versions of the project. They are kept to show how the project developed.
They are not used any more.

## v0.1-android (7–9 November 2026)

- A native Android app (Kotlin) that played the beeps and recorded the accelerometer
  and gyroscope at over 200 samples per second, saving each session as a ZIP file.
- Tested on a Samsung Galaxy S24 Ultra (Android 16); the first real recordings worked.
- See [v0.1-android/README.md](v0.1-android/README.md) and
  [v0.1-android/docs/proposal.md](v0.1-android/docs/proposal.md).

**Why it was replaced (10 November 2026).** At the meeting on 9 November the goal became
a classification task: from one movement, tell which hand made it. For this,
a high sampling rate is not needed, but data from many people are. A web app can be
opened by link on any Android phone or iPhone, so collecting data is much easier.
The protocol was also simplified (one grip, low beep at the nose touch, fixed pause).
See [../docs/decisions.md](../docs/decisions.md).
