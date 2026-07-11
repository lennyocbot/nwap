#!/usr/bin/env python3
"""Model experiment lab: extract fine-grained per-corner segment times once,
then evaluate model variants by leave-one-out rank accuracy on every season.

Cache layout per weekend/team/corner: min time (ms) across push laps for each
segment between offsets [-180,-140,-100,-30,+30,+100,+140,+180] around the
snapped apex — any window or phase split recombines from these.
"""
import gzip
import json
import sys
from pathlib import Path
from statistics import median

sys.path.insert(0, str(Path(__file__).parent))
import build_profiles as B

OFF = [-180, -140, -100, -30, 30, 100, 140, 180]
CACHE = Path(__file__).parent / "model_cache.json.gz"


def segment_times(tel, corners, map_len):
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
            out.append(None)
            continue
        apex = imin / (n - 1) * tl
        if apex + OFF[0] < 0 or apex + OFF[-1] > tl:
            out.append(None)
            continue
        ts = [B.t_at(tel, apex + o) for o in OFF]
        out.append([round(ts[i + 1] - ts[i], 1) for i in range(len(OFF) - 1)])
    return out


def build_cache():
    manifest = json.load(open(B.ROOT / "manifest.json"))
    out = {}
    for year in sorted(manifest["years"]):
        rounds = []
        for wk in sorted(manifest["years"][year], key=lambda w: w["round"]):
            files = wk["sessions"]
            if "Q" not in files:
                continue
            try:
                q = B.load(B.ROOT / files["Q"]["file"])
            except Exception:
                continue
            wet = B.wet_fraction(q.get("weather")) > B.WET_FRAC
            wind = median([w[4] for w in (q.get("weather") or []) if len(w) > 4 and w[4] is not None] or [0])
            team_of = {d["abbr"]: d["team"] for d in q["drivers"] if d.get("team")}
            corners = (q.get("map") or {}).get("corners") or []
            map_len = (q.get("map") or {}).get("len")
            lap_by = {(l["drv"], l["lap"]): l for l in q["laps"]}
            best_t = {}
            for l in q["laps"]:
                if l["t"] and not l.get("del") and not l.get("in") and not l.get("out"):
                    best_t[l["drv"]] = min(best_t.get(l["drv"], 1e12), l["t"])
            push_lens = [tel["len"] for k, tel in q["tel"].items()
                         if (lambda lp: lp and lp["t"] and not lp.get("del") and not lp.get("in") and not lp.get("out"))(lap_by.get((k.rpartition("-")[0], int(k.rpartition("-")[2])))) and tel.get("len")]
            med_len = median(push_lens) if push_lens else None
            segs, fps, apex_v = {}, {}, {}
            drv_best_fp = {}
            for key, tel in q["tel"].items():
                abbr, _, ln = key.rpartition("-")
                team = team_of.get(abbr)
                lp = lap_by.get((abbr, int(ln)))
                if not team or not lp or not lp["t"] or lp.get("del") or lp.get("in") or lp.get("out"):
                    continue
                if lp["t"] > best_t.get(abbr, 0) * 1.10:
                    continue
                if med_len and abs((tel.get("len") or 0) - med_len) > med_len * 0.015:
                    continue
                if corners:
                    st = segment_times(tel, corners, med_len)
                    mins = B.corner_mins(tel, corners)
                    prev = segs.get(team)
                    if prev is None:
                        segs[team] = st
                    else:
                        segs[team] = [s if p is None else p if s is None else
                                      [min(a, b) for a, b in zip(p, s)]
                                      for p, s in zip(prev, st)]
                    pv = apex_v.get(team)
                    apex_v[team] = mins if pv is None else [
                        (m if p is None else p if m is None else max(p, m))
                        for p, m in zip(pv, mins)]
                cur = drv_best_fp.get(abbr)
                if cur is None or lp["t"] < cur[0]:
                    fp = B.flat_pace(tel)
                    if fp is not None:
                        drv_best_fp[abbr] = (lp["t"], fp)
            for abbr, (_, fp) in drv_best_fp.items():
                team = team_of[abbr]
                fps[team] = min(fps.get(team, 1e12), fp)
            # quali gaps
            best_lap = {}
            for abbr, team in team_of.items():
                bl = best_t.get(abbr)
                if bl:
                    best_lap[team] = min(best_lap.get(team, 1e12), bl)
            if not best_lap:
                continue
            pole = min(best_lap.values())
            quali = {tm: round((v / pole - 1) * 100, 3) for tm, v in best_lap.items()}
            # field-best apex speed per corner (for class thresholds)
            fbest = []
            for i in range(len(corners)):
                vals = [m[i] for m in apex_v.values() if m and m[i] is not None]
                fbest.append(round(max(vals), 1) if vals else None)
            mp = q.get("map") or {}
            flat = None
            ref = mp.get("refLap")
            if ref and ref in q["tel"] and q["tel"][ref].get("th"):
                th = q["tel"][ref]["th"]
                flat = round(sum(1 for x in th if x >= 98) / len(th), 3)
            rounds.append({
                "round": wk["round"], "event": wk["event"], "wet": wet, "wind": round(wind, 1),
                "quali": quali, "fps": {t: round(v, 1) for t, v in fps.items()},
                "fbest": fbest, "flat": flat, "len": mp.get("len"),
                "segs": segs, "poleMs": pole,
            })
            print(f"  {year} R{wk['round']} cached", flush=True)
        if rounds:
            out[year] = rounds
    with gzip.open(CACHE, "wb") as f:
        f.write(json.dumps(out, separators=(",", ":")).encode())
    print(f"cache -> {CACHE} ({CACHE.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    build_cache()
