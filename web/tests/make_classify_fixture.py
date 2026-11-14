"""Write web/tests/fixtures/classify.json: synthetic trials (no participant data) with the
feature values and P(left) computed by the Python code, so that web/tests/classify.test.js
can check that web/js/classify.js gives the same numbers.

Run from the repository root after changing analysis/features.py or the model:

    python web/tests/make_classify_fixture.py
"""

import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "analysis"))
from features import trial_features  # noqa: E402

ZONE_R = 148.0


def synthetic_trial(seed: int, turn_sign: float, move: bool = True, outside_first: bool = False) -> dict:
    rng = np.random.default_rng(seed)
    t, cols = [], {k: [] for k in ["ax", "ay", "az", "lx", "ly", "lz", "gx", "gy", "gz", "oa", "ob", "og"]}
    beep, reach, dt = 1500.0, 1200.0, 1000 / 60
    now = 0.0
    while now < beep + reach + 600:
        u = (now - beep - 250) / (reach - 250)
        bump = math.sin(math.pi * u) if move and 0 <= u <= 1 else 0.0
        vals = {
            "ax": rng.normal(0, 0.05), "ay": 9.8 + rng.normal(0, 0.05) + 1.2 * bump, "az": 0.4 + 3 * bump,
            "lx": 0.0, "ly": 1.2 * bump, "lz": 3 * bump,
            "gx": turn_sign * 25 * bump + rng.normal(0, 1.5),   # rotation about y
            "gy": 8 * bump + rng.normal(0, 1.5),                # about z
            "gz": -40 * bump + rng.normal(0, 1.5),              # about x
            "oa": 10.0, "ob": 80.0, "og": 1.0,
        }
        t.append(round(now, 1))
        for k, v in vals.items():
            cols[k].append(round(float(v), 3 if k[0] in "al" else 2))
        # every 7th reading is delivered twice (as some Android browsers do)
        if len(t) % 7 == 0:
            t.append(round(now + 1.0, 1))
            for k in cols:
                cols[k].append(cols[k][-1])
        now += dt + rng.normal(0, 1.0)
    # one sample with a repeated time stamp and one missing rotation value
    t[50] = t[49]
    cols["gx"][60] = None
    events = []
    touch = beep + reach
    if outside_first:
        events.append({"type": "down", "id": 3, "t": touch - 180, "x": 160.0, "y": -10.0, "in_zone": False, "state": "go"})
        events.append({"type": "up", "id": 3, "t": touch - 120, "x": 160.0, "y": -10.0, "in_zone": False, "state": "go"})
    events.append({"type": "down", "id": 4, "t": touch, "x": 12.0, "y": -30.0, "in_zone": True, "state": "go"})
    events.append({"type": "up", "id": 4, "t": touch + 300, "x": 12.0, "y": -30.0, "in_zone": True, "state": "touching"})
    return {
        "t_beep_high_ms": beep,
        "t_touch_start_ms": touch,
        "t_touch_end_ms": touch + 300,
        "touch_events": events,
        "samples": {"t": t, **cols},
    }


def read_model() -> dict:
    text = (ROOT / "web" / "js" / "hand_model.js").read_text(encoding="utf-8")
    return json.loads(text[text.index("{"): text.rindex("}") + 1])


def p_left(model: dict, values: dict) -> float:
    z = model["intercept"] + sum(
        w * (values[f] - m) / s
        for f, w, m, s in zip(model["features"], model["weights"], model["mean"], model["scale"])
    )
    return 1 / (1 + math.exp(-z))


def main() -> None:
    model = read_model()
    cases = []
    for name, kw in [
        ("right-like", dict(seed=1, turn_sign=1.0)),
        ("left-like, first touch just outside the zone", dict(seed=2, turn_sign=-1.0, outside_first=True)),
        ("small turn", dict(seed=3, turn_sign=0.08)),
        ("phone did not move", dict(seed=4, turn_sign=1.0, move=False)),
    ]:
        trial = synthetic_trial(**kw)
        for platform in ["Android"]:  # the rotation features do not depend on the platform
            f = trial_features(trial, platform, ZONE_R)
            ok = f["excluded"] is None
            cases.append({
                "name": f"{name} ({platform})",
                "zone_r_px": ZONE_R,
                "trial": trial,
                "expected": {
                    "rot_y_angle": f["rot_y_angle"] if ok else None,
                    "turned_deg": None if f["turned_deg"] != f["turned_deg"] else f["turned_deg"],
                    "excluded": f["excluded"],
                    "p_left": p_left(model, f) if ok else None,
                },
            })
    out = ROOT / "web" / "tests" / "fixtures" / "classify.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"model_version": model["model_version"], "cases": cases}), encoding="utf-8")
    print(f"{len(cases)} cases -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
