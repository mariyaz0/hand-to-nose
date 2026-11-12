"""Plots for looking at the hand-to-nose recordings (used by the notebooks)."""

from __future__ import annotations

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib import transforms

from loading import CHANNEL_LABELS, EVENTS, reach_profiles

# Colours: identity colours from a colour-blind-checked palette; text stays in text colours.
HAND_COLORS = {"right": "#2a78d6", "left": "#eb6834"}
AXIS_COLORS = {"x": "#2a78d6", "y": "#eb6834", "z": "#1baf7a"}
TEXT = "#0b0b0b"
TEXT_2 = "#52514e"
MUTED = "#8a8984"
SURFACE = "#fcfcfb"
BAND = "#eeede9"
SPEEDS = ["fast", "normal", "slow"]
SPEED_TARGET_S = {"fast": (0.0, 1.0), "normal": (1.0, 2.0), "slow": (3.0, 4.0)}
EVENT_SHORT = {
    "t_beep_high_ms": "beep",
    "t_touch_start_ms": "touch",
    "t_touch_end_ms": "off",
    "t_rest_ms": "still",
}

TRIAL_GROUPS = [
    ("Acceleration with gravity, m/s²", ["ax", "ay", "az"]),
    ("Acceleration without gravity, m/s²", ["lx", "ly", "lz"]),
    ("Rotation rate, deg/s", ["gx", "gy", "gz"]),
]


def apply_style() -> None:
    plt.rcParams.update(
        {
            "figure.facecolor": SURFACE,
            "axes.facecolor": SURFACE,
            "savefig.facecolor": SURFACE,
            "axes.edgecolor": "#c3c2b7",
            "axes.labelcolor": TEXT_2,
            "axes.titlecolor": TEXT,
            "axes.titlesize": 10,
            "axes.titleweight": "bold",
            "axes.titlelocation": "left",
            "axes.labelsize": 9,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "axes.grid.axis": "y",
            "grid.color": "#e6e5e1",
            "grid.linewidth": 0.6,
            "xtick.color": TEXT_2,
            "ytick.color": TEXT_2,
            "xtick.labelsize": 8,
            "ytick.labelsize": 8,
            "legend.frameon": False,
            "legend.fontsize": 8,
            "lines.linewidth": 1.5,
            "font.size": 9,
            "figure.dpi": 110,
        }
    )


def _direct_labels(ax, ends: list[tuple[float, str]], min_gap: float = 0.09) -> None:
    """Write series names just right of the plot, next to each line's last value,
    pushed apart so that they never overlap."""
    if not ends:
        return
    lo, hi = ax.get_ylim()
    pos = sorted(((y - lo) / (hi - lo), name) for y, name in ends if np.isfinite(y))
    ys = [p for p, _ in pos]
    for i in range(1, len(ys)):
        ys[i] = max(ys[i], ys[i - 1] + min_gap)
    shift = max(0.0, ys[-1] - 0.98) if ys else 0.0
    trans = transforms.blended_transform_factory(ax.transAxes, ax.transAxes)
    for y, (_, name) in zip(ys, pos):
        ax.text(1.01, y - shift, name, transform=trans, color=TEXT_2, fontsize=8, va="center")


def plot_trial(samples: pd.DataFrame, trial: pd.Series, groups=TRIAL_GROUPS):
    """All sensor channels of one trial against time from the high beep, with the events."""
    fig, axes = plt.subplots(len(groups), 1, figsize=(9, 2.3 * len(groups)), sharex=True)
    axes = np.atleast_1d(axes)
    beep = trial["t_beep_high_ms"]
    events = {k: (trial[k] - beep) / 1000 for k in EVENTS if pd.notna(trial.get(k))}

    for ax, (title, chans) in zip(axes, groups):
        if "t_touch_start_ms" in events:
            ax.axvspan(0, events["t_touch_start_ms"], color=BAND, lw=0, zorder=0)
        for x in events.values():
            ax.axvline(x, color=MUTED, lw=0.8, ls="--", zorder=1)
        ends = []
        for ch in chans:
            if ch not in samples or samples[ch].isna().all():
                continue
            name = ch[-1]
            ax.plot(samples["t_s"], samples[ch], color=AXIS_COLORS[name], label=name, zorder=2)
            ends.append((samples[ch].dropna().iloc[-1], name))
        ax.set_title(title)
        _direct_labels(ax, ends)

    top = axes[0].secondary_xaxis("top")
    top.set_xticks(list(events.values()), [EVENT_SHORT[k] for k in events])
    top.tick_params(axis="x", rotation=90, labelsize=8, colors=TEXT_2, length=0)
    top.spines["top"].set_visible(False)
    axes[-1].set_xlabel("time from the high beep, s  (shaded: reach to the nose)")

    handles = [plt.Line2D([], [], color=c, lw=2) for c in AXIS_COLORS.values()]
    fig.legend(handles, [f"{a} axis" for a in AXIS_COLORS], loc="upper right", ncols=3)
    flipped = " · acceleration sign flipped (iPhone)" if trial.get("platform") == "iPhone" else ""
    fig.suptitle(
        f"Session {trial['code']} · trial {trial['trial_index']} · {trial['hand']} hand · "
        f"{trial['speed']} · {trial['platform']}{flipped}",
        x=0.01, ha="left", fontsize=10, color=TEXT,
    )
    fig.tight_layout(rect=(0, 0, 1, 0.96))
    return fig


def plot_reach_times(trials: pd.DataFrame):
    """Time from the high beep to the nose touch, per instructed speed and hand.
    Grey bands = the speed the app asked for."""
    fig, ax = plt.subplots(figsize=(7, 3.6))
    rng = np.random.default_rng(0)
    for i, speed in enumerate(SPEEDS):
        lo, hi = SPEED_TARGET_S[speed]
        ax.fill_between([i - 0.4, i + 0.4], lo, hi, color=BAND, lw=0, zorder=0)
        for j, hand in enumerate(["right", "left"]):
            y = trials.loc[(trials["speed"] == speed) & (trials["hand"] == hand), "reach_s"]
            x = i + (j - 0.5) * 0.36 + rng.uniform(-0.07, 0.07, len(y))
            ax.scatter(x, y, s=40, color=HAND_COLORS[hand], edgecolor=SURFACE, linewidth=1,
                       zorder=3, label=f"{hand} hand" if i == 0 else None)
    ax.set_xticks(range(len(SPEEDS)), SPEEDS)
    ax.set_xlim(-0.6, len(SPEEDS) - 0.4)
    ax.set_ylim(bottom=0)
    ax.set_ylabel("reach time (beep → nose), s")
    ax.set_title("Did people follow the speed instructions?")
    ax.legend(loc="upper left")
    fig.tight_layout()
    return fig


def plot_reach_profiles(samples: pd.DataFrame, channels: list[str], ncols: int = 3):
    """Every trial's reach (beep -> nose touch) on a normalised time axis, right vs left hand.
    Thin lines: single trials; thick lines: mean per hand."""
    nrows = int(np.ceil(len(channels) / ncols))
    fig, axes = plt.subplots(nrows, ncols, figsize=(3.4 * ncols, 2.6 * nrows), sharex=True,
                             squeeze=False)
    counts = {}
    for ax, ch in zip(axes.flat, channels):
        prof = reach_profiles(samples, ch)
        cols = [c for c in prof.columns if isinstance(c, (int, np.integer))]
        if prof.empty or not cols:
            ax.text(0.5, 0.5, "no data", transform=ax.transAxes, ha="center", color=TEXT_2)
            ax.set_title(CHANNEL_LABELS.get(ch, ch), fontsize=9)
            continue
        grid = np.linspace(0, 1, len(cols))
        for hand in ["right", "left"]:
            p = prof.loc[prof["hand"] == hand, cols].to_numpy()
            counts[hand] = len(p)
            for row in p:
                ax.plot(grid, row, color=HAND_COLORS[hand], lw=0.7, alpha=0.25, zorder=1)
            if len(p):
                ax.plot(grid, p.mean(axis=0), color=HAND_COLORS[hand], lw=2, zorder=3)
        ax.set_title(CHANNEL_LABELS.get(ch, ch), fontsize=9)
    for ax in axes.flat[len(channels):]:
        ax.set_visible(False)
    for ax in axes[-1]:
        ax.set_xlabel("0 = high beep, 1 = nose touch")
    handles = [plt.Line2D([], [], color=HAND_COLORS[h], lw=2) for h in ["right", "left"]]
    fig.legend(handles, [f"{h} hand ({counts.get(h, 0)} movements)" for h in ["right", "left"]],
               loc="upper right", ncols=2)
    fig.suptitle("Reach to the nose: right vs left hand", x=0.01, ha="left", fontsize=10,
                 fontweight="bold", color=TEXT)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    return fig
