// Settings of the data-collection app. Everything that may need tuning is here.

export const APP_VERSION = '2.1.0';

// Supabase: the publishable key is public by design. The database only allows
// inserting rows (see supabase/migrations/), so the key cannot be used to read data.
export const SUPABASE_URL = 'https://fcyhdmthrtkqauxbjpti.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_rJVA8mnGTtjF4D8V3NOeqA_lRLBMnYl';

// Protocol (docs/protocol.md)
export const PROTOCOL = {
  trialsPerSpeed: 2,                 // per hand: 2 slow + 2 normal + 2 fast = 6
  speeds: ['slow', 'normal', 'fast'],
  practiceTrials: 2,                 // not saved
  practiceSpeed: 'normal',
  restBetweenBlocksS: 10,
  beepHighHz: 1000,
  beepLowHz: 600,
  beepMs: 120,
};

// Trial detection (open the app with ?debug=1 to see the live values).
// Tuned on the first real recording (S24 Ultra, session B34CF91D, 11 Nov 2026):
//   holding still: rotation RMS 2-6 deg/s, SD of |a| 0.06-0.10 m/s^2;
//   during the 2 s pause: rotation <= 13 deg/s, | |a| - g | <= 0.43 m/s^2;
//   real movements: rotation always > 20 deg/s, but often < 45 deg/s, and
//   | |a| - g | often < 1 m/s^2 (slow movements) -> the old thresholds (45, 1.5)
//   would miss an early slow movement.
export const DETECT = {
  stillWindowMs: 1000,      // phone must be still this long before the pause starts
  stillGyroRms: 10,         // deg/s, RMS of rotation rate magnitude in the window
  stillAccStd: 0.25,        // m/s^2, SD of |acceleration incl. gravity| in the window
  uprightMin: 0.6,          // |a_y| / |a| : phone held upright (not lying on a table)
  minSamplesFraction: 0.5,  // window must contain at least this share of expected samples
  pauseMs: 2000,            // fixed pause between "still" and the high beep
  moveGyro: 20,             // deg/s: rotation above this during the pause = moved before the beep
  moveAccDev: 1.0,          // m/s^2: | |a| - baseline | above this during the pause = moved
  moveSamples: 3,           // consecutive samples above a threshold needed
  noTouchTimeoutMs: 10000,  // no nose touch within this time after the high beep = failed
  touchHoldTimeoutMs: 10000,// nose never leaves the screen: continue without touch end
  returnTimeoutMs: 10000,   // phone not still within this time after the touch: save anyway
  preMs: 1000,              // samples kept before the still window
  postMs: 500,              // samples kept after the phone is still again
  zoneRadiusCm: 2.5,        // touch zone around the dot
  cssPxPerCm: 59,           // typical phone: 1 cm ~ 59 CSS px (no browser API gives the real value)
  zoneEdgeMarginPx: 40,     // keep the zone this far from the left/right screen edges
};

export const UI = {
  resultShowMs: 1500,       // "Recorded" at the bottom
  failShowMs: 3500,         // error card in the centre
  speedChangeShowMs: 2500,  // "New speed" card before a trial
  handChangeShowMs: 3000,   // "Switch hand" card before a trial
  noticeShowMs: 3500,       // "Practice is over"
  vibrateMs: 250,           // short vibration on every error (Android; iPhone browsers cannot vibrate)
};
