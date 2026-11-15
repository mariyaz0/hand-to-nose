"""Why these features: checks and figures for notebooks/03_why_these_features.ipynb.

The 9 features (features.py) were chosen before the first model from the mirror-symmetry
argument: a left-hand movement is roughly the mirror image of a right-hand one, so only
acceleration x, rotation about y and rotation about z should differ between the hands.
This module checks that prediction on the data and shows the features on the signals.
Everything here works on the same reaches as the model (model.select_study_trials).

Typical use:

    feats = features_table(raw_sessions, raw_trials)
    data, _ = select_study_trials(feats)
    sig = reach_signals(raw_sessions, raw_trials, data)
    sep = separation_over_time(sig, data)
"""

from __future__ import annotations

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from features import (BASELINE_MS, FEATURES, GRID_MS, preprocess_trial, reach_end_ms,
                      separation)
from plots import HAND_COLORS, MUTED, SURFACE, TEXT, TEXT_2

# The six channels of features.preprocess_trial, with what mirror symmetry predicts.
CHANNELS = {
    "ax": ("acceleration x (sideways)", "m/s²", "flips"),
    "rot_y": ("rotation about y (long axis)", "deg/s", "flips"),
    "rot_z": ("rotation about z (screen plane)", "deg/s", "flips"),
    "ay": ("acceleration y (along the phone)", "m/s²", "same"),
    "az": ("acceleration z (towards the face)", "m/s²", "same"),
    "rot_x": ("rotation about x (tilt to the face)", "deg/s", "same"),
}


# ------------------------------------------------------------------------ signals


def _session_info(raw_sessions: list[dict]) -> dict:
    info = {}
    for s in raw_sessions:
        device = s.get("device") or {}
        info[s["id"]] = {
            "platform": device.get("platform") or (
                "iPhone" if "iPhone" in (device.get("user_agent") or "") else "Android"
            ),
            "zone_r_px": (device.get("zone") or {}).get("r_px"),
        }
    return info


def one_reach(trial: dict, session: dict) -> dict | None:
    """The preprocessed signals of one trial (50 Hz grid, smoothed, iPhone acceleration
    flipped, real rotation axes) plus the reach window; the same signals features.py uses."""
    d = preprocess_trial(trial, session["platform"])
    end, _ = reach_end_ms(trial, session["zone_r_px"])
    beep = trial.get("t_beep_high_ms")
    if d is None or end is None or beep is None:
        return None
    base = (d["t_ms"] >= beep - BASELINE_MS) & (d["t_ms"] <= beep)
    return {"grid": d, "beep": float(beep), "end": float(end), "ax0": float(d.loc[base, "ax"].mean())}


def reach_signals(raw_sessions: list[dict], raw_trials: list[dict], data: pd.DataFrame,
                  n_points: int = 51) -> dict[str, pd.DataFrame]:
    """Every reach in `data` on a normalised time axis u = 0 (high beep) .. 1 (nose touch).
    Returns {channel: DataFrame with one row per trial_id and n_points columns}."""
    info = _session_info(raw_sessions)
    by_id = {t["id"]: t for t in raw_trials}
    u = np.linspace(0, 1, n_points)
    rows = {c: {} for c in CHANNELS}
    for trial_id, session_id in zip(data["trial_id"], data["session_id"]):
        r = one_reach(by_id[trial_id], info[session_id])
        if r is None:
            continue
        g = r["grid"]
        t_u = (g["t_ms"].to_numpy() - r["beep"]) / (r["end"] - r["beep"])
        for c in CHANNELS:
            rows[c][trial_id] = np.interp(u, t_u, g[c].to_numpy())
    return {c: pd.DataFrame.from_dict(v, orient="index", columns=np.round(u, 3))
            for c, v in rows.items()}


# ----------------------------------------------------------------- separation in time


def separation_over_time(signals: dict[str, pd.DataFrame], data: pd.DataFrame) -> pd.DataFrame:
    """For every channel and every moment of the reach: the chance that a random right-hand
    reach has a larger value than a random left-hand reach (0.5 = no difference)."""
    hand = data.set_index("trial_id")["hand"]
    out = {}
    for c, df in signals.items():
        h = hand.reindex(df.index)
        out[c] = [separation(df.loc[h == "right", col], df.loc[h == "left", col]) for col in df.columns]
    return pd.DataFrame(out, index=next(iter(signals.values())).columns).T


def plot_separation_map(sep: pd.DataFrame):
    """Heatmap: channels (rows) x moment of the reach (columns). Blue = right hand higher,
    orange = left hand higher, light = no difference."""
    from matplotlib.colors import LinearSegmentedColormap

    cmap = LinearSegmentedColormap.from_list("hands", [HAND_COLORS["left"], "#f0efec", HAND_COLORS["right"]])
    order = list(CHANNELS)
    fig, ax = plt.subplots(figsize=(9.6, 3.3))
    im = ax.imshow(sep.loc[order].to_numpy(), aspect="auto", cmap=cmap, vmin=0, vmax=1,
                   extent=(0, 1, len(order) - 0.5, -0.5), interpolation="nearest")
    ax.set_yticks(range(len(order)),
                  [f"{CHANNELS[c][0]}  [{'should differ' if CHANNELS[c][2] == 'flips' else 'should be the same'}]"
                   for c in order])
    ax.axhline(2.5, color=TEXT, lw=1)
    ax.grid(False)
    ax.set_xlabel("moment of the reach: 0 = high beep, 1 = nose touch")
    ax.set_title("Right vs left hand at every moment of the reach", fontsize=10)
    cb = fig.colorbar(im, ax=ax, fraction=0.03, pad=0.02, ticks=[0, 0.5, 1])
    cb.ax.set_yticklabels(["left higher", "no difference", "right higher"], fontsize=8)
    fig.tight_layout()
    return fig


# ------------------------------------------------------------ features on the signal


def typical_person(data: pd.DataFrame, min_age: float = 18) -> str:
    """The adult whose own right-minus-left gap in net turn about y is closest to the median
    gap of all people (a typical, not a hand-picked, example)."""
    per = data.pivot_table(index="session_id", columns="hand", values="rot_y_angle", aggfunc="mean").dropna()
    age = data.drop_duplicates("session_id").set_index("session_id")["age"]
    per = per[pd.to_numeric(age.reindex(per.index), errors="coerce") >= min_age]
    gap = per["right"] - per["left"]
    return (gap - gap.median()).abs().idxmin()


def typical_reach(data: pd.DataFrame, session_id: str, hand: str) -> str:
    """The reach of this person and hand whose net turn about y is closest to their median."""
    d = data[(data["session_id"] == session_id) & (data["hand"] == hand)]
    return d.loc[(d["rot_y_angle"] - d["rot_y_angle"].median()).abs().idxmin(), "trial_id"]


def plot_features_on_signal(raw_sessions: list[dict], raw_trials: list[dict], data: pd.DataFrame,
                            session_id: str):
    """One right-hand and one left-hand reach of the same person, with the 9 features drawn
    on the signals they come from."""
    info = _session_info(raw_sessions)[session_id]
    by_id = {t["id"]: t for t in raw_trials}
    feats = data.set_index("trial_id")
    rows = [("rot_y", "rotation about y, deg/s"), ("rot_z", "rotation about z, deg/s"),
            ("ax", "sideways acceleration minus start, m/s²")]
    fig, axes = plt.subplots(3, 2, figsize=(10, 7.2), sharex="col")
    for col, hand in enumerate(["right", "left"]):
        tid = typical_reach(data, session_id, hand)
        r = one_reach(by_id[tid], info)
        g, beep, end = r["grid"], r["beep"], r["end"]
        t = (g["t_ms"].to_numpy() - beep) / 1000
        dur = (end - beep) / 1000
        show = (t >= -0.4) & (t <= dur + 0.4)
        reach = (t >= 0) & (t <= dur)
        f = feats.loc[tid]
        color = HAND_COLORS[hand]
        for row, (ch, ylabel) in enumerate(rows):
            ax = axes[row, col]
            y = g[ch].to_numpy() - (r["ax0"] if ch == "ax" else 0)
            ax.axvspan(0, dur, color="#eeede9", zorder=0)
            ax.axhline(0, color=MUTED, lw=0.8, zorder=1)
            ax.plot(t[show], y[show], color=color, lw=1.8, zorder=3)
            if ch == "ax":
                name = "acc_x"
                ax.hlines(f["acc_x_mean"], 0, dur, color=TEXT, lw=1.2, ls="--", zorder=4)
                text = (f"mean {f['acc_x_mean']:+.2f}   max {f['acc_x_max']:+.2f}   "
                        f"min {f['acc_x_min']:+.2f}")
            else:
                name = ch
                ax.fill_between(t[reach], 0, y[reach], color=color, alpha=0.25, lw=0, zorder=2)
                text = (f"net turn {f[name + '_angle']:+.1f}°   max {f[name + '_max']:+.0f}   "
                        f"min {f[name + '_min']:+.0f}")
            yr = y[reach]
            i_max, i_min = np.argmax(yr), np.argmin(yr)
            ax.scatter([t[reach][i_max], t[reach][i_min]], [yr[i_max], yr[i_min]], s=36,
                       color=SURFACE, edgecolor=TEXT, linewidth=1.4, zorder=5)
            ax.set_title(text, fontsize=9, loc="left")
            if col == 0:
                ax.set_ylabel(ylabel)
        axes[-1, col].set_xlabel("time from the high beep, s (grey = the reach)")
        axes[0, col].annotate(f"{hand} hand", xy=(0.99, 0.95), xycoords="axes fraction", ha="right",
                              va="top", fontsize=10, fontweight="bold", color=color)
    fig.suptitle("The 9 features on the signals of one person (shaded area = net turn; "
                 "circles = max and min; dashed = mean)", x=0.01, ha="left", fontsize=10,
                 fontweight="bold", color=TEXT)
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    return fig


# ----------------------------------------------------------------- every person


def plot_people_grid(signals: dict[str, pd.DataFrame], data: pd.DataFrame, channel: str = "rot_y",
                     ncols: int = 6):
    """One small panel per person: every reach of `channel` on the normalised time axis,
    right hand blue, left hand orange. People are anonymous and sorted by how clearly
    their hands differ in net turn about y."""
    df = signals[channel]
    hand = data.set_index("trial_id")["hand"].reindex(df.index)
    person = data.set_index("trial_id")["session_id"].reindex(df.index)
    per = data.pivot_table(index="session_id", columns="hand", values="rot_y_angle", aggfunc="mean")
    gap = (per.get("right") - per.get("left")).fillna(-np.inf).sort_values(ascending=False)
    people = list(gap.index)
    nrows = int(np.ceil(len(people) / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(1.75 * ncols, 1.45 * nrows), sharex=True, sharey=True)
    u = df.columns.to_numpy(dtype=float)
    lim = np.nanpercentile(np.abs(df.to_numpy()), 99)
    for k, (ax, sid) in enumerate(zip(axes.flat, people)):
        for h in ["right", "left"]:
            for _, row in df[(person == sid) & (hand == h)].iterrows():
                ax.plot(u, row.to_numpy(), color=HAND_COLORS[h], lw=0.9, alpha=0.7)
        ax.axhline(0, color=MUTED, lw=0.6)
        r = data[(data["session_id"] == sid)]
        ok = ((r["rot_y_angle"] < 0) == (r["hand"] == "left")).sum()
        ax.set_title(f"person {k + 1} · sign rule {ok}/{len(r)}", fontsize=7.5, loc="left",
                     fontweight="normal", color=TEXT_2)
        ax.set_ylim(-lim, lim)
        ax.grid(False)
        ax.tick_params(labelsize=6.5)
    for ax in axes.flat[len(people):]:
        ax.set_visible(False)
    fig.suptitle(f"{CHANNELS[channel][0]}, every reach of every person "
                 "(blue = right hand, orange = left hand; x: 0 = beep, 1 = nose touch)",
                 x=0.01, ha="left", fontsize=10, fontweight="bold", color=TEXT)
    fig.tight_layout(rect=(0, 0, 1, 0.95))
    return fig


# ----------------------------------------------------------------- candidate screen


def candidate_features(raw_sessions: list[dict], raw_trials: list[dict], data: pd.DataFrame) -> pd.DataFrame:
    """Four simple numbers from each of the six channels over the reach (24 candidates),
    computed like features.py: rotation -> net turn, mean, max, min rate; acceleration
    (minus its value before the beep) -> mean, max, min, change at the end."""
    info = _session_info(raw_sessions)
    by_id = {t["id"]: t for t in raw_trials}
    dt_s = GRID_MS / 1000
    rows = []
    for trial_id, session_id in zip(data["trial_id"], data["session_id"]):
        tr = by_id[trial_id]
        r = one_reach(tr, info[session_id])
        if r is None:
            continue
        g, beep, end = r["grid"], r["beep"], r["end"]
        t = g["t_ms"].to_numpy()
        reach = (t >= beep) & (t <= end)
        base = (t >= beep - BASELINE_MS) & (t <= beep)
        row = {"trial_id": trial_id}
        for c in CHANNELS:
            y = g.loc[reach, c].to_numpy()
            if c.startswith("rot"):
                row[f"{c} net turn"] = y.sum() * dt_s
                row[f"{c} mean"] = y.mean()
            else:
                y = y - g.loc[base, c].mean()
                row[f"{c} mean"] = y.mean()
                row[f"{c} change at the end"] = y[-1]
            row[f"{c} max"] = y.max()
            row[f"{c} min"] = y.min()
        rows.append(row)
    return pd.DataFrame(rows)


CHOSEN = {"rot_y net turn": "rot_y_angle", "rot_y max": "rot_y_max", "rot_y min": "rot_y_min",
          "rot_z net turn": "rot_z_angle", "rot_z max": "rot_z_max", "rot_z min": "rot_z_min",
          "ax mean": "acc_x_mean", "ax max": "acc_x_max", "ax min": "acc_x_min"}


def screen_table(cands: pd.DataFrame, data: pd.DataFrame) -> pd.DataFrame:
    """Separation and per-person consistency for every candidate, sorted."""
    d = data[["trial_id", "session_id", "hand"]].merge(cands, on="trial_id")
    rows = {}
    for c in cands.columns.drop("trial_id"):
        p = separation(d.loc[d["hand"] == "right", c], d.loc[d["hand"] == "left", c])
        per = d.pivot_table(index="session_id", columns="hand", values=c, aggfunc="mean").dropna()
        same = int(((per["right"] > per["left"]) == (p >= 0.5)).sum())
        channel = c.split(" ")[0]
        rows[c] = {"channel": CHANNELS[channel][0],
                   "mirror symmetry says": "should differ" if CHANNELS[channel][2] == "flips" else "should be the same",
                   "in the model (A)": "yes" if c in CHOSEN else "",
                   "separation": max(p, 1 - p),
                   "people, same direction": f"{same} / {len(per)}"}
    return pd.DataFrame(rows).T.astype({"separation": float}).sort_values("separation", ascending=False).rename_axis("candidate")


def plot_screen(screen: pd.DataFrame):
    """Horizontal bars, one per candidate: how well it separates the hands."""
    s = screen.iloc[::-1]
    fig, ax = plt.subplots(figsize=(8.6, 0.27 * len(s) + 1.2))
    y = np.arange(len(s))
    differ = (s["mirror symmetry says"] == "should differ").to_numpy()
    colors = np.where(differ, HAND_COLORS["right"], "#c3c2b7")
    ax.barh(y, s["separation"] - 0.5, left=0.5, height=0.62, color=colors, zorder=2)
    for yi, (name, row) in zip(y, s.iterrows()):
        mark = "  ◆ in model A" if row["in the model (A)"] == "yes" else ""
        ax.text(row["separation"] + 0.005, yi, f"{row['separation']:.2f}{mark}", va="center",
                fontsize=7.5, color=TEXT_2)
    ax.set_yticks(y, s.index, fontsize=8)
    ax.set_xlim(0.5, 1.08)
    ax.axvline(0.5, color=MUTED, lw=1)
    ax.grid(axis="y", visible=False)
    ax.grid(axis="x", visible=True)
    ax.set_xlabel("separation (0.5 = says nothing about the hand, 1 = no overlap)")
    handles = [plt.Rectangle((0, 0), 1, 1, color=HAND_COLORS["right"]), plt.Rectangle((0, 0), 1, 1, color="#c3c2b7")]
    ax.legend(handles, ["channel should differ (mirror symmetry)", "channel should be the same"],
              loc="lower right", fontsize=8)
    ax.set_title("All 24 candidate numbers, sorted", fontsize=10)
    fig.tight_layout()
    return fig
