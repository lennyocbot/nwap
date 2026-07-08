/* ============ views D: telemetry compare, weather ============ */
"use strict";

const N_TEL = 280;
function telEntries() {
  const ents = [];
  const teamCount = {};
  for (const e of HUB.S.compare) {
    const s = HUB.session(e.sid);
    const tel = s && s.tel[e.drv + "-" + e.lap];
    const lap = s && s.laps.find(l => l.drv === e.drv && l.lap === e.lap);
    const d = HUB.driver(e.drv, e.sid);
    if (!tel || !lap || !d) continue;
    const k = d.team;
    const nth = teamCount[k] = (teamCount[k] || 0) + 1;
    let col = teamCol(d.color);
    if (nth === 2) col = mix(col, isDark() ? "#ffffff" : "#000000", 0.35);
    if (nth >= 3) col = mix(col, isDark() ? "#000000" : "#ffffff", 0.35);
    ents.push({ e, tel, lap, d, col, dash: nth >= 2 ? "6 3" : null, label: `${e.drv} L${e.lap}${e.sid !== HUB.S.sid ? " · " + SNAMES[e.sid] : ""}` });
  }
  return ents;
}
function telAt(arr, r) {
  const f = r * (N_TEL - 1), i = Math.floor(f), k = f - i;
  if (i >= N_TEL - 1) return arr[N_TEL - 1];
  return arr[i] + (arr[i + 1] - arr[i]) * k;
}

function viewTel(root) {
  const S = HUB.S;
  /* ---- basket / picker ---- */
  const c = card(root, "Lap comparison", "up to 6 laps · first chip is the reference — click a chip to make it reference");
  const bar = document.createElement("div"); bar.className = "cmp-bar"; c.appendChild(bar);
  const ents = telEntries();
  ents.forEach((en, i) => {
    const chip = document.createElement("span");
    chip.className = "lapchip" + (i === 0 ? " ref" : "");
    chip.innerHTML = `<span class="sw" style="background:${en.col};${en.dash ? "outline:2px dashed " + en.col + ";outline-offset:1px;" : ""}"></span>
      ${i === 0 ? '<span class="refmark">REF</span>' : ""}<span>${esc(en.label)}</span><span class="num" style="color:var(--ink3)">${fmtLap(en.lap.t)}</span><button class="x" title="remove" aria-label="Remove ${esc(en.label)}">✕</button>`;
    chip.querySelector(".x").addEventListener("click", ev => { ev.stopPropagation(); S.compare.splice(i, 1); HUB.save(); HUB.render(); });
    chip.addEventListener("click", () => { if (i > 0) { const [e] = S.compare.splice(i, 1); S.compare.unshift(e); HUB.save(); HUB.render(); } });
    chip.style.cursor = i > 0 ? "pointer" : "default";
    bar.appendChild(chip);
  });

  // add controls — pick any lap from any session of the weekend
  const add = document.createElement("div"); add.className = "addlap"; c.appendChild(add);
  const sessSel = document.createElement("select");
  sessSel.innerHTML = HUB.data.sessions.map(ss => `<option value="${ss.id}" ${ss.id === HUB.S.sid ? "selected" : ""}>${SNAMES[ss.id] || ss.id}</option>`).join("");
  const drvSel = document.createElement("select");
  const lapSel = document.createElement("select");
  const ps = () => HUB.session(sessSel.value);
  const fillDrivers = () => {
    drvSel.innerHTML = [...ps().drivers].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99)).map(d => `<option value="${d.abbr}">${d.abbr} — ${esc(d.team)}</option>`).join("");
  };
  const fillLaps = () => {
    const s2 = ps();
    const laps = s2.laps.filter(l => l.drv === drvSel.value && s2.tel[l.drv + "-" + l.lap]).sort((a, b) => a.t - b.t);
    lapSel.innerHTML = laps.map(l => `<option value="${l.lap}">L${l.lap} — ${fmtLap(l.t)}${l.pb ? " ·PB" : ""}${l.cmp ? " · " + CMP_LETTER[l.cmp] + (l.life ?? "") : ""}${l.del ? " ·DEL" : ""}</option>`).join("") || `<option value="">no telemetry laps</option>`;
  };
  fillDrivers(); fillLaps();
  sessSel.addEventListener("change", () => { fillDrivers(); fillLaps(); });
  drvSel.addEventListener("change", fillLaps);
  const addBtn = document.createElement("button"); addBtn.className = "btn pri"; addBtn.textContent = "Add lap";
  addBtn.addEventListener("click", () => { if (lapSel.value) addCompare(sessSel.value, drvSel.value, +lapSel.value); });
  const fastBtn = document.createElement("button"); fastBtn.className = "btn"; fastBtn.textContent = "+ session fastest";
  fastBtn.addEventListener("click", () => {
    const s2 = ps();
    const cand = s2.laps.filter(l => l.t != null && !l.del && s2.tel[l.drv + "-" + l.lap]).sort((a, b) => a.t - b.t)[0];
    if (cand) addCompare(s2.id, cand.drv, cand.lap);
  });
  const clrBtn = document.createElement("button"); clrBtn.className = "btn"; clrBtn.textContent = "Clear";
  clrBtn.addEventListener("click", () => { S.compare = []; S.telZoom = null; HUB.save(); HUB.render(); });
  add.append("Add: ", sessSel, drvSel, lapSel, addBtn, fastBtn, clrBtn);
  add.insertAdjacentHTML("beforeend", `<span class="hint">tip: tap any dot in the Pace view · drag on a trace to zoom, double-tap to reset</span>`);

  if (!ents.length) {
    const q = HUB.session("Q");
    const empty = document.createElement("div"); empty.className = "empty";
    empty.innerHTML = `<b>No laps selected yet.</b><br>Pick laps above, click dots in the Pace view, or start with a preset:<br><br>`;
    const b = document.createElement("button"); b.className = "btn pri"; b.textContent = "Compare the qualifying top 3";
    b.addEventListener("click", () => {
      if (!q) return;
      for (const d of q.drivers.filter(d => d.pos <= 3)) {
        const laps = q.laps.filter(l => l.drv === d.abbr && l.t != null && !l.del && q.tel[l.drv + "-" + l.lap]).sort((a, b) => a.t - b.t);
        if (laps.length) addCompare("Q", d.abbr, laps[0].lap);
      }
      HUB.render();
    });
    empty.appendChild(b); c.appendChild(empty);
    return;
  }

  const ref = ents[0];
  const L = ref.tel.len;      // metres, all laps mapped onto reference length
  const map = HUB.session(ref.e.sid).map || HUB.session().map;
  const zoom = S.telZoom || [0, 1];
  const xd = [zoom[0] * L, zoom[1] * L];

  /* ---- lap stats table ---- */
  const w = document.createElement("div"); w.className = "tblwrap"; c.appendChild(w);
  const bs = { s1: Math.min(...ents.map(e => e.lap.s1 ?? 1e12)), s2: Math.min(...ents.map(e => e.lap.s2 ?? 1e12)), s3: Math.min(...ents.map(e => e.lap.s3 ?? 1e12)) };
  w.innerHTML = `<table class="t"><thead><tr><th></th><th>Lap</th><th class="r">Time</th><th class="r">Gap</th><th class="r">S1</th><th class="r">S2</th><th class="r">S3</th><th>Tyre</th><th class="r">Top speed</th><th class="r">Full throttle</th><th class="r">Braking</th></tr></thead><tbody>` +
    ents.map((en, i) => {
      const vmax = Math.max(...en.tel.v);
      const ft = en.tel.th.filter(t => t >= 98).length / N_TEL * 100;
      const br = en.tel.b.filter(b => b > 0).length / N_TEL * 100;
      return `<tr><td><span class="swd" style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${en.col}"></span></td>
      <td><b>${esc(en.label)}</b>${en.lap.del ? ' <span class="tag" style="background:var(--band-red);color:var(--red)">deleted</span>' : ""}</td>
      <td class="r num"><b>${fmtLap(en.lap.t)}</b></td><td class="r num">${i === 0 ? "—" : fmtDelta(en.lap.t - ref.lap.t)}</td>
      <td class="r num ${en.lap.s1 === bs.s1 ? "best" : ""}">${fmtSec(en.lap.s1)}</td>
      <td class="r num ${en.lap.s2 === bs.s2 ? "best" : ""}">${fmtSec(en.lap.s2)}</td>
      <td class="r num ${en.lap.s3 === bs.s3 ? "best" : ""}">${fmtSec(en.lap.s3)}</td>
      <td>${en.lap.cmp ? cmpDot(en.lap.cmp) + ` <span class="hint num">${en.lap.life}L</span>` : "—"}</td>
      <td class="r num">${vmax} km/h</td><td class="r num">${ft.toFixed(0)}%</td><td class="r num">${br.toFixed(0)}%</td></tr>`;
    }).join("") + "</tbody></table>";

  /* ---- why is the slower lap slower ---- */
  if (ents.length >= 2) whyCard(root, ents);

  /* ---- dominance + map row ---- */
  const g = document.createElement("div"); g.className = "grid2"; root.appendChild(g);
  const cmap = card(g, "Track map", map ? `${map.corners.length} corners · hover traces to follow the cars` : "");
  const cdom = card(g, ents.length >= 2 ? "Mini-sector dominance" : "Speed on the reference lap", ents.length >= 2 ? "who is fastest in each of 27 track segments" : "");

  let mapAPI = null;
  if (map) mapAPI = drawTrackMap(cmap, map, ents, L);

  /* dominance strip + table */
  const NSEG = 27;
  let domWinner = [];
  if (ents.length >= 2) {
    const counts = ents.map(() => 0);
    for (let k = 0; k < NSEG; k++) {
      const r0 = k / NSEG, r1 = (k + 1) / NSEG;
      let wi = 0, wt = Infinity;
      ents.forEach((en, i) => { const dt = telAt(en.tel.t, r1) - telAt(en.tel.t, r0); if (dt < wt) { wt = dt; wi = i; } });
      domWinner.push(wi); counts[wi]++;
    }
    const div = document.createElement("div"); div.className = "chart"; cdom.appendChild(div);
    const ch = Chart(div, { h: 86, xd: [0, L], yd: [0, 1], ml: 10, mr: 10, mb: 24, mt: 8, yticksArr: [], xticksArr: [], xfmt: () => "", label: "Mini-sector dominance strip" });
    for (let k = 0; k < NSEG; k++) {
      svgEl("rect", { x: ch.x(k / NSEG * L) + 0.6, y: ch.mt, width: ch.x(1 / NSEG * L) - ch.x(0) - 1.2, height: 30, rx: 3, fill: ents[domWinner[k]].col }, ch.plot);
    }
    if (map) for (const cn of map.corners) {
      const xx = ch.x(cn.d / map.len * L);
      svgEl("line", { x1: xx, x2: xx, y1: ch.mt + 32, y2: ch.mt + 38, stroke: "var(--ink3)", "stroke-width": 1 }, ch.plot);
      svgEl("text", { x: xx, y: ch.mt + 50, "text-anchor": "middle", "font-size": 8.5, fill: "var(--ink3)", class: "num" }, ch.plot).textContent = cn.n + (cn.l || "");
    }
    const tbl = document.createElement("div"); tbl.className = "tblwrap"; cdom.appendChild(tbl);
    tbl.innerHTML = `<table class="t"><thead><tr><th>Lap</th><th class="r">Mini-sectors won</th><th class="r">Share</th></tr></thead><tbody>` +
      ents.map((en, i) => `<tr><td><span class="drv-cell"><span class="dot" style="background:${en.col}"></span>${esc(en.label)}</span></td><td class="r num">${counts[i]}</td><td class="r num">${(counts[i] / NSEG * 100).toFixed(0)}%</td></tr>`).join("") + "</tbody></table>";
  } else {
    cdom.insertAdjacentHTML("beforeend", `<p class="note">Add a second lap to see mini-sector dominance and time deltas. The map is coloured by the reference lap's speed.</p>`);
  }

  /* ---- trace panels ---- */
  const c3 = card(root, "Traces", "shared distance axis · drag to zoom all panels · double-click resets");
  const right = c3.querySelector(".right");
  const hasDrs = ents.some(en => en.tel.d.some(v => v));
  const PANELS = [
    ["delta", "Δ time"], ["v", "Speed"], ["th", "Throttle"], ["b", "Brake"], ["g", "Gear"], ["n", "RPM"], ["d", "DRS/OT"],
  ];
  for (const [id, label] of PANELS) {
    if (id === "delta" && ents.length < 2) continue;
    if (id === "d" && !hasDrs) continue;
    const t = document.createElement("label"); t.className = "toggle";
    t.innerHTML = `<input type="checkbox" ${S.telPanels[id] ? "checked" : ""}>${label}`;
    t.querySelector("input").addEventListener("change", e => { S.telPanels[id] = e.target.checked; HUB.render(); });
    right.appendChild(t);
  }
  if (S.telZoom) {
    const b = document.createElement("button"); b.className = "btn"; b.textContent = "Reset zoom";
    b.addEventListener("click", () => { S.telZoom = null; HUB.render(); });
    right.appendChild(b);
  }

  const stack = document.createElement("div"); c3.appendChild(stack);
  const charts = [];
  const inWin = i => { const r = i / (N_TEL - 1); return r >= zoom[0] - 0.02 && r <= zoom[1] + 0.02; };
  const xsOf = () => Array.from({ length: N_TEL }, (_, i) => i / (N_TEL - 1) * L);
  const xs = xsOf();
  const mkPanel = (h, yd, o = {}) => {
    const div = document.createElement("div"); div.className = "chart"; stack.appendChild(div);
    const ch = Chart(div, Object.assign({ h, xd, yd, ml: 64, mr: 14, mt: 8, mb: 4, xticksArr: [], xgrid: false, yticks: o.yticks || 4 }, o));
    charts.push(ch);
    return ch;
  };
  const cornerLines = ch => {
    if (!map) return;
    for (const cn of map.corners) {
      const xm = cn.d / map.len * L;
      if (xm < xd[0] || xm > xd[1]) continue;
      svgEl("line", { x1: ch.x(xm), x2: ch.x(xm), y1: ch.mt, y2: ch.mt + ch.ih, stroke: "var(--line)", "stroke-width": 1, "stroke-dasharray": "2 4" }, ch.plot);
    }
  };

  // corner header ruler (clickable)
  if (map) {
    const div = document.createElement("div"); div.className = "chart"; stack.appendChild(div);
    const ch = Chart(div, { h: 30, xd, yd: [0, 1], ml: 64, mr: 14, mt: 2, mb: 2, yticksArr: [], xticksArr: [], xgrid: false });
    charts.push(ch);
    for (const cn of map.corners) {
      const xm = cn.d / map.len * L;
      if (xm < xd[0] || xm > xd[1]) continue;
      const t = svgEl("text", { x: ch.x(xm), y: 18, "text-anchor": "middle", "font-size": 9.5, "font-weight": 700, fill: "var(--ink2)", class: "num", cursor: "pointer" }, ch.svg);
      t.textContent = "T" + cn.n + (cn.l || "");
      t.addEventListener("click", () => { S.telZoom = [Math.max(0, (xm - 320) / L), Math.min(1, (xm + 320) / L)]; HUB.render(); });
    }
    svgEl("text", { x: 4, y: 18, "font-size": 9, fill: "var(--ink3)" }, ch.svg).textContent = "corners ▸";
  }

  // Delta
  if (S.telPanels.delta && ents.length >= 2) {
    const deltas = ents.slice(1).map(en => xs.map((_, i) => (en.tel.t[i] - ref.tel.t[i]) / 1000));
    const vis = deltas.flatMap(dd => dd.filter((_, i) => inWin(i)));
    const pad = Math.max(0.05, (Math.max(...vis) - Math.min(...vis)) * 0.1);
    const ch = mkPanel(150, [Math.min(...vis) - pad, Math.max(...vis) + pad], { ylab: "Δt (s)", yfmt: v => v.toFixed(2) });
    cornerLines(ch);
    svgEl("line", { x1: ch.ml, x2: ch.ml + ch.iw, y1: ch.y(0), y2: ch.y(0), stroke: ref.col, "stroke-width": 1.6, opacity: .8 }, ch.plot);
    deltas.forEach((dd, j) => {
      const en = ents[j + 1];
      const p = svgEl("path", { d: linePath(xs.map((x, i) => [x, dd[i]]), ch.x, ch.y), fill: "none", stroke: en.col, "stroke-width": 1.8 }, ch.plot);
      if (en.dash) p.setAttribute("stroke-dasharray", en.dash);
    });
    ch.chan = "delta"; ch.get = (en, i) => en === ref ? 0 : (en.tel.t[i] - ref.tel.t[i]) / 1000;
  }
  // Speed
  if (S.telPanels.v) {
    const vis = ents.flatMap(en => en.tel.v.filter((_, i) => inWin(i)));
    const ch = mkPanel(190, [Math.min(...vis) - 12, Math.max(...vis) + 12], { ylab: "km/h" });
    cornerLines(ch);
    for (const en of ents) {
      const p = svgEl("path", { d: linePath(xs.map((x, i) => [x, en.tel.v[i]]), ch.x, ch.y), fill: "none", stroke: en.col, "stroke-width": 1.8 }, ch.plot);
      if (en.dash) p.setAttribute("stroke-dasharray", en.dash);
    }
    ch.chan = "v";
  }
  // Throttle
  if (S.telPanels.th) {
    const ch = mkPanel(90, [-4, 104], { ylab: "thr %", yticksArr: [0, 50, 100] });
    cornerLines(ch);
    for (const en of ents) {
      const p = svgEl("path", { d: linePath(xs.map((x, i) => [x, en.tel.th[i]]), ch.x, ch.y), fill: "none", stroke: en.col, "stroke-width": 1.4 }, ch.plot);
      if (en.dash) p.setAttribute("stroke-dasharray", en.dash);
    }
    ch.chan = "th";
  }
  // Brake
  if (S.telPanels.b) {
    const ch = mkPanel(64, [-0.08, 1.15], { ylab: "brake", yticksArr: [] });
    cornerLines(ch);
    ents.forEach((en, j) => {
      const p = svgEl("path", { d: stepPath(xs.map((x, i) => [x, en.tel.b[i] ? 1 - j * 0.13 : 0]), ch.x, ch.y), fill: "none", stroke: en.col, "stroke-width": 1.6 }, ch.plot);
      if (en.dash) p.setAttribute("stroke-dasharray", en.dash);
    });
    ch.chan = "b";
  }
  // Gear
  if (S.telPanels.g) {
    const ch = mkPanel(100, [0.5, 8.9], { ylab: "gear", yticksArr: [2, 4, 6, 8] });
    cornerLines(ch);
    for (const en of ents) {
      const p = svgEl("path", { d: stepPath(xs.map((x, i) => [x, en.tel.g[i]]), ch.x, ch.y), fill: "none", stroke: en.col, "stroke-width": 1.4 }, ch.plot);
      if (en.dash) p.setAttribute("stroke-dasharray", en.dash);
    }
    ch.chan = "g";
  }
  // RPM
  if (S.telPanels.n) {
    const vis = ents.flatMap(en => en.tel.n.filter((_, i) => inWin(i)));
    const ch = mkPanel(110, [Math.min(...vis) - 300, Math.max(...vis) + 300], { ylab: "rpm", yfmt: v => (v / 1000).toFixed(0) + "k" });
    cornerLines(ch);
    for (const en of ents) {
      const p = svgEl("path", { d: linePath(xs.map((x, i) => [x, en.tel.n[i]]), ch.x, ch.y), fill: "none", stroke: en.col, "stroke-width": 1.4 }, ch.plot);
      if (en.dash) p.setAttribute("stroke-dasharray", en.dash);
    }
    ch.chan = "n";
  }
  // DRS rows
  if (S.telPanels.d && hasDrs) {
    const rh = 15;
    const ch = mkPanel(ents.length * rh + 26, [0, 1], { ylab: "DRS", yticksArr: [], mb: 18 });
    ents.forEach((en, j) => {
      const cy = ch.mt + j * rh + rh / 2;
      svgEl("line", { x1: ch.ml, x2: ch.ml + ch.iw, y1: cy, y2: cy, stroke: "var(--grid)", "stroke-width": 1 }, ch.plot);
      let start = null;
      for (let i = 0; i <= N_TEL; i++) {
        const on = i < N_TEL && en.tel.d[i];
        if (on && start == null) start = i;
        if (!on && start != null) {
          svgEl("rect", { x: ch.x(xs[start]), y: cy - 5, width: Math.max(2, ch.x(xs[i - 1]) - ch.x(xs[start])), height: 10, rx: 2.5, fill: en.col, opacity: .85 }, ch.plot);
          start = null;
        }
      }
      svgEl("text", { x: ch.ml - 8, y: cy + 3, "text-anchor": "end", "font-size": 9, "font-weight": 700, fill: en.col, class: "num" }, ch.svg).textContent = en.e.drv;
    });
    ch.chan = "d";
  }
  // x-axis footer
  {
    const div = document.createElement("div"); div.className = "chart"; stack.appendChild(div);
    const ch = Chart(div, { h: 34, xd, yd: [0, 1], ml: 64, mr: 14, mt: 0, mb: 22, yticksArr: [], xfmt: v => (v / 1000).toFixed(v >= 1000 ? 1 : 2) + " km", xlab: "" });
    charts.push(ch);
  }

  legend(c3, ents.map(en => ({ color: en.col, label: en.label + " — " + fmtLap(en.lap.t), dash: !!en.dash })));

  /* ---- shared crosshair + readout ---- */
  const readout = document.createElement("div");
  readout.style.cssText = "position:absolute;top:6px;right:10px;background:var(--surface);border:1px solid var(--line2);border-radius:8px;padding:6px 9px;font-size:11px;box-shadow:var(--shadow);display:none;z-index:5;pointer-events:none";
  c3.style.position = "relative"; c3.appendChild(readout);
  const vlines = charts.map(ch => svgEl("line", { y1: ch.mt, y2: ch.mt + ch.ih, stroke: "var(--ink2)", "stroke-width": 1, opacity: 0 }, ch.svg));
  stack.addEventListener("pointermove", e => {
    const ref0 = charts[0];
    const rect0 = ref0.svg.getBoundingClientRect();
    const fx = (e.clientX - rect0.left) / rect0.width * ref0.W;
    if (fx < ref0.ml || fx > ref0.ml + ref0.iw) { hideCross(); return; }
    const xm = xd[0] + (fx - ref0.ml) / ref0.iw * (xd[1] - xd[0]);
    const r = Math.max(0, Math.min(1, xm / L));
    charts.forEach((ch, i) => { vlines[i].setAttribute("x1", ch.x(xm)); vlines[i].setAttribute("x2", ch.x(xm)); vlines[i].setAttribute("opacity", .55); });
    readout.style.display = "block";
    readout.innerHTML = `<div style="color:var(--ink3);margin-bottom:2px" class="num">${(xm / 1000).toFixed(3)} km</div><table>` + ents.map((en, i) => {
      const v = telAt(en.tel.v, r).toFixed(0), th = telAt(en.tel.th, r).toFixed(0), gg = Math.round(telAt(en.tel.g, r));
      const dt = i === 0 ? "" : ` · Δ<b>${((telAt(en.tel.t, r) - telAt(ref.tel.t, r)) / 1000).toFixed(2)}s</b>`;
      return `<tr><td><span class="drv-cell" style="gap:4px"><span class="dot" style="background:${en.col};height:10px"></span>${en.e.drv}</span></td><td class="num" style="padding-left:7px">${v} km/h · ${th}% · G${gg}${dt}</td></tr>`;
    }).join("") + "</table>";
    if (mapAPI) mapAPI.moveDots(r);
  });
  stack.addEventListener("pointerleave", hideCross);
  function hideCross() { vlines.forEach(v => v.setAttribute("opacity", 0)); readout.style.display = "none"; if (mapAPI) mapAPI.hideDots(); }

  // drag zoom on all panels
  for (const ch of charts) dragZoom(ch, dom => {
    S.telZoom = dom ? [Math.max(0, dom[0] / L), Math.min(1, dom[1] / L)] : null;
    HUB.render();
  });

  /* map dominance colouring uses same winners */
  if (mapAPI && ents.length >= 2) mapAPI.dominance(domWinner);
}

/* ---- time-loss decomposition: why is the slower lap slower ----
   The reference lap is partitioned completely into corner zones (lift/brake
   -> apex -> back to full throttle) and the straights between them, so the
   per-zone deltas provably sum to the total gap. Every label is a measured
   fact: braking point (m), minimum speed (km/h), throttle application (m). */
function refZones(tel, map) {
  const N = tel.v.length;
  const starts = [];
  for (let j = 2; j < N - 2; j++) if (tel.b[j] && !tel.b[j - 1]) starts.push(j);
  let zones = [];
  for (const bs of starts) {
    let lift = bs;
    for (let j = bs - 1; j > Math.max(0, bs - 30); j--) { if (tel.th[j] >= 95) { lift = j; break; } }
    let apex = bs, mv = 1e9;
    for (let j = bs; j < Math.min(bs + 50, N - 1); j++) { if (tel.v[j] < mv) { mv = tel.v[j]; apex = j; } else if (tel.v[j] > mv + 10) break; }
    let ex = Math.min(apex + 45, N - 1);
    for (let j = apex; j < Math.min(apex + 45, N - 1); j++) if (tel.th[j] >= 97 && tel.th[j + 1] >= 97) { ex = j; break; }
    zones.push({ lift, bs, apex, ex });
  }
  // merge chained corners (esses / chicanes) whose zones touch
  const merged = [];
  for (const z of zones) {
    const p = merged.at(-1);
    if (p && z.lift <= p.ex + 2) { p.ex = Math.max(p.ex, z.ex); p.apex2 = z.apex; }
    else merged.push({ ...z });
  }
  // name zones by the nearest corner to the apex
  for (const z of merged) {
    if (map && map.corners.length) {
      const dApex = z.apex / (N - 1) * map.len;
      let bestC = map.corners[0], bd = 1e9;
      for (const c of map.corners) { const dd = Math.abs(c.d - dApex); if (dd < bd) { bd = dd; bestC = c; } }
      z.name = "T" + bestC.n + (bestC.l || "") + (z.apex2 ? "+" : "");
    }
  }
  return merged;
}

function zoneFacts(zone, telA, telB, N) {
  const step = telA.len / (N - 1);
  const win0 = Math.max(0, zone.lift - 10), win1 = Math.min(N - 1, zone.apex + 6);
  const measure = tel => {
    let bs = null;
    for (let j = win0; j <= win1; j++) if (tel.b[j] && !tel.b[j - 1]) { bs = j; break; }
    let lift = bs ?? win1;
    for (let j = (bs ?? win1) - 1; j > Math.max(0, win0 - 15); j--) { if (tel.th[j] >= 95) { lift = j; break; } }
    let mv = 1e9;
    for (let j = win0; j <= Math.min(zone.ex, N - 1); j++) mv = Math.min(mv, tel.v[j]);
    let on = null;
    for (let j = zone.apex - 2; j < Math.min(zone.ex + 25, N - 1); j++) if (tel.th[j] >= 95 && tel.th[j + 1] >= 95) { on = j; break; }
    return { bs, lift, mv, on };
  };
  const A = measure(telA), B = measure(telB);
  const facts = [];
  if (A.bs != null && B.bs != null && Math.abs(B.bs - A.bs) >= 2)
    facts.push(`braked ${Math.round(Math.abs(B.bs - A.bs) * step)} m ${B.bs < A.bs ? "earlier" : "later"}`);
  else if (Math.abs(B.lift - A.lift) >= 2)
    facts.push(`lifted ${Math.round(Math.abs(B.lift - A.lift) * step)} m ${B.lift < A.lift ? "earlier" : "later"}`);
  if (Math.abs(B.mv - A.mv) >= 2) facts.push(`min speed ${B.mv < A.mv ? "−" : "+"}${Math.abs(Math.round(B.mv - A.mv))} km/h`);
  if (A.on != null && B.on != null && Math.abs(B.on - A.on) >= 2)
    facts.push(`full throttle ${Math.round(Math.abs(B.on - A.on) * step)} m ${B.on > A.on ? "later" : "earlier"}`);
  return facts;
}

function whyCard(root, ents) {
  const S = HUB.S;
  const ref = ents[0];
  const map = HUB.session(ref.e.sid).map || HUB.session().map;
  const N = ref.tel.v.length;
  if (!(S.whyIdx >= 1 && S.whyIdx < ents.length)) S.whyIdx = 1;
  const other = ents[S.whyIdx];

  const c = card(root, "Why the slower lap is slower", "the reference lap is split into corner zones and straights — the pieces sum to the whole gap, and every label is a measured fact");
  if (ents.length > 2) {
    const sel = document.createElement("select");
    sel.innerHTML = ents.slice(1).map((en, i) => `<option value="${i + 1}" ${i + 1 === S.whyIdx ? "selected" : ""}>${esc(en.label)} vs ${esc(ref.label)}</option>`).join("");
    sel.addEventListener("change", () => { S.whyIdx = +sel.value; HUB.render(); });
    c.querySelector(".right").appendChild(sel);
  }

  const zones = refZones(ref.tel, map);
  const dt = (tel, a, b) => tel.t[Math.min(b, N - 1)] - tel.t[Math.max(a, 0)];
  const segs = [];
  let cursor = 0;
  for (const z of zones) {
    if (z.lift > cursor + 1) segs.push({ kind: "straight", a: cursor, b: z.lift, name: `Straight → ${z.name || ""}` });
    segs.push({ kind: "entry", a: z.lift, b: Math.max(z.apex2 || z.apex, z.apex), name: z.name, zone: z });
    segs.push({ kind: "exit", a: Math.max(z.apex2 || z.apex, z.apex), b: z.ex, name: z.name, zone: z });
    cursor = z.ex;
  }
  if (cursor < N - 1) segs.push({ kind: "straight", a: cursor, b: N - 1, name: "Final straight" });
  for (const sg of segs) sg.d = dt(other.tel, sg.a, sg.b) - dt(ref.tel, sg.a, sg.b);

  const total = other.lap.t - ref.lap.t;
  const sumSegs = segs.reduce((a, s) => a + s.d, 0);

  // per corner: entry + exit combined, plus straights as their own rows
  const rowsMap = new Map();
  for (const sg of segs) {
    const key = sg.kind === "straight" ? "s:" + sg.a : "c:" + sg.a + sg.name;
    if (!rowsMap.has(key)) rowsMap.set(key, { name: sg.name, kind: sg.kind, d: 0, zone: sg.zone });
    rowsMap.get(key).d += sg.d;
  }
  const rows = [...rowsMap.values()].filter(r => Math.abs(r.d) >= 15).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 9);
  for (const r of rows) {
    r.facts = r.kind === "straight"
      ? [r.d > 0 ? "flat-out deficit (power / drag / clipping / tow)" : "flat-out gain (power / clipping / tow)"]
      : zoneFacts(r.zone, ref.tel, other.tel, N);
    if (!r.facts.length)
      r.facts = [r.d > 0 ? "carried less speed through the zone (line / grip)" : "carried more speed through the zone (line / grip)"];
  }
  const totals = { entry: 0, exit: 0, straight: 0 };
  for (const sg of segs) totals[sg.kind === "straight" ? "straight" : sg.kind] += sg.d;

  const maxAbs = Math.max(...rows.map(r => Math.abs(r.d)), 1);
  c.insertAdjacentHTML("beforeend", `
    <div class="why-head"><b class="num" style="font-size:17px">${fmtDelta(total)}s</b> — ${esc(other.label)} vs ${esc(ref.label)}
      <span class="hint">zones account for ${fmtDelta(sumSegs)}s${Math.abs(sumSegs - total) > 40 ? ` · ${fmtDelta(total - sumSegs)}s elsewhere (line variation between zones)` : ""}</span></div>
    <div class="why-totals">
      <span>Corner entries <b class="num">${fmtDelta(totals.entry, 2)}</b></span>
      <span>Corner exits <b class="num">${fmtDelta(totals.exit, 2)}</b></span>
      <span>Straights <b class="num">${fmtDelta(totals.straight, 2)}</b></span>
    </div>
    <table class="t why-t"><tbody>${rows.map(r => `
      <tr><td style="width:110px"><b>${esc(r.name || "?")}</b>${r.kind === "straight" ? "" : ""}</td>
      <td class="r num" style="width:70px;font-weight:700;color:${r.d > 0 ? "var(--red)" : "var(--green)"}">${fmtDelta(r.d, 2)}</td>
      <td style="width:130px"><div style="height:6px;border-radius:3px;background:var(--surface3);overflow:hidden"><div style="height:100%;width:${(Math.abs(r.d) / maxAbs * 100).toFixed(0)}%;background:${r.d > 0 ? "var(--red)" : "var(--green)"};float:${r.d > 0 ? "left" : "left"}"></div></div></td>
      <td class="hint">${r.facts.map(esc).join(" · ") || "—"}</td></tr>`).join("")}</tbody></table>
    <p class="note">Positive red = time lost by ${esc(other.e.drv)} in that zone, green = gained. Facts are read directly from the traces (braking point, minimum speed, throttle application); zones smaller than 0.015 s are folded into the totals.</p>`);
}

/* ---- track map ---- */
function drawTrackMap(cardEl, map, ents, L) {
  const rot = (map.rot || 0) * Math.PI / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const rx = (x, y) => x * cos - y * sin;
  const ry = (x, y) => x * sin + y * cos;
  const X = map.x.map((x, i) => rx(x, map.y[i]));
  const Y = map.y.map((y, i) => -ry(map.x[i], y));
  const pad = 700;
  const x0 = Math.min(...X) - pad, x1 = Math.max(...X) + pad, y0 = Math.min(...Y) - pad, y1 = Math.max(...Y) + pad;
  const div = document.createElement("div"); div.className = "chart"; cardEl.appendChild(div);
  const svg = svgEl("svg", { viewBox: `${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}`, role: "img", "aria-label": "Track map" }, div);
  svg.style.maxHeight = "440px";
  const sw = (x1 - x0) / 90;
  // base line
  svgEl("path", { d: X.map((x, i) => (i ? "L" : "M") + x.toFixed(0) + "," + Y[i].toFixed(0)).join("") + "Z", fill: "none", stroke: "var(--surface3)", "stroke-width": sw * 1.7, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  const segs = svgEl("g", {}, svg);
  const M = map.x.length;
  const ref = ents[0];

  function colorBy(colFn) {
    segs.innerHTML = "";
    const step = 2;
    for (let i = 0; i < M - step; i += step) {
      const col = colFn(i / (M - 1));
      svgEl("path", { d: `M${X[i].toFixed(0)},${Y[i].toFixed(0)}L${X[Math.min(i + step, M - 1)].toFixed(0)},${Y[Math.min(i + step, M - 1)].toFixed(0)}`, stroke: col, "stroke-width": sw, "stroke-linecap": "round", fill: "none" }, segs);
    }
  }
  // default: speed heat of reference lap (single-hue ramp)
  const vmin = Math.min(...ref.tel.v), vmax = Math.max(...ref.tel.v);
  colorBy(r => {
    const v = telAt(ref.tel.v, r), k = (v - vmin) / (vmax - vmin || 1);
    return `hsl(215 85% ${(30 + k * 42).toFixed(0)}%)`;
  });

  // corners
  for (const cn of map.corners) {
    const cxr = rx(cn.x, cn.y), cyr = -ry(cn.x, cn.y);
    const a = (cn.a || 0) * Math.PI / 180;
    const off = 780;
    const lx = rx(cn.x + off * Math.cos(a), cn.y + off * Math.sin(a));
    const ly = -ry(cn.x + off * Math.cos(a), cn.y + off * Math.sin(a));
    svgEl("line", { x1: cxr, y1: cyr, x2: lx, y2: ly, stroke: "var(--line2)", "stroke-width": sw / 6 }, svg);
    svgEl("circle", { cx: lx, cy: ly, r: sw * 1.05, fill: "var(--surface2)", stroke: "var(--line2)", "stroke-width": sw / 8 }, svg);
    svgEl("text", { x: lx, y: ly + sw * 0.42, "text-anchor": "middle", "font-size": sw * 1.15, "font-weight": 700, fill: "var(--ink2)", class: "num" }, svg).textContent = cn.n + (cn.l || "");
  }
  // start/finish
  svgEl("circle", { cx: X[0], cy: Y[0], r: sw * 0.7, fill: "var(--ink)", stroke: "var(--bg)", "stroke-width": sw / 5 }, svg);

  // hover dots per lap
  const dots = ents.map(en => svgEl("circle", { r: sw * 0.75, fill: en.col, stroke: "var(--bg)", "stroke-width": sw / 5, opacity: 0 }, svg));
  return {
    moveDots(r) {
      const f = r * (M - 1), i = Math.min(M - 2, Math.floor(f)), k = f - i;
      const px = X[i] + (X[i + 1] - X[i]) * k, py = Y[i] + (Y[i + 1] - Y[i]) * k;
      dots.forEach(d => { d.setAttribute("cx", px); d.setAttribute("cy", py); d.setAttribute("opacity", 1); });
    },
    hideDots() { dots.forEach(d => d.setAttribute("opacity", 0)); },
    dominance(domWinner) {
      const NSEG = domWinner.length;
      colorBy(r => ents[domWinner[Math.min(NSEG - 1, Math.floor(r * NSEG))]].col);
    },
  };
}

/* ---------- WEATHER ---------- */
function viewWeather(root) {
  const s = HUB.session();
  if (!s.weather.length) { root.innerHTML = `<div class="empty">No weather data for this session.</div>`; return; }
  const W = s.weather;
  const t0 = W[0][0], mins = w => (w[0] - t0) / 60000;
  const xd = [0, mins(W.at(-1)) + 1];
  const rain = W.some(w => w[6]);

  const stats = [
    { k: "Air temp", v: `${Math.min(...W.map(w => w[1]))}–${Math.max(...W.map(w => w[1]))} °C` },
    { k: "Track temp", v: `${Math.min(...W.map(w => w[2]))}–${Math.max(...W.map(w => w[2]))} °C` },
    { k: "Wind", v: `${Math.min(...W.map(w => w[4]))}–${Math.max(...W.map(w => w[4]))} m/s` },
    { k: "Humidity", v: `${Math.min(...W.map(w => w[3]))}–${Math.max(...W.map(w => w[3]))}%` },
    { k: "Rain", v: rain ? "YES" : "dry" },
  ];
  const sr = document.createElement("div"); sr.className = "stat-row";
  sr.innerHTML = stats.map(st => `<div class="stat"><div class="k">${st.k}</div><div class="v num">${st.v}</div></div>`).join("");
  root.appendChild(sr);

  const mkW = (title, series, o = {}) => {
    const c = card(root, title);
    const div = document.createElement("div"); div.className = "chart"; c.appendChild(div);
    const vals = series.flatMap(sr => sr.pts.map(p => p[1]).filter(v => v != null));
    const lo = o.lo ?? Math.min(...vals), hi = o.hi ?? Math.max(...vals);
    const padv = Math.max((hi - lo) * 0.15, 0.5);
    const ch = Chart(div, { h: 210, xd, yd: [lo - padv, hi + padv], xfmt: v => v + "m", xlab: "session time", yfmt: o.yfmt, label: title });
    // rain shading
    let rs = null;
    for (let i = 0; i <= W.length; i++) {
      const on = i < W.length && W[i][6];
      if (on && rs == null) rs = mins(W[i]);
      if (!on && rs != null) { svgEl("rect", { x: ch.x(rs), y: ch.mt, width: ch.x(mins(W[Math.min(i, W.length - 1)])) - ch.x(rs), height: ch.ih, fill: "var(--cmp-WET)", opacity: .12 }, ch.plot); rs = null; }
    }
    for (const sr2 of series)
      svgEl("path", { d: linePath(sr2.pts, ch.x, ch.y), fill: "none", stroke: sr2.col, "stroke-width": 2 }, ch.plot);
    legend(div, series.map(sr2 => ({ color: sr2.col, label: sr2.label })).concat(rain ? [{ color: "var(--cmp-WET)", label: "rainfall", dot: true }] : []));
    return ch;
  };
  mkW("Temperature (°C)", [
    { label: "track", col: "#f59e0b", pts: W.map(w => [mins(w), w[2]]) },
    { label: "air", col: "#60a5fa", pts: W.map(w => [mins(w), w[1]]) },
  ]);
  mkW("Wind speed (m/s)", [{ label: "wind", col: "#10b981", pts: W.map(w => [mins(w), w[4]]) }]);
  mkW("Humidity (%)", [{ label: "humidity", col: "#8b5cf6", pts: W.map(w => [mins(w), w[3]]) }]);
  mkW("Pressure (mbar)", [{ label: "pressure", col: "var(--ink2)", pts: W.map(w => [mins(w), w[7]]) }]);
}
