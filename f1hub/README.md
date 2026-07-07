# F1 Analysis Hub

A self-contained race-weekend analysis tool built on [FastF1](https://docs.fastf1.dev/) data.
One Python pipeline pulls every session of a Grand Prix weekend; one build step bakes it into a
single HTML file with no dependencies and no server — open it in a browser and everything runs
locally, including full per-lap telemetry.

Think "GP Tempo, plus the analysis layer": the raw detail is all browsable, but degradation fits,
long-run detection, gap ladders, strategy timelines and mini-sector dominance are computed for you.

## What's in the hub

| Tab | Session(s) | What you get |
|---|---|---|
| **Overview** | any | Classification, headline stats (winner, margin, fastest lap, movers, SC/VSC laps, retirements), filterable race-control feed |
| **Pace** | any | Interactive lap chart (team/compound colouring, fuel-correction slider, SC/VSC shading, outlier filter), box-plot pace distribution, click any lap to send it to Telemetry |
| **Tyres & Deg** | R / Sprint / FP | Strategy timeline with pit-lane times, per-team degradation fits per compound (stint-baseline normalised, fuel-corrected, traffic-filtered), full stint explorer |
| **Long Runs** | FP | Auto-detected race sims (5+ clean laps), run comparison chart with trend fits, run ranking table |
| **Qualifying** | Q / SQ | Gap ladder per segment with elimination line, best-sector + ideal-lap analysis, track evolution scatter, speed traps |
| **Race** | R / Sprint | Race trace vs winner's clean-lap median, position chart, pit-stop table vs field median, lap-1 gains/losses |
| **Telemetry** | any | Up to 6 laps side by side (cross-session works): Δ-time, speed, throttle, brake, gear, RPM traces on a shared distance axis, corner markers, drag-zoom, crosshair readout, track map with mini-sector dominance colouring and live position dots |
| **Weather** | any | Air/track temp, wind, humidity, pressure, rainfall shading |

Extras: laps deleted for track limits are flagged, personal bests are ringed, second cars of a team
are dashed, dark/light theme both supported, compare basket survives reloads (localStorage).

## Usage

```bash
pip install fastf1 numpy pandas

# 1. pull a weekend (year, round) — takes a few minutes on first run, cached afterwards
python3 extract.py 2026 9 weekend_2026_9.json

# 2. bake the app (accepts .json or .json.gz)
python3 build.py weekend_2026_9.json f1-analysis-hub.html

# 3. open f1-analysis-hub.html
```

Works for any season/round FastF1 supports (2018+). Sprint weekends automatically get
FP1 / Sprint Quali / Sprint / Quali / Race pickers; conventional weekends get FP1-3 / Q / R.
For pre-2026 seasons the DRS trace panel appears automatically (2026 cars no longer report DRS).

`f1-analysis-hub.html` in this directory is a pre-built copy for the **2026 British Grand Prix**
(data in `weekend_2026_9.json.gz`).

## How the numbers are made

- **Telemetry** is resampled to 280 points per lap on a uniform relative-distance grid and
  time-normalised so each lap ends exactly on its official lap time — deltas are honest at the line.
- **Fuel correction** subtracts `k × laps of fuel remaining` (slider, default 0.06 s/lap).
- **Degradation** fits are least-squares on tyre life vs fuel-corrected time per stint, first lap of
  stint dropped, >1.2 s residual outliers removed, then pooled per team with each stint's own
  baseline subtracted so different fuel loads align. Only green-flag, non-in/out, accurate laps count.
- **Long runs** are stints of 5+ representative laps (cool-down/traffic laps above 103.5 % of the
  stint median are stripped; runs slower than 112 % of the best run's median are discarded as
  aero-rake/constant-speed running). Fuel loads in practice are unknown — trends are real, absolute
  gaps indicative.
- **Mini-sector dominance** splits the lap into 27 equal segments and takes the fastest of the
  compared laps in each from the resampled time channel.
- **Pit-lane time** is pit entry to pit exit (stationary time is not public data).

## Files

- `extract.py` — FastF1 → compact JSON bundle (laps, telemetry, results, weather, RC messages, track map + corners)
- `build.py` — injects the gzipped bundle + `src/` into `template.html` → single HTML file
- `template.html`, `src/` — the app (vanilla JS + SVG, no external dependencies)

Unofficial analysis tool for personal use; not associated with Formula 1.
