#!/usr/bin/env python3
"""FastF1 weekend extractor for the F1 Analysis Hub.

Pulls every session of a race weekend and writes one compact JSON bundle:
results, all laps (times, sectors, stints, compounds, speed traps, track
status), per-lap telemetry resampled onto a uniform relative-distance grid,
track map + corner markers, weather, and race control messages.

Usage:
    python3 extract.py <year> <round> [outfile]
"""
import json
import math
import sys

import numpy as np
import pandas as pd

import fastf1

N_TEL = 280   # telemetry points per lap (uniform in relative distance)
N_MAP = 620   # track map points

SESSION_ORDER = {
    "conventional": ["FP1", "FP2", "FP3", "Q", "R"],
    "sprint_qualifying": ["FP1", "SQ", "S", "Q", "R"],
    "sprint_shootout": ["FP1", "SQ", "S", "Q", "R"],
    "sprint": ["FP1", "Q", "FP2", "S", "R"],
}


def ms(td):
    """Timedelta -> int milliseconds, NaN-safe."""
    if td is None or pd.isna(td):
        return None
    return int(round(td.total_seconds() * 1000))


def num(x, nd=None):
    if x is None or (isinstance(x, float) and math.isnan(x)) or pd.isna(x):
        return None
    if nd is not None:
        return round(float(x), nd)
    return float(x)


def intval(x):
    if x is None or pd.isna(x):
        return None
    return int(x)


def resample_lap(car, lap_time_ms):
    """Resample one lap's car data onto a uniform relative-distance grid.

    Returns dict of channel arrays (ints) or None if data is unusable.
    """
    if car is None or len(car) < 20:
        return None
    dist = car["Distance"].to_numpy(dtype=float)
    d_total = dist[-1]
    if not np.isfinite(d_total) or d_total < 500:
        return None
    # enforce monotonic distance for interpolation
    dist = np.maximum.accumulate(dist)
    r = dist / d_total
    grid = np.linspace(0.0, 1.0, N_TEL)

    t = (car["Time"] - car["Time"].iloc[0]).dt.total_seconds().to_numpy() * 1000.0
    # scale cumulative time so the lap ends exactly on the official lap time;
    # keeps deltas between laps honest at the finish line
    if lap_time_ms and t[-1] > 0:
        t = t * (lap_time_ms / t[-1])

    def interp(col):
        return np.interp(grid, r, col)

    out = {
        "t": np.rint(interp(t)).astype(int).tolist(),
        "v": np.rint(interp(car["Speed"].to_numpy(dtype=float))).astype(int).tolist(),
        "n": np.rint(interp(car["RPM"].to_numpy(dtype=float))).astype(int).tolist(),
        "g": np.rint(interp(car["nGear"].to_numpy(dtype=float))).astype(int).tolist(),
        "th": np.clip(np.rint(interp(car["Throttle"].to_numpy(dtype=float))), 0, 100).astype(int).tolist(),
        "b": np.rint(interp(car["Brake"].astype(float).to_numpy())).astype(int).tolist(),
        "d": (interp((car["DRS"].to_numpy(dtype=float) >= 10).astype(float)) > 0.5).astype(int).tolist(),
        "len": round(d_total, 1),
    }
    return out


def extract_session(year, rnd, ident):
    try:
        s = fastf1.get_session(year, rnd, ident)
        s.load(laps=True, telemetry=True, weather=True, messages=True)
    except Exception as e:
        print(f"  !! could not load {ident}: {e}")
        return None
    if s.laps is None or len(s.laps) == 0:
        print(f"  !! no laps in {ident}")
        return None

    laps = s.laps

    # ---- results / drivers ------------------------------------------------
    drivers = []
    res = s.results
    team_seen = {}
    for _, row in res.iterrows():
        team = row.get("TeamName") or "?"
        style = team_seen.get(team, 0)
        team_seen[team] = style + 1
        d = {
            "abbr": row.get("Abbreviation"),
            "num": str(row.get("DriverNumber")),
            "name": row.get("FullName"),
            "team": team,
            "color": ("#" + str(row.get("TeamColor")).lstrip("#")) if pd.notna(row.get("TeamColor")) else "#888888",
            "style": style,  # 0 = first car (solid), 1 = second car (dashed)
            "pos": intval(row.get("Position")),
            "grid": intval(row.get("GridPosition")),
            "status": row.get("Status") if pd.notna(row.get("Status")) else None,
            "points": num(row.get("Points")),
            "classPos": str(row.get("ClassifiedPosition")) if pd.notna(row.get("ClassifiedPosition")) else None,
            "q1": ms(row.get("Q1")), "q2": ms(row.get("Q2")), "q3": ms(row.get("Q3")),
            "time": ms(row.get("Time")),
        }
        drivers.append(d)

    # ---- qualifying segment tagging ---------------------------------------
    qseg = {}  # (abbr, lapNumber) -> 1/2/3
    if ident in ("Q", "SQ"):
        try:
            parts = laps.split_qualifying_sessions()
            for i, part in enumerate(parts, start=1):
                if part is None:
                    continue
                for _, lp in part.iterrows():
                    qseg[(lp["Driver"], int(lp["LapNumber"]))] = i
        except Exception as e:
            print(f"  qsplit failed: {e}")

    # ---- laps --------------------------------------------------------------
    lap_rows = []
    tel = {}
    tel_count = 0
    for _, lp in laps.iterrows():
        abbr = lp["Driver"]
        lapno = int(lp["LapNumber"])
        pit_in = pd.notna(lp["PitInTime"])
        pit_out = pd.notna(lp["PitOutTime"])
        rec = {
            "drv": abbr,
            "lap": lapno,
            "t": ms(lp["LapTime"]),
            "s1": ms(lp["Sector1Time"]), "s2": ms(lp["Sector2Time"]), "s3": ms(lp["Sector3Time"]),
            "stint": intval(lp["Stint"]),
            "cmp": lp["Compound"] if pd.notna(lp["Compound"]) else None,
            "life": intval(lp["TyreLife"]),
            "fresh": bool(lp["FreshTyre"]) if pd.notna(lp["FreshTyre"]) else None,
            "pos": intval(lp["Position"]),
            "ts": str(lp["TrackStatus"]) if pd.notna(lp["TrackStatus"]) else "1",
            "pb": bool(lp["IsPersonalBest"]),
            "in": pit_in, "out": pit_out,
            "del": bool(lp["Deleted"]) if pd.notna(lp["Deleted"]) else False,
            "delR": lp["DeletedReason"] if (pd.notna(lp["DeletedReason"]) and lp["DeletedReason"]) else None,
            "acc": bool(lp["IsAccurate"]),
            "st": ms(lp["LapStartTime"]),
            "pitIn": ms(lp["PitInTime"]),
            "pitOut": ms(lp["PitOutTime"]),
            "spI1": num(lp["SpeedI1"]), "spI2": num(lp["SpeedI2"]),
            "spFL": num(lp["SpeedFL"]), "spST": num(lp["SpeedST"]),
        }
        if (abbr, lapno) in qseg:
            rec["q"] = qseg[(abbr, lapno)]
        lap_rows.append(rec)

        # telemetry: skip in/out laps and laps without a time (nothing to compare)
        if rec["t"] is not None and not pit_in and not pit_out:
            try:
                car = lp.get_car_data().add_distance()
                r = resample_lap(car, rec["t"])
                if r is not None:
                    tel[f"{abbr}-{lapno}"] = r
                    tel_count += 1
            except Exception:
                pass

    print(f"  {ident}: {len(lap_rows)} laps, {tel_count} telemetry laps")

    # ---- track map + corners (from session fastest lap) --------------------
    trackmap = None
    try:
        fl = laps.pick_fastest()
        pos = fl.get_telemetry()
        d = pos["Distance"].to_numpy(dtype=float)
        d = np.maximum.accumulate(d)
        r = d / d[-1]
        grid = np.linspace(0, 1, N_MAP)
        x = np.interp(grid, r, pos["X"].to_numpy(dtype=float))
        y = np.interp(grid, r, pos["Y"].to_numpy(dtype=float))
        ci = s.get_circuit_info()
        corners = []
        for _, c in ci.corners.iterrows():
            corners.append({
                "n": intval(c["Number"]),
                "l": c["Letter"] if c["Letter"] else "",
                "d": round(float(c["Distance"]), 1),
                "x": round(float(c["X"]), 1), "y": round(float(c["Y"]), 1),
                "a": round(float(c["Angle"]), 1),
            })
        trackmap = {
            "x": np.round(x, 1).tolist(),
            "y": np.round(y, 1).tolist(),
            "rot": float(ci.rotation),
            "corners": corners,
            "len": round(float(d[-1]), 1),
            "refLap": f"{fl['Driver']}-{int(fl['LapNumber'])}",
        }
    except Exception as e:
        print(f"  trackmap failed: {e}")

    # ---- weather ------------------------------------------------------------
    weather = []
    try:
        for _, w in s.weather_data.iterrows():
            weather.append([
                ms(w["Time"]), num(w["AirTemp"], 1), num(w["TrackTemp"], 1),
                num(w["Humidity"], 0), num(w["WindSpeed"], 1), num(w["WindDirection"], 0),
                1 if bool(w["Rainfall"]) else 0, num(w["Pressure"], 1),
            ])
    except Exception as e:
        print(f"  weather failed: {e}")

    # ---- race control -------------------------------------------------------
    rcm = []
    try:
        for _, m in s.race_control_messages.iterrows():
            rcm.append({
                "time": str(m.get("Time")) if pd.notna(m.get("Time")) else None,
                "lap": intval(m.get("Lap")),
                "cat": m.get("Category"),
                "flag": m.get("Flag") if pd.notna(m.get("Flag")) else None,
                "scope": m.get("Scope") if pd.notna(m.get("Scope")) else None,
                "sector": intval(m.get("Sector")),
                "msg": m.get("Message"),
            })
    except Exception as e:
        print(f"  rcm failed: {e}")

    return {
        "id": ident,
        "name": s.name,
        "date": str(s.date),
        "totalLaps": intval(s.total_laps) if s.total_laps else None,
        "drivers": drivers,
        "laps": lap_rows,
        "tel": tel,
        "map": trackmap,
        "weather": weather,
        "rcm": rcm,
    }


def main():
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
    rnd = int(sys.argv[2]) if len(sys.argv) > 2 else 9
    out = sys.argv[3] if len(sys.argv) > 3 else f"weekend_{year}_{rnd}.json"

    fastf1.Cache.enable_cache("f1cache")
    fastf1.set_log_level("WARNING")

    ev = fastf1.get_event(year, rnd)
    fmt = ev["EventFormat"]
    idents = SESSION_ORDER.get(fmt, ["FP1", "FP2", "FP3", "Q", "R"])
    print(f"{ev['EventName']} {year} (round {rnd}, {fmt}) -> sessions {idents}")

    sessions = []
    for ident in idents:
        print(f"loading {ident} ...")
        data = extract_session(year, rnd, ident)
        if data:
            sessions.append(data)

    bundle = {
        "year": year,
        "round": rnd,
        "event": ev["EventName"],
        "location": ev["Location"],
        "country": ev["Country"],
        "format": fmt,
        "generated": pd.Timestamp.utcnow().isoformat(),
        "sessions": sessions,
    }
    with open(out, "w") as f:
        json.dump(bundle, f, separators=(",", ":"))
    import os
    print(f"wrote {out}: {os.path.getsize(out)/1e6:.1f} MB")


if __name__ == "__main__":
    main()
