/* ============ view E: straights — end-of-straight speeds & ERS clipping ============ */
"use strict";

/* find the straights on the reference lap: stretches ending at a braking onset,
   long and fast enough to matter */
function detectStraights(tel, map) {
  const N = tel.v.length, L = tel.len;
  const out = [];
  let from = 0;
  const ends = [];
  for (let i = 2; i < N; i++) if (tel.b[i] && !tel.b[i - 1] && !tel.b[i - 2]) ends.push(i);
  ends.push(N - 1); // start/finish straight ends at the line
  for (const i of ends) {
    let vmax = -1, imax = from;
    for (let j = from; j <= i; j++) if (tel.v[j] > vmax) { vmax = tel.v[j]; imax = j; }
    const len = (i - from) / (N - 1) * L;
    if (len >= 400 && vmax >= 210) {
      let name = "";
      if (map && map.corners.length) {
        const dEnd = i / (N - 1) * map.len;
        const next = map.corners.find(c => c.d >= dEnd - 40) || map.corners[0];
        name = "→ T" + next.n + (next.l || "");
      }
      out.push({ from, iEnd: i, iPeak: imax, vmax, len, name });
    }
    from = i;
  }
  const best = Math.max(...out.map(s => s.vmax));
  return out.filter(s => s.vmax >= best * 0.82).slice(0, 7);
}

/* km/h lost to clipping on one lap, per straight: peak speed minus speed at
   the braking point, counted only while the driver stays flat out — a lift
   (throttle off, lift-and-coast) is not clipping and returns null there */
/* which telemetry grid points sit on a dead-straight piece of track —
   speed falling there at full throttle cannot be cornering scrub */
function straightLineMask(map, N) {
  const M = map.x.length;
  const h = new Array(M).fill(0);
  for (let i = 1; i < M; i++) h[i] = Math.atan2(map.y[i] - map.y[i - 1], map.x[i] - map.x[i - 1]);
  h[0] = h[1];
  const segLen = map.len / (M - 1);
  const mask = new Array(N).fill(false);
  for (let j = 0; j < N; j++) {
    const i = Math.max(2, Math.min(M - 3, Math.round(j / (N - 1) * (M - 1))));
    let dh = 0;
    for (let k = i - 2; k <= i + 1; k++) {
      let a = h[k + 1] - h[k];
      while (a > Math.PI) a -= 2 * Math.PI;
      while (a < -Math.PI) a += 2 * Math.PI;
      dh += Math.abs(a);
    }
    mask[j] = dh / (4 * segLen) < 0.0016;   // curve radius beyond ~600 m ≈ straight line
  }
  return mask;
}

/* per straight: km/h given back while flat on the throttle before this lap's
   own braking point. Lifts simply don't contribute (they're lift-and-coast,
   not clipping) instead of invalidating the whole zone. slLoss counts only
   the part lost on dead-straight track — the superclipping signature. */
function clipLossPer(tel, straights, slMask) {
  const N = tel.v.length;
  // light smoothing so ±1 km/h quantisation wiggle doesn't sum into fake loss
  const vs = tel.v.map((v, i) => i > 0 && i < N - 1 ? (tel.v[i - 1] + v + tel.v[i + 1]) / 3 : v);
  return straights.map(s => {
    const hiRef = Math.min(s.iEnd + 6, N - 1);
    // this lap may still be braking / feeding throttle out of the previous
    // corner past the reference lap's exit point — skip the whole corner-exit
    // zone (up to the first quarter of the window) before looking for the
    // braking onset that ends the straight
    let lo = s.from;
    const lead = Math.min(hiRef - 6, s.from + Math.max(6, Math.round((hiRef - s.from) * 0.25)));
    while (lo < lead && (tel.b[lo] || tel.th[lo] < 90)) lo++;
    let end = hiRef;
    for (let j = lo + 2; j <= hiRef; j++) if (tel.b[j]) { end = j; break; }
    if (end - lo < 6) return null;
    let loss = 0, slLoss = 0, any = false;
    for (let j = lo + 1; j < end - 1; j++) {
      if (tel.b[j] || tel.th[j] < 95 || tel.th[j - 1] < 95) continue;
      any = true;
      const dv = vs[j - 1] - vs[j];
      if (dv > 0.4) {
        loss += dv;
        if (slMask && slMask[j] && slMask[j - 1]) slLoss += dv;
      }
    }
    return any ? { loss, slLoss } : null;
  });
}

/* the circuit with its straights highlighted and labelled */
function straightsMap(cardEl, map, straights, best) {
  const rot = (map.rot || 0) * Math.PI / 180;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const M = map.x.length;
  const X = map.x.map((x, i) => x * cos - map.y[i] * sin);
  const Y = map.y.map((y, i) => -(map.x[i] * sin + y * cos));
  const pad = 1500;
  const x0 = Math.min(...X) - pad, x1 = Math.max(...X) + pad, y0 = Math.min(...Y) - pad, y1 = Math.max(...Y) + pad;
  const cx0 = (Math.min(...X) + Math.max(...X)) / 2, cy0 = (Math.min(...Y) + Math.max(...Y)) / 2;
  const div = document.createElement("div"); div.className = "chart"; cardEl.appendChild(div);
  const svg = svgEl("svg", { viewBox: `${x0.toFixed(0)} ${y0.toFixed(0)} ${(x1 - x0).toFixed(0)} ${(y1 - y0).toFixed(0)}`, role: "img", "aria-label": "Straights map" }, div);
  svg.style.maxHeight = "460px";
  const sw = (x1 - x0) / 95;
  svgEl("path", { d: X.map((x, i) => (i ? "L" : "M") + x.toFixed(0) + "," + Y[i].toFixed(0)).join("") + "Z", fill: "none", stroke: "var(--surface3)", "stroke-width": sw * 1.5, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);

  const N = 280; // telemetry grid
  const vmaxAll = Math.max(...straights.map(s => s.vmax));
  straights.forEach((s, si) => {
    const i0 = Math.round(s.from / (N - 1) * (M - 1)), i1 = Math.round(s.iEnd / (N - 1) * (M - 1));
    let d = "";
    for (let i = i0; i <= Math.min(i1, M - 1); i++) d += (d ? "L" : "M") + X[i].toFixed(0) + "," + Y[i].toFixed(0);
    const hot = s.vmax === vmaxAll;
    svgEl("path", { d, fill: "none", stroke: hot ? "var(--accent)" : "var(--ink2)", "stroke-width": sw, "stroke-linecap": "round", opacity: hot ? 1 : .8 }, svg);
    // arrowhead at the braking point
    const ie = Math.min(i1, M - 2);
    const dx = X[ie + 1] - X[ie], dy = Y[ie + 1] - Y[ie], n = Math.hypot(dx, dy) || 1;
    const ax = X[ie], ay = Y[ie], ux = dx / n, uy = dy / n;
    svgEl("path", { d: `M${ax + ux * sw * 2},${ay + uy * sw * 2} L${ax - uy * sw},${ay + ux * sw} L${ax + uy * sw},${ay - ux * sw} Z`, fill: hot ? "var(--accent)" : "var(--ink2)" }, svg);
    // label pushed outward from the circuit centre at the straight's midpoint
    const im = Math.round((i0 + Math.min(i1, M - 1)) / 2);
    const vx = X[im] - cx0, vy = Y[im] - cy0, vn = Math.hypot(vx, vy) || 1;
    const lx = X[im] + vx / vn * sw * 7, ly = Y[im] + vy / vn * sw * 7;
    const b = best[si];
    const t1 = svgEl("text", { x: lx, y: ly - sw * 0.9, "text-anchor": "middle", "font-size": sw * 1.7, "font-weight": 800, fill: hot ? "var(--accent)" : "var(--ink)" }, svg);
    t1.textContent = s.name || "S" + (si + 1);
    const t2 = svgEl("text", { x: lx, y: ly + sw * 1.2, "text-anchor": "middle", "font-size": sw * 1.35, fill: "var(--ink2)", class: "num" }, svg);
    t2.textContent = b ? `${b.v} km/h · ${b.abbr}` : "";
  });
  cardEl.insertAdjacentHTML("beforeend", `<p class="note">Highlighted stretches are the detected straights; arrowheads mark the braking points. Labels show the session's top speed there and who set it — <span style="color:var(--accent)">red</span> is the fastest straight.</p>`);
}

/* best minimum speed per corner per driver — downforce & balance in numbers */
function cornerSpeeds(root, s, map, drivers) {
  if (!map || !map.corners.length) return;
  const N = 280, win = 90; // metres searched around the apex
  const rows = [];
  for (const d of drivers) {
    const tels = s.laps.filter(l => l.drv === d.abbr && !l.del && s.tel[l.drv + "-" + l.lap])
      .sort((a, b) => a.t - b.t).slice(0, 8).map(l => s.tel[l.drv + "-" + l.lap]);
    if (!tels.length) continue;
    const mins = map.corners.map(c => {
      const j0 = Math.max(0, Math.floor((c.d - win) / map.len * (N - 1)));
      const j1 = Math.min(N - 1, Math.ceil((c.d + win) / map.len * (N - 1)));
      let best = 0;
      for (const tel of tels) {
        let m = 1e9;
        for (let j = j0; j <= j1 && j < tel.v.length; j++) m = Math.min(m, tel.v[j]);
        if (m < 1e9) best = Math.max(best, m);
      }
      return best || null;
    });
    rows.push({ d, mins });
  }
  if (rows.length < 2) return;
  const colBest = map.corners.map((_, i) => Math.max(...rows.map(r => r.mins[i] || 0)));
  // corner classes from the session-best minimum
  const cls = colBest.map(v => v < 150 ? 0 : v < 230 ? 1 : 2);
  const clsName = ["Slow", "Med", "Fast"];
  for (const r of rows) {
    r.avg = [0, 1, 2].map(k => {
      const vals = r.mins.filter((v, i) => v != null && cls[i] === k);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
  }
  rows.sort((a, b) => (b.avg[2] ?? 0) - (a.avg[2] ?? 0));
  const avgBest = [0, 1, 2].map(k => Math.max(...rows.map(r => r.avg[k] ?? 0)));

  const c = card(root, "Corner minimum speeds", "best apex speed per corner across each driver's 8 fastest laps · Slow < 150 · Med < 230 · Fast ≥ 230 km/h at the session-best apex");
  const w = document.createElement("div"); w.className = "tblwrap"; c.appendChild(w);
  w.innerHTML = `<table class="t"><thead><tr><th>Driver</th>` +
    [0, 1, 2].map(k => `<th class="r" style="border-right:${k === 2 ? "2px solid var(--line2)" : "none"}">${clsName[k]} avg</th>`).join("") +
    map.corners.map(cn => `<th class="r">T${cn.n}${cn.l || ""}</th>`).join("") +
    `</tr></thead><tbody>` +
    rows.map(r => `<tr><td>${drvCell(r.d)}</td>` +
      [0, 1, 2].map(k => `<td class="r num" style="font-weight:700;border-right:${k === 2 ? "2px solid var(--line2)" : "none"};${r.avg[k] != null && Math.round(r.avg[k]) >= Math.round(avgBest[k]) ? "color:var(--purple)" : ""}">${r.avg[k] != null ? Math.round(r.avg[k]) : "—"}</td>`).join("") +
      r.mins.map((v, i) => `<td class="r num ${v === colBest[i] ? "best" : ""}">${v ?? "—"}</td>`).join("") + `</tr>`).join("") +
    `</tbody></table>`;
  c.insertAdjacentHTML("beforeend", `<p class="note">Sorted by fast-corner average — the purest read on downforce${HUB.data.year >= 2026 ? " (Z-mode grip)" : ""}. Slow corners lean on mechanical grip and traction. Purple = best of the field. Apex windows are ±${win} m around each corner, so chicanes share readings.</p>`);
}

function viewStraights(root) {
  const s = HUB.session();
  if (telHolder(root, s, `downloading ${SNAMES[s.id] || s.id} telemetry for straight-line analysis…`)) return;
  const isRace = s.id === "R" || s.id === "S";
  const map = s.map;
  const refTel = map && s.tel[map.refLap];
  if (!refTel) { root.innerHTML = `<div class="empty">No telemetry in this session.</div>`; return; }
  const straights = detectStraights(refTel, map);
  if (!straights.length) { root.innerHTML = `<div class="empty">Could not identify straights here.</div>`; return; }
  const mainIdx = straights.indexOf(straights.reduce((a, b) => b.vmax > a.vmax ? b : a));
  const slMask = straightLineMask(map, refTel.v.length);

  const rows = [];
  for (const d of s.drivers) {
    const lapRecs = s.laps.filter(l => l.drv === d.abbr && s.tel[l.drv + "-" + l.lap] && !l.del);
    if (!lapRecs.length) continue;
    const tels = lapRecs.map(l => ({ l, tel: s.tel[l.drv + "-" + l.lap] }));
    const tops = straights.map(st => {
      let v = 0;
      for (const { tel } of tels)
        for (let j = st.from; j <= Math.min(st.iEnd, tel.v.length - 1); j++) if (tel.v[j] > v) v = tel.v[j];
      return Math.round(v);
    });
    // clipping: races -> per-straight average over clean laps;
    // quali/practice -> per-straight loss on the fastest lap
    let per, clipN;
    if (isRace) {
      const clean = tels.filter(x => isClean(x.l));
      const use = clean.length ? clean : tels;
      const sums = straights.map(() => 0), sl = straights.map(() => 0), ns = straights.map(() => 0);
      for (const x of use) {
        clipLossPer(x.tel, straights, slMask).forEach((v, i) => { if (v) { sums[i] += v.loss; sl[i] += v.slLoss; ns[i]++; } });
      }
      per = sums.map((v, i) => ns[i] ? { loss: v / ns[i], slLoss: sl[i] / ns[i] } : null);
      clipN = use.length;
    } else {
      const fastest = [...tels].sort((a, b) => a.l.t - b.l.t)[0];
      per = clipLossPer(fastest.tel, straights, slMask);
      clipN = 1;
    }
    const clip = per.reduce((a, v) => a + (v ? v.loss : 0), 0);
    const slClip = per.reduce((a, v) => a + (v ? v.slLoss : 0), 0);
    rows.push({ d, tops, per, clip, slClip, clipN });
  }
  if (!rows.length) { root.innerHTML = `<div class="empty">No usable laps.</div>`; return; }
  rows.sort((a, b) => b.tops[mainIdx] - a.tops[mainIdx]);
  const colBest = straights.map((_, i) => Math.max(...rows.map(r => r.tops[i])));
  const bestBy = straights.map((_, i) => {
    const r = rows.find(r => r.tops[i] === colBest[i]);
    return { v: colBest[i], abbr: r ? r.d.abbr : "" };
  });
  const clipMax = Math.max(...rows.map(r => r.clip), 1);

  const cm = card(root, "Where the straights are");
  straightsMap(cm, map, straights, bestBy);

  const c = card(root, "End-of-straight top speeds", `${SNAMES[s.id] || s.id} · session maximum per straight (best tow / engine mode across all laps)`);
  const w = document.createElement("div"); w.className = "tblwrap"; c.appendChild(w);
  w.innerHTML = `<table class="t"><thead><tr><th>Driver</th>` +
    straights.map((st, i) => `<th class="r" title="${Math.round(st.len)} m straight">${esc(st.name || "S" + (i + 1))}${i === mainIdx ? " ★" : ""}</th>`).join("") +
    `</tr></thead><tbody>` +
    rows.map(r => `<tr><td>${drvCell(r.d)}</td>` +
      r.tops.map((v, i) => `<td class="r num ${v === colBest[i] ? "best" : ""}">${v}</td>`).join("") + `</tr>`).join("") +
    `</tbody></table>`;
  c.insertAdjacentHTML("beforeend", `<p class="note"><b>★</b> = fastest straight (rows sorted by it) · speeds in km/h · top speeds mix engine modes, tows and wing levels, so treat single-lap outliers with care.</p>`);

  /* ---- clipping ranking: per straight + overall ---- */
  const crows = [...rows].sort((a, b) => b.clip - a.clip);
  const cellMax = Math.max(...rows.flatMap(r => r.per.map(v => v ? v.loss : 0)), 1);
  const c2 = card(root, "Clipping ranking",
    `km/h given back while flat on the throttle, per straight · ${isRace ? "average per clean race lap" : "on each driver's fastest lap"} · ‡ = superclipping signature`);
  const w2 = document.createElement("div"); w2.className = "tblwrap"; c2.appendChild(w2);
  const heat = v => v == null ? "" : `background:rgba(250,204,21,${Math.min(0.5, v.loss / cellMax * 0.5).toFixed(2)});`;
  const cellTxt = v => {
    if (v == null) return "—";
    if (v.loss < 1.5) return "0";
    const sup = v.slLoss >= 12;
    return `−${v.loss.toFixed(1)}${sup ? '<span title="speed falling on dead-straight track at full throttle — harvesting against the engine (superclipping) likely" style="color:var(--red);font-weight:800">‡</span>' : ""}`;
  };
  w2.innerHTML = `<table class="t"><thead><tr><th class="r">#</th><th>Driver</th>` +
    straights.map((st, i) => `<th class="r">${esc(st.name || "S" + (i + 1))}${i === mainIdx ? " ★" : ""}</th>`).join("") +
    `<th class="r">Total /lap</th><th class="r">on straights</th>${isRace ? '<th class="r">Laps</th>' : ""}</tr></thead><tbody>` +
    crows.map((r, i) => `<tr><td class="r num">${i + 1}</td><td>${drvCell(r.d)}</td>` +
      r.per.map(v => `<td class="r num" style="${heat(v)}">${cellTxt(v)}</td>`).join("") +
      `<td class="r num" style="font-weight:700${i === 0 ? ";color:var(--yellow)" : ""}">−${r.clip.toFixed(1)}</td>
       <td class="r num" style="color:var(--ink2)">−${r.slClip.toFixed(1)}</td>${isRace ? `<td class="r num" style="color:var(--ink3)">${r.clipN}</td>` : ""}</tr>`).join("") +
    `</tbody></table>`;
  c2.insertAdjacentHTML("beforeend", `<p class="note">Ranked worst-first. <b>Total /lap</b> sums every km/h lost at full throttle before the braking points; <b>on straights</b> counts only the part lost on dead-straight track (curve radius &gt; ~600 m), where cornering scrub can't be the explanation — that portion is pure deployment clipping, and <span style="color:var(--red);font-weight:800">‡</span> marks zones where it exceeds 12 km/h: the signature of the MGU-K harvesting against the engine (superclipping). Loss through flat-out esses (e.g. Maggotts–Becketts) mixes clipping with cornering scrub, so compare cars on the same column rather than across circuits. Lifts don't count — that's lift-and-coast, not clipping.</p>`);

  if (HUB.data.year >= 2026) c2.insertAdjacentHTML("beforeend",
    `<p class="note">2026 note: electrical deployment tapers off above ~290 km/h by regulation, so some loss at very high speed is the rulebook, not a weakness — the gaps between cars are still real.</p>`);

  /* ---- corner minimum speeds: the other half of the car-performance story ---- */
  cornerSpeeds(root, s, map, rows.map(r => r.d));

  const most = [...rows].sort((a, b) => b.clip - a.clip)[0];
  const none = rows.filter(r => r.clip < 3).length;
  insights(root, [
    `Overall fastest: <b>${rows[0].d.abbr}</b> ${rows[0].tops[mainIdx]} km/h on the ${esc(straights[mainIdx].name || "main straight")}`,
    most && most.clip > 8 ? `Clipping the most: <b>${most.d.abbr}</b> — giving back ~${most.clip.toFixed(0)} km/h per lap before the braking zones (deployment running dry)` : "",
    none ? `${none} car${none > 1 ? "s" : ""} showing essentially no clipping` : "",
  ].filter(Boolean));
  root.insertBefore(root.lastChild, root.firstChild);
}
