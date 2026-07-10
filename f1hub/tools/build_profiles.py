#!/usr/bin/env python3
"""Aggregate the archive into per-season team performance profiles.

For every archived weekend this reads Q (corner-class speeds, straight-line,
quali gaps) and R (race pace, track temp) and produces data/profiles.json.gz:

  - per team, per season: measured speed deficits in slow / medium / fast
    corners (km/h vs the field-best car at each corner), straight-line
    (speed-trap) deficit, quali + race pace gaps, temperature correlation
  - per circuit: corner-class composition + flat-out fraction
  - circuit-fit estimates: measured deficits pushed through a simple
    physical time-loss model (dt = L * dv / v^2 per corner window), ranked
  - honesty check: Spearman rank correlation of predicted order vs actual
    quali order at every completed dry weekend

Corner classes match the app: slow < 150, medium < 230, fast >= 230 km/h,
windows +/-90 m around the apex. Wet qualifying sessions are excluded from
corner/straight aggregation (speeds are meaningless in the wet).
"""
import gzip
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import median

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent if TOOLS.name == "tools" else TOOLS
DATA = ROOT / "data"

WINDOW = 90.0          # m either side of the apex, same as the app
CLASS_SLOW, CLASS_MED = 150.0, 230.0
WET_FRAC = 0.15        # fraction of weather samples reporting rain => wet
MIN_TEMP_N = 6         # weekends needed before temp correlation is reported


def load(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def wet_fraction(weather):
    rows = [w for w in (weather or []) if len(w) > 6]
    if not rows:
        return 0.0
    return sum(1 for w in rows if w[6]) / len(rows)


def track_temp(weather):
    vals = [w[3] for w in (weather or []) if len(w) > 3 and w[3]]
    return round(median(vals), 1) if vals else None


def best_tel_lap(sess, abbr):
    """Fastest lap by `abbr` that has telemetry. Returns (lap_ms, tel) or None."""
    times = {}
    for lp in sess["laps"]:
        if lp["drv"] == abbr and lp["t"] and not lp.get("del"):
            times[lp["lap"]] = lp["t"]
    best = None
    for key, tel in sess["tel"].items():
        d, _, ln = key.rpartition("-")
        if d != abbr:
            continue
        t = times.get(int(ln))
        if t and (best is None or t < best[0]):
            best = (t, tel)
    return best


def corner_mins(tel, corners):
    """Min speed in a +/-90 m window around each corner apex."""
    v, n = tel["v"], len(tel["v"])
    tl = tel.get("len") or 1.0
    out = []
    for c in corners:
        lo = max(0, int((c["d"] - WINDOW) / tl * (n - 1)))
        hi = min(n - 1, int(math.ceil((c["d"] + WINDOW) / tl * (n - 1))))
        out.append(min(v[lo:hi + 1]) if hi > lo else None)
    return out


def spearman(a, b):
    """Spearman rank correlation of two equal-length lists."""
    def ranks(x):
        order = sorted(range(len(x)), key=lambda i: x[i])
        r = [0.0] * len(x)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and x[order[j + 1]] == x[order[i]]:
                j += 1
            avg = (i + j) / 2 + 1
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r
    ra, rb = ranks(a), ranks(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    da = math.sqrt(sum((x - ma) ** 2 for x in ra))
    db = math.sqrt(sum((y - mb) ** 2 for y in rb))
    return num / (da * db) if da and db else 0.0


def pearson(xs, ys):
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return num / (dx * dy) if dx and dy else 0.0


def slug_of(path):
    # data/2025/09-spanish-grand-prix/Q.json.gz -> spanish-grand-prix
    part = Path(path).parent.name
    return part.split("-", 1)[1] if "-" in part else part


def analyze_weekend(wk):
    """Returns dict with per-team quali/corner/straight metrics + circuit char + race pace."""
    files = wk["sessions"]
    if "Q" not in files:
        return None
    q = load(ROOT / files["Q"]["file"])
    out = {
        "round": wk["round"], "event": wk["event"], "slug": slug_of(files["Q"]["file"]),
        "wetQ": wet_fraction(q.get("weather")) > WET_FRAC,
        "teams": {}, "circuit": None, "race": None, "tempR": None,
    }
    team_of, team_color = {}, {}
    for d in q["drivers"]:
        if d.get("team"):
            team_of[d["abbr"]] = d["team"]
            team_color[d["team"]] = d.get("color") or "#888"
    out["colors"] = team_color

    corners = (q.get("map") or {}).get("corners") or []
    # per-team best quali lap + corner mins + speed trap
    best_lap, team_mins, team_trap = {}, {}, {}
    for abbr, team in team_of.items():
        bl = best_tel_lap(q, abbr)
        if not bl:
            continue
        t, tel = bl
        if team not in best_lap or t < best_lap[team]:
            best_lap[team] = t
        if corners:
            mins = corner_mins(tel, corners)
            prev = team_mins.get(team)
            team_mins[team] = mins if prev is None else [
                (m if p is None else p if m is None else max(p, m))
                for p, m in zip(prev, mins)]
    for lp in q["laps"]:
        team = team_of.get(lp["drv"])
        sp = lp.get("spST") or lp.get("spFL")
        if team and sp and sp > 100:
            team_trap[team] = max(team_trap.get(team, 0), sp)

    if not best_lap:
        return None
    pole = min(best_lap.values())
    out["poleMs"] = pole

    # circuit characterisation from field-best corner speeds + pole flat-out fraction
    classes = None
    if corners and team_mins:
        field = []
        for i in range(len(corners)):
            vals = [m[i] for m in team_mins.values() if m and m[i] is not None]
            field.append(max(vals) if vals else None)
        classes = ["slow" if v < CLASS_SLOW else "med" if v < CLASS_MED else "fast"
                   for v in field if v is not None]
        cls_of = {}
        k = 0
        for i, v in enumerate(field):
            if v is not None:
                cls_of[i] = classes[k]
                k += 1
        counts = {c: classes.count(c) for c in ("slow", "med", "fast")}
        speeds = {c: round(sum(field[i] for i in cls_of if cls_of[i] == c)
                           / max(1, counts[c]), 1) if counts[c] else None
                  for c in ("slow", "med", "fast")}
        # flat-out fraction from the pole team's lap telemetry
        flat = None
        ref = q.get("map", {}).get("refLap")
        if ref and ref in q["tel"]:
            th = q["tel"][ref].get("th")
            if th:
                flat = round(sum(1 for x in th if x >= 98) / len(th), 3)
        out["circuit"] = {
            "counts": counts, "speeds": speeds, "flat": flat,
            "len": (q.get("map") or {}).get("len"),
        }
        # per-team per-class deficits vs field best
        for team, mins in team_mins.items():
            defs = {"slow": [], "med": [], "fast": []}
            for i, cls in cls_of.items():
                if mins[i] is not None and field[i] is not None:
                    defs[cls].append(field[i] - mins[i])
            out["teams"][team] = {
                "def": {c: round(sum(v) / len(v), 2) if v else None
                        for c, v in defs.items()},
            }

    trap_best = max(team_trap.values()) if team_trap else None
    for team in best_lap:
        rec = out["teams"].setdefault(team, {"def": {"slow": None, "med": None, "fast": None}})
        rec["quali"] = round((best_lap[team] / pole - 1) * 100, 3)
        rec["trap"] = round(trap_best - team_trap[team], 1) if trap_best and team in team_trap else None

    # race pace + temps
    if "R" in files:
        try:
            r = load(ROOT / files["R"]["file"])
        except Exception:
            r = None
        if r:
            out["tempR"] = track_temp(r.get("weather"))
            out["wetR"] = wet_fraction(r.get("weather")) > WET_FRAC
            rteam = {d["abbr"]: d["team"] for d in r["drivers"] if d.get("team")}
            clean = [lp for lp in r["laps"]
                     if lp["t"] and lp.get("ts") == "1" and lp["lap"] > 1
                     and not lp.get("pitIn") and not lp.get("pitOut") and not lp.get("del")]
            if len(clean) > 40:
                med_all = median(lp["t"] for lp in clean)
                by_team = defaultdict(list)
                for lp in clean:
                    if lp["t"] <= med_all * 1.07 and rteam.get(lp["drv"]):
                        by_team[rteam[lp["drv"]]].append(lp["t"])
                meds = {tm: median(v) for tm, v in by_team.items() if len(v) >= 8}
                if meds:
                    best = min(meds.values())
                    out["race"] = {tm: round((m - best) / 1000, 3) for tm, m in meds.items()}
    return out


# --- physical circuit-fit model -------------------------------------------
# Time lost per corner: dt = L * dv / v^2 with L = 2*WINDOW, v the field's
# class-average apex speed AT THAT CIRCUIT, dv the team's measured class
# deficit. Straights: dt = flat_len * dv_trap * 0.6 / v_straight^2 (0.6
# because a speed-trap gap builds over the straight rather than being
# carried end to end). All inputs measured; the model is just kinematics.
V_STRAIGHT = 285 / 3.6


def fit_loss(prof, circ):
    loss = 0.0
    for cls in ("slow", "med", "fast"):
        d = prof["def"].get(cls)
        n = circ["counts"].get(cls, 0)
        v = circ["speeds"].get(cls)
        if d is None or not n or not v:
            continue
        vms = v / 3.6
        loss += n * (2 * WINDOW) * (max(d, 0.0) / 3.6) / (vms * vms)
    if prof.get("trap") is not None and circ.get("flat") and circ.get("len"):
        loss += circ["flat"] * circ["len"] * (max(prof["trap"], 0.0) / 3.6) * 0.6 / (V_STRAIGHT ** 2)
    return loss


def build():
    manifest = json.load(open(ROOT / "manifest.json"))
    seasons = {}
    # latest circuit characterisation per event slug across all years (for
    # upcoming rounds that haven't been run in the current season yet)
    circ_by_slug = {}

    for year in sorted(manifest["years"]):
        wks = sorted(manifest["years"][year], key=lambda w: w["round"])
        season = {"teams": {}, "rounds": [], "colors": {}}
        # def/trap entries carry their round number so the honesty check can be
        # leave-one-out: each weekend is predicted by a model built WITHOUT it
        per_team = defaultdict(lambda: {
            "def": {"slow": [], "med": [], "fast": []},
            "trap": [], "quali": [], "race": [], "temp_pairs": []})
        for wk in wks:
            try:
                res = analyze_weekend(wk)
            except Exception as e:
                print(f"  ! {year} R{wk['round']}: {e}")
                continue
            if not res:
                continue
            season["colors"].update(res.get("colors", {}))
            rnd = {"round": res["round"], "event": res["event"], "slug": res["slug"],
                   "wetQ": res["wetQ"], "temp": res["tempR"],
                   "circuit": res["circuit"], "done": True, "poleMs": res.get("poleMs"),
                   "quali": {tm: t.get("quali") for tm, t in res["teams"].items()
                             if t.get("quali") is not None},
                   "race": res.get("race")}
            season["rounds"].append(rnd)
            if res["circuit"]:
                circ_by_slug[res["slug"]] = (int(year), res["circuit"], res["event"])
            for tm, t in res["teams"].items():
                agg = per_team[tm]
                if not res["wetQ"]:
                    for cls in ("slow", "med", "fast"):
                        if t["def"].get(cls) is not None:
                            agg["def"][cls].append((res["round"], t["def"][cls]))
                    if t.get("trap") is not None:
                        agg["trap"].append((res["round"], t["trap"]))
                    if t.get("quali") is not None:
                        agg["quali"].append(t["quali"])
                if res.get("race") and tm in res["race"] and not res.get("wetR") \
                        and res["tempR"] is not None:
                    agg["race"].append(res["race"][tm])
                    agg["temp_pairs"].append((res["tempR"], res["race"][tm]))
        # aggregate
        season["_agg"] = per_team
        for tm, agg in per_team.items():
            if not agg["quali"] and not agg["race"]:
                continue
            prof = {
                "def": {c: round(sum(x[1] for x in v) / len(v), 2) if v else None
                        for c, v in agg["def"].items()},
                "defN": {c: len(v) for c, v in agg["def"].items()},
                "trap": round(sum(x[1] for x in agg["trap"]) / len(agg["trap"]), 1) if agg["trap"] else None,
                "quali": round(median(agg["quali"]), 3) if agg["quali"] else None,
                "race": round(median(agg["race"]), 3) if agg["race"] else None,
                "n": len(agg["quali"]),
            }
            pairs = agg["temp_pairs"]
            if len(pairs) >= MIN_TEMP_N:
                xs = [p[0] for p in pairs]
                ys = [p[1] for p in pairs]
                r = pearson(xs, ys)
                mx = sum(xs) / len(xs)
                den = sum((x - mx) ** 2 for x in xs)
                slope = (sum((x - mx) * y for x, y in zip(xs, ys)) / den) if den else 0.0
                prof["temp"] = {"r": round(r, 2), "slope10": round(slope * 10, 3), "n": len(pairs)}
            season["teams"][tm] = prof
        if season["teams"]:
            seasons[str(year)] = season

    # circuit-fit + honesty check + calibration per season
    slugs_of_season = {int(y): {r["slug"] for r in s["rounds"] if r.get("circuit")}
                       for y, s in seasons.items()}
    for year, season in seasons.items():
        teams = season["teams"]
        fits, acc = {}, []
        done_slugs = set()
        cal_x, cal_y = [], []   # fit score vs actual quali gap (s) — for scale calibration
        for rnd in season["rounds"]:
            if not rnd.get("circuit"):
                continue
            done_slugs.add(rnd["slug"])
            for tm, prof in teams.items():
                fits.setdefault(tm, {})[rnd["slug"]] = round(fit_loss(prof, rnd["circuit"]), 3)
            # honesty check, leave-one-out: predict this weekend's quali order
            # with a profile built from every OTHER weekend of the season
            if not rnd["wetQ"] and rnd.get("quali"):
                agg = season["_agg"]
                loo_fit = {}
                for tm in teams:
                    a = agg.get(tm)
                    if not a:
                        continue
                    defs, ns = {}, 0
                    for cls in ("slow", "med", "fast"):
                        v = [x[1] for x in a["def"][cls] if x[0] != rnd["round"]]
                        defs[cls] = sum(v) / len(v) if v else None
                        ns = max(ns, len(v))
                    tr = [x[1] for x in a["trap"] if x[0] != rnd["round"]]
                    if ns >= 2:   # need at least two other weekends to predict this one
                        loo_fit[tm] = fit_loss(
                            {"def": defs, "trap": sum(tr) / len(tr) if tr else None},
                            rnd["circuit"])
                common = [tm for tm in loo_fit if tm in rnd["quali"]]
                if len(common) >= 6:
                    rho = spearman([loo_fit[tm] for tm in common],
                                   [rnd["quali"][tm] for tm in common])
                    acc.append({"round": rnd["round"], "event": rnd["event"],
                                "rho": round(rho, 2), "n": len(common)})
                if rnd.get("poleMs"):
                    base = min(fits[tm][rnd["slug"]] for tm in common) if common else 0
                    for tm in common:
                        cal_x.append(fits[tm][rnd["slug"]] - base)
                        cal_y.append(rnd["quali"][tm] / 100 * rnd["poleMs"] / 1000)
        # upcoming: only circuits that were on the *previous* season's calendar
        # (keeps one-off covid-era events out of a modern season's predictions)
        prev = slugs_of_season.get(int(year) - 1, set())
        upcoming = []
        for slug, (cy, circ, event) in circ_by_slug.items():
            if slug in done_slugs or slug not in prev or cy >= int(year):
                continue
            upcoming.append({"slug": slug, "event": event, "from": cy, "circuit": circ})
            for tm, prof in teams.items():
                fits.setdefault(tm, {})[slug] = round(fit_loss(prof, circ), 3)
        season["upcoming"] = sorted(upcoming, key=lambda u: u["event"])
        season["fits"] = fits
        season["acc"] = acc
        season["accMean"] = round(sum(a["rho"] for a in acc) / len(acc), 2) if acc else None
        # least-squares through origin: seconds-per-fit-point, so the UI can
        # show the score on a realistic seconds scale
        sxx = sum(x * x for x in cal_x)
        season["calib"] = round(sum(x * y for x, y in zip(cal_x, cal_y)) / sxx, 4) if sxx else None
        # strip heavy per-round quali/race maps we no longer need client-side
        season.pop("_agg", None)
        for rnd in season["rounds"]:
            rnd.pop("quali", None)
            rnd.pop("race", None)
            rnd.pop("poleMs", None)

    out = {"generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "classes": {"slow": CLASS_SLOW, "med": CLASS_MED}, "seasons": seasons}
    raw = json.dumps(out, separators=(",", ":")).encode()
    dest = DATA / "profiles.json.gz"
    with gzip.open(dest, "wb", compresslevel=9) as f:
        f.write(raw)
    print(f"profiles: {len(seasons)} seasons, {len(raw)//1024} KB raw, "
          f"{dest.stat().st_size//1024} KB gz -> {dest}")


if __name__ == "__main__":
    build()
