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
function clipLossPer(tel, straights) {
  const N = tel.v.length;
  return straights.map(s => {
    // find THIS lap's braking onset — drivers brake at different points than
    // the reference lap, and measuring to the ref's point falsely reads
    // "lift" for anyone braking earlier
    const lo = s.from, hiRef = Math.min(s.iEnd + 6, N - 1);
    let end = hiRef;
    for (let j = lo + 3; j <= hiRef; j++) if (tel.b[j]) { end = j; break; }
    if (end - lo < 6) return null;
    let vmax = -1, imax = -1;
    for (let j = lo; j < end; j++) if (tel.v[j] > vmax) { vmax = tel.v[j]; imax = j; }
    if (imax < 0) return null;
    // flat on the throttle from peak to just before their own braking point;
    // a real lift (throttle off before braking) is lift-and-coast, not clipping
    const stop = end - 1;
    for (let j = imax; j < stop; j++) if (tel.th[j] < 95) return null;
    return Math.max(0, vmax - tel.v[Math.max(stop - 1, imax)]);
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
    // clipping: races -> per-straight average over clean laps;
    // quali/practice -> per-straight loss on the fastest lap
    let per, clipN;
    if (isRace) {
      const clean = tels.filter(x => isClean(x.l));
      const use = clean.length ? clean : tels;
      const sums = straights.map(() => 0), ns = straights.map(() => 0);
      for (const x of use) {
        clipLossPer(x.tel, straights).forEach((v, i) => { if (v != null) { sums[i] += v; ns[i]++; } });
      }
      per = sums.map((v, i) => ns[i] ? v / ns[i] : null);
      clipN = use.length;
    } else {
      const fastest = [...tels].sort((a, b) => a.l.t - b.l.t)[0];
      per = clipLossPer(fastest.tel, straights);
      clipN = 1;
    }
    const clip = per.reduce((a, v) => a + (v || 0), 0);
    rows.push({ d, tops, per, clip, clipN });
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
  const cellMax = Math.max(...rows.flatMap(r => r.per.map(v => v || 0)), 1);
  const c2 = card(root, "Clipping ranking",
    `km/h given back between peak speed and the braking point while flat on the throttle · ${isRace ? "average per clean race lap, per straight" : "on each driver's fastest lap"} · "—" = lifted there${isRace ? " every lap" : ""}, so not measurable`);
  const w2 = document.createElement("div"); w2.className = "tblwrap"; c2.appendChild(w2);
  const heat = v => v == null ? "" : `background:rgba(250,204,21,${Math.min(0.5, v / cellMax * 0.5).toFixed(2)});`;
  w2.innerHTML = `<table class="t"><thead><tr><th class="r">#</th><th>Driver</th>` +
    straights.map((st, i) => `<th class="r">${esc(st.name || "S" + (i + 1))}${i === mainIdx ? " ★" : ""}</th>`).join("") +
    `<th class="r">Total /lap</th>${isRace ? '<th class="r">Laps</th>' : ""}</tr></thead><tbody>` +
    crows.map((r, i) => `<tr><td class="r num">${i + 1}</td><td>${drvCell(r.d)}</td>` +
      r.per.map(v => `<td class="r num" style="${heat(v)}">${v == null ? "—" : v < 0.05 ? "0" : "−" + v.toFixed(1)}</td>`).join("") +
      `<td class="r num" style="font-weight:700${i === 0 ? ";color:var(--yellow)" : ""}">−${r.clip.toFixed(1)}</td>${isRace ? `<td class="r num" style="color:var(--ink3)">${r.clipN}</td>` : ""}</tr>`).join("") +
    `</tbody></table>`;
  c2.insertAdjacentHTML("beforeend", `<p class="note">Ranked worst-first — the top of this table is the most energy-limited car. Laps with a lift between peak and braking are excluded (that's lift-and-coast, not clipping). A plateau can also be plain terminal velocity on a very long straight; compare cars on the <i>same</i> straight before concluding. High clipping + low top speed = energy-limited; low clipping + low top speed = draggy / big wing.</p>`);

  const most = [...rows].sort((a, b) => b.clip - a.clip)[0];
  const none = rows.filter(r => r.clip < 3).length;
  insights(root, [
    `Overall fastest: <b>${rows[0].d.abbr}</b> ${rows[0].tops[mainIdx]} km/h on the ${esc(straights[mainIdx].name || "main straight")}`,
    most && most.clip > 8 ? `Clipping the most: <b>${most.d.abbr}</b> — giving back ~${most.clip.toFixed(0)} km/h per lap before the braking zones (deployment running dry)` : "",
    none ? `${none} car${none > 1 ? "s" : ""} showing essentially no clipping` : "",
  ].filter(Boolean));
  root.insertBefore(root.lastChild, root.firstChild);
}
