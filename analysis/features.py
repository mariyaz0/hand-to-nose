"""Features of one reach (high beep -> nose touch) for the hand classifier.

Rules (docs/decisions.md): only the reach is used (D-50); every trial is put on an even
50 Hz time grid and smoothed before the features are computed (D-46); acceleration axes
are flipped for iPhone, the rotation rate is not (D-28, D-36, D-51); missing values are
not filled in (D-45). A trial is dropped only if its reach cannot be found in the data,
and the reason is kept (D-43).

Why these features. With the phone upright and the screen facing the person, a left-hand
movement is roughly the mirror image of a right-hand movement (mirror plane = the
person's midline, i.e. the phone's x axis is reversed). Under that mirror
    acceleration  x -> -x,  y -> y,  z -> z            (an ordinary vector)
    rotation      about x -> same, about y -> -, about z -> -   (an axial vector)
so only acceleration x, rotation about y and rotation about z change sign between the
hands. The features are built from these three channels only; the others look the
same for both hands. Rotation about y = turning the phone about its long (vertical) axis;
rotation about z = turning it in the screen plane; acceleration x = sideways (screen x).

Typical use:

    raw_sessions, raw_trials = load_raw()
    feats = features_table(raw_sessions, raw_trials)   # one row per trial
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from loading import handedness_group

# ---------------------------------------------------------------- preprocessing settings

GRID_MS = 20.0          # even time grid: 50 Hz
SMOOTH_POINTS = 5       # centred moving average over 5 grid points = 100 ms (first zero at 10 Hz)
BASELINE_MS = 300.0     # still phone before the high beep, used as the start value
TOUCH_NEAR_RADII = 1.5  # a nose touch just outside the zone still ends the reach
MIN_REACH_MS = 200.0    # shorter "reaches" cannot be real movements
MIN_TOTAL_ROTATION = 4.0  # deg turned in total during the reach; below this the phone did not move (D-52)

# Stored column -> physical axis (D-51: the browsers report rotationRate alpha, beta, gamma
# about x, y, z; the app stored alpha in gz, beta in gx, gamma in gy).
ROTATION_COLUMNS = {"rot_x": "gz", "rot_y": "gx", "rot_z": "gy"}
ACC_COLUMNS = ["ax", "ay", "az"]

# The feature columns, in a fixed order (the browser test mode must compute the same).
FEATURES = [
    "rot_y_angle",   # net turn about y over the reach, deg
    "rot_y_max",     # largest positive rotation rate about y, deg/s
    "rot_y_min",     # largest negative rotation rate about y, deg/s
    "rot_z_angle",   # net turn about z (in the screen plane), deg
    "rot_z_max",
    "rot_z_min",
    "acc_x_mean",    # mean sideways acceleration (with gravity) minus its start value, m/s²
    "acc_x_max",
    "acc_x_min",
]


def _arr(values) -> np.ndarray:
    return np.array([np.nan if v is None else v for v in (values or [])], dtype=float)


def moving_average(x: np.ndarray, n: int = SMOOTH_POINTS) -> np.ndarray:
    """Centred moving average; at the edges the window is shortened (no padding)."""
    if n <= 1 or len(x) == 0:
        return x.copy()
    k = np.ones(n)
    num = np.convolve(x, k, mode="same")
    den = np.convolve(np.ones_like(x), k, mode="same")
    return num / den


def drop_repeats(t: np.ndarray, channels: np.ndarray) -> np.ndarray:
    """Mask of samples to keep: a sample whose values all equal the previous sample's is a
    re-delivered reading (Android browsers), not a new measurement."""
    keep = np.ones(len(t), dtype=bool)
    if len(t) > 1:
        same = np.all(channels[1:] == channels[:-1], axis=1)
        keep[1:] = ~same
    return keep


def preprocess_trial(trial: dict, platform: str) -> pd.DataFrame | None:
    """Raw samples of one trial on an even 50 Hz grid, smoothed.

    Columns: t_ms (same clock as the trial's event times), ax, ay, az (Android sign
    convention), rot_x, rot_y, rot_z (deg/s). Returns None if the trial has no rotation
    rate or too few samples.
    """
    smp = trial.get("samples") or {}
    t = _arr(smp.get("t"))
    if len(t) < 10:
        return None
    acc = np.column_stack([_arr(smp.get(c)) for c in ACC_COLUMNS])
    rot = np.column_stack([_arr(smp.get(src)) for src in ROTATION_COLUMNS.values()])
    if np.isnan(rot).all() or np.isnan(acc).all():
        return None
    if platform == "iPhone":
        acc = -acc  # Safari reports acceleration with the opposite sign (D-28, D-36)

    values = np.column_stack([acc, rot])
    ok = ~np.isnan(values).any(axis=1) & ~np.isnan(t)
    t, values = t[ok], values[ok]
    keep = drop_repeats(t, values)
    keep &= np.concatenate([[True], np.diff(t) > 0])  # equal timestamps: keep the first
    t, values = t[keep], values[keep]
    if len(t) < 10:
        return None

    grid = np.arange(t[0], t[-1] + 1e-9, GRID_MS)
    cols = ACC_COLUMNS + list(ROTATION_COLUMNS)
    out = {"t_ms": grid}
    for j, c in enumerate(cols):
        out[c] = moving_average(np.interp(grid, t, values[:, j]))
    return pd.DataFrame(out)


# ---------------------------------------------------------------- the reach


def reach_end_ms(trial: dict, zone_radius_px: float | None) -> tuple[float | None, str]:
    """End of the reach: the first nose touch after the high beep.

    That is the first touch-down after the beep inside the zone or just outside it
    (within TOUCH_NEAR_RADII zone radii); after a touch just outside the zone the person
    touches again, and `t_touch_start_ms` is that later touch (D-43). Falls back to
    `t_touch_start_ms`.
    """
    beep = trial.get("t_beep_high_ms")
    touch = trial.get("t_touch_start_ms")
    best = None
    for e in trial.get("touch_events") or []:
        if e.get("type") != "down" or beep is None or e.get("t") is None or e["t"] <= beep:
            continue
        near = bool(e.get("in_zone"))
        if not near and zone_radius_px and e.get("x") is not None and e.get("y") is not None:
            near = math.hypot(e["x"], e["y"]) <= TOUCH_NEAR_RADII * zone_radius_px
        if near and (best is None or e["t"] < best):
            best = e["t"]
    if touch is not None and (best is None or touch < best):
        best = touch
    if best is None:
        return None, "no nose touch"
    return float(best), "first touch" if touch is None or best < touch else "in-zone touch"


def trial_features(trial: dict, platform: str, zone_radius_px: float | None) -> dict:
    """Features of one reach, or a reason why the reach cannot be found."""
    out = {name: np.nan for name in FEATURES}
    out.update({"excluded": None, "reach_ms": np.nan, "end_from": None, "turned_deg": np.nan})

    beep = trial.get("t_beep_high_ms")
    if beep is None:
        out["excluded"] = "no high beep"
        return out
    d = preprocess_trial(trial, platform)
    if d is None:
        out["excluded"] = "no rotation rate or too few samples"
        return out
    end, end_from = reach_end_ms(trial, zone_radius_px)
    out["end_from"] = end_from
    if end is None:
        out["excluded"] = end_from
        return out
    out["reach_ms"] = end - beep
    if end - beep < MIN_REACH_MS:
        out["excluded"] = "reach shorter than 0.2 s"
        return out

    t = d["t_ms"].to_numpy()
    base = (t >= beep - BASELINE_MS) & (t <= beep)
    reach = (t >= beep) & (t <= end)
    if base.sum() < 3 or reach.sum() < 5:
        out["excluded"] = "recording does not cover the reach"
        return out

    dt_s = GRID_MS / 1000
    speed = np.sqrt(d.loc[reach, ["rot_x", "rot_y", "rot_z"]].pow(2).sum(axis=1))
    out["turned_deg"] = float(speed.sum() * dt_s)  # total angle turned, any direction
    if not out["turned_deg"] >= MIN_TOTAL_ROTATION:
        out["excluded"] = "phone did not move (turned < 4 deg in total)"
        return out

    for axis in ["y", "z"]:
        r = d.loc[reach, f"rot_{axis}"].to_numpy()
        out[f"rot_{axis}_angle"] = float(r.sum() * dt_s)
        out[f"rot_{axis}_max"] = float(r.max())
        out[f"rot_{axis}_min"] = float(r.min())
    ax0 = d.loc[base, "ax"].mean()
    ax = d.loc[reach, "ax"].to_numpy() - ax0
    out["acc_x_mean"] = float(ax.mean())
    out["acc_x_max"] = float(ax.max())
    out["acc_x_min"] = float(ax.min())
    return out


def features_table(raw_sessions: list[dict], raw_trials: list[dict]) -> pd.DataFrame:
    """One row per trial: labels, session facts used by the selection rules, features."""
    sess = {}
    for s in raw_sessions:
        device = s.get("device") or {}
        sess[s["id"]] = {
            "code": s["id"][:8].upper(),
            "is_pilot": bool(s.get("is_pilot")),
            "mode": s.get("mode"),
            "platform": device.get("platform") or (
                "iPhone" if "iPhone" in (device.get("user_agent") or "") else "Android"
            ),
            "has_rotation": (device.get("sensors") or {}).get("has_rotation"),
            "age": s.get("age"),
            "handedness": handedness_group(s.get("edinburgh_lq")),
            "zone_r_px": (device.get("zone") or {}).get("r_px"),
        }
    rows = []
    for tr in raw_trials:
        s = sess.get(tr["session_id"])
        if s is None:
            continue
        f = trial_features(tr, s["platform"], s["zone_r_px"])
        rows.append(
            {
                "trial_id": tr["id"],
                "session_id": tr["session_id"],
                "code": s["code"],
                "is_pilot": s["is_pilot"],
                "mode": s["mode"],
                "platform": s["platform"],
                "has_rotation": s["has_rotation"],
                "age": s["age"],
                "handedness": s["handedness"],
                "block_index": tr.get("block_index"),
                "trial_index": tr.get("trial_index"),
                "hand": tr.get("hand"),
                "speed": tr.get("speed"),
                **f,
            }
        )
    df = pd.DataFrame(rows)
    if not df.empty:
        df["n_trials_in_session"] = df.groupby("session_id")["trial_id"].transform("count")
    return df
