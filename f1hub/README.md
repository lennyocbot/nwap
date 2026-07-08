# Minisector — F1 Analysis Hub

A self-updating race-weekend analysis site built on [FastF1](https://docs.fastf1.dev/) data.
Pick **any season (2018+), any weekend, any session** and get the full analysis — pace, tyre
degradation, long runs, qualifying, strategy and side-by-side lap telemetry — in the browser,
no server-side compute. A GitHub Action extracts each new session automatically ~1–3 hours
after F1 publishes the data, so new Grands Prix appear on their own.

Think "GP Tempo, plus the analysis layer": all the raw detail is browsable, but degradation
fits, long-run detection, gap ladders, strategy timelines and mini-sector dominance are
computed for you.

**→ [SETUP.md](SETUP.md) for free hosting with your own domain (GitHub Pages + Actions).**

## What's in the hub

| Tab | Session(s) | What you get |
|---|---|---|
| **Overview** | any | Classification, headline stats (winner, margin, fastest lap, movers, SC/VSC laps, retirements), filterable race-control feed |
| **Pace** | any | Interactive lap chart (team/compound colouring, fuel-correction slider, SC/VSC shading, outlier filter), box-plot pace distribution, click any lap to send it to Telemetry |
| **Tyres & Deg** | R / Sprint / FP | Strategy timeline with pit-lane times, per-team degradation fits per compound (stint-baseline normalised, fuel-corrected, traffic-filtered), full stint explorer |
| **Long Runs** | FP | Auto-detected race sims (5+ clean laps), run comparison chart with trend fits, run ranking table |
| **Qualifying** | Q / SQ | Gap ladder per segment with elimination line, best-sector + ideal-lap analysis, track evolution scatter, speed traps |
| **Race** | R / Sprint | Race trace vs winner's clean-lap median, position chart, pit-stop table vs field median, lap-1 gains/losses |
| **Straights** | any | Auto-detected straights on a labelled track diagram, end-of-straight top speeds per driver, clipping ranking per straight (km/h given back flat-out, superclipping ‡ markers), corner minimum speeds by class |
| **Telemetry** | any | Up to 6 laps side by side (cross-session works): Δ-time, speed, throttle, brake, gear, RPM traces on a shared distance axis, corner markers, drag-zoom, crosshair readout, track map with mini-sector dominance colouring and live position dots |
| **Weather** | any | Air/track temp, wind, humidity, pressure, rainfall shading |

Extras: deleted laps flagged, personal bests ringed, second cars dashed, dark/light themes,
weekend deep links (`#2026/9`), compare basket persists per weekend.

## Repository layout (when deployed — see SETUP.md)

```
index.html                       the app (site mode; fetches data at runtime)
manifest.json                    index of available weekends   } written by
data/<year>/<round>-<slug>/      one .json.gz per session      } update_data.py
tools/
  extract.py                     FastF1 -> compact session JSON
  update_data.py                 cron/backfill driver + manifest builder
  build.py                       assembles the app (--site or embedded single-file)
  template.html, src/            vanilla JS + SVG app source, no dependencies
.github/workflows/f1-data.yml    the auto-updater (from workflows/f1-data.yml)
```

## Usage

```bash
pip install fastf1 numpy pandas

# grab a weekend (every session that has been published)
python3 update_data.py --year 2026 --round 9

# backfill a season / pick up recent sessions (what the cron runs)
python3 update_data.py --year 2024 --all
python3 update_data.py

# build the site app, then serve the folder
python3 build.py --site index.html
python3 -m http.server            # -> http://localhost:8000

# or bake one weekend into a single portable HTML file
python3 extract.py 2026 9 weekend.json && python3 build.py weekend.json hub.html
```

Sprint weekends automatically get FP1 / Sprint Quali / Sprint / Quali / Race; conventional
weekends FP1–3 / Q / R. Pre-2026 seasons get the DRS trace panel (2026 cars don't report DRS).

## How the numbers are made

- **Telemetry** is resampled to 280 points per lap on a uniform relative-distance grid and
  time-normalised so each lap ends exactly on its official lap time — deltas are honest at the line.
- **Fuel correction** subtracts `k × laps of fuel remaining` (slider, default 0.06 s/lap).
- **Degradation** fits are least-squares on tyre life vs fuel-corrected time per stint, first lap
  of stint dropped, >1.2 s residual outliers removed, then pooled per team with each stint's own
  baseline subtracted so different fuel loads align. Only green-flag, non-in/out, accurate laps count.
- **Long runs** are stints of 5+ representative laps (cool-down/traffic laps above 103.5 % of the
  stint median stripped; runs slower than 112 % of the best run's median discarded as aero-rake /
  constant-speed running). Practice fuel loads are unknown — trends are real, absolute gaps indicative.
- **Mini-sector dominance** splits the lap into 27 equal segments and takes the fastest of the
  compared laps in each from the resampled time channel.
- **Pit-lane time** is pit entry to pit exit (stationary time is not public data).

Unofficial analysis tool for personal use; not associated with Formula 1.
