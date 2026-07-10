/* ============ views A: driver rail, overview, pace ============ */
"use strict";

/* ---------- driver rail ---------- */
function driverRail(root, sess) {
  const s = sess || HUB.session();
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
function selDrivers(sess) {
  const s = sess || HUB.session();
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

  // ---- race pace (vertical box plot, sorted by mean) ----
  const c2 = card(root, isRace ? "Race pace" : "Pace distribution",
    `drivers sorted by mean lap time · clean green-flag laps only${S.fuelOn && isRace ? " · fuel-corrected" : ""} · dashed line = mean, solid = median, box = middle 50%, dots = outliers`);
  const rows = [];
  for (const d of drvs) {
    const cl = s.laps.filter(l => l.drv === d.abbr && isClean(l));
    const v = cl.map(l => fuelCorr(l, s.id)).sort((a, b) => a - b);
    if (v.length >= 3) {
      const cmps = [...new Set(cl.sort((a, b) => a.lap - b.lap).map(l => l.cmp).filter(Boolean))].map(c => CMP_LETTER[c] || "?");
      const q1 = quantile(v, .25), q3 = quantile(v, .75), iqr = q3 - q1;
      const loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr;
      const inl = v.filter(x => x >= loF && x <= hiF);
      rows.push({
        d, v, cmps, n: v.length,
        mean: v.reduce((a, b) => a + b, 0) / v.length, med: median(v), q1, q3,
        wLo: inl.length ? inl[0] : v[0], wHi: inl.length ? inl.at(-1) : v.at(-1),
        outliers: v.filter(x => x < loF || x > hiF),
      });
    }
  }
  rows.sort((a, b) => a.mean - b.mean);
  if (rows.length < 2) { c2.insertAdjacentHTML("beforeend", `<div class="empty">Not enough clean laps.</div>`); }
  else {
    const p1 = rows[0].mean, mob = innerWidth < 640;
    const wrap = document.createElement("div"); wrap.style.overflowX = "auto"; wrap.style.overflowY = "hidden"; c2.appendChild(wrap);
    const colW = mob ? 58 : 66, ml = 46, mr = 14, mt = 54, plotH = mob ? 250 : 300, mb = 96;
    const W = ml + rows.length * colW + mr, H = mt + plotH + mb;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": "Race pace box plot" }, wrap);
    svg.style.display = "block"; svg.style.maxWidth = "none";
    const gLo = Math.min(...rows.map(r => Math.min(r.wLo, ...r.outliers))), gHi = Math.max(...rows.map(r => Math.max(r.wHi, ...r.outliers)));
    const pad = (gHi - gLo) * 0.06 + 100;
    const ylo = gLo - pad, yhi = gHi + pad;
    const yP = v => mt + plotH * (1 - (v - ylo) / (yhi - ylo));
    const xC = i => ml + colW * (i + 0.5);
    // y grid + axis (seconds)
    for (const gv of niceTicks(ylo, yhi, 6)) {
      if (gv < ylo || gv > yhi) continue;
      svgEl("line", { x1: ml, x2: W - mr, y1: yP(gv), y2: yP(gv), stroke: "var(--grid)", "stroke-width": 1 }, svg);
      svgEl("text", { x: ml - 6, y: yP(gv) + 3.5, "text-anchor": "end", "font-size": 10, fill: "var(--ink3)", class: "num" }, svg).textContent = (gv / 1000).toFixed(1);
    }
    svgEl("text", { x: 12, y: mt + plotH / 2, "text-anchor": "middle", class: "ylab", transform: `rotate(-90 12 ${mt + plotH / 2})` }, svg).textContent = "lap time (s)";

    // deterministic annotation groups (dashed brackets + coloured labels).
    // only labels that are provable from the ordering — no editorialising.
    const gaps = rows.map((r, i) => i === 0 ? 0 : r.mean - rows[i - 1].mean);
    const callouts = [];
    const covered = i => callouts.some(c => i >= c.a && i <= c.b);
    // 1. front-running group: within 0.30s of fastest
    let fEnd = 0; while (fEnd + 1 < rows.length && rows[fEnd + 1].mean - p1 <= 300 && gaps[fEnd + 1] < 250) fEnd++;
    if (fEnd === 0 && rows.length > 1 && gaps[1] > 350) callouts.push({ a: 0, b: 0, label: "Unmatched pace", col: "#12b3a6" });
    else if (fEnd >= 1) callouts.push({ a: 0, b: fEnd, label: rows.length > 6 ? "Front-running pace" : "Fastest group", col: "#12b3a6" });
    // 2. recovery drive: strong race pace from a poor grid slot (races only) — high priority story
    if (isRace) {
      const rec = rows.map((r, i) => ({ r, i, gain: (r.d.grid || 20) - (i + 1) }))
        .filter(x => x.r.d.grid && x.gain >= 6 && x.i <= Math.min(9, rows.length - 2) && !covered(x.i))
        .sort((a, b) => b.gain - a.gain)[0];
      if (rec) callouts.push({ a: rec.i, b: rec.i, label: `Recovery · P${rec.r.d.grid} start`, col: "#e0393a" });
    }
    // 3. off the pace: trailing driver(s) after a big gap in the last third of the field
    const backStart = Math.ceil(rows.length * 0.66);
    let bi = -1, bv = 0;
    for (let i = backStart; i < rows.length; i++) if (gaps[i] > bv) { bv = gaps[i]; bi = i; }
    if (bi > 0 && bv > 450) callouts.push({ a: bi, b: rows.length - 1, label: rows.length - bi <= 1 ? "Off the pace" : "Adrift at the back", col: "#7a828c" });
    // 4. leading the midfield: biggest uncovered run right after the front (>=2 drivers)
    if (rows.length > 8) {
      let a = fEnd + 1; while (a < rows.length && covered(a)) a++;
      if (a < rows.length) {
        let mEnd = a; while (mEnd + 1 < rows.length && gaps[mEnd + 1] < 250 && !covered(mEnd + 1)) mEnd++;
        if (mEnd >= a + 1) callouts.push({ a, b: mEnd, label: "Leading the midfield", col: "#c02fd6" });
      }
    }

    let labRow = 0;
    for (const co of callouts) {
      const xL = xC(co.a) - colW * 0.42, xR = xC(co.b) + colW * 0.42;
      const yTop = yP(Math.max(...rows.slice(co.a, co.b + 1).map(r => Math.max(r.wHi, ...r.outliers)))) - 6;
      const yBot = yP(Math.min(...rows.slice(co.a, co.b + 1).map(r => Math.min(r.wLo, ...r.outliers)))) + 6;
      svgEl("rect", { x: xL, y: yTop, width: xR - xL, height: yBot - yTop, fill: "none", stroke: co.col, "stroke-width": 1.4, "stroke-dasharray": "5 3", rx: 5 }, svg);
      const ly = 12 + (labRow % 2) * 17, lx = Math.max(ml + 2, Math.min(W - mr - 2, (xL + xR) / 2));
      const tw2 = co.label.length * (mob ? 5.7 : 6.4) + 12;
      svgEl("rect", { x: lx - tw2 / 2, y: ly - 10, width: tw2, height: 15, rx: 3, fill: co.col }, svg);
      svgEl("text", { x: lx, y: ly + 1.5, "text-anchor": "middle", "font-size": mob ? 9.5 : 10.5, "font-weight": 800, fill: "#fff" }, svg).textContent = co.label;
      svgEl("line", { x1: lx, x2: (xL + xR) / 2, y1: ly + 5, y2: yTop, stroke: co.col, "stroke-width": 1, "stroke-dasharray": "2 2" }, svg);
      labRow++;
    }

    const boxes = [];
    rows.forEach((r, i) => {
      const x = xC(i), col = teamCol(r.d.color), bw = colW * 0.52, dark = lum(col) < 0.5;
      // whisker
      svgEl("line", { x1: x, x2: x, y1: yP(r.wLo), y2: yP(r.wHi), stroke: col, "stroke-width": 1.3 }, svg);
      svgEl("line", { x1: x - 5, x2: x + 5, y1: yP(r.wHi), y2: yP(r.wHi), stroke: col, "stroke-width": 1.3 }, svg);
      svgEl("line", { x1: x - 5, x2: x + 5, y1: yP(r.wLo), y2: yP(r.wLo), stroke: col, "stroke-width": 1.3 }, svg);
      // box
      const bx = svgEl("rect", { x: x - bw / 2, y: yP(r.q3), width: bw, height: Math.max(2, yP(r.q1) - yP(r.q3)), fill: col, opacity: .34, stroke: col, "stroke-width": 1.3, rx: 2 }, svg);
      // median (solid) + mean (dashed)
      svgEl("line", { x1: x - bw / 2, x2: x + bw / 2, y1: yP(r.med), y2: yP(r.med), stroke: col, "stroke-width": 2.4 }, svg);
      svgEl("line", { x1: x - bw / 2, x2: x + bw / 2, y1: yP(r.mean), y2: yP(r.mean), stroke: col, "stroke-width": 1.6, "stroke-dasharray": "3 2" }, svg);
      for (const o of r.outliers) svgEl("circle", { cx: x, cy: yP(o), r: 2.2, fill: "none", stroke: col, "stroke-width": 1.1 }, svg);
      // helmet + stacked labels below plot
      const hy = mt + plotH + 12;
      drawHelmet(svg, x, hy, col, dark);
      const tx = mt + plotH + 34;
      svgEl("text", { x, y: tx, "text-anchor": "middle", "font-size": 10.5, "font-weight": 800, fill: "var(--ink)" }, svg).textContent = r.d.abbr;
      svgEl("text", { x, y: tx + 13, "text-anchor": "middle", "font-size": 9.5, fill: "var(--ink2)", class: "num" }, svg).textContent = (r.mean / 1000).toFixed(2);
      svgEl("text", { x, y: tx + 25, "text-anchor": "middle", "font-size": 9, fill: i === 0 ? "var(--green)" : "var(--ink3)", class: "num" }, svg).textContent = i === 0 ? "+0.00" : "+" + ((r.mean - p1) / 1000).toFixed(2);
      svgEl("text", { x, y: tx + 37, "text-anchor": "middle", "font-size": 8.5, "font-weight": 700, fill: "var(--ink3)" }, svg).textContent = r.cmps.join("-");
      // wide invisible hit target for hover
      const hit = svgEl("rect", { x: x - colW / 2, y: mt, width: colW, height: plotH, fill: "transparent" }, svg);
      boxes.push(hit);
    });
    hoverMarks(boxes, i => {
      const r = rows[i];
      return `<div class="t-title">${esc(r.d.abbr)} — ${esc(r.d.team)}</div><table>
        <tr><td>Mean</td><td class="num"><b>${fmtLap(Math.round(r.mean))}</b>${i ? ` (+${((r.mean - p1) / 1000).toFixed(2)})` : " — fastest"}</td></tr>
        <tr><td>Median</td><td class="num">${fmtLap(Math.round(r.med))}</td></tr>
        <tr><td>Spread (IQR)</td><td class="num">${fmtSec(r.q3 - r.q1, 2)}s</td></tr>
        <tr><td>Tyres · laps</td><td>${r.cmps.join("-")} · ${r.n}</td></tr>
        ${r.outliers.length ? `<tr><td>Outliers</td><td class="num">${r.outliers.length}</td></tr>` : ""}</table>`;
    });

    // pace per team (best driver)
    const teamBest = new Map();
    for (const r of rows) { const t = r.d.team; if (!teamBest.has(t) || r.mean < teamBest.get(t).mean) teamBest.set(t, r); }
    const tr = [...teamBest.values()].sort((a, b) => a.mean - b.mean);
    const tw = document.createElement("div"); tw.className = "tblwrap"; c2.appendChild(tw);
    tw.innerHTML = `<table class="t"><thead><tr><th>#</th><th>Team (best driver)</th><th class="r">Mean pace</th><th class="r">Gap /lap</th></tr></thead><tbody>` +
      tr.map((r, i) => `<tr><td class="num" style="color:var(--ink3)">${i + 1}</td><td><span class="drv-cell"><span class="dot" style="background:${teamCol(r.d.color)}"></span>${esc(r.d.team)} <span class="team">${esc(r.d.abbr)}</span></span></td><td class="r num">${fmtLap(Math.round(r.mean))}</td><td class="r num ${i === 0 ? "best" : ""}">${i === 0 ? "—" : "+" + ((r.mean - tr[0].mean) / 1000).toFixed(3)}</td></tr>`).join("") + "</tbody></table>";
  }

  // insights
  const ins = [];
  const bestL = pts.reduce((a, b) => fc(b) < fc(a) ? b : a);
  ins.push(`Fastest lap: <b>${bestL.drv}</b> ${fmtLap(bestL.t)} (lap ${bestL.lap}${bestL.cmp ? ", " + bestL.cmp : ""})`);
  if (rows && rows.length >= 2) {
    const cons = [...rows].filter(r => r.v.length >= 8).sort((a, b) => (a.q3 - a.q1) - (b.q3 - b.q1))[0];
    if (cons) ins.push(`Most consistent: <b>${cons.d.abbr}</b> (IQR ${fmtSec(cons.q3 - cons.q1, 2)}s over ${cons.v.length} laps)`);
    ins.push(`Field spread P1→P${rows.length}: <b>${fmtSec(rows.at(-1).med - rows[0].med, 2)}s</b>/lap on median`);
  }
  insights(root, ins);
  root.insertBefore(root.lastChild, root.children[1]);
}
