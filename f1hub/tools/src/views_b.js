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
  driverRail(root, s);
  if (!s.drivers.some(d => HUB.S.sel.has(d.abbr))) { root.insertAdjacentHTML("beforeend", `<div class="empty">No drivers selected — pick some above.</div>`); return; }

  const stints = stintsOf(s).filter(t => HUB.S.sel.has(t.drv));

  /* ---- strategy timeline ---- */
  if (isRace) {
    const c = card(root, "Strategy", "stint compound + length; hover pit markers for pit-lane time");
    const drivers = s.drivers.filter(d => d.pos && HUB.S.sel.has(d.abbr)).sort((a, b) => a.pos - b.pos);
    if (!drivers.length) { c.insertAdjacentHTML("beforeend", `<div class="empty">None of the selected drivers are classified here.</div>`); return; }
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
  const used = [...new Set(stints.map(t => t.cmp))].filter(cc => cc !== "UNKNOWN");
  const cmps = used.filter(cc => stints.filter(t => t.cmp === cc).some(t => stintFit(t, sid)));
  const unfittable = used.filter(cc => !cmps.includes(cc));
  if (!cmps.length) { card(root, "Tyre degradation").insertAdjacentHTML("beforeend", `<div class="empty">Not enough clean stint running to fit degradation${HUB.S.sel.size < s.drivers.length ? " from the selected drivers — add more above" : ""}.</div>`); return; }
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
  // compounds that ran, but never long enough to fit a slope — show why
  // they're missing instead of hiding them silently
  for (const cc of unfittable) {
    const b = document.createElement("button");
    b.innerHTML = cmpDot(cc) + " " + cc;
    b.disabled = true;
    b.title = `${cc} was used, but no stint had the 4+ clean consecutive laps needed to fit degradation`;
    segEl.appendChild(b);
  }
  c2.querySelector(".right").appendChild(segEl);
  if (unfittable.length)
    c2.insertAdjacentHTML("beforeend", `<p class="note">${unfittable.map(cc => cmpDot(cc) + " " + cc.toLowerCase()).join(", ")} ${unfittable.length > 1 ? "were" : "was"} used but never for a long enough clean run (4+ laps) to measure degradation — greyed out, not hidden.</p>`);

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
  // FP2 is where representative long running happens on a conventional
  // weekend; sprint weekends only have FP1
  const pref = practiceIds.includes("FP2") ? "FP2" : practiceIds[0];
  const sid = practiceIds.includes(HUB.S.sid) ? HUB.S.sid : pref;
  const s = HUB.session(sid);
  if (sid !== HUB.S.sid) root.insertAdjacentHTML("beforeend", `<p class="note">Showing <b>${SNAMES[sid]}</b> — the representative long-run session${practiceIds.length > 1 ? "; use the session picker for other practice sessions" : ""}.</p>`);

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

  // tag how representative each run is: length ≈ fuel ≈ trust
  for (const r of runs) {
    const valid = r.t.laps.filter(l => !l.in && !l.out && l.t != null).length;
    r.pushCool = valid > 0 && r.run.length / valid < 0.62;   // lots of stripped laps = push-cool program
    r.tag = r.pushCool ? "push-cool?" : r.run.length >= 9 ? "race sim" : r.run.length <= 6 ? "short run" : "";
  }
  if (!HUB.S.lrSel) {
    // default: each team's most representative run (longest, then fastest),
    // top 4 teams — the midfield "glory runs" on low fuel stay off by default
    const perTeam = new Map();
    for (const r of runs) {
      const cur = perTeam.get(r.d.team);
      if (!cur || r.run.length > cur.run.length || (r.run.length === cur.run.length && r.med < cur.med)) perTeam.set(r.d.team, r);
    }
    HUB.S.lrSel = new Set([...perTeam.values()].sort((a, b) => a.med - b.med).slice(0, 4).map(r => r.key));
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

  /* ---- deg gradient: the fuel-proof comparison ---- */
  const grads = runs.filter(r => r.fit && r.run.length >= 7 && !r.pushCool).sort((a, b) => a.fit.b - b.fit.b);
  if (grads.length >= 2) {
    const cg = card(root, "Deg gradient", "time lost per lap within each run — fuel load cancels out of the slope, so this IS comparable across cars");
    const div = document.createElement("div"); div.className = "chart"; cg.appendChild(div);
    const mx = Math.max(...grads.map(r => Math.abs(r.fit.b)), 100);
    const rh2 = 24, H2 = grads.length * rh2 + 40;
    const chg = Chart(div, { h: H2, xd: [Math.min(0, ...grads.map(r => r.fit.b)) - 20, mx * 1.25], yd: [0, 1], ml: 100, mb: 26, yticksArr: [], xfmt: v => "+" + (v / 1000).toFixed(2), xlab: "deg (s/lap)", label: "Deg gradient ranking" });
    const bars2 = [];
    grads.forEach((r, i) => {
      const cy = chg.mt + (i + .5) * (chg.ih / grads.length), col = teamCol(r.d.color);
      svgEl("text", { x: chg.ml - 8, y: cy + 3.5, "text-anchor": "end", "font-size": 11, "font-weight": 700, fill: col, class: "num" }, chg.svg).textContent = `${r.d.abbr} ${CMP_LETTER[r.t.cmp] || ""}`;
      const x0 = chg.x(Math.min(0, r.fit.b)), x1 = chg.x(Math.max(0, r.fit.b));
      const bar = svgEl("rect", { x: x0, y: cy - 8, width: Math.max(2, x1 - x0), height: 16, rx: 3.5, fill: col, opacity: .85 }, chg.plot);
      svgEl("text", { x: x1 + 6, y: cy + 3.5, "font-size": 10, fill: "var(--ink2)", class: "num" }, chg.plot).textContent = `+${(r.fit.b / 1000).toFixed(3)} · ${r.run.length}L`;
      bars2.push(bar);
    });
    hoverMarks(bars2, i => {
      const r = grads[i];
      return `<div class="t-title">${r.d.abbr} — ${esc(r.t.cmp)} run, ${r.run.length} laps</div>deg <b class="num">+${(r.fit.b / 1000).toFixed(3)} s/lap</b> · over 20 laps that compounds to <b class="num">${(r.fit.b * 20 / 1000).toFixed(1)}s</b>`;
    });
    cg.insertAdjacentHTML("beforeend", `<p class="note">Race sims only (7+ clean laps, no push-cool programs). A car burning fuel gets ~0.06 s/lap faster, so true tyre deg is roughly the shown slope <b>+ 0.06</b> — but that offset is the same for everyone, so the order stands.</p>`);
  }

  const c2 = card(root, "Run ranking", "⚠ fuel unknown — two 10-lap runs can differ by 40 kg. Absolute pace here proves nothing; the gradient above is the honest signal");
  const w = document.createElement("div"); w.className = "tblwrap"; c2.appendChild(w);
  w.innerHTML = `<table class="t"><thead><tr><th class="r">#</th><th>Driver</th><th>Tyre</th><th class="r">Laps</th><th></th><th class="r">Median</th><th class="r">Best</th><th class="r">Trend s/lap</th><th class="r">Gap</th></tr></thead><tbody>` +
    runs.map((r, i) => `<tr${r.tag === "race sim" ? "" : ' style="opacity:.82"'}><td class="r num">${i + 1}</td><td>${drvCell(r.d)}</td><td>${cmpDot(r.t.cmp)}${r.t.startLife > 1 ? ` <span class="hint">used</span>` : ""}</td>
      <td class="r num">${r.run.length}</td>
      <td>${r.tag ? `<span class="tag" style="${r.tag === "race sim" ? "background:rgba(74,222,128,.18);color:var(--green)" : "background:var(--surface3);color:var(--ink3)"}">${r.tag}</span>` : ""}</td>
      <td class="r num ${i === 0 ? "best" : ""}">${fmtLap(Math.round(r.med))}</td><td class="r num">${fmtLap(r.best)}</td>
      <td class="r num">${r.fit ? (r.fit.b >= 0 ? "+" : "") + (r.fit.b / 1000).toFixed(3) : "—"}</td>
      <td class="r num">${i === 0 ? "—" : fmtDelta(r.med - runs[0].med)}</td></tr>`).join("") + "</tbody></table>";
  c2.insertAdjacentHTML("beforeend", `<p class="note">Longer runs carry more fuel and mean more; <b>race sim</b> ≥ 9 laps, <b>short run</b> ≤ 6 laps, <b>push-cool?</b> = many stripped laps between pushes. Trends within a run are real; gaps across teams are indicative only.</p>`);

  // headline goes to the most representative running, not the fastest light-fuel glory run
  const rep = runs.filter(r => r.run.length >= 7 && !r.pushCool);
  const head = rep[0] || runs[0];
  insights(root, [
    `Best representative long run: <b>${head.d.abbr}</b> ${fmtLap(Math.round(head.med))} on ${head.t.cmp.toLowerCase()}s (${head.run.length} laps)${rep.length ? "" : " — no true race sims this session, treat with care"}`,
    head !== runs[0] ? `<b>${runs[0].d.abbr}</b> tops the raw ranking (${fmtLap(Math.round(runs[0].med))}) but only over ${runs[0].run.length} laps — likely light fuel` : "",
    rep.find(r => r.fit && r.fit.b < 20) ? `Flattest race sim: <b>${[...rep].filter(r => r.fit).sort((a, b) => a.fit.b - b.fit.b)[0].d.abbr}</b> — barely any drop-off` : "",
  ].filter(Boolean));

  lrSheet(root, s, runs);
}

/* ---- shareable long-run sheet (lap-by-lap grid + PNG export) ---- */
function lrSheet(root, s, runs) {
  // one column per driver — their best run; columns ordered by average pace
  const best = new Map();
  for (const r of runs) if (!best.has(r.d.abbr) || r.med < best.get(r.d.abbr).med) best.set(r.d.abbr, r);
  const cols = [...best.values()];
  for (const c of cols) {
    const laps = c.t.laps.filter(l => !l.in && !l.out && l.t != null);
    const inRun = new Set(c.run.map(l => l.lap));
    c.cells = laps.map(l => ({ t: l.t, x: !inRun.has(l.lap) || l.del }));
    c.avg = c.run.reduce((a, l) => a + l.t, 0) / c.run.length;
  }
  cols.sort((a, b) => a.avg - b.avg);
  if (!cols.length) return;
  const maxRows = Math.max(...cols.map(c => c.cells.length));
  const baseSec = Math.floor(Math.min(...cols.map(c => c.avg)) / 60000) * 60;
  const cell = t => (t / 1000 - baseSec).toFixed(3);
  const surname = d => (d.name || d.abbr).split(" ").at(-1);
  const headTxt = c => `${surname(c.d)} (${CMP_LETTER[c.t.cmp] || "?"})`;

  const card2 = card(root, "Long run sheet", "lap-by-lap, X = stripped (traffic / cool-down / deleted) · sorted by average pace");
  const right = card2.querySelector(".right");
  const dl = document.createElement("button"); dl.className = "btn pri"; dl.textContent = "Download PNG";
  right.appendChild(dl);
  const w = document.createElement("div"); w.className = "tblwrap"; card2.appendChild(w);
  let html = `<table class="t lr-sheet"><thead><tr>` + cols.map(c => {
    const col = teamCol(c.d.color), dark = lum(col) < 0.4;
    return `<th style="background:${col};color:${dark ? "#fff" : "#111"};text-align:center">${esc(headTxt(c))}</th>`;
  }).join("") + `</tr></thead><tbody>`;
  for (let i = 0; i < maxRows; i++) {
    html += "<tr>" + cols.map(c => {
      const cc = c.cells[i];
      if (!cc) return i === c.cells.length ? `<td class="lr-end"></td>` : `<td></td>`;
      return `<td class="r num" style="text-align:center${cc.x ? ";color:var(--ink3)" : ""}">${cc.x ? "X" : cell(cc.t)}</td>`;
    }).join("") + "</tr>";
  }
  html += `<tr class="lr-avg"><td colspan="${cols.length}">AVERAGE STINT PACE</td></tr><tr>` +
    cols.map(c => `<td class="num" style="text-align:center;font-weight:700">${cell(c.avg)}</td>`).join("") + `</tr></tbody></table>`;
  w.innerHTML = html;
  card2.insertAdjacentHTML("beforeend", `<p class="note">Times shown minus ${baseSec / 60} min (e.g. ${cell(cols[0].avg)} = ${fmtLap(Math.round(cols[0].avg))}).</p>`);

  dl.addEventListener("click", () => sheetPNG(
    `Long Runs ${HUB.data.location} ${SNAMES[s.id] || s.id} ${HUB.data.year}`, cols, cell, headTxt, maxRows));
}

function sheetPNG(title, cols, cell, headTxt, maxRows) {
  const cw = 122, rh = 27, hh = 34, pad = 24, titleH = 52, footH = 30;
  const W = pad * 2 + cw * cols.length;
  const H = titleH + hh + maxRows * rh + 12 + rh * 2 + footH + pad;
  const cv = document.createElement("canvas");
  const k = 2; cv.width = W * k; cv.height = H * k;
  const x0 = pad, ctx = cv.getContext("2d");
  ctx.scale(k, k);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#111"; ctx.font = "700 21px -apple-system,Segoe UI,Arial"; ctx.textAlign = "center";
  ctx.fillText(title, W / 2, 34);
  const mono = '13px ui-monospace,Consolas,Menlo,monospace';
  // headers
  cols.forEach((c, i) => {
    const col = teamCol(c.d.color);
    ctx.fillStyle = col; ctx.fillRect(x0 + i * cw, titleH, cw - 2, hh - 4);
    ctx.fillStyle = lum(col) < 0.4 ? "#fff" : "#111";
    ctx.font = "700 12.5px -apple-system,Segoe UI,Arial";
    ctx.fillText(headTxt(c), x0 + i * cw + cw / 2 - 1, titleH + 21);
  });
  // cells
  for (let rIdx = 0; rIdx < maxRows; rIdx++) {
    const y = titleH + hh + rIdx * rh;
    cols.forEach((c, i) => {
      const cx = x0 + i * cw;
      const cc = c.cells[rIdx];
      if (!cc && rIdx === c.cells.length) { ctx.fillStyle = "#111"; ctx.fillRect(cx, y, cw - 2, rh - 3); return; }
      ctx.strokeStyle = "#c9cdd4"; ctx.lineWidth = 1; ctx.strokeRect(cx + .5, y + .5, cw - 3, rh - 4);
      if (!cc) return;
      ctx.fillStyle = cc.x ? "#9aa0a8" : "#111"; ctx.font = cc.x ? "700 13px Arial" : mono;
      ctx.fillText(cc.x ? "X" : cell(cc.t), cx + cw / 2 - 1, y + 18);
    });
  }
  // average band
  const yA = titleH + hh + maxRows * rh + 12;
  ctx.fillStyle = "#bfe3ad"; ctx.fillRect(x0, yA, cw * cols.length - 2, rh - 3);
  ctx.fillStyle = "#111"; ctx.font = "700 13px -apple-system,Segoe UI,Arial";
  ctx.fillText("AVERAGE STINT PACE", x0 + (cw * cols.length) / 2, yA + 18);
  cols.forEach((c, i) => {
    const cx = x0 + i * cw, y = yA + rh;
    ctx.strokeStyle = "#c9cdd4"; ctx.strokeRect(cx + .5, y + .5, cw - 3, rh - 4);
    ctx.fillStyle = "#111"; ctx.font = "700 " + mono;
    ctx.fillText(cell(c.avg), cx + cw / 2 - 1, y + 18);
  });
  ctx.fillStyle = "#9aa0a8"; ctx.font = "11px -apple-system,Segoe UI,Arial";
  ctx.fillText("minisector · data via FastF1 · out/in laps removed, X = stripped lap", W / 2, H - 14);
  cv.toBlob(b => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, "image/png");
}
