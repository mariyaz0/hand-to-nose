"""Which hand made the movement: selection rules, leave-one-subject-out test, final model.

Rules (docs/decisions.md):
  D-41  only complete study sessions (12 of 12 trials, not pilot, collect mode)
  D-42  nobody is excluded for how they did the task
  D-43  a trial is dropped only if its reach cannot be found (features.py says why)
  D-44  speed label and reaction time are not features
  D-48  one model with acceleration + rotation rate: only phones with a gyroscope
  D-49  participants under 18 are included (INCLUDE_MINORS switches this)
  D-15  logistic regression, tested leave-one-subject-out

Typical use:

    feats = features_table(raw_sessions, raw_trials)
    data, excluded = select_study_trials(feats)
    preds = leave_one_subject_out(data)
    model = fit_final(data)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from features import (FEATURES, GRID_MS, SMOOTH_POINTS, BASELINE_MS, TOUCH_NEAR_RADII,
                      MIN_TOTAL_ROTATION)

INCLUDE_MINORS = True   # D-49
TRIALS_PER_SESSION = 12
C = 1.0                 # regularisation strength, fixed in advance (not tuned on the test people)
POSITIVE = "left"       # the model outputs P(left hand)

# The final model for the test mode (D-53): logistic regression on one feature.
FINAL_FEATURES = ["rot_y_angle"]
MODEL_VERSION = "hand-v1"


def select_study_trials(
    feats: pd.DataFrame, include_minors: bool = INCLUDE_MINORS
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Apply the rules. Returns (trials used, table of what was left out and why).

    The second table has one row per reason with counts of sessions and trials, so it can
    be shown without listing people.
    """
    f = feats.copy()
    f["left_out"] = None

    def mark(mask, reason):
        f.loc[mask & f["left_out"].isna(), "left_out"] = reason

    mark(f["is_pilot"], "pilot session")
    mark(f["mode"] != "collect", "not a collection session")
    mark(f["n_trials_in_session"] < TRIALS_PER_SESSION, "incomplete session (D-41)")
    mark(f["has_rotation"] != True, "phone without gyroscope (D-48)")  # noqa: E712
    if not include_minors:
        mark(pd.to_numeric(f["age"], errors="coerce") < 18, "under 18 (D-49 switched off)")
    mark(f["excluded"].notna(), "reach not found (D-43)")

    left = f[f["left_out"].notna()]
    summary = (
        left.groupby("left_out", sort=False)
        .agg(sessions=("session_id", "nunique"), trials=("trial_id", "count"))
        .reset_index()
        .rename(columns={"left_out": "reason"})
    )
    used = f[f["left_out"].isna()].drop(columns="left_out").reset_index(drop=True)
    return used, summary


def make_model() -> object:
    return make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=1000))


def leave_one_subject_out(data: pd.DataFrame, features: list[str] = FEATURES) -> pd.DataFrame:
    """For every person: train on all the others, predict this person's trials.

    Returns the trial rows with `p_left` (predicted probability of the left hand),
    `predicted` and `correct`.
    """
    out = []
    for sid in data["session_id"].unique():
        test = data["session_id"] == sid
        model = make_model()
        model.fit(data.loc[~test, features], data.loc[~test, "hand"] == POSITIVE)
        p = model.predict_proba(data.loc[test, features])[:, 1]
        part = data.loc[test].copy()
        part["p_left"] = p
        out.append(part)
    res = pd.concat(out).sort_index()
    res["predicted"] = np.where(res["p_left"] >= 0.5, "left", "right")
    res["correct"] = res["predicted"] == res["hand"]
    res["confidence"] = np.where(res["predicted"] == "left", res["p_left"], 1 - res["p_left"])
    return res


def single_feature_rule(data: pd.DataFrame, feature: str = "rot_y_angle") -> pd.DataFrame:
    """Baseline without training: the sign of one feature, with the direction learned
    leave-one-subject-out (which sign means "left" in the other people)."""
    out = []
    for sid in data["session_id"].unique():
        test = data["session_id"] == sid
        train = data.loc[~test]
        sign = np.sign(
            train.loc[train["hand"] == "left", feature].mean()
            - train.loc[train["hand"] == "right", feature].mean()
        )
        part = data.loc[test].copy()
        part["predicted"] = np.where(sign * part[feature] > 0, "left", "right")
        out.append(part)
    res = pd.concat(out).sort_index()
    res["correct"] = res["predicted"] == res["hand"]
    return res


def accuracy_table(res: pd.DataFrame, by: str | None = None) -> pd.DataFrame:
    """Share of correct trials, overall or per group; people counted, not listed."""
    if by is None:
        g = res.assign(_all="all").groupby("_all")
    else:
        g = res.groupby(by)
    t = g.agg(
        people=("session_id", "nunique"),
        trials=("trial_id", "count"),
        accuracy=("correct", "mean"),
    )
    if "confidence" in res:
        t["mean_confidence"] = g["confidence"].mean()
    return t.rename_axis(by or "")


def per_person_accuracy(res: pd.DataFrame) -> pd.DataFrame:
    """Accuracy per person (indexed by an anonymous running number, not the session code)."""
    t = (
        res.groupby("session_id")
        .agg(handedness=("handedness", "first"), trials=("trial_id", "count"),
             accuracy=("correct", "mean"))
        .sort_values("accuracy")
        .reset_index(drop=True)
    )
    t.index = pd.RangeIndex(1, len(t) + 1, name="person")
    return t


def fit_final(data: pd.DataFrame, features: list[str] = FEATURES):
    model = make_model()
    model.fit(data[features], data["hand"] == POSITIVE)
    return model


def coefficients(model, features: list[str] = FEATURES) -> pd.DataFrame:
    """Weights on the standardised features: + pushes towards "left", − towards "right"."""
    lr = model.named_steps["logisticregression"]
    return pd.DataFrame({"weight": lr.coef_[0]}, index=pd.Index(features, name="feature"))


def model_json(model, data: pd.DataFrame, features: list[str] = FEATURES,
               version: str = MODEL_VERSION) -> dict:
    """Everything the browser needs to compute the same prediction (test mode)."""
    scaler = model.named_steps["standardscaler"]
    lr = model.named_steps["logisticregression"]
    return {
        "model_version": version,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "output": "probability of the left hand = 1 / (1 + exp(-(intercept + sum(w * (x - mean) / scale))))",
        "features": features,
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "weights": lr.coef_[0].tolist(),
        "intercept": float(lr.intercept_[0]),
        "preprocessing": {
            "grid_ms": GRID_MS,
            "smooth_points": SMOOTH_POINTS,
            "baseline_ms": BASELINE_MS,
            "touch_near_radii": TOUCH_NEAR_RADII,
            "min_total_rotation_deg": MIN_TOTAL_ROTATION,
            "iphone_flip_acceleration": True,
            "iphone_flip_rotation": False,
            "rotation_axes": {"rot_x": "gz", "rot_y": "gx", "rot_z": "gy"},
        },
        "trained_on": {
            "people": int(data["session_id"].nunique()),
            "trials": int(len(data)),
        },
    }


def save_model_json(model, data: pd.DataFrame, path, **kw) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(model_json(model, data, **kw), fh, indent=2)


def write_model_js(model, data: pd.DataFrame, path, features: list[str] = FINAL_FEATURES, **kw) -> dict:
    """Write the model as a JavaScript module for the web app's test mode
    (web/js/hand_model.js). A .js module gets a version tag when the site is published
    (scripts/publish_pages.sh), so a phone never combines an old model with a new page."""
    m = model_json(model, data, features=features, **kw)
    text = (
        "// Generated by analysis/model.py (write_model_js) from notebooks/02_hand_model.ipynb.\n"
        "// Do not edit by hand: retrain and export again.\n"
        f"export const MODEL = {json.dumps(m, indent=2)};\n"
    )
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    return m
