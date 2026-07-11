#!/usr/bin/env python3
"""Evaluate model variants on the cached segment data. Metric: mean
leave-one-out Spearman rho between predicted and actual quali order, per
season and overall (round-weighted). Only variants that beat baseline earn
their way into the real builder."""
import gzip
import json
import sys
from pathlib import Path
from statistics import median

sys.path.insert(0, str(Path(__file__).parent))
from build_profiles import spearman

CACHE = Path(__file__).parent / "model_cache.json.gz"
D = json.loads(gzip.open(CACHE).read())
OFF = [-180, -140, -100, -30, 30, 100, 140, 180]
SEG_IDX = {(-180, -140): 0, (-140, -100): 1, (-100, -30): 2, (-30, 30): 3,
           (30, 100): 4, (100, 140): 5, (140, 180): 6}


def window(seg, lo, hi):
    """Sum contiguous cached segments covering [lo, hi]."""
    idxs = [i for (a, b), i in SEG_IDX.items() if a >= lo and b <= hi]
    vals = [seg[i] for i in idxs]
    return sum(vals) if all(v is not None for v in vals) else None


def classify(v, bounds):
    for name, hi in bounds:
        if v < hi:
            return name
    return bounds[-1][0] if bounds[-1][1] == 1e9 else "fast"


def evaluate(cfg):
    """cfg: phases=[(lo,hi),...]; bounds=[(name,upper),...] last upper=1e9;
    width used via phases; wind_max for slp; recency=None|K (last K rounds)."""
    season_rhos = {}
    for year, rounds in D.items():
        dry = [r for r in rounds if not r["wet"]]
        if len(dry) < 4:
            continue
        # per round, per team, per class, per phase: mean deficit
        classes = [b[0] for b in cfg["bounds"]]
        per_round = []
        for r in dry:
            cls_of = {}
            for i, v in enumerate(r["fbest"]):
                if v is not None:
                    cls_of[i] = classify(v, cfg["bounds"])
            teams = {}
            # field best per corner per phase
            for pi, (lo, hi) in enumerate(cfg["phases"]):
                fb = {}
                for tm, segl in r["segs"].items():
                    for ci, seg in enumerate(segl):
                        if seg is None or ci not in cls_of:
                            continue
                        w = window(seg, lo, hi)
                        if w is None:
                            continue
                        if ci not in fb or w < fb[ci]:
                            fb[ci] = w
                for tm, segl in r["segs"].items():
                    defs = {c: [] for c in classes}
                    for ci, seg in enumerate(segl):
                        if seg is None or ci not in cls_of or ci not in fb:
                            continue
                        w = window(seg, lo, hi)
                        if w is None:
                            continue
                        defs[cls_of[ci]].append(w - fb[ci])
                    t = teams.setdefault(tm, {})
                    for c in classes:
                        t[(c, pi)] = (sum(defs[c]) / len(defs[c])) if defs[c] else None
            # straight-line
            if r["fps"] and (cfg.get("wind_max") is None or r["wind"] <= cfg["wind_max"]):
                fb = min(r["fps"].values())
                for tm, v in r["fps"].items():
                    teams.setdefault(tm, {})["slp"] = v - fb
            counts = {c: 0 for c in classes}
            for ci in cls_of:
                counts[cls_of[ci]] += 1
            per_round.append({"round": r["round"], "teams": teams, "counts": counts,
                              "flatkm": (r["flat"] or 0) * (r["len"] or 0) / 1000,
                              "quali": r["quali"]})
        # LOO
        rhos = []
        for tgt in per_round:
            others = [p for p in per_round if p["round"] != tgt["round"]]
            if cfg.get("recency"):
                others = sorted(others, key=lambda p: abs(p["round"] - tgt["round"]))[:cfg["recency"]]
            if len(others) < 2:
                continue
            fits = {}
            for tm in tgt["quali"]:
                loss, ok = 0.0, 0
                for c in classes:
                    for pi in range(len(cfg["phases"])):
                        vals = [p["teams"][tm][(c, pi)] for p in others
                                if tm in p["teams"] and p["teams"][tm].get((c, pi)) is not None]
                        if vals:
                            loss += max(median(vals), 0) * tgt["counts"][c] / 1000
                            ok += 1
                sp = [p["teams"][tm]["slp"] for p in others
                      if tm in p["teams"] and p["teams"][tm].get("slp") is not None]
                if sp:
                    loss += max(median(sp), 0) * tgt["flatkm"] / 1000
                if ok >= 2:
                    fits[tm] = loss
            common = [tm for tm in fits if tm in tgt["quali"]]
            if len(common) >= 6:
                rhos.append(spearman([fits[tm] for tm in common],
                                     [tgt["quali"][tm] for tm in common]))
        if rhos:
            season_rhos[year] = (sum(rhos) / len(rhos), len(rhos))
    tot = sum(v * n for v, n in season_rhos.values())
    n = sum(n for _, n in season_rhos.values())
    return tot / n if n else 0, season_rhos


B3 = [("slow", 150), ("med", 230), ("fast", 1e9)]
CONFIGS = {
    "baseline (zone±140)":       dict(phases=[(-140, 140)], bounds=B3),
    "zone±100":                  dict(phases=[(-100, 100)], bounds=B3),
    "zone±180":                  dict(phases=[(-180, 180)], bounds=B3),
    "phases entry/exit":         dict(phases=[(-140, -30), (-30, 140)], bounds=B3),
    "phases entry/mid/exit":     dict(phases=[(-140, -30), (-30, 30), (30, 140)], bounds=B3),
    "4 classes (<100 vslow)":    dict(phases=[(-140, 140)], bounds=[("vslow", 100), ("slow", 150), ("med", 230), ("fast", 1e9)]),
    "wind<=6 m/s slp":           dict(phases=[(-140, 140)], bounds=B3, wind_max=6),
    "wind<=4 m/s slp":           dict(phases=[(-140, 140)], bounds=B3, wind_max=4),
    "recency 6 rounds":          dict(phases=[(-140, 140)], bounds=B3, recency=6),
    "recency 8 rounds":          dict(phases=[(-140, 140)], bounds=B3, recency=8),
}

if __name__ == "__main__":
    base = None
    for name, cfg in CONFIGS.items():
        overall, per = evaluate(cfg)
        if base is None:
            base = overall
        line = f"{name:28} overall={overall:.3f} ({overall - base:+.3f})  " + \
            " ".join(f"{y}:{v:.2f}" for y, (v, _) in sorted(per.items()))
        print(line)
