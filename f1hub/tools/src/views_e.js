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

/* km/h lost to clipping on one lap: peak speed minus speed at the braking
   point, counted only while the driver stays flat out — a lift (throttle off,
   lift-and-coast) is not clipping and is excluded */
function clipLoss(tel, straights) {
  let loss = 0;
  for (const s of straights) {
    const hi = Math.min(s.iEnd, tel.v.length - 1);
    let vmax = -1, imax = -1;
    for (let j = s.from; j < hi; j++) if (tel.v[j] > vmax) { vmax = tel.v[j]; imax = j; }
    if (imax < 0) continue;
    let flat = true;
    for (let j = imax; j < hi; j++) if (tel.th[j] < 95 || tel.b[j]) { flat = false; break; }
    if (flat) loss += Math.max(0, vmax - tel.v[hi - 1]);
  }
  return loss;
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
    const lx = X[im] + vx / vn * sw * 6.2, ly = Y[im] + vy / vn * sw * 6.2;
    const b = best[si];
    const t1 = svgEl("text", { x: lx, y: ly - sw * 0.7, "text-anchor": "middle", "font-size": sw * 1.25, "font-weight": 800, fill: hot ? "var(--accent)" : "var(--ink)" }, svg);
    t1.textContent = s.name || "S" + (si + 1);
    const t2 = svgEl("text", { x: lx, y: ly + sw * 0.9, "text-anchor": "middle", "font-size": sw * 1.05, fill: "var(--ink2)", class: "num" }, svg);
    t2.textContent = b ? `${b.v} km/h · ${b.abbr}` : "";
  });
  cardEl.insertAdjacentHTML("beforeend", `<p class="note">Highlighted stretches are the detected straights; arrowheads mark the braking points. Labels show the session's top speed there and who set it — <span style="color:var(--accent)">red</span> is the fastest straight.</p>`);
}

function viewStraights(root) {
  const s = HUB.session();
  const isRace = s.id === "R" || s.id === "S";
  const map = s.map;
  const refTel = map && s.tel[map.refLap];
  if (!refTel) { root.innerHTML = `<div class="empty">No telemetry in this session.</div>`; return; }
  const straights = detectStraights(refTel, map);
  if (!straights.length) { root.innerHTML = `<div class="empty">Could not identify straights here.</div>`; return; }
  const mainIdx = straights.indexOf(straights.reduce((a, b) => b.vmax > a.vmax ? b : a));

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
    // clipping: races -> average over clean laps; quali/practice -> the fastest lap
    let clip, clipN;
    if (isRace) {
      const clean = tels.filter(x => isClean(x.l));
      const use = clean.length ? clean : tels;
      clip = use.reduce((a, x) => a + clipLoss(x.tel, straights), 0) / use.length;
      clipN = use.length;
    } else {
      const fastest = [...tels].sort((a, b) => a.l.t - b.l.t)[0];
      clip = clipLoss(fastest.tel, straights);
      clipN = 1;
    }
    rows.push({ d, tops, clip, clipN });
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

  const c = card(root, "End-of-straight top speeds",
    `${SNAMES[s.id] || s.id} · session maximum per straight · clipping = km/h lost between peak and braking point (${isRace ? "average over clean race laps" : "on each driver's fastest lap"})`);
  const w = document.createElement("div"); w.className = "tblwrap"; c.appendChild(w);
  w.innerHTML = `<table class="t"><thead><tr><th>Driver</th>` +
    straights.map((st, i) => `<th class="r" title="${Math.round(st.len)} m straight">${esc(st.name || "S" + (i + 1))}${i === mainIdx ? " ★" : ""}</th>`).join("") +
    `<th class="r">Clipping</th><th></th></tr></thead><tbody>` +
    rows.map(r => `<tr><td>${drvCell(r.d)}</td>` +
      r.tops.map((v, i) => `<td class="r num ${v === colBest[i] ? "best" : ""}">${v}</td>`).join("") +
      `<td class="r num" style="${r.clip > clipMax * 0.66 ? "color:var(--yellow);font-weight:700" : ""}">−${r.clip.toFixed(1)} km/h</td>
       <td style="min-width:90px"><div style="height:5px;border-radius:3px;background:var(--surface3);overflow:hidden"><div style="height:100%;width:${(r.clip / clipMax * 100).toFixed(0)}%;background:${r.clip > clipMax * 0.66 ? "var(--yellow)" : teamCol(r.d.color)}"></div></div></td></tr>`).join("") +
    `</tbody></table>`;
  c.insertAdjacentHTML("beforeend", `<p class="note"><b>★</b> = fastest straight (rows sorted by it) · speeds in km/h · <b>Clipping</b> sums, across all straights, the speed a car gave back between its peak and the braking point while still flat on the throttle — the signature of electrical deployment running out. Laps with a lift in that zone are excluded, so lift-and-coast doesn't count.</p>
  <p class="note">⚠ Read with care: top speeds mix engine modes, tows and wing levels. A plateau can also be terminal velocity on a very long straight — compare cars on the <i>same</i> straight: if one keeps building speed where another flatlines lower, that one is clipping. High clipping + low top speed = energy-limited; low clipping + low top speed = draggy / big wing.</p>`);

  const most = [...rows].sort((a, b) => b.clip - a.clip)[0];
  const none = rows.filter(r => r.clip < 3).length;
  insights(root, [
    `Overall fastest: <b>${rows[0].d.abbr}</b> ${rows[0].tops[mainIdx]} km/h on the ${esc(straights[mainIdx].name || "main straight")}`,
    most && most.clip > 8 ? `Clipping the most: <b>${most.d.abbr}</b> — giving back ~${most.clip.toFixed(0)} km/h per lap before the braking zones (deployment running dry)` : "",
    none ? `${none} car${none > 1 ? "s" : ""} showing essentially no clipping` : "",
  ].filter(Boolean));
  root.insertBefore(root.lastChild, root.firstChild);
}
