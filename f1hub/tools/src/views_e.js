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
      // name it after the corner the braking zone leads into
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
  // keep the significant ones, track order
  const best = Math.max(...out.map(s => s.vmax));
  return out.filter(s => s.vmax >= best * 0.82).slice(0, 7);
}

/* metres of "clipping" on one lap: full throttle but speed has stopped building
   well before the braking point — deployment has run out */
function clipMetres(tel, straights) {
  const N = tel.v.length, L = tel.len;
  let m = 0;
  for (const s of straights) {
    let runLen = 0;
    for (let j = Math.max(s.from + 3, 1); j < s.iEnd; j++) {
      const full = tel.th[j] >= 96 && !tel.b[j];
      const flat = (tel.v[j] - tel.v[j - 1]) <= 0.2;
      const nearTop = tel.v[j] >= tel.v[s.iPeak] - 10;
      if (full && flat && nearTop) runLen++;
      else { if (runLen >= 3) m += runLen / (N - 1) * L; runLen = 0; }
    }
    if (runLen >= 3) m += runLen / (N - 1) * L;
  }
  return m;
}

function viewStraights(root) {
  const s = HUB.session();
  const map = s.map;
  const refTel = map && s.tel[map.refLap];
  if (!refTel) { root.innerHTML = `<div class="empty">No telemetry in this session.</div>`; return; }
  const straights = detectStraights(refTel, map);
  if (!straights.length) { root.innerHTML = `<div class="empty">Could not identify straights here.</div>`; return; }
  const mainIdx = straights.indexOf(straights.reduce((a, b) => b.vmax > a.vmax ? b : a));

  const rows = [];
  for (const d of s.drivers) {
    const lapKeys = s.laps.filter(l => l.drv === d.abbr && s.tel[l.drv + "-" + l.lap] && !l.del);
    if (!lapKeys.length) continue;
    const tels = lapKeys.map(l => ({ l, tel: s.tel[l.drv + "-" + l.lap] }));
    // top speed per straight: max across the driver's laps in a window before the braking point
    const tops = straights.map(st => {
      let v = 0;
      for (const { tel } of tels) {
        for (let j = st.from; j <= Math.min(st.iEnd, tel.v.length - 1); j++) if (tel.v[j] > v) v = tel.v[j];
      }
      return Math.round(v);
    });
    // clipping: median over the driver's 5 fastest laps (push laps)
    const fastest = [...tels].sort((a, b) => a.l.t - b.l.t).slice(0, 5);
    const clip = Math.round(median(fastest.map(x => clipMetres(x.tel, straights))) || 0);
    rows.push({ d, tops, clip, n: tels.length });
  }
  if (!rows.length) { root.innerHTML = `<div class="empty">No usable laps.</div>`; return; }
  rows.sort((a, b) => b.tops[mainIdx] - a.tops[mainIdx]);
  const colBest = straights.map((_, i) => Math.max(...rows.map(r => r.tops[i])));
  const clipMax = Math.max(...rows.map(r => r.clip), 1);

  const c = card(root, "End-of-straight top speeds", `${SNAMES[s.id] || s.id} · session maximum per straight (best tow / engine mode across all laps)`);
  const w = document.createElement("div"); w.className = "tblwrap"; c.appendChild(w);
  w.innerHTML = `<table class="t"><thead><tr><th>Driver</th>` +
    straights.map((st, i) => `<th class="r" title="${Math.round(st.len)} m straight">${esc(st.name || "S" + (i + 1))}${i === mainIdx ? " ★" : ""}</th>`).join("") +
    `<th class="r">Clipping</th><th></th></tr></thead><tbody>` +
    rows.map(r => `<tr><td>${drvCell(r.d)}</td>` +
      r.tops.map((v, i) => `<td class="r num ${v === colBest[i] ? "best" : ""}">${v}</td>`).join("") +
      `<td class="r num">${r.clip} m</td>
       <td style="min-width:90px"><div style="height:5px;border-radius:3px;background:var(--surface3);overflow:hidden"><div style="height:100%;width:${(r.clip / clipMax * 100).toFixed(0)}%;background:${r.clip > clipMax * 0.65 ? "var(--yellow)" : teamCol(r.d.color)}"></div></div></td></tr>`).join("") +
    `</tbody></table>`;
  c.insertAdjacentHTML("beforeend", `<p class="note"><b>★</b> = fastest straight (rows sorted by it) · speeds in km/h · <b>Clipping</b> = metres per push lap spent at full throttle with speed no longer building before the braking point — the signature of electrical deployment running out. Median over each driver's 5 fastest laps.</p>
  <p class="note">⚠ Read with care: top speeds mix engine modes, tows and wing levels — a car can be "fast" here because it ran a monster mode for one lap or caught a tow. And a plateau can be genuine deployment clipping <i>or</i> a car simply hitting terminal velocity on a long straight — compare cars on the <i>same</i> straight: if one keeps building speed where another flatlines at a lower number, that one is clipping. High clipping + low top speed = energy-limited; low clipping + low top speed = draggy / big wing.</p>`);

  const most = [...rows].sort((a, b) => b.clip - a.clip)[0];
  const least = [...rows].filter(r => r.clip < 40).length;
  insights(root, [
    `Overall fastest: <b>${rows[0].d.abbr}</b> ${rows[0].tops[mainIdx]} km/h on the ${esc(straights[mainIdx].name || "main straight")}`,
    most && most.clip > 80 ? `Clipping the most: <b>${most.d.abbr}</b> (~${most.clip} m per push lap flat-out without accelerating — deployment running dry)` : "",
    least ? `${least} car${least > 1 ? "s" : ""} showing essentially no clipping` : "",
  ].filter(Boolean));
  root.insertBefore(root.lastChild, root.firstChild);
}
