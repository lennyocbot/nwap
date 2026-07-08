/* ============ views A: driver rail, overview, pace ============ */
"use strict";

/* ---------- driver rail ---------- */
function driverRail(root, opts = {}) {
  const s = HUB.session();
  // phones: collapse the 22-chip rail behind a one-line toggle
  if (innerWidth < 640) {
    const holder = document.createElement("div");
    const btn = document.createElement("button");
    btn.className = "btn rail-toggle";
    btn.innerHTML = `Drivers · <b>${HUB.S.sel.size}</b>/${s.drivers.length} selected <span style="color:var(--ink3)">${HUB.S.railOpen ? "▴" : "▾"}</span>`;
    btn.addEventListener("click", () => { HUB.S.railOpen = !HUB.S.railOpen; HUB.render(); });
    holder.appendChild(btn);
    root.appendChild(holder);
    if (!HUB.S.railOpen) { holder.style.marginBottom = "12px"; return; }
  }
  const wrap = document.createElement("div");
  wrap.className = "drv-rail";
  wrap.innerHTML = `<span class="lbl">Drivers</span>`;
  const order = [...s.drivers].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  for (const d of order) {
    const on = HUB.S.sel.has(d.abbr);
    const c = document.createElement("button");
    c.className = "chip " + (on ? "on" : "off");
    c.innerHTML = `<span class="dot" style="background:${teamCol(d.color)}"></span>${d.abbr}`;
    c.title = `${d.name} — ${d.team} (double-click to solo)`;
    c.addEventListener("click", () => { HUB.S.sel.has(d.abbr) ? HUB.S.sel.delete(d.abbr) : HUB.S.sel.add(d.abbr); HUB.render(); });
    c.addEventListener("dblclick", () => { HUB.S.sel = new Set([d.abbr]); HUB.render(); });
    wrap.appendChild(c);
  }
  const mk = (label, fn) => {
    const b = document.createElement("button"); b.className = "rail-btn"; b.textContent = label;
    b.addEventListener("click", fn); wrap.appendChild(b);
  };
  mk("All", () => { HUB.S.sel = new Set(s.drivers.map(d => d.abbr)); HUB.render(); });
  mk("None", () => { HUB.S.sel = new Set(); HUB.render(); });
  mk("Top 10", () => { HUB.S.sel = new Set(order.slice(0, 10).map(d => d.abbr)); HUB.render(); });
  mk("Leaders", () => {
    const seen = new Set(), pick = [];
    for (const d of order) { if (!seen.has(d.team)) { seen.add(d.team); pick.push(d.abbr); } }
    HUB.S.sel = new Set(pick); HUB.render();
  });
  root.appendChild(wrap);
}
function selDrivers() {
  const s = HUB.session();
  return [...s.drivers].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99)).filter(d => HUB.S.sel.has(d.abbr));
}
function card(root, title, subtitle) {
  const c = document.createElement("div"); c.className = "card";
  if (title) {
    const h = document.createElement("h3");
    h.innerHTML = esc(title) + (subtitle ? ` <span class="sub">${esc(subtitle)}</span>` : "") + `<span class="right"></span>`;
    c.appendChild(h);
  }
  root.appendChild(c);
  return c;
}
function drvCell(d) {
  return `<span class="drv-cell"><span class="dot" style="background:${teamCol(d.color)}"></span>${esc(d.abbr)} <span class="team">${esc(d.team)}</span></span>`;
}
function insights(root, arr) {
  if (!arr.length) return;
  const el = document.createElement("div"); el.className = "insights";
  el.innerHTML = arr.map(t => `<div class="insight">${t}</div>`).join("");
  root.appendChild(el);
}

/* ---------- practice standings (computed from laps) ---------- */
function practiceStandings(s) {
  const rows = [];
  for (const d of s.drivers) {
    const laps = s.laps.filter(l => l.drv === d.abbr);
    const timed = laps.filter(l => l.t != null && !l.del);
    const best = timed.length ? timed.reduce((a, b) => a.t < b.t ? a : b) : null;
    rows.push({ d, best, n: laps.length });
  }
  rows.sort((a, b) => (a.best ? a.best.t : 1e12) - (b.best ? b.best.t : 1e12));
  return rows;
}

/* ---------- OVERVIEW ---------- */
function viewOverview(root) {
  const s = HUB.session();
  const isRace = s.id === "R" || s.id === "S";
  const isQ = s.id === "Q" || s.id === "SQ";

  // ---- headline stats ----
  const stats = [];
  const timed = s.laps.filter(l => l.t != null && !l.del);
  const fl = timed.length ? timed.reduce((a, b) => a.t < b.t ? a : b) : null;
  const flD = fl && HUB.driver(fl.drv);
  if (isRace) {
    const p1 = s.drivers.find(d => d.pos === 1), p2 = s.drivers.find(d => d.pos === 2);
    if (p1) stats.push({ k: s.id === "R" ? "Winner" : "Sprint winner", v: p1.abbr, c: teamCol(p1.color), s: p1.team });
    if (p2 && p2.time != null) stats.push({ k: "Margin", v: fmtDelta(p2.time) + "s", s: "to " + p2.abbr });
    if (fl) stats.push({ k: "Fastest lap", v: fmtLap(fl.t), c: flD && teamCol(flD.color), s: `${fl.drv} · lap ${fl.lap}` });
    const movers = s.drivers.filter(d => d.grid && d.pos).map(d => ({ d, g: d.grid - d.pos })).sort((a, b) => b.g - a.g);
    if (movers.length && movers[0].g > 0) stats.push({ k: "Biggest mover", v: `+${movers[0].g}`, c: teamCol(movers[0].d.color), s: `${movers[0].d.abbr} · P${movers[0].d.grid}→P${movers[0].d.pos}` });
    const scLaps = new Set(), vscLaps = new Set();
    for (const l of s.laps) { const f = tsFlags(l.ts); if (f.sc) scLaps.add(l.lap); else if (f.vsc) vscLaps.add(l.lap); }
    stats.push({ k: "SC / VSC laps", v: `${scLaps.size} / ${vscLaps.size}`, s: scLaps.size ? "laps " + [...scLaps].sort((a, b) => a - b).join(", ").slice(0, 24) : "clean race" });
    const dnf = s.drivers.filter(d => d.status && !/Finished|\+/.test(d.status));
    stats.push({ k: "Retirements", v: String(dnf.length), s: dnf.map(d => d.abbr).join(", ") || "none" });
  } else if (isQ) {
    const p1 = s.drivers.find(d => d.pos === 1);
    if (p1) stats.push({ k: s.id === "Q" ? "Pole" : "Sprint pole", v: p1.abbr, c: teamCol(p1.color), s: fmtLap(p1.q3 ?? p1.q2 ?? p1.q1) });
    const p2 = s.drivers.find(d => d.pos === 2);
    if (p1 && p2) { const t1 = p1.q3 ?? p1.q2, t2 = p2.q3 ?? p2.q2; if (t1 && t2) stats.push({ k: "Gap to P2", v: fmtDelta(t2 - t1) + "s", s: p2.abbr }); }
    if (fl) stats.push({ k: "Best lap", v: fmtLap(fl.t), s: `${fl.drv} · ${fl.cmp || ""}` });
  } else {
    const st = practiceStandings(s)[0];
    if (st && st.best) stats.push({ k: "P1", v: st.d.abbr, c: teamCol(st.d.color), s: fmtLap(st.best.t) });
    if (fl) stats.push({ k: "Best lap", v: fmtLap(fl.t), s: `${fl.drv} · ${fl.cmp || ""}` });
    stats.push({ k: "Laps run", v: String(s.laps.length), s: "all drivers" });
  }
  if (s.weather.length) {
    const air = s.weather.map(w => w[1]).filter(v => v != null), trk = s.weather.map(w => w[2]).filter(v => v != null);
    const rain = s.weather.some(w => w[6]);
    stats.push({ k: "Air / Track", v: `${Math.min(...air).toFixed(0)}–${Math.max(...air).toFixed(0)}° / ${Math.min(...trk).toFixed(0)}–${Math.max(...trk).toFixed(0)}°`, s: rain ? "rain during session" : "dry" });
  }
  const sr = document.createElement("div"); sr.className = "stat-row";
  sr.innerHTML = stats.map(st => `<div class="stat"><div class="k">${esc(st.k)}</div><div class="v">${st.c ? `<span class="dot" style="background:${st.c}"></span>` : ""}<span class="num">${esc(st.v)}</span></div><div class="s num">${esc(st.s || "")}</div></div>`).join("");
  root.appendChild(sr);

  // ---- results table ----
  const c1 = card(root, SNAMES[s.id] + " classification");
  const wrap = document.createElement("div"); wrap.className = "tblwrap"; c1.appendChild(wrap);
  let html = "";
  if (isRace) {
    html = `<table class="t"><thead><tr><th class="r">P</th><th>Driver</th><th class="r">Grid</th><th class="r">+/−</th><th class="r">Time / Gap</th><th class="r">Best lap</th><th>Stops</th><th class="r">Pts</th><th>Status</th></tr></thead><tbody>` +
      s.drivers.filter(d => d.pos).sort((a, b) => a.pos - b.pos).map(d => {
        const laps = s.laps.filter(l => l.drv === d.abbr);
        const best = laps.filter(l => l.t != null && !l.del).reduce((a, b) => !a || b.t < a.t ? b : a, null);
        const stops = laps.filter(l => l.in).length;
        const stints = [...new Map(laps.filter(l => l.cmp).map(l => [l.stint, l.cmp])).values()];
        const diff = d.grid ? d.grid - d.pos : null;
        const diffH = diff == null ? "" : diff > 0 ? `<span class="pos-gain">▲${diff}</span>` : diff < 0 ? `<span class="pos-loss">▼${-diff}</span>` : `<span class="pos-same">•</span>`;
        const t = d.pos === 1 ? fmtLap(d.time) : (d.time != null ? fmtDelta(d.time) : (d.status || ""));
        return `<tr><td class="r num">${d.pos}</td><td>${drvCell(d)}</td><td class="r num">${d.grid ?? "—"}</td><td class="r">${diffH}</td><td class="r num">${t}</td><td class="r num ${best && fl && best.t === fl.t ? "best" : ""}">${best ? fmtLap(best.t) : "—"}</td><td>${stints.map(c => cmpDot(c)).join(" ")}</td><td class="r num">${d.points || ""}</td><td class="num" style="color:var(--ink3)">${esc(d.status || "")}</td></tr>`;
      }).join("") + "</tbody></table>";
  } else if (isQ) {
    const seg = s.id === "SQ" ? "SQ" : "Q";
    const best = { 1: null, 2: null, 3: null };
    for (const d of s.drivers) { for (const i of [1, 2, 3]) { const v = d["q" + i]; if (v != null && (!best[i] || v < best[i])) best[i] = v; } }
    html = `<table class="t"><thead><tr><th class="r">P</th><th>Driver</th><th class="r">${seg}1</th><th class="r">${seg}2</th><th class="r">${seg}3</th><th class="r">Gap</th></tr></thead><tbody>` +
      s.drivers.filter(d => d.pos).sort((a, b) => a.pos - b.pos).map(d => {
        const bt = d.q3 ?? d.q2 ?? d.q1, p1 = s.drivers.find(x => x.pos === 1), p1t = p1 && (p1.q3 ?? p1.q2 ?? p1.q1);
        const cell = i => { const v = d["q" + i]; return `<td class="r num ${v != null && v === best[i] ? "best" : ""}">${fmtLap(v)}</td>`; };
        const cut = (s.id === "Q" || s.id === "SQ") && (d.pos === 15 || d.pos === 10) ? ' style="border-bottom:2px solid var(--line2)"' : "";
        return `<tr${cut}><td class="r num">${d.pos}</td><td>${drvCell(d)}</td>${cell(1)}${cell(2)}${cell(3)}<td class="r num">${d.pos === 1 ? "—" : (bt != null && p1t != null && d.q3 != null ? fmtDelta(bt - p1t) : "")}</td></tr>`;
      }).join("") + "</tbody></table>";
  } else {
    const rows = practiceStandings(s);
    const p1t = rows[0] && rows[0].best ? rows[0].best.t : null;
    html = `<table class="t"><thead><tr><th class="r">P</th><th>Driver</th><th class="r">Best</th><th class="r">Gap</th><th>Tyre</th><th class="r">Laps</th></tr></thead><tbody>` +
      rows.map((r, i) => `<tr><td class="r num">${i + 1}</td><td>${drvCell(r.d)}</td><td class="r num ${i === 0 ? "best" : ""}">${r.best ? fmtLap(r.best.t) : "—"}</td><td class="r num">${r.best && p1t != null && i > 0 ? fmtDelta(r.best.t - p1t) : ""}</td><td>${r.best && r.best.cmp ? cmpDot(r.best.cmp) : ""}</td><td class="r num">${r.n}</td></tr>`).join("") + "</tbody></table>";
  }
  wrap.innerHTML = html;

  // ---- race control ----
  if (s.rcm.length) {
    const c2 = card(root, "Race control", s.rcm.length + " messages");
    const seg = document.createElement("div"); seg.className = "seg mini";
    const cats = [["All", () => true], ["Flags", m => m.flag], ["SC/VSC", m => /SAFETY|VSC/i.test(m.msg || "")], ["Penalties", m => /PENALTY|INVESTIGATION|WARNING/i.test(m.msg || "")], ["Deleted laps", m => /DELETED/i.test(m.msg || "")]];
    let cur = 0;
    const wrap2 = document.createElement("div"); wrap2.className = "tblwrap"; wrap2.style.maxHeight = "340px"; wrap2.style.overflowY = "auto";
    const draw = () => {
      const rows = s.rcm.filter(cats[cur][1]);
      wrap2.innerHTML = `<table class="t"><thead><tr><th>Time</th><th class="r">Lap</th><th>Flag</th><th>Message</th></tr></thead><tbody>` +
        rows.map(m => `<tr><td class="num" style="color:var(--ink3)">${esc((m.time || "").slice(11, 19))}</td><td class="r num">${m.lap ?? ""}</td><td>${m.flag ? `<span class="tag" style="background:var(--surface3)">${esc(m.flag)}</span>` : ""}</td><td style="white-space:normal">${esc(m.msg)}</td></tr>`).join("") + "</tbody></table>";
      seg.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i === cur));
    };
    cats.forEach(([label], i) => {
      const b = document.createElement("button"); b.textContent = label;
      b.addEventListener("click", () => { cur = i; draw(); });
      seg.appendChild(b);
    });
    c2.querySelector(".right").appendChild(seg);
    c2.appendChild(wrap2);
    draw();
  }
}

/* ---------- PACE ---------- */
function paceFilter(l, medByDrv) {
  const S = HUB.S;
  if (l.t == null) return false;
  if (S.showOff) return true;
  if (l.in || l.out || l.del) return false;
  const med = medByDrv[l.drv];
  return !(med && l.t > med * 1.07);
}
function viewPace(root) {
  const s = HUB.session(), S = HUB.S;
  const isRace = s.id === "R" || s.id === "S";
  driverRail(root);

  const c = card(root, "Lap times", "click any lap to add it to Telemetry compare");
  const right = c.querySelector(".right");
  right.innerHTML = `
    <div class="seg mini" id="cmode"><button ${S.colorMode === "team" ? 'class="on"' : ""}>Team</button><button ${S.colorMode === "compound" ? 'class="on"' : ""}>Compound</button></div>
    ${isRace ? `<label class="toggle"><input type="checkbox" id="fuel" ${S.fuelOn ? "checked" : ""}>fuel-corr</label>
    <input type="range" id="fuelk" min="0" max="0.12" step="0.005" value="${S.fuelK}" style="width:70px" title="fuel effect s/lap">
    <span class="hint num" id="fuelv">${S.fuelK.toFixed(3)} s/lap</span>` : ""}
    <label class="toggle"><input type="checkbox" id="outl" ${S.showOff ? "checked" : ""}>all laps</label>`;
  const [bTeam, bCmp] = right.querySelectorAll("#cmode button");
  bTeam.addEventListener("click", () => { S.colorMode = "team"; HUB.render(); });
  bCmp.addEventListener("click", () => { S.colorMode = "compound"; HUB.render(); });
  right.querySelector("#outl").addEventListener("change", e => { S.showOff = e.target.checked; HUB.render(); });
  if (isRace) {
    right.querySelector("#fuel").addEventListener("change", e => { S.fuelOn = e.target.checked; HUB.render(); });
    right.querySelector("#fuelk").addEventListener("input", e => { S.fuelK = +e.target.value; right.querySelector("#fuelv").textContent = S.fuelK.toFixed(3) + " s/lap"; });
    right.querySelector("#fuelk").addEventListener("change", () => { HUB.save(); if (S.fuelOn) HUB.render(); });
  }

  const drvs = selDrivers();
  if (!drvs.length) { c.insertAdjacentHTML("beforeend", `<div class="empty">No drivers selected — pick some above.</div>`); return; }

  const medByDrv = {};
  for (const d of s.drivers) {
    const v = s.laps.filter(l => l.drv === d.abbr && isClean(l)).map(l => l.t);
    medByDrv[d.abbr] = median(v);
  }
  const pts = [];
  for (const d of drvs) for (const l of s.laps) if (l.drv === d.abbr && paceFilter(l, medByDrv)) pts.push(l);
  if (!pts.length) { c.insertAdjacentHTML("beforeend", `<div class="empty">No representative laps.</div>`); return; }

  const fc = l => fuelCorr(l, s.id);
  const vals = pts.map(fc);
  const maxLap = Math.max(...pts.map(l => l.lap));
  const lo = Math.min(...vals) - 400;
  const hi = S.showOff ? Math.max(...vals) + 400 : quantile(vals, 0.94) + 900;

  const div = document.createElement("div"); div.className = "chart"; c.appendChild(div);
  const ch = Chart(div, {
    h: 380, mr: 42, xd: [0.5, maxLap + 0.5], yd: [lo, hi],
    xfmt: v => Number.isInteger(v) ? v : "", yfmt: v => fmtLap(Math.round(v)),
    xlab: "Lap", ylab: S.fuelOn && isRace ? "fuel-corrected lap time" : "lap time", label: "Lap time chart"
  });

  // SC / VSC bands
  if (isRace) {
    const worst = {};
    for (const l of s.laps) {
      const f = tsFlags(l.ts);
      const w = f.red ? 3 : f.sc ? 2 : f.vsc ? 1 : 0;
      worst[l.lap] = Math.max(worst[l.lap] || 0, w);
    }
    for (const lap in worst) {
      if (!worst[lap]) continue;
      const fill = worst[lap] === 3 ? "var(--band-red)" : worst[lap] === 2 ? "var(--band-sc)" : "var(--band-vsc)";
      svgEl("rect", { x: ch.x(lap - 0.5), y: ch.mt, width: ch.x(+lap + 0.5) - ch.x(lap - 0.5), height: ch.ih, fill }, ch.plot);
    }
  }
  // lines + dots
  const dotNodes = [], dotLaps = [];
  for (const d of drvs) {
    const laps = pts.filter(l => l.drv === d.abbr).sort((a, b) => a.lap - b.lap);
    const lp = [];
    let prev = null;
    for (const l of laps) { if (prev != null && l.lap - prev > 1) lp.push(null); lp.push([l.lap, fc(l)]); prev = l.lap; }
    const col = teamCol(d.color);
    const path = svgEl("path", { d: linePath(lp, ch.x, ch.y), fill: "none", stroke: col, "stroke-width": 1.6, opacity: .85 }, ch.plot);
    if (drvDash(d.abbr)) path.setAttribute("stroke-dasharray", drvDash(d.abbr));
    for (const l of laps) {
      const fillc = S.colorMode === "compound" ? cmpCol(l.cmp) : col;
      const cx = ch.x(l.lap), cy = ch.y(fc(l));
      const vis = svgEl("circle", { cx, cy, r: pts.length > 400 ? 2.6 : 3.4, fill: fillc, stroke: "var(--surface)", "stroke-width": 1.2, "pointer-events": "none" }, ch.plot);
      if (l.pb) vis.setAttribute("stroke", "var(--green)");
      // generous invisible hit target so laps are tappable on touch screens
      const hit = svgEl("circle", { cx, cy, r: 9, fill: "transparent", cursor: "pointer" }, ch.plot);
      dotNodes.push(hit); dotLaps.push(l);
      hit.addEventListener("click", () => addCompare(s.id, l.drv, l.lap));
    }
  }
  // direct labels at line ends, de-collided
  const endLabels = [];
  for (const d of drvs) {
    const laps = pts.filter(l => l.drv === d.abbr).sort((a, b) => a.lap - b.lap);
    if (!laps.length) continue;
    const last = laps.at(-1);
    endLabels.push({ y: ch.y(fc(last)), x: ch.x(last.lap) + 6, txt: d.abbr, col: teamCol(d.color) });
  }
  spreadLabels(endLabels, 11, ch.mt + 4, ch.mt + ch.ih - 2);
  for (const L of endLabels)
    svgEl("text", { x: Math.min(L.x, ch.ml + ch.iw + 4), y: L.y + 3.5, "font-size": 10, "font-weight": 700, fill: L.col, class: "num" }, ch.svg).textContent = L.txt;
  hoverMarks(dotNodes, i => {
    const l = dotLaps[i], d = HUB.driver(l.drv), f = tsFlags(l.ts);
    return `<div class="t-title">${esc(l.drv)} — lap ${l.lap}${l.pb ? " · PB" : ""}${l.del ? " · DELETED" : ""}</div>
      <table><tr><td>Time</td><td class="num"><b>${fmtLap(l.t)}</b>${S.fuelOn && isRace ? ` <span style="color:var(--ink3)">(fc ${fmtLap(Math.round(fc(l)))})</span>` : ""}</td></tr>
      <tr><td>Sectors</td><td class="num">${fmtSec(l.s1)} / ${fmtSec(l.s2)} / ${fmtSec(l.s3)}</td></tr>
      <tr><td>Tyre</td><td>${l.cmp ? `${esc(l.cmp)} · ${l.life} laps` : "—"}</td></tr>
      ${l.pos ? `<tr><td>Position</td><td class="num">P${l.pos}</td></tr>` : ""}
      ${!f.green ? `<tr><td>Track</td><td>${f.sc ? "Safety Car" : f.vsc ? "VSC" : f.red ? "Red flag" : "Yellow"}</td></tr>` : ""}
      <tr><td colspan="2" style="color:var(--ink3)">click to add to Telemetry</td></tr></table>`;
  });
  legend(div.parentElement, S.colorMode === "compound"
    ? ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"].filter(cc => pts.some(l => l.cmp === cc)).map(cc => ({ color: cmpCol(cc), label: cc, dot: true }))
    : [...new Map(drvs.map(d => [d.team, d])).values()].map(d => ({ color: teamCol(d.color), label: d.team, dot: true })));
  if (isRace) legend(div.parentElement, [{ color: "var(--band-sc)", label: "SC band", dot: true }, { color: "var(--band-vsc)", label: "VSC band", dot: true }]);

  // ---- pace distribution ----
  const c2 = card(root, "Race pace distribution", "clean green-flag laps only" + (S.fuelOn && isRace ? " · fuel-corrected" : ""));
  const rows = [];
  for (const d of drvs) {
    const v = s.laps.filter(l => l.drv === d.abbr && isClean(l)).map(l => fuelCorr(l, s.id));
    if (v.length >= 3) rows.push({ d, v, med: median(v), q1: quantile(v, .25), q3: quantile(v, .75), p5: quantile(v, .05), p95: quantile(v, .95) });
  }
  rows.sort((a, b) => a.med - b.med);
  if (rows.length < 2) { c2.insertAdjacentHTML("beforeend", `<div class="empty">Not enough clean laps.</div>`); }
  else {
    const div2 = document.createElement("div"); div2.className = "chart"; c2.appendChild(div2);
    const xlo = Math.min(...rows.map(r => r.p5)) - 250, xhi = Math.max(...rows.map(r => r.p95)) + 250;
    const rh = 26, H = rows.length * rh + 46;
    const ch2 = Chart(div2, { h: H, xd: [xlo, xhi], yd: [0, rows.length], ml: 100, mb: 30, yticksArr: [], xfmt: v => fmtLap(Math.round(v)), xlab: "lap time", label: "Pace distribution box plot" });
    const boxes = [];
    rows.forEach((r, i) => {
      const cy = ch2.mt + (i + .5) * (ch2.ih / rows.length), col = teamCol(r.d.color);
      svgEl("text", { x: ch2.ml - 10, y: cy + 4, "text-anchor": "end", "font-size": 11.5, "font-weight": 700, fill: col, class: "num" }, ch2.svg).textContent = r.d.abbr;
      svgEl("line", { x1: ch2.x(r.p5), x2: ch2.x(r.p95), y1: cy, y2: cy, stroke: col, "stroke-width": 1.4, opacity: .7 }, ch2.plot);
      const bx = svgEl("rect", { x: ch2.x(r.q1), y: cy - 7, width: Math.max(2, ch2.x(r.q3) - ch2.x(r.q1)), height: 14, fill: col, opacity: .38, rx: 3, stroke: col, "stroke-width": 1 }, ch2.plot);
      svgEl("line", { x1: ch2.x(r.med), x2: ch2.x(r.med), y1: cy - 8, y2: cy + 8, stroke: col, "stroke-width": 2.4 }, ch2.plot);
      svgEl("text", { x: Math.min(ch2.x(r.p95) + 7, ch2.ml + ch2.iw - 108), y: cy + 3.5, "font-size": 10, fill: "var(--ink3)", class: "num" }, ch2.svg).textContent = `${fmtLap(Math.round(r.med))} · n=${r.v.length}`;
      boxes.push(bx);
    });
    hoverMarks(boxes, i => {
      const r = rows[i];
      return `<div class="t-title">${esc(r.d.abbr)} — ${esc(r.d.team)}</div><table>
        <tr><td>Median</td><td class="num"><b>${fmtLap(Math.round(r.med))}</b></td></tr>
        <tr><td>IQR</td><td class="num">${fmtSec(r.q3 - r.q1, 3)}s</td></tr>
        <tr><td>P5–P95</td><td class="num">${fmtLap(Math.round(r.p5))} – ${fmtLap(Math.round(r.p95))}</td></tr>
        <tr><td>Clean laps</td><td class="num">${r.v.length}</td></tr></table>`;
    });
  }

  // insights
  const ins = [];
  const bestL = pts.reduce((a, b) => fc(b) < fc(a) ? b : a);
  ins.push(`Fastest: <b>${bestL.drv}</b> ${fmtLap(bestL.t)} (lap ${bestL.lap}${bestL.cmp ? ", " + bestL.cmp : ""})`);
  if (rows && rows.length >= 2) {
    const cons = [...rows].filter(r => r.v.length >= 8).sort((a, b) => (a.q3 - a.q1) - (b.q3 - b.q1))[0];
    if (cons) ins.push(`Most consistent: <b>${cons.d.abbr}</b> (IQR ${fmtSec(cons.q3 - cons.q1, 2)}s over ${cons.v.length} laps)`);
    ins.push(`Pace spread P1→P${rows.length}: <b>${fmtSec(rows.at(-1).med - rows[0].med, 2)}s</b>/lap on median`);
  }
  insights(root, ins);
  root.insertBefore(root.lastChild, root.children[1]);
}
