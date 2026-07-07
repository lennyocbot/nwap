/* ============ views C: qualifying, race ============ */
"use strict";

function viewQuali(root) {
  const qids = HUB.data.sessions.filter(s => s.id === "Q" || s.id === "SQ").map(s => s.id);
  if (!qids.length) { root.innerHTML = `<div class="empty">No qualifying session.</div>`; return; }
  const sid = qids.includes(HUB.S.sid) ? HUB.S.sid : "Q";
  const s = HUB.session(sid), pfx = sid === "SQ" ? "SQ" : "Q";
  if (sid !== HUB.S.sid) root.insertAdjacentHTML("beforeend", `<p class="note">Showing <b>${SNAMES[sid]}</b> — switch the session picker to ${qids.filter(q => q !== sid).map(q => SNAMES[q]).join("/") || "…"} for the other one.</p>`);

  const seg = HUB.S.qseg;
  const c = card(root, "Gap ladder");
  const segEl = document.createElement("div"); segEl.className = "seg mini";
  [1, 2, 3].forEach(i => {
    const b = document.createElement("button"); b.textContent = pfx + i;
    if (i === seg) b.classList.add("on");
    b.addEventListener("click", () => { HUB.S.qseg = i; HUB.render(); });
    segEl.appendChild(b);
  });
  c.querySelector(".right").appendChild(segEl);

  // best lap per driver in segment (laps table; fall back to results q1/q2/q3)
  const rows = [];
  for (const d of s.drivers) {
    const laps = s.laps.filter(l => l.drv === d.abbr && l.q === seg && l.t != null && !l.del);
    const best = laps.length ? laps.reduce((a, b) => a.t < b.t ? a : b) : null;
    const t = best ? best.t : d["q" + seg];
    if (t != null) rows.push({ d, t, best });
  }
  rows.sort((a, b) => a.t - b.t);
  if (!rows.length) { c.insertAdjacentHTML("beforeend", `<div class="empty">No laps in this segment.</div>`); }
  else {
    const p1 = rows[0].t;
    const div = document.createElement("div"); div.className = "chart"; c.appendChild(div);
    const gmax = Math.max(...rows.map(r => r.t - p1), 800);
    const rh = 23, H = rows.length * rh + 40;
    const ch = Chart(div, { h: H, xd: [0, gmax * 1.15], yd: [0, 1], ml: 96, mb: 26, yticksArr: [], xfmt: v => "+" + (v / 1000).toFixed(2), xlab: "gap (s)", label: "Qualifying gap ladder" });
    const bars = [];
    rows.forEach((r, i) => {
      const cy = ch.mt + i * (ch.ih / rows.length) + (ch.ih / rows.length) / 2, col = teamCol(r.d.color);
      svgEl("text", { x: ch.ml - 8, y: cy + 3.5, "text-anchor": "end", "font-size": 11, "font-weight": 700, fill: col, class: "num" }, ch.svg).textContent = `${i + 1}. ${r.d.abbr}`;
      const w = Math.max(2, ch.x(r.t - p1) - ch.x(0));
      const bar = svgEl("rect", { x: ch.x(0), y: cy - 7.5, width: w, height: 15, rx: 3, fill: col, opacity: i === 0 ? 1 : .75 }, ch.plot);
      svgEl("text", { x: ch.x(0) + w + 6, y: cy + 3.5, "font-size": 10.5, fill: "var(--ink2)", class: "num" }, ch.plot).textContent = i === 0 ? fmtLap(r.t) : "+" + ((r.t - p1) / 1000).toFixed(3);
      bars.push(bar);
      const cutN = pfx === "Q" || pfx === "SQ" ? (seg === 1 ? 15 : seg === 2 ? 10 : null) : null;
      if (cutN && i === cutN - 1 && rows.length > cutN)
        svgEl("line", { x1: ch.ml, x2: ch.ml + ch.iw, y1: cy + (ch.ih / rows.length) / 2, y2: cy + (ch.ih / rows.length) / 2, stroke: "var(--red)", "stroke-width": 1, "stroke-dasharray": "5 4" }, ch.plot);
    });
    hoverMarks(bars, i => {
      const r = rows[i];
      return `<div class="t-title">${r.d.abbr} — ${esc(r.d.team)}</div><b class="num">${fmtLap(r.t)}</b>${r.best ? ` · lap ${r.best.lap} · ${esc(r.best.cmp || "")}` : ""}${i > 0 ? `<br>+${((r.t - p1) / 1000).toFixed(3)}s to ${rows[0].d.abbr}` : ""}`;
    });
  }

  /* ---- sectors ---- */
  const c2 = card(root, "Sector analysis", `${pfx}${seg} · best individual sectors · purple = best overall`);
  const secRows = [];
  for (const d of s.drivers) {
    const laps = s.laps.filter(l => l.drv === d.abbr && l.q === seg && !l.del);
    const b1 = Math.min(...laps.map(l => l.s1 ?? 1e12)), b2 = Math.min(...laps.map(l => l.s2 ?? 1e12)), b3 = Math.min(...laps.map(l => l.s3 ?? 1e12));
    const bl = laps.filter(l => l.t != null);
    const best = bl.length ? Math.min(...bl.map(l => l.t)) : null;
    if (b1 < 1e11 && b2 < 1e11 && b3 < 1e11) secRows.push({ d, b1, b2, b3, ideal: b1 + b2 + b3, best });
  }
  if (secRows.length) {
    const m1 = Math.min(...secRows.map(r => r.b1)), m2 = Math.min(...secRows.map(r => r.b2)), m3 = Math.min(...secRows.map(r => r.b3));
    secRows.sort((a, b) => a.ideal - b.ideal);
    const w2 = document.createElement("div"); w2.className = "tblwrap"; c2.appendChild(w2);
    w2.innerHTML = `<table class="t"><thead><tr><th>Driver</th><th class="r">Best S1</th><th class="r">Best S2</th><th class="r">Best S3</th><th class="r">Ideal lap</th><th class="r">Actual best</th><th class="r">Left on table</th></tr></thead><tbody>` +
      secRows.map(r => `<tr><td>${drvCell(r.d)}</td>
        <td class="r num ${r.b1 === m1 ? "best" : ""}">${fmtSec(r.b1)}</td>
        <td class="r num ${r.b2 === m2 ? "best" : ""}">${fmtSec(r.b2)}</td>
        <td class="r num ${r.b3 === m3 ? "best" : ""}">${fmtSec(r.b3)}</td>
        <td class="r num">${fmtLap(r.ideal)}</td><td class="r num">${fmtLap(r.best)}</td>
        <td class="r num" style="color:${r.best && r.best - r.ideal > 150 ? "var(--yellow)" : "var(--ink3)"}">${r.best ? fmtDelta(r.best - r.ideal) : "—"}</td></tr>`).join("") + "</tbody></table>";
    const theo = secRows[0];
    insights(root, [
      `Theoretical best lap: <b>${theo.d.abbr}</b> ${fmtLap(theo.ideal)} (S1 ${fmtSec(theo.b1)} · S2 ${fmtSec(theo.b2)} · S3 ${fmtSec(theo.b3)})`,
      (() => { const r = [...secRows].filter(r => r.best).sort((a, b) => (b.best - b.ideal) - (a.best - a.ideal))[0]; return r && r.best - r.ideal > 100 ? `Most time left on the table: <b>${r.d.abbr}</b> ${fmtDelta(r.best - r.ideal)}s vs his ideal lap` : ""; })(),
    ].filter(Boolean));
  }

  /* ---- track evolution ---- */
  const c3 = card(root, "Track evolution", "every timed lap vs session clock — watch the track ramp up");
  const evo = s.laps.filter(l => l.t != null && !l.del && !l.in && !l.out);
  if (evo.length > 5) {
    const div3 = document.createElement("div"); div3.className = "chart"; c3.appendChild(div3);
    const t0 = Math.min(...evo.map(l => l.st)), t1 = Math.max(...evo.map(l => l.st));
    const vmin = Math.min(...evo.map(l => l.t));
    const ch3 = Chart(div3, {
      h: 300, xd: [(0), (t1 - t0) / 60000 + 2], yd: [vmin - 300, quantile(evo.map(l => l.t), 0.9) + 600],
      xfmt: v => Math.round(v) + "m", yfmt: v => fmtLap(Math.round(v)), xlab: "session time", ylab: "lap time", label: "Track evolution"
    });
    const segCol = { 1: "var(--ink3)", 2: "var(--yellow)", 3: "var(--purple)" };
    const nodes = [], data = [];
    let bests = [];
    let bmin = 1e12;
    for (const l of [...evo].sort((a, b) => a.st - b.st)) {
      if (l.t < bmin) { bmin = l.t; bests.push([(l.st - t0) / 60000, l.t]); }
    }
    for (const l of evo) {
      const n = svgEl("circle", { cx: ch3.x((l.st - t0) / 60000), cy: ch3.y(l.t), r: 3, fill: segCol[l.q] || "var(--ink3)", opacity: .65 }, ch3.plot);
      nodes.push(n); data.push(l);
    }
    bests.push([(t1 - t0) / 60000 + 2, bmin]);
    svgEl("path", { d: stepPath(bests, ch3.x, ch3.y), fill: "none", stroke: "var(--green)", "stroke-width": 1.6, "stroke-dasharray": "2 3" }, ch3.plot);
    hoverMarks(nodes, i => {
      const l = data[i];
      return `<div class="t-title">${l.drv} — ${pfx}${l.q || "?"} lap ${l.lap}</div><b class="num">${fmtLap(l.t)}</b> · ${esc(l.cmp || "")} ${l.life ? "(" + l.life + " laps)" : ""}`;
    });
    legend(div3, [{ color: "var(--ink3)", label: pfx + "1", dot: true }, { color: "var(--yellow)", label: pfx + "2", dot: true }, { color: "var(--purple)", label: pfx + "3", dot: true }, { color: "var(--green)", label: "session best so far" }]);
  }

  /* ---- speed traps ---- */
  const c4 = card(root, "Speed traps", "session maximums per driver");
  const sp = [];
  for (const d of s.drivers) {
    const laps = s.laps.filter(l => l.drv === d.abbr);
    const mx = k => { const v = laps.map(l => l[k]).filter(v => v != null); return v.length ? Math.max(...v) : null; };
    const r = { d, i1: mx("spI1"), i2: mx("spI2"), fl: mx("spFL"), st: mx("spST") };
    if (r.st != null || r.fl != null) sp.push(r);
  }
  sp.sort((a, b) => (b.st ?? 0) - (a.st ?? 0));
  if (sp.length) {
    const bmax = { i1: Math.max(...sp.map(r => r.i1 ?? 0)), i2: Math.max(...sp.map(r => r.i2 ?? 0)), fl: Math.max(...sp.map(r => r.fl ?? 0)), st: Math.max(...sp.map(r => r.st ?? 0)) };
    const w4 = document.createElement("div"); w4.className = "tblwrap"; c4.appendChild(w4);
    const stmin = Math.min(...sp.map(r => r.st ?? 999));
    w4.innerHTML = `<table class="t"><thead><tr><th>Driver</th><th class="r">Speed trap</th><th></th><th class="r">Intermediate 1</th><th class="r">Intermediate 2</th><th class="r">Finish line</th></tr></thead><tbody>` +
      sp.map(r => `<tr><td>${drvCell(r.d)}</td>
        <td class="r num ${r.st === bmax.st ? "best" : ""}">${r.st ?? "—"} km/h</td>
        <td style="min-width:110px"><div style="height:5px;border-radius:3px;background:var(--surface3);overflow:hidden"><div style="height:100%;width:${r.st ? ((r.st - stmin + 3) / (bmax.st - stmin + 3) * 100).toFixed(0) : 0}%;background:${teamCol(r.d.color)}"></div></div></td>
        <td class="r num ${r.i1 === bmax.i1 ? "best" : ""}">${r.i1 ?? "—"}</td>
        <td class="r num ${r.i2 === bmax.i2 ? "best" : ""}">${r.i2 ?? "—"}</td>
        <td class="r num ${r.fl === bmax.fl ? "best" : ""}">${r.fl ?? "—"}</td></tr>`).join("") + "</tbody></table>";
  }
}

/* ---------- RACE ---------- */
function viewRace(root) {
  const rids = HUB.data.sessions.filter(s => s.id === "R" || s.id === "S").map(s => s.id);
  if (!rids.length) { root.innerHTML = `<div class="empty">No race session.</div>`; return; }
  const sid = rids.includes(HUB.S.sid) ? HUB.S.sid : "R";
  const s = HUB.session(sid);
  if (sid !== HUB.S.sid) root.insertAdjacentHTML("beforeend", `<p class="note">Showing <b>${SNAMES[sid]}</b> — use the session picker for the ${rids.filter(r => r !== sid).map(r => SNAMES[r]).join("/")}.</p>`);
  driverRail(root);
  const drvs = selDrivers();
  const total = s.totalLaps || Math.max(...s.laps.map(l => l.lap));

  // end-of-lap session time per driver
  const endOf = {}; // drv -> Map(lap -> sessionTime ms)
  let raceStart = Infinity;
  for (const d of s.drivers) {
    const m = new Map();
    for (const l of s.laps.filter(l => l.drv === d.abbr)) {
      if (l.st != null && l.t != null) m.set(l.lap, l.st + l.t);
      if (l.lap === 1 && l.st != null) raceStart = Math.min(raceStart, l.st);
    }
    endOf[d.abbr] = m;
  }
  const leaderAt = new Map();
  for (let lap = 1; lap <= total; lap++) {
    let best = null;
    for (const d of s.drivers) { const e = endOf[d.abbr].get(lap); if (e != null && (best == null || e < best)) best = e; }
    if (best != null) leaderAt.set(lap, best);
  }
  const winner = s.drivers.find(d => d.pos === 1);
  // reference = winner's clean-lap median, so green-flag running plots flat and
  // SC/VSC phases read as shared dips instead of a session-long upward drift
  const wClean = winner ? s.laps.filter(l => l.drv === winner.abbr && isClean(l)).map(l => l.t) : [];
  const wEnd = winner && [...endOf[winner.abbr].values()].sort((a, b) => b - a)[0];
  const wLaps = winner && Math.max(...[...endOf[winner.abbr].keys()]);
  const refAvg = wClean.length >= 5 ? median(wClean)
    : (winner && wEnd != null ? (wEnd - raceStart) / wLaps : 95000);

  // SC bands helper
  const worst = {};
  for (const l of s.laps) { const f = tsFlags(l.ts); const w = f.red ? 3 : f.sc ? 2 : f.vsc ? 1 : 0; worst[l.lap] = Math.max(worst[l.lap] || 0, w); }
  const drawBands = ch => {
    for (const lap in worst) {
      if (!worst[lap]) continue;
      const fill = worst[lap] === 3 ? "var(--band-red)" : worst[lap] === 2 ? "var(--band-sc)" : "var(--band-vsc)";
      svgEl("rect", { x: ch.x(lap - 1), y: ch.mt, width: ch.x(+lap) - ch.x(lap - 1), height: ch.ih, fill }, ch.plot);
    }
  };

  /* ---- race trace ---- */
  const c1 = card(root, "Race trace", `gap to a constant ${fmtLap(Math.round(refAvg))} reference (winner's clean-lap median) — flat = reference pace, pit stops and SC are the drops`);
  if (drvs.length) {
    const div = document.createElement("div"); div.className = "chart"; c1.appendChild(div);
    const series = drvs.map(d => {
      const pts = [[0, 0]];
      for (let lap = 1; lap <= total; lap++) {
        const e = endOf[d.abbr].get(lap);
        pts.push(e == null ? null : [lap, (refAvg * lap - (e - raceStart)) / 1000]);
      }
      return { d, pts };
    });
    const ys = series.flatMap(sr => sr.pts.filter(Boolean).map(p => p[1]));
    const ch = Chart(div, { h: 420, mr: 46, xd: [0, total], yd: [quantile(ys, 0.01) - 4, Math.max(...ys) + 4], xlab: "lap", ylab: "gap to reference (s)", yfmt: v => v.toFixed(0), label: "Race trace" });
    drawBands(ch);
    const nodes = [], data = [];
    for (const sr of series) {
      const col = teamCol(sr.d.color);
      const p = svgEl("path", { d: linePath(sr.pts, ch.x, v => ch.y(v)), fill: "none", stroke: col, "stroke-width": 1.7, opacity: .9 }, ch.plot);
      if (drvDash(sr.d.abbr)) p.setAttribute("stroke-dasharray", "6 3");
      // pit markers
      for (const l of s.laps.filter(l => l.drv === sr.d.abbr && l.in)) {
        const pt = sr.pts[l.lap];
        if (pt) { const n = svgEl("circle", { cx: ch.x(pt[0]), cy: ch.y(pt[1]), r: 3.6, fill: "var(--surface)", stroke: col, "stroke-width": 2 }, ch.plot); nodes.push(n); data.push({ d: sr.d, l }); }
      }
    }
    const endL = series.map(sr => {
      const last = sr.pts.filter(Boolean).at(-1);
      return last ? { y: ch.y(last[1]) + 3.5, x: ch.x(last[0]) + 5, txt: sr.d.abbr, col: teamCol(sr.d.color) } : null;
    }).filter(Boolean);
    spreadLabels(endL, 11, ch.mt + 6, ch.mt + ch.ih);
    for (const L of endL)
      svgEl("text", { x: Math.min(L.x, ch.ml + ch.iw + 4), y: L.y, "font-size": 10, "font-weight": 700, fill: L.col, class: "num" }, ch.svg).textContent = L.txt;
    hoverMarks(nodes, i => {
      const { d, l } = data[i];
      const nx = s.laps.find(n => n.drv === d.abbr && n.lap === l.lap + 1 && n.pitOut != null);
      const dur = nx && l.pitIn != null ? nx.pitOut - l.pitIn : null;
      return `<div class="t-title">${d.abbr} — pit stop, lap ${l.lap}</div>pit lane: <b class="num">${dur ? fmtSec(dur, 1) + "s" : "?"}</b> · from ${esc(l.cmp || "?")}`;
    });
    // crosshair with gap readout
    raceCross(ch, div, series, s);
    legend(div, [{ color: "var(--band-sc)", label: "SC", dot: true }, { color: "var(--band-vsc)", label: "VSC", dot: true }, { color: "var(--ink2)", label: "○ pit stop", dot: true }]);
  } else c1.insertAdjacentHTML("beforeend", `<div class="empty">Select drivers above.</div>`);

  /* ---- position chart ---- */
  const c2 = card(root, "Position changes");
  if (drvs.length) {
    const div2 = document.createElement("div"); div2.className = "chart"; c2.appendChild(div2);
    const N = s.drivers.filter(d => d.pos).length;
    const ch2 = Chart(div2, { h: Math.max(320, N * 19), xd: [0, total], yd: [0.5, N + 0.5], yflip: true, ml: 64, mr: 64, yticksArr: [], xlab: "lap", label: "Position chart" });
    drawBands(ch2);
    const leftL = [], rightL = [];
    for (const d of drvs) {
      const col = teamCol(d.color);
      const pts = [];
      if (d.grid) pts.push([0, d.grid]);
      for (let lap = 1; lap <= total; lap++) {
        const l = s.laps.find(l => l.drv === d.abbr && l.lap === lap);
        pts.push(l && l.pos ? [lap, l.pos] : null);
      }
      const p = svgEl("path", { d: stepPath(pts, ch2.x, ch2.y), fill: "none", stroke: col, "stroke-width": 2 }, ch2.plot);
      if (drvDash(d.abbr)) p.setAttribute("stroke-dasharray", "6 3");
      const first = pts.find(Boolean), last = pts.filter(Boolean).at(-1);
      if (first) leftL.push({ y: ch2.y(first[1]) + 3.5, txt: `${first[1]}. ${d.abbr}`, col });
      if (last) rightL.push({ y: ch2.y(last[1]) + 3.5, txt: `${d.abbr} ${last[1]}.`, col });
    }
    spreadLabels(leftL, 11, ch2.mt + 4, ch2.mt + ch2.ih);
    spreadLabels(rightL, 11, ch2.mt + 4, ch2.mt + ch2.ih);
    for (const L of leftL) svgEl("text", { x: ch2.ml - 8, y: L.y, "text-anchor": "end", "font-size": 10, "font-weight": 700, fill: L.col, class: "num" }, ch2.svg).textContent = L.txt;
    for (const L of rightL) svgEl("text", { x: ch2.ml + ch2.iw + 6, y: L.y, "font-size": 10, "font-weight": 700, fill: L.col, class: "num" }, ch2.svg).textContent = L.txt;
  }

  const g = document.createElement("div"); g.className = "grid2"; root.appendChild(g);

  /* ---- pit stops ---- */
  const c3 = card(g, "Pit stops", "pit-lane time = pit entry to pit exit (not stationary time)");
  const stops = [];
  for (const l of s.laps.filter(l => l.in)) {
    const nx = s.laps.find(n => n.drv === l.drv && n.lap === l.lap + 1);
    const dur = nx && nx.pitOut != null && l.pitIn != null ? nx.pitOut - l.pitIn : null;
    const d = HUB.driver(l.drv, sid);
    if (d) stops.push({ d, l, dur, to: nx && nx.cmp, from: l.cmp });
  }
  stops.sort((a, b) => (a.dur ?? 9e9) - (b.dur ?? 9e9));
  const medStop = median(stops.map(st => st.dur).filter(Boolean));
  const w3 = document.createElement("div"); w3.className = "tblwrap"; w3.style.maxHeight = "400px"; w3.style.overflowY = "auto"; c3.appendChild(w3);
  w3.innerHTML = `<table class="t"><thead><tr><th>Driver</th><th class="r">Lap</th><th>Change</th><th class="r">Pit lane</th><th class="r">vs median</th></tr></thead><tbody>` +
    stops.map((st, i) => `<tr><td>${drvCell(st.d)}</td><td class="r num">${st.l.lap}</td>
      <td>${st.from ? cmpDot(st.from) : "?"} → ${st.to ? cmpDot(st.to) : "?"}</td>
      <td class="r num ${i === 0 ? "best" : ""}">${st.dur ? fmtSec(st.dur, 1) + "s" : "—"}</td>
      <td class="r num" style="color:${st.dur && medStop && st.dur - medStop > 1500 ? "var(--red)" : "var(--ink3)"}">${st.dur && medStop ? fmtDelta(st.dur - medStop, 1) : ""}</td></tr>`).join("") + "</tbody></table>";
  if (medStop) c3.insertAdjacentHTML("beforeend", `<p class="note">Median pit-lane time: <b class="num">${fmtSec(medStop, 1)}s</b> · ${stops.length} stops</p>`);

  /* ---- start analysis ---- */
  const c4 = card(g, "Lap 1", "positions gained and lost from the grid");
  const l1 = s.drivers.filter(d => d.grid).map(d => {
    const l = s.laps.find(l => l.drv === d.abbr && l.lap === 1);
    return l && l.pos ? { d, delta: d.grid - l.pos, p1: l.pos } : null;
  }).filter(Boolean).sort((a, b) => b.delta - a.delta);
  if (l1.length) {
    const div4 = document.createElement("div"); div4.className = "chart"; c4.appendChild(div4);
    const mx = Math.max(...l1.map(r => Math.abs(r.delta)), 2);
    const rh = 19, H = l1.length * rh + 36;
    const ch4 = Chart(div4, { h: H, xd: [-mx - 0.5, mx + 0.5], yd: [0, 1], ml: 66, mb: 24, yticksArr: [], xfmt: v => (v > 0 ? "+" : "") + v, label: "Lap one gains" });
    const bars = [];
    l1.forEach((r, i) => {
      const cy = ch4.mt + i * (ch4.ih / l1.length) + (ch4.ih / l1.length) / 2, col = teamCol(r.d.color);
      svgEl("text", { x: ch4.ml - 8, y: cy + 3, "text-anchor": "end", "font-size": 10.5, "font-weight": 700, fill: col, class: "num" }, ch4.svg).textContent = r.d.abbr;
      const x0 = ch4.x(0), x1 = ch4.x(r.delta);
      const bar = svgEl("rect", { x: Math.min(x0, x1), y: cy - 6, width: Math.max(2, Math.abs(x1 - x0)), height: 12, rx: 3, fill: r.delta >= 0 ? "var(--green)" : "var(--red)", opacity: .8 }, ch4.plot);
      svgEl("text", { x: r.delta >= 0 ? x1 + 5 : x1 - 5, y: cy + 3, "text-anchor": r.delta >= 0 ? "start" : "end", "font-size": 10, fill: "var(--ink2)", class: "num" }, ch4.plot).textContent = (r.delta > 0 ? "+" : "") + r.delta;
      bars.push(bar);
    });
    svgEl("line", { x1: ch4.x(0), x2: ch4.x(0), y1: ch4.mt, y2: ch4.mt + ch4.ih, stroke: "var(--line2)", "stroke-width": 1 }, ch4.plot);
    hoverMarks(bars, i => { const r = l1[i]; return `<div class="t-title">${r.d.abbr}</div>P${r.d.grid} grid → P${r.p1} after lap 1`; });
  }

  const movers = s.drivers.filter(d => d.grid && d.pos).map(d => ({ d, g: d.grid - d.pos })).sort((a, b) => b.g - a.g);
  insights(root, [
    stops.length && stops[0].dur ? `Fastest stop: <b>${stops[0].d.abbr}</b> ${fmtSec(stops[0].dur, 1)}s pit lane (lap ${stops[0].l.lap})` : "",
    movers.length && movers[0].g > 0 ? `Drive of the day candidate: <b>${movers[0].d.abbr}</b> gained ${movers[0].g} places` : "",
    l1.length ? `Best start: <b>${l1[0].d.abbr}</b> (${l1[0].delta > 0 ? "+" + l1[0].delta : l1[0].delta} on lap 1)` : "",
  ].filter(Boolean));
  root.insertBefore(root.lastChild, root.children[2] || null);
}

/* crosshair for race trace: shows lap + gaps between visible drivers */
function raceCross(ch, container, series, s) {
  const vline = svgEl("line", { y1: ch.mt, y2: ch.mt + ch.ih, stroke: "var(--ink3)", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: 0 }, ch.svg);
  ch.svg.addEventListener("pointermove", e => {
    const p = pt(e);
    if (p.x < ch.ml || p.x > ch.ml + ch.iw) { vline.setAttribute("opacity", 0); tipHide(); return; }
    const lap = Math.round(ch.xd[0] + (p.x - ch.ml) / ch.iw * (ch.xd[1] - ch.xd[0]));
    if (lap < 1) { vline.setAttribute("opacity", 0); return; }
    vline.setAttribute("x1", ch.x(lap)); vline.setAttribute("x2", ch.x(lap)); vline.setAttribute("opacity", .7);
    const at = series.map(sr => ({ sr, v: sr.pts[lap] })).filter(x => x.v).sort((a, b) => b.v[1] - a.v[1]);
    if (!at.length) return;
    tipShow(`<div class="t-title">Lap ${lap}</div><table>` + at.slice(0, 12).map((x, i) =>
      `<tr><td><span class="drv-cell"><span class="dot" style="background:${teamCol(x.sr.d.color)}"></span>${x.sr.d.abbr}</span></td><td class="num">${i === 0 ? "leader" : "+" + (at[0].v[1] - x.v[1]).toFixed(1) + "s"}</td></tr>`).join("") + "</table>", e);
  });
  ch.svg.addEventListener("pointerleave", () => { vline.setAttribute("opacity", 0); tipHide(); });
  function pt(e) { const r = ch.svg.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * ch.W, y: (e.clientY - r.top) / r.height * ch.H }; }
}
