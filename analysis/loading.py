"""Load the exported data (data/raw/, written by export_data.py) into pandas tables.

Three levels, from coarse to fine:

    sessions_table()  one row per session (one person, one run of the app)
    trials_table()    one row per movement (to the nose and back), without raw samples
    samples_table()   one row per sensor sample, with the labels of its trial

Typical use:

    raw_sessions, raw_trials = load_raw()
    sessions = sessions_table(raw_sessions)
    trials = trials_table(raw_trials, sessions)
    samples = samples_table(raw_trials, trials)

See docs/data_format.md for the meaning of every column.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "raw"

ACC_WITH_GRAVITY = ["ax", "ay", "az"]
ACC_LINEAR = ["lx", "ly", "lz"]
ROTATION = ["gx", "gy", "gz"]
ORIENTATION = ["oa", "ob", "og"]
SENSOR_KEYS = ACC_WITH_GRAVITY + ACC_LINEAR + ROTATION + ORIENTATION

CHANNEL_LABELS = {
    "ax": "acc. x (with gravity), m/s²",
    "ay": "acc. y (with gravity), m/s²",
    "az": "acc. z (with gravity), m/s²",
    "lx": "acc. x (no gravity), m/s²",
    "ly": "acc. y (no gravity), m/s²",
    "lz": "acc. z (no gravity), m/s²",
    "gx": "rotation about y (gx), deg/s",
    "gy": "rotation about z (gy), deg/s",
    "gz": "rotation about x (gz), deg/s",
    "oa": "orientation alpha, deg",
    "ob": "orientation beta, deg",
    "og": "orientation gamma, deg",
}

# Event columns of `trials` (ms from the first sample of the trial) and their names.
EVENTS = {
    "t_beep_high_ms": "high beep",
    "t_touch_start_ms": "nose touch",
    "t_touch_end_ms": "nose off",
    "t_rest_ms": "still again",
}


# --------------------------------------------------------------------------- raw files


def load_raw(data_dir: Path = DATA_DIR) -> tuple[list[dict], list[dict]]:
    """Read sessions.json and trials.json exactly as exported from Supabase."""
    data_dir = Path(data_dir)
    paths = [data_dir / "sessions.json", data_dir / "trials.json"]
    missing = [p for p in paths if not p.exists()]
    if missing:
        raise FileNotFoundError(
            f"{missing[0]} not found. Run `python analysis/export_data.py` first."
        )
    return tuple(json.loads(p.read_text(encoding="utf-8")) for p in paths)  # type: ignore[return-value]


def export_info(data_dir: Path = DATA_DIR) -> dict:
    p = Path(data_dir) / "export_info.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


# --------------------------------------------------------------------------- sessions


def handedness_group(lq: float | None) -> str:
    """Edinburgh laterality quotient -> group (usual cut-offs: above +40 / below -40)."""
    if lq is None or (isinstance(lq, float) and math.isnan(lq)):
        return "unknown"
    if lq > 40:
        return "right-handed"
    if lq < -40:
        return "left-handed"
    return "mixed"


def _browser(user_agent: str) -> str:
    ua = user_agent or ""
    if "SamsungBrowser" in ua:
        return "Samsung Internet"
    if "CriOS" in ua:
        return "Chrome (iOS)"
    if "FxiOS" in ua or "Firefox" in ua:
        return "Firefox"
    if "Chrome" in ua:
        return "Chrome"
    if "Safari" in ua:
        return "Safari"
    return "other"


def _platform(device: dict) -> str:
    p = device.get("platform")
    if p:
        return p
    ua = device.get("user_agent", "")
    if "iPhone" in ua or "iPad" in ua:
        return "iPhone"
    if "Android" in ua:
        return "Android"
    return "other"


def sessions_table(raw_sessions: list[dict]) -> pd.DataFrame:
    """One row per session. `code` = first 8 characters of the id, as used in the docs."""
    rows = []
    for s in raw_sessions:
        device = s.get("device") or {}
        sensors = device.get("sensors") or {}
        rows.append(
            {
                "session_id": s["id"],
                "code": s["id"][:8].upper(),
                "created_at": s.get("created_at"),
                "app_version": s.get("app_version"),
                "mode": s.get("mode"),
                "is_pilot": bool(s.get("is_pilot")),
                "pilot_note": s.get("pilot_note"),
                "language": s.get("language"),
                "age": s.get("age"),
                "sex": s.get("sex"),
                "edinburgh_lq": s.get("edinburgh_lq"),
                "handedness": handedness_group(s.get("edinburgh_lq")),
                "first_hand": s.get("first_hand"),
                "platform": _platform(device),
                "browser": _browser(device.get("user_agent", "")),
                "speed_order": ", ".join(device.get("speed_order") or []) or None,
                "measured_rate_hz": sensors.get("measured_rate_hz"),
                "has_rotation": sensors.get("has_rotation"),
            }
        )
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["created_at"] = pd.to_datetime(df["created_at"], utc=True, format="ISO8601")
    df["age"] = pd.to_numeric(df["age"], errors="coerce")
    df["edinburgh_lq"] = pd.to_numeric(df["edinburgh_lq"], errors="coerce")
    return df.sort_values("created_at").reset_index(drop=True)


def participant_summary(sessions: pd.DataFrame) -> pd.DataFrame:
    """Aggregate description of the people (no per-person rows, safe to publish)."""
    if sessions.empty:
        return pd.DataFrame(columns=["value"])
    age = sessions["age"].dropna()
    items = {
        "people (sessions)": len(sessions),
        "right-handed / mixed / left-handed": " / ".join(
            str((sessions["handedness"] == g).sum())
            for g in ["right-handed", "mixed", "left-handed"]
        ),
        "age, median (range)": (
            f"{age.median():.0f} ({age.min():.0f}–{age.max():.0f})" if len(age) else "—"
        ),
        "female / male / other or not said": " / ".join(
            [
                str((sessions["sex"] == "female").sum()),
                str((sessions["sex"] == "male").sum()),
                str((~sessions["sex"].isin(["female", "male"])).sum()),
            ]
        ),
        "Android / iPhone": f"{(sessions['platform'] == 'Android').sum()} / "
        f"{(sessions['platform'] == 'iPhone').sum()}",
    }
    return pd.DataFrame({"value": items}).rename_axis("")


# --------------------------------------------------------------------------- trials


def _as_float_array(values) -> np.ndarray:
    return np.array([np.nan if v is None else v for v in (values or [])], dtype=float)


def _repeated_fraction(samples: dict) -> float:
    """Share of samples whose 3 acceleration and 3 rotation values all equal the previous
    sample's: the browser delivered the same reading twice."""
    keys = ACC_WITH_GRAVITY + ROTATION
    if not all(k in samples for k in keys):
        return float("nan")
    m = np.column_stack([_as_float_array(samples[k]) for k in keys])
    if len(m) < 2:
        return float("nan")
    same = np.all(m[1:] == m[:-1], axis=1)
    return float(same.mean())


def trials_table(raw_trials: list[dict], sessions: pd.DataFrame) -> pd.DataFrame:
    """One row per movement: labels, event times, durations and data-quality numbers."""
    rows = []
    for tr in raw_trials:
        smp = tr.get("samples") or {}
        t = _as_float_array(smp.get("t"))
        dt = np.diff(t)
        rows.append(
            {
                "trial_id": tr["id"],
                "session_id": tr["session_id"],
                "block_index": tr.get("block_index"),
                "trial_index": tr.get("trial_index"),
                "hand": tr.get("hand"),
                "speed": tr.get("speed"),
                **{k: tr.get(k) for k in EVENTS},
                "touch_x_px": tr.get("touch_x_px"),
                "touch_y_px": tr.get("touch_y_px"),
                "n_failed_before": len(tr.get("failed_before") or []),
                "n_samples": len(t),
                "duration_s": (t[-1] - t[0]) / 1000 if len(t) > 1 else np.nan,
                "rate_hz": tr.get("sample_rate_hz"),
                "median_dt_ms": float(np.median(dt)) if len(dt) else np.nan,
                "max_dt_ms": float(dt.max()) if len(dt) else np.nan,
                "repeated_share": _repeated_fraction(smp),
            }
        )
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    for k in EVENTS:
        df[k] = pd.to_numeric(df[k], errors="coerce")
    df["reach_s"] = (df["t_touch_start_ms"] - df["t_beep_high_ms"]) / 1000
    df["at_nose_s"] = (df["t_touch_end_ms"] - df["t_touch_start_ms"]) / 1000
    df["return_s"] = (df["t_rest_ms"] - df["t_touch_end_ms"]) / 1000

    cols = ["session_id", "code", "created_at", "is_pilot", "mode", "platform", "handedness"]
    df = df.merge(sessions[cols], on="session_id", how="left", validate="many_to_one")
    df = df.sort_values(["created_at", "trial_index"]).drop(columns="created_at")
    first = ["trial_id", "session_id", "code", "is_pilot", "mode", "platform", "handedness",
             "block_index", "trial_index", "hand", "speed", "reach_s", "at_nose_s", "return_s"]
    return df[first + [c for c in df.columns if c not in first]].reset_index(drop=True)


# --------------------------------------------------------------------------- samples


def trial_samples(trial: dict, platform: str, flip_iphone: bool = True) -> pd.DataFrame:
    """Raw samples of one trial as a table.

    Added columns:
      t_s    time from the high beep, s
      u      normalised time of the reach: 0 = high beep, 1 = nose touch
      phase  wait / to_nose / at_nose / back / still

    iPhone (Safari) reports both accelerations with the opposite sign to Android
    (docs/data_format.md); with flip_iphone=True they are flipped so that all phones use
    the Android convention. The rotation rate is not changed: it has the same sign on
    iPhone and Android (D-51). Real axes: gz = about x, gx = about y, gy = about z.
    """
    smp = trial.get("samples") or {}
    df = pd.DataFrame({k: _as_float_array(smp[k]) for k in ["t"] + SENSOR_KEYS if k in smp})
    df = df.rename(columns={"t": "t_ms"})
    if flip_iphone and platform == "iPhone":
        acc = [c for c in ACC_WITH_GRAVITY + ACC_LINEAR if c in df]
        df[acc] = -df[acc]

    beep = trial.get("t_beep_high_ms")
    touch = trial.get("t_touch_start_ms")
    off = trial.get("t_touch_end_ms")
    rest = trial.get("t_rest_ms")
    df["t_s"] = (df["t_ms"] - beep) / 1000 if beep is not None else np.nan
    df["u"] = (df["t_ms"] - beep) / (touch - beep) if beep is not None and touch else np.nan

    t = df["t_ms"].to_numpy()
    big = np.inf
    edges = [
        beep if beep is not None else big,
        touch if touch is not None else big,
        off if off is not None else big,
        rest if rest is not None else big,
    ]
    edges = np.maximum.accumulate(np.array(edges, dtype=float))  # keep them in order
    phase_names = np.array(["wait", "to_nose", "at_nose", "back", "still"])
    df["phase"] = phase_names[np.searchsorted(edges, t, side="right")]
    return df


def samples_table(
    raw_trials: list[dict], trials: pd.DataFrame, flip_iphone: bool = True
) -> pd.DataFrame:
    """All samples of all trials in one long table (one row = one moment of one trial)."""
    labels = trials.set_index("trial_id")[
        ["session_id", "code", "is_pilot", "platform", "handedness", "hand", "speed", "trial_index"]
    ]
    parts = []
    for tr in raw_trials:
        if tr["id"] not in labels.index:
            continue
        lab = labels.loc[tr["id"]]
        df = trial_samples(tr, lab["platform"], flip_iphone=flip_iphone)
        df.insert(0, "trial_id", tr["id"])
        parts.append(df)
    if not parts:
        return pd.DataFrame()
    out = pd.concat(parts, ignore_index=True)
    return out.merge(labels, left_on="trial_id", right_index=True, how="left")


def reach_profiles(samples: pd.DataFrame, channel: str, n_points: int = 101) -> pd.DataFrame:
    """Each trial's `channel` during the reach (high beep -> nose touch), resampled onto the
    same normalised time grid u = 0..1, so that slow and fast movements can be overlaid.

    Returns one row per trial: the labels + columns 0..n_points-1.
    """
    grid = np.linspace(0, 1, n_points)
    rows, index = [], []
    for trial_id, g in samples.groupby("trial_id", sort=False):
        g = g.dropna(subset=["u", channel])
        if g["u"].min() > 0 or g["u"].max() < 1:
            continue
        rows.append(np.interp(grid, g["u"].to_numpy(), g[channel].to_numpy()))
        index.append(trial_id)
    prof = pd.DataFrame(rows, index=pd.Index(index, name="trial_id"))
    labels = samples.drop_duplicates("trial_id").set_index("trial_id")[
        ["code", "hand", "speed", "platform"]
    ]
    return labels.join(prof, how="inner")
