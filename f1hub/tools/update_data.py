#!/usr/bin/env python3
"""Keep data/ and manifest.json up to date with published F1 sessions.

Modes:
    python3 update_data.py                          # cron: grab any recently finished, missing sessions
    python3 update_data.py --year 2024 --all        # backfill a whole season
    python3 update_data.py --year 2026 --round 9    # backfill one weekend
    add --force to re-extract files that already exist

Output layout (repo root):
    data/<year>/<round>-<event-slug>/<SID>.json.gz   one file per session
    data/<year>/<round>-<event-slug>/meta.json       event metadata
    manifest.json                                    index the web app loads
"""
import argparse
import datetime
import gzip
import json
import pathlib
import re
import sys

import pandas as pd
import fastf1

from extract import extract_session, SESSION_ORDER

TOOLS = pathlib.Path(__file__).resolve().parent
ROOT = TOOLS.parent if TOOLS.name == "tools" else TOOLS
DATA = ROOT / "data"

SESSION_NAME_TO_ID = {
    "Practice 1": "FP1", "Practice 2": "FP2", "Practice 3": "FP3",
    "Qualifying": "Q", "Sprint Qualifying": "SQ", "Sprint Shootout": "SQ",
    "Sprint": "S", "Race": "R",
}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")


def weekend_dir(year, rnd, event_name):
    return DATA / str(year) / f"{int(rnd):02d}-{slug(event_name)}"


def write_meta(year, ev):
    d = weekend_dir(year, ev["RoundNumber"], ev["EventName"])
    d.mkdir(parents=True, exist_ok=True)
    (d / "meta.json").write_text(json.dumps({
        "year": int(year),
        "round": int(ev["RoundNumber"]),
        "event": ev["EventName"],
        "location": ev["Location"],
        "country": ev["Country"],
        "format": ev["EventFormat"],
        "date": str(ev["EventDate"].date()) if pd.notna(ev["EventDate"]) else None,
    }))
    return d


def extract_one(year, ev, sid, force=False, require_tel=False):
    d = weekend_dir(year, ev["RoundNumber"], ev["EventName"])
    out = d / f"{sid}.json.gz"
    if out.exists() and not force:
        return False
    print(f"extracting {year} R{ev['RoundNumber']} {sid} ({ev['EventName']}) ...", flush=True)
    data = extract_session(year, int(ev["RoundNumber"]), sid)
    if not data:
        return False
    if require_tel and not data.get("tel"):
        # laps published but car data not yet — don't freeze a telemetry-less
        # file into the archive; the next cron run will pick it up complete
        print("  laps up but telemetry not published yet — retrying next run")
        return False
    write_meta(year, ev)
    out.write_bytes(gzip.compress(json.dumps(data, separators=(",", ":")).encode(), 9))
    print(f"  -> {out.relative_to(ROOT)} ({out.stat().st_size/1e6:.1f} MB)")
    return True


def sessions_of(ev):
    """[(sid, utc_datetime)] for an event row, in schedule order."""
    out = []
    for i in range(1, 6):
        name = ev.get(f"Session{i}")
        date = ev.get(f"Session{i}DateUtc")
        sid = SESSION_NAME_TO_ID.get(name)
        if sid and pd.notna(date):
            out.append((sid, date))
    return out


def do_weekend(year, ev, force=False):
    now = pd.Timestamp.now(tz="UTC").tz_localize(None)
    n = 0
    for sid, date in sessions_of(ev):
        if date + pd.Timedelta(minutes=45) > now:
            continue  # session not finished / data not published yet
        try:
            n += bool(extract_one(year, ev, sid, force))
        except Exception as e:
            print(f"  !! {sid} failed: {e}")
    return n


def auto(year):
    """Cron mode: only look at sessions from the last two weeks that we don't have."""
    sched = fastf1.get_event_schedule(year)
    now = pd.Timestamp.now(tz="UTC").tz_localize(None)
    n = 0
    for _, ev in sched.iterrows():
        if int(ev["RoundNumber"]) == 0:
            continue
        for sid, date in sessions_of(ev):
            # start trying 45 min after the scheduled session end; FastF1
            # publishes anywhere from ~30 min to a few hours later, and
            # failed early attempts are cheap and retried every cron run
            if date + pd.Timedelta(minutes=45) > now:
                continue
            if date < now - pd.Timedelta(days=14):
                continue  # history is handled by explicit backfill runs
            if (weekend_dir(year, ev["RoundNumber"], ev["EventName"]) / f"{sid}.json.gz").exists():
                continue
            try:
                n += bool(extract_one(year, ev, sid, require_tel=True))
            except Exception as e:
                print(f"  !! {year} R{ev['RoundNumber']} {sid} not ready: {e}")
    return n


def rebuild_manifest():
    years = {}
    for ydir in sorted(DATA.glob("[12][0-9][0-9][0-9]")):
        entries = []
        for wdir in sorted(p for p in ydir.iterdir() if p.is_dir()):
            mf = wdir / "meta.json"
            if not mf.exists():
                continue
            meta = json.loads(mf.read_text())
            order = SESSION_ORDER.get(meta.get("format"), ["FP1", "FP2", "FP3", "Q", "R"])
            sessions = {}
            for sid in order:
                f = wdir / f"{sid}.json.gz"
                if f.exists():
                    sessions[sid] = {"file": str(f.relative_to(ROOT)), "size": f.stat().st_size}
            if sessions:
                meta["sessions"] = sessions
                entries.append(meta)
        if entries:
            years[ydir.name] = sorted(entries, key=lambda e: e["round"])
    (ROOT / "manifest.json").write_text(json.dumps({
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "years": years,
    }, separators=(",", ":")))
    total = sum(len(v) for v in years.values())
    print(f"manifest.json: {total} weekends across {len(years)} seasons")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int)
    ap.add_argument("--round", type=int)
    ap.add_argument("--all", action="store_true", help="backfill every round of --year")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    cache = TOOLS / "f1cache"
    cache.mkdir(exist_ok=True)
    fastf1.Cache.enable_cache(str(cache))
    fastf1.set_log_level("WARNING")

    n = 0
    if args.year and args.round:
        sched = fastf1.get_event_schedule(args.year)
        ev = sched[sched["RoundNumber"] == args.round].iloc[0]
        n = do_weekend(args.year, ev, args.force)
    elif args.year:
        sched = fastf1.get_event_schedule(args.year)
        for _, ev in sched.iterrows():
            if int(ev["RoundNumber"]) == 0:
                continue
            n += do_weekend(args.year, ev, args.force)
    else:
        year = datetime.date.today().year
        n = auto(year)
        if datetime.date.today().month <= 2:  # season overlap: also check last year's finale
            n += auto(year - 1)

    rebuild_manifest()
    print(f"done: {n} new session file(s)")


if __name__ == "__main__":
    main()
