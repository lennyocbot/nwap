/* ============ views B: tyres & degradation, long runs ============ */
"use strict";

function stintsOf(s) {
  const map = new Map();
  for (const l of s.laps) {
    if (l.stint == null) continue;
    const k = l.drv + "#" + l.stint;
    if (!map.has(k)) map.set(k, { drv: l.drv, stint: l.stint, laps: [] });
    map.get(k).laps.push(l);
  }
  for (const st of map.values()) {
    st.laps.sort((a, b) => a.lap - b.lap);
    st.from = st.laps[0].lap; st.to = st.laps.at(-1).lap;
    st.cmp = (st.laps.find(l => l.cmp) || {}).cmp || "UNKNOWN";
    st.startLife = Math.min(...st.laps.map(l => l.life ?? 99));
    st.fresh = st.laps[0].fresh;
  }
  return [...map.values()];
}

/* robust linear fit of (tyre life, fuel-corrected ms) for one stint */
function stintFit(st, sid) {
  const pts0 = st.laps.filter(l => isClean(l) && l.life != null)
    .filter((l, i, arr) => l.lap > st.from)             // drop first lap of stint
    .map(l => [l.life, fuelCorrWith(l, sid)]);
  if (pts0.length < 4) return null;
  let fit = linfit(pts0);
  if (!fit) return null;
  const pts = pts0.filter(([x, y]) => Math.abs(y - (fit.a + fit.b * x)) < 1200);
  if (pts.length >= 4) fit = linfit(pts) || fit;
  fit.pts = pts;
  return fit;
}
/* fuel correction that is always on for deg analysis of race sessions */
function fuelCorrWith(l, sid) {
  const s = HUB.session(sid);
  if (!s || !(s.id === "R" || s.id === "S") || !s.totalLaps) return l.t;
  return l.t - (s.totalLaps - l.lap) * HUB.S.fuelK * 1000;
}

function degSessionId() {
  return ["R", "S", "FP1", "FP2", "FP3"].includes(HUB.S.sid) ? HUB.S.sid : "R";
}

function viewDeg(root) {
  const sid = degSessionId(), s = HUB.session(sid);
  const isRace = sid === "R" || sid === "S";
  if (sid !== HUB.S.sid) root.insertAdjacentHTML("beforeend", `<p class="note">Showing <b>${SNAMES[sid]}</b> — degradation needs long running (Race, Sprint or practice).</p>`);

  const stints = stintsOf(s);

  /* ---- strategy timeline ---- */
  if (isRace) {
    const c = card(root, "Strategy", "stint compound + length; hover pit markers for pit-lane time");
    const drivers = s.drivers.filter(d => d.pos).sort((a, b) => a.pos - b.pos);
    const total = s.totalLaps || Math.max(...s.laps.map(l => l.lap));
    const div = document.createElement("div"); div.className = "chart"; c.appendChild(div);
    const rh = 21, H = drivers.length * rh + 40;
    const ch = Chart(div, { h: H, xd: [0, total], yd: [0, 1], ml: 88, mb: 28, yticksArr: [], xlab: "lap", label: "Strategy timeline" });
    const stNodes = [], stData = [];
    drivers.forEach((d, i) => {
      const cy = ch.mt + i * (ch.ih / drivers.length) + (ch.ih / drivers.length) / 2;
      svgEl("text", { x: ch.ml - 8, y: cy + 3.5, "text-anchor": "end", "font-size": 10.5, "font-weight": 700, fill: teamCol(d.color), class: "num" }, ch.svg).textContent = `P${d.pos} ${d.abbr}`;
      const dst = stints.filter(t => t.drv === d.abbr).sort((a, b) => a.from - b.from);
      for (const t of dst) {
        const x0 = ch.x(t.from - 1), x1 = ch.x(t.to);
        const r = svgEl("rect", { x: x0 + 1, y: cy - 7, width: Math.max(1, x1 - x0 - 2), height: 14, rx: 3.5, fill: cmpCol(t.cmp), opacity: .88, stroke: "var(--surface)", "stroke-width": 1 }, ch.plot);
        if (x1 - x0 > 26) svgEl("text", { x: (x0 + x1) / 2, y: cy + 3.2, "text-anchor": "middle", "font-size": 9, "font-weight": 800, fill: "#0b0d10" }, ch.plot).textContent = (CMP_LETTER[t.cmp] || "?") + (t.startLife > 1 ? "•" : "") + (t.to - t.from + 1);
        stNodes.push(r); stData.push({ t, d });
      }
      // pit markers
      const inLaps = s.laps.filter(l => l.drv === d.abbr && l.in);
      for (const l of inLaps) {
        const nx = s.laps.find(n => n.drv === d.abbr && n.lap === l.lap + 1 && n.pitOut != null);
        const dur = nx && l.pitIn != null ? nx.pitOut - l.pitIn : null;
        const m = svgEl("path", { d: `M${ch.x(l.lap)},${cy - 10} l4,-5 l-8,0 Z`, fill: "var(--ink2)" }, ch.plot);
        m.style.cursor = "default";
        m.addEventListener("pointermove", ev => tipShow(`<div class="t-title">${d.abbr} — pit lap ${l.lap}</div>pit lane: <b class="num">${dur ? fmtSec(dur, 1) + "s" : "?"}</b>`, ev));
        m.addEventListener("pointerleave", tipHide);
      }
    });
    hoverMarks(stNodes, i => {
      const { t, d } = stData[i];
      const clean = t.laps.filter(isClean).map(l => l.t);
      const fit = stintFit(t, sid);
      return `<div class="t-title">${d.abbr} stint ${t.stint} — ${esc(t.cmp)}${t.startLife > 1 ? " (used, " + t.startLife + " laps old)" : " (new)"}</div><table>
        <tr><td>Laps</td><td class="num">${t.from}–${t.to} (${t.to - t.from + 1})</td></tr>
        <tr><td>Median pace</td><td class="num">${clean.length ? fmtLap(Math.round(median(clean))) : "—"}</td></tr>
        <tr><td>Deg (fuel-corr)</td><td class="num">${fit ? "+" + (fit.b / 1000).toFixed(3) + " s/lap" : "—"}</td></tr></table>`;
    });
    legend(div, ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].filter(cc => stints.some(t => t.cmp === cc)).map(cc => ({ color: cmpCol(cc), label: cc, dot: true })).concat([{ color: "var(--ink2)", label: "▲ pit stop", dot: true }]));
  }

  /* ---- degradation model ---- */
  const cmps = [...new Set(stints.map(t => t.cmp))].filter(cc => cc !== "UNKNOWN" && stints.filter(t => t.cmp === cc).some(t => stintFit(t, sid)));
  if (!cmps.length) { card(root, "Tyre degradation").insertAdjacentHTML("beforeend", `<div class="empty">Not enough clean stint running to fit degradation.</div>`); return; }
  if (!HUB.S.degCmp || !cmps.includes(HUB.S.degCmp)) HUB.S.degCmp = cmps.includes("MEDIUM") ? "MEDIUM" : cmps[0];

  const c2 = card(root, "Tyre degradation", `per-stint baseline removed · first lap of stint dropped · traffic/SC laps excluded${isRace ? ` · fuel-corrected at ${HUB.S.fuelK.toFixed(3)} s/lap` : ""}`);
  const segEl = document.createElement("div"); segEl.className = "seg mini";
  for (const cc of cmps) {
    const b = document.createElement("button");
    b.innerHTML = cmpDot(cc) + " " + cc;
    if (cc === HUB.S.degCmp) b.classList.add("on");
    b.addEventListener("click", () => { HUB.S.degCmp = cc; HUB.render(); });
    segEl.appendChild(b);
  }
  c2.querySelector(".right").appendChild(segEl);

  // pooled normalized points per team
  const teams = new Map(); // team -> {col, pts:[[life, dMs]], drvs:Set}
  for (const t of stints.filter(t => t.cmp === HUB.S.degCmp)) {
    const fit = stintFit(t, sid);
    if (!fit) continue;
    const d = HUB.driver(t.drv, sid);
    if (!d) continue;
    if (!teams.has(d.team)) teams.set(d.team, { col: teamCol(d.color), pts: [], drvs: new Set(), stints: 0 });
    const T = teams.get(d.team);
    T.stints++;
    T.drvs.add(t.drv);
    for (const [x, y] of fit.pts) T.pts.push([x, y - fit.a, t.drv, t.stint]);
  }
  const rows = [...teams.entries()].map(([team, T]) => ({ team, ...T, fit: linfit(T.pts.map(p => [p[0], p[1]])) }))
    .filter(r => r.fit && r.pts.length >= 6).sort((a, b) => a.fit.b - b.fit.b);

  if (!rows.length) { c2.insertAdjacentHTML("beforeend", `<div class="empty">Not enough data on this compound.</div>`); }
  else {
    const div2 = document.createElement("div"); div2.className = "chart"; c2.appendChild(div2);
    const allPts = rows.flatMap(r => r.pts);
    const xmax = Math.max(...allPts.map(p => p[0])) + 1;
    const ylo = Math.min(quantile(allPts.map(p => p[1]), 0.02), -200), yhi = Math.max(quantile(allPts.map(p => p[1]), 0.985) + 300, 800);
    const ch2 = Chart(div2, { h: 360, xd: [0, xmax], yd: [ylo, yhi], yfmt: v => (v / 1000).toFixed(1), xlab: "tyre life (laps)", ylab: "Δ pace vs stint baseline (s)", label: "Degradation scatter" });
    const nodes = [], data = [];
    const labels = [];
    for (const r of rows) {
      for (const p of r.pts) {
        const n = svgEl("circle", { cx: ch2.x(p[0]), cy: ch2.y(p[1]), r: 2.8, fill: r.col, opacity: .5 }, ch2.plot);
        nodes.push(n); data.push({ p, r });
      }
      const f = r.fit;
      svgEl("line", { x1: ch2.x(0), y1: ch2.y(f.a), x2: ch2.x(xmax), y2: ch2.y(f.a + f.b * xmax), stroke: r.col, "stroke-width": 2.4 }, ch2.plot);
      const yEnd = Math.min(Math.max(f.a + f.b * xmax, ylo + 100), yhi - 100);
      labels.push({ y: ch2.y(yEnd) - 6, txt: r.team, col: r.col });
    }
    spreadLabels(labels, 12, ch2.mt + 8, ch2.mt + ch2.ih - 4);
    for (const L of labels)
      svgEl("text", { x: ch2.ml + ch2.iw - 4, y: L.y, "text-anchor": "end", "font-size": 10, "font-weight": 700, fill: L.col }, ch2.svg).textContent = L.txt;
    hoverMarks(nodes, i => {
      const { p, r } = data[i];
      return `<div class="t-title">${esc(p[2])} stint ${p[3]} — ${esc(r.team)}</div>tyre life ${p[0]} · Δ <b class="num">${(p[1] / 1000).toFixed(3)}s</b> vs stint baseline`;
    });
    legend(div2, rows.map(r => ({ color: r.col, label: r.team })));

    const wrap = document.createElement("div"); wrap.className = "tblwrap"; c2.appendChild(wrap);
    wrap.innerHTML = `<table class="t"><thead><tr><th>Team</th><th class="r">Deg (s/lap)</th><th class="r">±10 laps costs</th><th class="r">Stints</th><th class="r">Laps</th><th>Drivers</th></tr></thead><tbody>` +
      rows.map((r, i) => `<tr><td><span class="drv-cell"><span class="dot" style="background:${r.col}"></span>${esc(r.team)}</span></td>
        <td class="r num" style="${i === 0 ? "color:var(--green);font-weight:700" : i === rows.length - 1 ? "color:var(--red);font-weight:700" : ""}">+${(r.fit.b / 1000).toFixed(3)}</td>
        <td class="r num">${(r.fit.b / 100).toFixed(2)}s</td>
        <td class="r num">${r.stints}</td><td class="r num">${r.pts.length}</td><td>${[...r.drvs].join(" ")}</td></tr>`).join("") + "</tbody></table>";

    insights(root, [
      `Kindest to the ${HUB.S.degCmp.toLowerCase()}: <b>${rows[0].team}</b> at +${(rows[0].fit.b / 1000).toFixed(3)} s/lap`,
      rows.length > 1 ? `Highest deg: <b>${rows.at(-1).team}</b> (+${(rows.at(-1).fit.b / 1000).toFixed(3)} s/lap) — ${((rows.at(-1).fit.b - rows[0].fit.b) / 100).toFixed(2)}s more over a 10-lap stint` : "",
    ].filter(Boolean));
  }

  /* ---- stint explorer ---- */
  const c3 = card(root, "All stints", "every stint with a fit; sorted by pace");
  const srows = stints.map(t => {
    const clean = t.laps.filter(isClean);
    const fit = stintFit(t, sid);
    const d = HUB.driver(t.drv, sid);
    return { t, d, fit, med: clean.length ? median(clean.map(l => fuelCorrWith(l, sid))) : null, best: clean.length ? Math.min(...clean.map(l => l.t)) : null, n: clean.length };
  }).filter(r => r.n >= 3 && r.med != null && r.d).sort((a, b) => a.med - b.med);
  const w3 = document.createElement("div"); w3.className = "tblwrap"; w3.style.maxHeight = "420px"; w3.style.overflowY = "auto"; c3.appendChild(w3);
  w3.innerHTML = `<table class="t"><thead><tr><th>Driver</th><th>Tyre</th><th class="r">Laps</th><th class="r">Stint len</th><th class="r">Median${isRace ? " (fc)" : ""}</th><th class="r">Best</th><th class="r">Deg s/lap</th></tr></thead><tbody>` +
    srows.map(r => `<tr><td>${drvCell(r.d)}</td><td>${cmpDot(r.t.cmp)} ${r.t.startLife > 1 ? `<span class="hint">+${r.t.startLife - 1} old</span>` : ""}</td>
      <td class="r num">${r.t.from}–${r.t.to}</td><td class="r num">${r.t.to - r.t.from + 1}</td>
      <td class="r num">${fmtLap(Math.round(r.med))}</td><td class="r num">${fmtLap(r.best)}</td>
      <td class="r num">${r.fit ? "+" + (r.fit.b / 1000).toFixed(3) : "—"}</td></tr>`).join("") + "</tbody></table>";
}

/* ---------- LONG RUNS (practice) ---------- */
function viewLongRuns(root) {
  const practiceIds = HUB.data.sessions.filter(s => s.id.startsWith("FP")).map(s => s.id);
  if (!practiceIds.length) { root.innerHTML = `<div class="empty">No practice session in this weekend.</div>`; return; }
  const sid = practiceIds.includes(HUB.S.sid) ? HUB.S.sid : practiceIds[0];
  const s = HUB.session(sid);
  if (sid !== HUB.S.sid) root.insertAdjacentHTML("beforeend", `<p class="note">Long-run detection uses <b>${SNAMES[sid]}</b>.</p>`);

  // detect runs
  const runs = [];
  for (const t of stintsOf(s)) {
    const laps = t.laps.filter(l => l.t != null && !l.in && !l.out && !l.del);
    if (laps.length < 5) continue;
    const med = median(laps.map(l => l.t));
    const run = laps.filter(l => l.t < med * 1.035);   // strip cool-down / traffic laps
    if (run.length < 5) continue;
    const d = HUB.driver(t.drv, sid);
    if (!d) continue;
    const fit = linfit(run.map((l, i) => [i, l.t]));
    runs.push({ t, d, run, med: median(run.map(l => l.t)), best: Math.min(...run.map(l => l.t)), fit, key: t.drv + "#" + t.stint });
  }
  runs.sort((a, b) => a.med - b.med);
  // drop junk "runs" (constant-speed running, aero rakes, traffic sims) far off genuine long-run pace
  if (runs.length > 1) {
    const ref = runs[0].med;
    for (let i = runs.length - 1; i >= 0; i--) if (runs[i].med > ref * 1.12) runs.splice(i, 1);
  }
  if (!runs.length) { root.insertAdjacentHTML("beforeend", `<div class="empty">No stint of 5+ representative laps found — nobody did race sims here.</div>`); return; }

  if (!HUB.S.lrSel) {
    const seen = new Set(); HUB.S.lrSel = new Set();
    for (const r of runs) { if (!seen.has(r.d.team)) { seen.add(r.d.team); HUB.S.lrSel.add(r.key); } if (HUB.S.lrSel.size >= 6) break; }
  }

  const c = card(root, "Long runs", `stints of 5+ laps in ${SNAMES[sid]} · out/in and cool-down laps stripped · fuel loads unknown`);
  const chips = document.createElement("div"); chips.className = "drv-rail"; c.appendChild(chips);
  for (const r of runs) {
    const on = HUB.S.lrSel.has(r.key);
    const b = document.createElement("button");
    b.className = "chip sm " + (on ? "on" : "off");
    b.innerHTML = `<span class="dot" style="background:${teamCol(r.d.color)}"></span>${r.d.abbr} ${cmpDot(r.t.cmp, 13)} <span class="num">${r.run.length}L</span>`;
    b.addEventListener("click", () => { on ? HUB.S.lrSel.delete(r.key) : HUB.S.lrSel.add(r.key); HUB.render(); });
    chips.appendChild(b);
  }
  const sel = runs.filter(r => HUB.S.lrSel.has(r.key));
  if (sel.length) {
    const div = document.createElement("div"); div.className = "chart"; c.appendChild(div);
    const allT = sel.flatMap(r => r.run.map(l => l.t));
    const maxN = Math.max(...sel.map(r => r.run.length));
    const ch = Chart(div, {
      h: 340, xd: [0.6, maxN + 0.4], yd: [Math.min(...allT) - 300, quantile(allT, 0.97) + 500],
      yfmt: v => fmtLap(Math.round(v)), xfmt: v => Number.isInteger(v) ? v : "", xlab: "lap in run", ylab: "lap time", label: "Long run comparison"
    });
    const nodes = [], data = [];
    for (const r of sel) {
      const col = teamCol(r.d.color);
      const pts = r.run.map((l, i) => [i + 1, l.t]);
      const p = svgEl("path", { d: linePath(pts, ch.x, ch.y), fill: "none", stroke: col, "stroke-width": 1.8, opacity: .9 }, ch.plot);
      if (drvDash(r.d.abbr, sid)) p.setAttribute("stroke-dasharray", "6 3");
      pts.forEach(([xx, yy], i) => {
        const n = svgEl("circle", { cx: ch.x(xx), cy: ch.y(yy), r: 3.4, fill: cmpCol(r.t.cmp), stroke: col, "stroke-width": 1.4 }, ch.plot);
        nodes.push(n); data.push({ r, i });
      });
      const last = pts.at(-1);
      svgEl("text", { x: ch.x(last[0]) + 6, y: ch.y(last[1]) + 3.5, "font-size": 10, "font-weight": 700, fill: col, class: "num" }, ch.svg).textContent = r.d.abbr;
    }
    hoverMarks(nodes, i => {
      const { r, i: li } = data[i];
      const l = r.run[li];
      return `<div class="t-title">${r.d.abbr} — ${esc(r.t.cmp)} run, lap ${li + 1}/${r.run.length}</div>
        <b class="num">${fmtLap(l.t)}</b> · tyre life ${l.life} · session lap ${l.lap}<br><span style="color:var(--ink3)">click dot in Pace view to add to telemetry</span>`;
    });
    legend(div, [...new Map(sel.map(r => [r.d.team, r])).values()].map(r => ({ color: teamCol(r.d.color), label: r.d.team })));
  }

  const c2 = card(root, "Run ranking");
  const w = document.createElement("div"); w.className = "tblwrap"; c2.appendChild(w);
  w.innerHTML = `<table class="t"><thead><tr><th class="r">#</th><th>Driver</th><th>Tyre</th><th class="r">Laps</th><th class="r">Median</th><th class="r">Best</th><th class="r">Trend s/lap</th><th class="r">Gap</th></tr></thead><tbody>` +
    runs.map((r, i) => `<tr><td class="r num">${i + 1}</td><td>${drvCell(r.d)}</td><td>${cmpDot(r.t.cmp)}${r.t.startLife > 1 ? ` <span class="hint">used</span>` : ""}</td>
      <td class="r num">${r.run.length}</td><td class="r num ${i === 0 ? "best" : ""}">${fmtLap(Math.round(r.med))}</td><td class="r num">${fmtLap(r.best)}</td>
      <td class="r num">${r.fit ? (r.fit.b >= 0 ? "+" : "") + (r.fit.b / 1000).toFixed(3) : "—"}</td>
      <td class="r num">${i === 0 ? "—" : fmtDelta(r.med - runs[0].med)}</td></tr>`).join("") + "</tbody></table>";
  c2.insertAdjacentHTML("beforeend", `<p class="note">Median long-run pace, unknown fuel — treat gaps across teams as indicative, trends within a run as real.</p>`);

  insights(root, [
    `Best long-run pace: <b>${runs[0].d.abbr}</b> ${fmtLap(Math.round(runs[0].med))} on ${runs[0].t.cmp.toLowerCase()}s (${runs[0].run.length} laps)`,
    runs.find(r => r.fit && r.fit.b < 20) ? `Flattest run: <b>${[...runs].filter(r => r.fit).sort((a, b) => a.fit.b - b.fit.b)[0].d.abbr}</b> — barely any drop-off` : "",
  ].filter(Boolean));
}
