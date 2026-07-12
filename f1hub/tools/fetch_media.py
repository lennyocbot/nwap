#!/usr/bin/env python3
"""Vendor official driver headshots + team logos into media/ so the app never
hotlinks. Driver names/teams are harvested from the archive itself; anyone the
CDN doesn't know keeps the built-in helmet fallback in the app.

Usage: python3 fetch_media.py [--new-only]
"""
import gzip
import hashlib
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parent if TOOLS.name == "tools" else TOOLS
DATA = ROOT / "data"
MEDIA = ROOT / "media"
CDN = "https://media.formula1.com"
FALLBACK_MD5 = "f0323c28e194d31af6a32b06769bfbed"   # F1's own silhouette

NEW_ONLY = "--new-only" in sys.argv


def fold(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()


def slugify(s):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", fold(s).lower())).strip("-")


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def harvest():
    """(driver full names, team names) across every archived weekend."""
    drivers, teams = set(), set()
    for f in sorted(DATA.glob("*/*/R.core.json.gz")) + sorted(DATA.glob("*/*/Q.core.json.gz")):
        try:
            d = json.loads(gzip.decompress(f.read_bytes()))
        except Exception:
            continue
        for dr in d.get("drivers", []):
            if dr.get("name"):
                drivers.add(dr["name"].strip())
            if dr.get("team"):
                teams.add(dr["team"].strip())
    return drivers, teams


def driver_candidates(name):
    """Plausible CDN ids for a driver name, most likely first."""
    toks = fold(name).split()
    if len(toks) < 2:
        return
    first = toks[0]
    lasts = [" ".join(toks[1:]), toks[-1]]
    if len(toks) >= 3:
        lasts.append(toks[1])                       # e.g. Andrea Kimi Antonelli
    seen = set()
    for last in lasts:
        base = (first[:3] + re.sub(r"[^A-Za-z]", "", last)[:3]).upper()
        for suffix in ("01", "02"):
            key = base + suffix
            if key in seen:
                continue
            seen.add(key)
            path_name = urllib.parse.quote("_".join([first.capitalize()] + name.split()[1:]))
            yield (f"{CDN}/d_driver_fallback_image.png/content/dam/fom-website/drivers/"
                   f"{base[0]}/{key}_{urllib.parse.quote(name.replace(' ', '_'))}/{key.lower()}"
                   f".png.transform/2col/image.png")


def fetch_driver(name):
    out = MEDIA / "drivers" / f"{slugify(name)}.png"
    if out.exists():
        return "have"
    for url in driver_candidates(name):
        try:
            blob = get(url)
        except Exception:
            continue
        if blob[:4] != b"\x89PNG":
            continue
        if hashlib.md5(blob).hexdigest() == FALLBACK_MD5 or len(blob) < 1500:
            continue
        # 2col fallback has a different hash; also compare against 1col fallback via size heuristic
        out.write_bytes(blob)
        return "new"
    return "miss"


# current-season teams: the 2026 CDN scheme has a full-colour "logo" and a
# "logowhite" silhouette — vendor both so the app can theme-switch. cdn-id keyed.
CURRENT_TEAM_CDN = {
    "mclaren": "mclaren", "ferrari": "ferrari", "mercedes": "mercedes",
    "red-bull-racing": "redbullracing", "racing-bulls": "racingbulls",
    "alpine": "alpine", "aston-martin": "astonmartin", "williams": "williams",
    "haas-f1-team": "haasf1team", "audi": "audi", "cadillac": "cadillac",
}
IMG_CDN = "https://media.formula1.com/image/upload/c_lfill,h_120/q_auto/v1740000001/common/f1/2026"


def _save_webp(blob, dest):
    try:
        from PIL import Image
        import io
        im = Image.open(io.BytesIO(blob)).convert("RGBA")
        if im.size[0] < 30:
            return False
        im.save(dest)
        return True
    except Exception:
        return False


def fetch_team(team):
    slug = slugify(team)
    out = MEDIA / "teams" / f"{slug}.png"
    if out.exists():
        return "have"
    cdn = CURRENT_TEAM_CDN.get(slug)
    if cdn:                                   # current team: colour + white
        ok = False
        for variant, dest in (("logo", f"{slug}.png"), ("logowhite", f"{slug}-white.png")):
            try:
                blob = get(f"{IMG_CDN}/{cdn}/2026{cdn}{variant}.webp")
            except Exception:
                continue
            if _save_webp(blob, MEDIA / "teams" / dest):
                ok = ok or variant == "logo"
        if ok:
            return "new"
    for year in range(2026, 2018, -1):        # historic: single colour logo
        try:
            blob = get(f"{CDN}/content/dam/fom-website/teams/{year}/{slug}-logo.png")
        except Exception:
            continue
        if blob[:4] == b"\x89PNG" and len(blob) > 300:
            out.write_bytes(blob)
            return "new"
    return "miss"


def main():
    (MEDIA / "drivers").mkdir(parents=True, exist_ok=True)
    (MEDIA / "teams").mkdir(parents=True, exist_ok=True)
    drivers, teams = harvest()
    print(f"harvested {len(drivers)} drivers, {len(teams)} teams from the archive")
    stats = {"new": 0, "have": 0, "miss": 0}
    misses = []
    for name in sorted(drivers):
        r = fetch_driver(name)
        stats[r] += 1
        if r == "miss":
            misses.append(name)
        if r == "new":
            time.sleep(0.15)
    tstats = {"new": 0, "have": 0, "miss": 0}
    tmiss = []
    for team in sorted(teams):
        r = fetch_team(team)
        tstats[r] += 1
        if r == "miss":
            tmiss.append(team)
        if r == "new":
            time.sleep(0.15)
    manifest = {
        "drivers": sorted(p.stem for p in (MEDIA / "drivers").glob("*.png")),
        "teams": sorted(p.stem for p in (MEDIA / "teams").glob("*.png") if not p.stem.endswith("-white")),
        "teamsWhite": sorted(p.stem[:-6] for p in (MEDIA / "teams").glob("*-white.png")),
    }
    (MEDIA / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")))
    print(f"drivers: {stats} · teams: {tstats}")
    if misses:
        print("driver misses (helmet fallback):", ", ".join(misses[:20]) + (" …" if len(misses) > 20 else ""))
    if tmiss:
        print("team misses (colour-dot fallback):", ", ".join(tmiss))
    total = sum(f.stat().st_size for f in MEDIA.rglob("*.png"))
    print(f"media total: {total / 1e6:.1f} MB, {len(manifest['drivers'])} faces, {len(manifest['teams'])} logos")


if __name__ == "__main__":
    main()
