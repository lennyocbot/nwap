/* ============ view F: race replay ============ */
/* Every race lap carries a cumulative-time channel on a distance grid, so a
   car's track position at any session time is reconstructable from data —
   no simulation, just interpolation of what actually happened. */
"use strict";

function replayCard(root, s) {
  if (!(s.id === "R" || s.id === "S") || !s.map) return;
  if (!s.tel) {
    const c = card(root, "Race replay");
    c.insertAdjacentHTML("beforeend", `<div class="empty"><div class="bar" style="margin:0 auto 14px"><i></i></div>replay appears once the telemetry finishes downloading…</div>`);
    ensureTel(s.id);
    return;
  }
  if (!Object.keys(s.tel).length) return;
  const map = s.map, N = 280, M = map.x.length;

  // per-driver lap index
  const cars = [];
  for (const d of s.drivers) {
    const laps = s.laps.filter(l => l.drv === d.abbr && l.st != null && l.t != null).sort((a, b) => a.lap - b.lap);
    if (!laps.length) continue;
    cars.push({ d, laps, lastEnd: laps.at(-1).st + laps.at(-1).t, finPos: d.pos ?? 99 });
  }
  if (cars.length < 2) return;
  const t0 = Math.min(...cars.map(c => c.laps[0].st));
  const t1 = Math.max(...cars.map(c => c.lastEnd));

  const c = card(root, "Race replay", "reconstructed from each lap's telemetry — press play");
  const wrap = document.createElement("div"); wrap.className = "rp-wrap"; c.appendChild(wrap);
  const left = document.createElement("div"); wrap.appendChild(left);
  const right = document.createElement("div"); right.className = "rp-board"; wrap.appendChild(right);

  // controls
  const ctr = document.createElement("div"); ctr.className = "rp-controls";
  ctr.innerHTML = `
    <button class="btn pri" id="rpPlay">▶ Play</button>
    <select id="rpSpeed"><option>2</option><option>5</option><option selected>15</option><option>30</option><option>60</option><option>120</option></select><span class="hint">× speed</span>
    <span class="rp-lap num" id="rpLap"></span><span class="rp-flag" id="rpFlag"></span>
    <input type="range" id="rpScrub" min="0" max="${Math.ceil((t1 - t0) / 1000)}" value="0">`;
  left.appendChild(ctr);

  // map svg
  const rot = (map.rot || 0) * Math.PI / 180, cos = Math.cos(rot), sin = Math.sin(rot);
  const X = map.x.map((x, i) => x * cos - map.y[i] * sin);
  const Y = map.y.map((y, i) => -(map.x[i] * sin + y * cos));
  const pad = 700;
  const x0 = Math.min(...X) - pad, x1 = Math.max(...X) + pad, y0 = Math.min(...Y) - pad, y1 = Math.max(...Y) + pad;
  const div = document.createElement("div"); div.className = "chart"; left.appendChild(div);
  const svg = svgEl("svg", { viewBox: `${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}`, role: "img", "aria-label": "Race replay" }, div);
  svg.style.maxHeight = "480px";
  const sw = (x1 - x0) / 95;
  svgEl("path", { d: X.map((x, i) => (i ? "L" : "M") + x.toFixed(0) + "," + Y[i].toFixed(0)).join("") + "Z", fill: "none", stroke: "var(--surface3)", "stroke-width": sw * 1.6, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  svgEl("circle", { cx: X[0], cy: Y[0], r: sw * 0.55, fill: "var(--ink3)" }, svg);
  for (const cn of map.corners)
    svgEl("text", { x: X[Math.round(cn.d / map.len * (M - 1)) % M], y: Y[Math.round(cn.d / map.len * (M - 1)) % M] - sw, "text-anchor": "middle", "font-size": sw * 0.95, fill: "var(--ink3)", class: "num" }, svg).textContent = cn.n;
  const dots = new Map();
  for (const car of cars) {
    const g = svgEl("g", {}, svg);
    const dot = svgEl("circle", { r: sw * 0.85, fill: teamCol(car.d.color), stroke: "#fff", "stroke-width": sw * 0.22 }, g);
    dots.set(car.d.abbr, { g, dot });
  }

  /* position of a car at session time T. Progress = laps completed + lap
     fraction, and it FREEZES at the car's last real datapoint — a retired car
     keeps the progress it had and sinks down the order as others pass it. */
  function locate(car, T) {
    if (T >= car.lastEnd) return { done: true, prog: car.laps.at(-1).lap, end: car.lastEnd };
    let lapRec = null, idx = 0;
    for (let i = car.laps.length - 1; i >= 0; i--) {
      if (car.laps[i].st <= T) { lapRec = car.laps[i]; idx = i; break; }
    }
    if (!lapRec) return { pre: true, prog: -((car.d.grid || 30) / 1000), r: 0 };
    const tel = s.tel[car.d.abbr + "-" + lapRec.lap];
    const dtc = Math.max(0, Math.min(T - lapRec.st, lapRec.t));
    let r;
    if (tel) {
      // binary search cumulative time channel
      let lo = 0, hi = N - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; (tel.t[m] <= dtc) ? lo = m : hi = m; }
      const span = tel.t[hi] - tel.t[lo] || 1;
      r = (lo + (dtc - tel.t[lo]) / span) / (N - 1);
    } else r = dtc / (lapRec.t || 1);
    return { r: Math.max(0, Math.min(1, r)), lapRec, prog: lapRec.lap - 1 + r, inPit: lapRec.in || lapRec.out };
  }

  const flagEl = ctr.querySelector("#rpFlag"), lapEl = ctr.querySelector("#rpLap");
  const scrub = ctr.querySelector("#rpScrub"), playBtn = ctr.querySelector("#rpPlay"), spdSel = ctr.querySelector("#rpSpeed");
  const total = s.totalLaps || Math.max(...s.laps.map(l => l.lap));
  let T = t0, playing = false, lastFrame = 0, lastBoard = 0;

  function draw(now) {
    if (!svg.isConnected) { playing = false; return; }   // view left — stop the loop
    if (playing) {
      const dt = lastFrame ? Math.min(now - lastFrame, 200) : 0;
      T = Math.min(T + dt * (+spdSel.value), t1);
      if (T >= t1) { playing = false; playBtn.textContent = "▶ Play"; }
    }
    lastFrame = now;
    const states = cars.map(car => ({ car, st: locate(car, T) }));
    for (const { car, st } of states) {
      const el = dots.get(car.d.abbr);
      if (st.done) { el.g.setAttribute("opacity", 0); continue; }
      const f = (st.r || 0) * (M - 1), i = Math.min(M - 2, Math.floor(f)), k = f - i;
      // pre-start cars wait on the line at half opacity
      el.g.setAttribute("opacity", st.pre ? 0.45 : st.inPit ? 0.35 : 1);
      el.dot.setAttribute("cx", X[i] + (X[i + 1] - X[i]) * k);
      el.dot.setAttribute("cy", Y[i] + (Y[i + 1] - Y[i]) * k);
      el.dot.setAttribute("stroke", st.lapRec && st.lapRec.cmp ? cmpCol(st.lapRec.cmp) : "#fff");
    }
    // leaderboard + lap/flag, throttled
    if (now - lastBoard > 350) {
      lastBoard = now;
      // order: progress, then who reached their final progress first (that IS
      // the finishing order for cars that end on the same lap), then grid
      const sorted = [...states].sort((a, b) => (b.st.prog - a.st.prog)
        || ((a.st.end ?? 9e15) - (b.st.end ?? 9e15))
        || ((a.car.d.grid ?? 99) - (b.car.d.grid ?? 99)));
      const leader = sorted.find(x => !x.st.done && !x.st.pre);
      // until the field is properly away, show the grid — lap-1 start times in
      // the source data are staggered and would invent fake gaps
      const gridPhase = !leader || leader.st.prog < 0.03;
      const board = gridPhase
        ? [...states].sort((a, b) => (a.car.d.grid ?? 99) - (b.car.d.grid ?? 99))
        : sorted;
      const leadLap = leader ? Math.min(total, Math.floor(Math.max(0, leader.st.prog)) + 1) : total;
      lapEl.textContent = `Lap ${leadLap}/${total}`;
      scrub.value = Math.round((T - t0) / 1000);
      // flag from any lap record at the leader's lap
      let w = 0;
      for (const l of s.laps) if (l.lap === leadLap) { const f = tsFlags(l.ts); w = Math.max(w, f.red ? 3 : f.sc ? 2 : f.vsc ? 1 : 0); }
      flagEl.className = "rp-flag" + (w >= 3 ? " red" : w >= 1 ? " sc" : "");
      flagEl.textContent = w >= 3 ? "RED FLAG" : w === 2 ? "SAFETY CAR" : w === 1 ? "VIRTUAL SC" : "";
      const leaderLapTime = leader && leader.st.lapRec ? leader.st.lapRec.t : 95000;
      right.innerHTML = `<table>` + board.map((x, i) => {
        const gapP = i === 0 ? null : Math.max(0, board[0].st.prog - x.st.prog);
        const lappedBy = Math.floor(gapP ?? 0);
        const gapTxt = x.st.done ? (x.car.d.status && !/Finished|\+/.test(x.car.d.status) ? "OUT" : "FIN")
          : gridPhase ? (x.car.d.grid ? `P${x.car.d.grid} grid` : "pit lane")
            : i === 0 ? "Leader"
              : lappedBy >= 1 ? `+${lappedBy}L`
                : `+${(gapP * leaderLapTime / 1000).toFixed(1)}`;
        const cmp = x.st.lapRec && x.st.lapRec.cmp;
        return `<tr class="${x.st.done && gapTxt === "OUT" ? "out" : ""}"><td class="num" style="color:var(--ink3)">${i + 1}</td>
          <td><span class="drv-cell" style="gap:5px"><span class="dot" style="background:${teamCol(x.car.d.color)}"></span>${x.car.d.abbr}</span></td>
          <td>${cmp ? `<span class="rp-tyre" style="border-color:${cmpCol(cmp)}"></span>` : ""}</td>
          <td class="r num">${gapTxt}</td></tr>`;
      }).join("") + `</table><p class="hint" style="margin:6px 0 0">gaps ≈ track-position × leader lap time · tyre ring = current compound · dimmed dot = in the pits</p>`;
    }
    requestAnimationFrame(draw);
  }
  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "⏸ Pause" : "▶ Play";
    if (playing && T >= t1) T = t0;
  });
  scrub.addEventListener("input", () => { T = t0 + (+scrub.value) * 1000; });
  requestAnimationFrame(draw);
}
