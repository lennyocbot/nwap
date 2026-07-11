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

# circuit altitude in metres (public geography, keyed by event slug)
ALTITUDE = {
    "mexico-city-grand-prix": 2240, "s-o-paulo-grand-prix": 760, "brazilian-grand-prix": 760,
    "austrian-grand-prix": 660, "styrian-grand-prix": 660, "eifel-grand-prix": 620,
    "las-vegas-grand-prix": 610, "belgian-grand-prix": 400, "french-grand-prix": 400,
    "hungarian-grand-prix": 250, "tuscan-grand-prix": 250, "madrid-grand-prix": 650,
    "united-states-grand-prix": 160, "italian-grand-prix": 160, "british-grand-prix": 150,
    "70th-anniversary-grand-prix": 150, "turkish-grand-prix": 130, "spanish-grand-prix": 100,
    "barcelona-grand-prix": 100, "portuguese-grand-prix": 100, "german-grand-prix": 100,
    "japanese-grand-prix": 45, "emilia-romagna-grand-prix": 37, "australian-grand-prix": 30,
    "canadian-grand-prix": 13, "monaco-grand-prix": 10, "qatar-grand-prix": 10,
    "bahrain-grand-prix": 7, "sakhir-grand-prix": 7, "dutch-grand-prix": 5,
    "singapore-grand-prix": 5, "abu-dhabi-grand-prix": 5, "russian-grand-prix": 5,
    "chinese-grand-prix": 4, "saudi-arabian-grand-prix": 3, "miami-grand-prix": 2,
    "azerbaijan-grand-prix": -28,
}
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


def flat_avg(tel):
    """Average speed while flat-out (throttle >= 98%, over 200 km/h) on a lap.

    A far better straight-line metric than the peak speed-trap number: the
    trap is one sample, inflated by slipstream tows and skinny-wing outliers,
    while this integrates drag + energy deployment along every straight."""
    v, th = tel.get("v"), tel.get("th")
    if not v or not th:
        return None
    pts = [vv for vv, tt in zip(v, th) if tt >= 98 and vv >= 200]
    return sum(pts) / len(pts) if len(pts) >= 15 else None


ZONE_W = 100.0   # m either side of the apex — tested best of 100/140/180 by leave-one-out accuracy


def t_at(tel, dist):
    """Interpolated cumulative lap time (ms) at a given distance."""
    t, n = tel["t"], len(tel["t"])
    tl = tel.get("len") or 1.0
    f = max(0.0, min(1.0, dist / tl)) * (n - 1)
    i = min(n - 2, int(f))
    return t[i] + (t[i + 1] - t[i]) * (f - i)


def corner_zone_times(tel, corners, map_len):
    """Time (ms) to traverse +/-ZONE_W around each apex — measures the whole
    corner (entry, apex, exit), not just the minimum speed point.

    Distance channels drift (GPS glitches add phantom metres), so each
    corner is rescaled to the lap's own length and then SNAPPED to the local
    speed minimum within +/-160 m — the window follows the real apex."""
    tl = tel.get("len") or 1.0
    v = tel["v"]
    n = len(v)
    scale = tl / (map_len or tl)
    out = []
    for c in corners:
        cd = c["d"] * scale
        slo = max(0, int((cd - 160) / tl * (n - 1)))
        shi = min(n - 1, int((cd + 160) / tl * (n - 1)))
        if shi <= slo + 2:
            out.append(None)
            continue
        imin = min(range(slo, shi + 1), key=lambda i: v[i])
        if imin <= slo or imin >= shi:
            out.append(None)          # no local apex inside the window — misaligned
            continue
        apex_d = imin / (n - 1) * tl
        lo, hi = apex_d - ZONE_W, apex_d + ZONE_W
        if lo < 0 or hi > tl:
            out.append(None)          # zone crosses the start line — skip
        else:
            out.append(t_at(tel, hi) - t_at(tel, lo))
    return out


def flat_pace(tel):
    """ms per km while flat-out (throttle >= 98%, >= 200 km/h): pure
    drag + energy deployment, measured along every straight of the lap."""
    v, th, t = tel.get("v"), tel.get("th"), tel.get("t")
    if not v or not th or not t:
        return None
    n = len(v)
    step = (tel.get("len") or 1.0) / (n - 1)
    time = dist = 0.0
    for i in range(n - 1):
        if th[i] >= 98 and v[i] >= 200 and th[i + 1] >= 98:
            time += t[i + 1] - t[i]
            dist += step
    return time / (dist / 1000) if dist >= 800 else None


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


def season_calendar(year):
    """[(round, slug, event)] for the season's OFFICIAL calendar — the source
    of truth for which circuits still count as 'upcoming' (calendars change
    year on year). Fetched via FastF1 and cached beside the data."""
    cache = DATA / f"calendar_{year}.json"
    try:
        import re as _re
        import fastf1
        sched = fastf1.get_event_schedule(int(year), include_testing=False)
        cal = []
        for _, ev in sched.iterrows():
            name = str(ev["EventName"])
            sl = _re.sub(r"-+", "-", _re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")
            cal.append([int(ev["RoundNumber"]), sl, name])
        cache.write_text(json.dumps(cal))
        return cal
    except Exception:
        try:
            return json.loads(cache.read_text())
        except Exception:
            return None


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
    # per-team best quali lap (apex speeds for circuit character) plus, from
    # EVERY telemetry lap the team drove: best zone time per corner and best
    # flat-out pace — an order of magnitude more datapoints than one lap
    best_lap, team_mins, team_trap, team_flat = {}, {}, {}, {}
    team_zone, team_fp = {}, {}
    for abbr, team in team_of.items():
        bl = best_tel_lap(q, abbr)
        if not bl:
            continue
        t, tel = bl
        if team not in best_lap or t < best_lap[team]:
            best_lap[team] = t
        fa = flat_avg(tel)
        if fa is not None:
            team_flat[team] = max(team_flat.get(team, 0), fa)
        if corners:
            mins = corner_mins(tel, corners)
            prev = team_mins.get(team)
            team_mins[team] = mins if prev is None else [
                (m if p is None else p if m is None else max(p, m))
                for p, m in zip(prev, mins)]
    # only genuine push laps feed the model: deleted laps are often track-limit
    # CUTS (shorter path = impossibly quick corner zones), and in/out or slow
    # laps carry no signal. Flat-out pace comes from each driver's single best
    # lap so one lucky slipstream tow can't set a team's straight-line level.
    lap_by = {}
    for lp in q["laps"]:
        lap_by[(lp["drv"], lp["lap"])] = lp
    best_t = {}
    for lp in q["laps"]:
        if lp["t"] and not lp.get("del") and not lp.get("in") and not lp.get("out"):
            best_t[lp["drv"]] = min(best_t.get(lp["drv"], 1e12), lp["t"])
    drv_best_fp = {}
    # a glitched distance channel (phantom metres) poisons every position on
    # the lap — reject laps whose length strays >1.5% from the session median
    push_lens = []
    for key, tel in q["tel"].items():
        abbr, _, ln = key.rpartition("-")
        lp = lap_by.get((abbr, int(ln)))
        if lp and lp["t"] and not lp.get("del") and not lp.get("in") and not lp.get("out") and tel.get("len"):
            push_lens.append(tel["len"])
    med_len = median(push_lens) if push_lens else None
    for key, tel in q["tel"].items():
        abbr, _, ln = key.rpartition("-")
        team = team_of.get(abbr)
        if not team:
            continue
        lp = lap_by.get((abbr, int(ln)))
        if not lp or not lp["t"] or lp.get("del") or lp.get("in") or lp.get("out"):
            continue
        if lp["t"] > best_t.get(abbr, 0) * 1.10:
            continue                        # not a push lap
        if med_len and abs((tel.get("len") or 0) - med_len) > med_len * 0.015:
            continue                        # corrupted distance channel
        if corners:
            zt = corner_zone_times(tel, corners, med_len)
            prev = team_zone.get(team)
            team_zone[team] = zt if prev is None else [
                (z if p is None else p if z is None else min(p, z))
                for p, z in zip(prev, zt)]
        cur = drv_best_fp.get(abbr)
        if cur is None or lp["t"] < cur[0]:
            fp = flat_pace(tel)
            if fp is not None:
                drv_best_fp[abbr] = (lp["t"], fp)
    for abbr, (_, fp) in drv_best_fp.items():
        team = team_of[abbr]
        team_fp[team] = min(team_fp.get(team, 1e12), fp)
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
        # per-team per-class deficits vs field best: apex speed (km/h, for
        # character) and zone TIME (ms/corner — what the model predicts with)
        fieldZ = []
        for i in range(len(corners)):
            vals = [z[i] for z in team_zone.values() if z and z[i] is not None]
            fieldZ.append(min(vals) if vals else None)
        for team, mins in team_mins.items():
            defs = {"slow": [], "med": [], "fast": []}
            defsT = {"slow": [], "med": [], "fast": []}
            zt = team_zone.get(team)
            for i, cls in cls_of.items():
                if mins[i] is not None and field[i] is not None:
                    defs[cls].append(field[i] - mins[i])
                if zt and zt[i] is not None and fieldZ[i] is not None:
                    defsT[cls].append(zt[i] - fieldZ[i])
            out["teams"][team] = {
                "def": {c: round(sum(v) / len(v), 2) if v else None
                        for c, v in defs.items()},
                "defT": {c: round(sum(v) / len(v), 1) if v else None
                         for c, v in defsT.items()},
            }

    # straight-line: flat-out average speed for display (km/h) and flat-out
    # pace for the model (ms per km — lower is faster)
    sl = team_flat if len(team_flat) >= 6 else team_trap
    sl_best = max(sl.values()) if sl else None
    fp_best = min(team_fp.values()) if team_fp else None
    for team in best_lap:
        rec = out["teams"].setdefault(team, {"def": {"slow": None, "med": None, "fast": None}, "defT": {"slow": None, "med": None, "fast": None}})
        rec["quali"] = round((best_lap[team] / pole - 1) * 100, 3)
        rec["trap"] = round(sl_best - sl[team], 1) if sl_best and team in sl else None
        rec["slp"] = round(team_fp[team] - fp_best, 1) if fp_best is not None and team in team_fp else None

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


# --- circuit-fit model: measured TIME deficits per track element -----------
# Every term is a directly measured time: zone-time deficit per corner of
# each class (ms) x how many such corners the circuit has, plus flat-out
# pace deficit (ms/km) x how many flat-out km the circuit has. No kinematic
# conversion — the sum is already an estimated lap-time gap in seconds.


def fit_loss(prof, circ):
    loss = 0.0
    dT = prof.get("defT") or {}
    for cls in ("slow", "med", "fast"):
        d = dT.get(cls)
        n = circ["counts"].get(cls, 0)
        if d is None or not n:
            continue
        loss += n * max(d, 0.0) / 1000
    if prof.get("slp") is not None and circ.get("flat") and circ.get("len"):
        loss += max(prof["slp"], 0.0) * (circ["flat"] * circ["len"] / 1000) / 1000
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
            "defT": {"slow": [], "med": [], "fast": []},
            "trap": [], "slp": [], "quali": [], "race": [], "temp_pairs": []})
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
                   "alt": ALTITUDE.get(res["slug"]),
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
                        if t.get("defT", {}).get(cls) is not None:
                            agg["defT"][cls].append((res["round"], t["defT"][cls]))
                    if t.get("trap") is not None:
                        agg["trap"].append((res["round"], t["trap"]))
                    if t.get("slp") is not None:
                        agg["slp"].append((res["round"], t["slp"]))
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
                "def": {c: round(median([x[1] for x in v]), 2) if v else None
                        for c, v in agg["def"].items()},
                "defT": {c: round(median([x[1] for x in v]), 1) if v else None
                         for c, v in agg["defT"].items()},
                "defN": {c: len(v) for c, v in agg["def"].items()},
                "trap": round(median([x[1] for x in agg["trap"]]), 1) if agg["trap"] else None,
                "slp": round(median([x[1] for x in agg["slp"]]), 1) if agg["slp"] else None,
                "quali": round(median(agg["quali"]), 3) if agg["quali"] else None,
                "race": round(median(agg["race"]), 3) if agg["race"] else None,
                "n": len(agg["quali"]),
            }
            apairs = [(ALTITUDE.get(r["slug"]), (r.get("quali") or {}).get(tm))
                      for r in season["rounds"] if not r["wetQ"]]
            apairs = [(a, v) for a, v in apairs if a is not None and v is not None]
            if len(apairs) >= MIN_TEMP_N and sum(1 for a, _ in apairs if a >= 500) >= 2:
                xs = [a / 1000 for a, _ in apairs]
                ys = [v for _, v in apairs]
                r_ = pearson(xs, ys)
                mx = sum(xs) / len(xs)
                den = sum((x - mx) ** 2 for x in xs)
                slope = (sum((x - mx) * y for x, y in zip(xs, ys)) / den) if den else 0.0
                prof["alt"] = {"r": round(r_, 2), "slopeKm": round(slope, 3), "n": len(apairs)}
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
                    defsT, ns = {}, 0
                    for cls in ("slow", "med", "fast"):
                        v = [x[1] for x in a["defT"][cls] if x[0] != rnd["round"]]
                        defsT[cls] = median(v) if v else None
                        ns = max(ns, len(v))
                    sp = [x[1] for x in a["slp"] if x[0] != rnd["round"]]
                    if ns >= 2:   # need at least two other weekends to predict this one
                        loo_fit[tm] = fit_loss(
                            {"defT": defsT, "slp": median(sp) if sp else None},
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
        # upcoming: rounds on THIS season's official calendar not yet in the
        # archive; layout characterised from the most recent archived visit
        cal = season_calendar(year)
        upcoming = []
        if cal:
            done_rounds = {r["round"] for r in season["rounds"]}
            for rno, slug, event in cal:
                if rno in done_rounds or slug in done_slugs:
                    continue
                hit = circ_by_slug.get(slug)
                if hit and hit[0] < int(year):
                    cy, circ, _ = hit
                    upcoming.append({"slug": slug, "event": event, "round": rno,
                                     "from": cy, "circuit": circ,
                                     "alt": ALTITUDE.get(slug)})
                    for tm, prof in teams.items():
                        fits.setdefault(tm, {})[slug] = round(fit_loss(prof, circ), 3)
                else:
                    upcoming.append({"slug": slug, "event": event, "round": rno,
                                     "noData": True, "alt": ALTITUDE.get(slug)})
        season["upcoming"] = sorted(upcoming, key=lambda u: u.get("round", 99))
        circs = [r["circuit"] for r in season["rounds"] if r.get("circuit")]
        if circs:
            season["avgCirc"] = {
                "counts": {c: round(sum(x["counts"].get(c, 0) for x in circs) / len(circs), 1)
                           for c in ("slow", "med", "fast")},
                "flatKm": round(sum((x.get("flat") or 0) * (x.get("len") or 0) for x in circs) / len(circs) / 1000, 2),
            }
        season["fits"] = fits
        season["acc"] = acc
        season["accMean"] = round(sum(a["rho"] for a in acc) / len(acc), 2) if acc else None
        poles = [r["poleMs"] for r in season["rounds"] if not r["wetQ"] and r.get("poleMs")]
        season["avgPole"] = int(sum(poles) / len(poles)) if poles else None
        # least-squares through origin: seconds-per-fit-point, so the UI can
        # show the score on a realistic seconds scale
        sxx = sum(x * x for x in cal_x)
        season["calib"] = round(sum(x * y for x, y in zip(cal_x, cal_y)) / sxx, 4) if sxx else None
        # keep per-round quali gaps (they power the pace-evolution chart);
        # strip the rest of the per-round detail
        season.pop("_agg", None)
        for rnd in season["rounds"]:
            if rnd.get("quali"):
                rnd["quali"] = {tm: round(v, 3) for tm, v in rnd["quali"].items()}
            rnd.pop("race", None)
            if rnd.get("poleMs"):
                rnd["poleMs"] = int(rnd["poleMs"])

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
