/* ============ views G: Team DNA (season profiles + circuit fit) ============ */
"use strict";

/* Season-level team profiles precomputed by tools/build_profiles.py from every
   archived weekend: measured corner-class speed deficits, straight-line deficit,
   pace gaps, temperature correlation, and a kinematic circuit-fit model whose
   predicted order is checked against real qualifying order (Spearman rho). */

async function loadProfiles() {
  if (HUB._profiles) return HUB._profiles;
  HUB._profiles = await fetchSession("data/profiles.json.gz");
  return HUB._profiles;
}

const TEAM_ABBR = {
  "Red Bull Racing": "RBR", "Racing Bulls": "RB", "AlphaTauri": "AT", "Toro Rosso": "STR",
  "Aston Martin": "AMR", "Racing Point": "RP", "Force India": "FI", "Alfa Romeo": "ALF",
  "Alfa Romeo Racing": "ALF", "Haas F1 Team": "HAA", "McLaren": "MCL", "Ferrari": "FER",
  "Mercedes": "MER", "Williams": "WIL", "Alpine": "ALP", "Renault": "REN", "Sauber": "SAU",
  "Kick Sauber": "SAU", "Audi": "AUD", "Cadillac": "CAD", "Racing Point BWT": "RP",
};
const tAbbr = t => TEAM_ABBR[t] || t.slice(0, 3).toUpperCase();

function showTeams(year) {
  const root = document.getElementById("app");
  root.innerHTML = `<div id="loading"><div style="font-size:15px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Car <span style="color:var(--accent)">rankings</span></div><div class="bar"><i></i></div><div style="font-size:12px">loading…</div></div>`;
  loadProfiles().then(P => renderTeams(P, year)).catch(err => {
    showError("Team profiles not available yet: " + err.message);
  });
}

function renderTeams(P, year) {
  const years = Object.keys(P.seasons).sort();
  const y = P.seasons[year] ? String(year) : years.at(-1);
  const S = P.seasons[y];
  const root = document.getElementById("app");
  HUB.viewing = "teams/" + y;
  try {
    const target = `#teams/${y}`;
    if (location.hash !== target) {
      if (location.hash.startsWith("#teams")) history.replaceState(null, "", target);
      else history.pushState(null, "", target);
    }
    document.title = `Car rankings ${y} — Minisector`;
  } catch (e) { }

  root.innerHTML = `
  <header class="top"><div class="top-inner">
    <div class="title-row">
      <span class="picker">
        <button id="homeBtn" class="btn" title="All weekends" aria-label="All weekends">≡</button>
        <select id="dnaYear" aria-label="Season">${years.map(yy => `<option ${yy === y ? "selected" : ""}>${yy}</option>`).join("")}</select>
        <span class="gp" style="font-size:16px">Car rankings — ${esc(y)} only</span>
      </span>
      <span class="meta">one season at a time: cars change every year, so no performance data crosses seasons · updates automatically as new weekends land</span>
      <span class="brand">Mini<b>sector</b> · F1 analysis</span>
      <span id="themeSlot"></span>
    </div>
  </div></header>
  <main id="view"></main>
  <footer>All inputs measured (corner minimum speeds, speed traps, dry quali/race gaps); predictions = kinematics + one calibration constant, accuracy checked above. Unofficial, not associated with Formula 1.</footer>`;

  document.getElementById("homeBtn").addEventListener("click", showPicker);
  document.getElementById("dnaYear").addEventListener("change", e => renderTeams(P, e.target.value));
  const slot = document.getElementById("themeSlot");
  if (slot && MODE === "site") slot.appendChild(themeToggleBtn());

  const main = document.getElementById("view");
  const teams = Object.entries(S.teams).filter(([, t]) => t.quali != null)
    .sort((a, b) => a[1].quali - b[1].quali);
  if (!teams.length) { main.innerHTML = `<div class="empty">Not enough dry weekends in ${y} yet.</div>`; return; }
  // gaps are DISPLAYED relative to the leading team (the intuitive reading:
  // the fastest car shows "fastest", everyone else their gap to it). Raw
  // values are medians vs each weekend's best — rebasing shifts all teams
  // equally, so no ordering or margin between teams changes.
  const avgPoleS = (S.avgPole || 90000) / 1000;   // season average pole lap
  const minQuali = Math.min(...teams.map(([, t]) => t.quali));
  const minRace = Math.min(...teams.map(([, t]) => t.race).filter(v => v != null));
  const relQ = t => t.quali - minQuali;
  const relR = t => t.race != null ? t.race - minRace : null;
  const qSec = t => relQ(t) / 100 * avgPoleS;
  const fmtQ = t => relQ(t) < 1e-9 ? "fastest" : "+" + (qSec(t) < 0.05 ? qSec(t).toFixed(3) : qSec(t).toFixed(2)) + "s";
  const fmtR = t => relR(t) == null ? null : relR(t) < 1e-9 ? "fastest" : "+" + (relR(t) < 0.05 ? relR(t).toFixed(3) : relR(t).toFixed(2)) + " s/lap";

  // per team, per element: time lost per lap to the best car, scaled to the
  // season's average circuit (zone-time deficits x corner counts + flat-out
  // pace deficit x flat-out km). Rebased so the best team in each area = 0.
  const AC = S.avgCirc || { counts: { slow: 6, med: 5, fast: 4 }, flatKm: 3 };
  const ELEMS = ["slow", "med", "fast", "sl", "deg"];
  const lapLoss = {};
  for (const [tm, t] of teams) {
    const L = {};
    for (const cls of ["slow", "med", "fast"])
      L[cls] = t.defT && t.defT[cls] != null ? t.defT[cls] * AC.counts[cls] / 1000 : null;
    L.sl = t.slp != null ? t.slp * AC.flatKm / 1000 : null;
    L.deg = t.deg != null ? t.deg / 1000 : null;   // s/lap of extra tyre wear
    lapLoss[tm] = L;
  }
  const minEl = {}, maxEl = {}, rankEl = {};
  let worstRel = 0.4;
  for (const e of ELEMS) {
    const vals = teams.map(([tm]) => lapLoss[tm][e]).filter(v => v != null);
    minEl[e] = vals.length ? Math.min(...vals) : 0;
    maxEl[e] = vals.length ? Math.max(...vals) : 1;
    rankEl[e] = new Map(teams.filter(([tm]) => lapLoss[tm][e] != null)
      .sort((a, b) => lapLoss[a[0]][e] - lapLoss[b[0]][e]).map(([tm], i) => [tm, i + 1]));
    if (e !== "deg") worstRel = Math.max(worstRel, maxEl[e] - minEl[e]);
  }


  /* season pace ranking: who has the fastest car right now */
  {
    const doneN = S.rounds.filter(r => r.circuit).length;
    const cr = card(main, `${y} season pace ranking`,
      `gaps to the fastest car · ${doneN} dry weekend${doneN > 1 ? "s" : ""}, this season only`);
    const wr = document.createElement("div"); wr.className = "tblwrap"; cr.appendChild(wr);
    wr.innerHTML = `<table class="t"><thead><tr><th class="r">#</th><th>Team</th><th class="r" title="median dry qualifying gap, on the season\u2019s average pole lap">Quali gap (s)</th><th class="r">Race pace (s/lap)</th><th class="r" title="extra degradation vs the kindest car · clean race stints, same compound, fuel-corrected">Tyre deg</th><th class="r">Weekends</th></tr></thead><tbody>` +
      teams.map(([tm, t], i) => `<tr><td class="r num">${i + 1}</td>
        <td><span class="drv-cell"><span class="dot" style="background:${teamCol(S.colors[tm] || "#888")}"></span>${esc(tm)}</span></td>
        <td class="r num ${relQ(t) < 1e-9 ? "best" : ""}" style="background:${heatBg(qSec(t), Math.max(...teams.map(([, x]) => qSec(x))))}">${fmtQ(t)}</td>
        <td class="r num ${relR(t) != null && relR(t) < 1e-9 ? "best" : ""}" style="background:${relR(t) == null ? "none" : heatBg(relR(t), Math.max(...teams.map(([, x]) => relR(x) ?? 0)))}">${fmtR(t) ?? "—"}</td>
        <td class="r num" style="background:${t.deg == null ? "none" : heatBg(t.deg / 1000 - minEl.deg, Math.max(maxEl.deg - minEl.deg, 0.001))}">${t.deg == null ? "\u2014" : (t.deg / 1000 - minEl.deg) < 1e-9 ? "kindest" : "+" + (t.deg - minEl.deg * 1000).toFixed(0) + " ms/lap"}</td>
        <td class="r num">${t.n}</td></tr>`).join("") + "</tbody></table>";
  }

  /* pace evolution: gap to each weekend's pole, round by round — upgrades
     (or a car falling behind the development race) show up as the trend */
  {
    const dryRounds = S.rounds.filter(r => !r.wetQ && r.quali && Object.keys(r.quali).length >= 6);
    if (dryRounds.length >= 3) {
      const ce = card(main, "Pace evolution — gap to pole (s), round by round",
        "dry rounds only · trending down = gaining pace (upgrades working)");
      const div = document.createElement("div"); div.className = "chart"; ce.appendChild(div);
      const allV = dryRounds.flatMap(r => teams.map(([tm]) => r.quali[tm] != null ? r.quali[tm] / 100 * ((r.poleMs || S.avgPole || 90000) / 1000) : null).filter(v => v != null));
      const rMin = Math.min(...dryRounds.map(r => r.round)), rMax = Math.max(...dryRounds.map(r => r.round));
      const mob = innerWidth < 700;
      const ch = Chart(div, {
        h: mob ? 300 : 380, mr: 52, xd: [rMin - 0.4, rMax + 0.4], yd: [-0.08, Math.min(Math.max(...allV) + 0.25, quantile(allV, 0.97) + 0.7)],
        yflip: true, xticksArr: dryRounds.map(r => r.round), xfmt: v => "R" + v,
        yfmt: v => "+" + v.toFixed(1) + "s", xlab: "round", ylab: "gap to pole (s)", label: "Pace evolution",
      });
      const endL = [];
      const nodes = [], nData = [];
      for (const [tm] of teams) {
        const col = teamCol(S.colors[tm] || "#888");
        const pts = dryRounds.map(r => r.quali[tm] != null ? [r.round, r.quali[tm] / 100 * ((r.poleMs || S.avgPole || 90000) / 1000)] : null);
        svgEl("path", { d: linePath(pts, ch.x, ch.y), fill: "none", stroke: col, "stroke-width": 1.7, opacity: .85 }, ch.plot);
        for (const p of pts) {
          if (!p) continue;
          const n = svgEl("circle", { cx: ch.x(p[0]), cy: ch.y(p[1]), r: 6, fill: "transparent" }, ch.plot);
          svgEl("circle", { cx: ch.x(p[0]), cy: ch.y(p[1]), r: 2.6, fill: col, "pointer-events": "none" }, ch.plot);
          nodes.push(n); nData.push({ tm, p, col });
        }
        const last = [...pts].reverse().find(Boolean);
        if (last) endL.push({ y: ch.y(last[1]) + 3.5, txt: tAbbr(tm), col });
      }
      spreadLabels(endL, 11, ch.mt + 4, ch.mt + ch.ih);
      for (const L2 of endL)
        svgEl("text", { x: ch.ml + ch.iw + 5, y: L2.y, "font-size": 10, "font-weight": 700, fill: L2.col, class: "num" }, ch.svg).textContent = L2.txt;
      hoverMarks(nodes, i => {
        const { tm, p } = nData[i];
        const rnd = dryRounds.find(r => r.round === p[0]);
        return `<div class="t-title">${esc(tm)} — R${p[0]} ${esc(rnd ? rnd.event : "")}</div>gap to pole: <b class="num">${p[1] < 0.005 ? "fastest" : "+" + p[1].toFixed(2) + "s"}</b>`;
      });
    }
  }

  /* relative calibrated fits: per circuit, gap to the best team's score */
  const k = S.calib || 1;
  const slugsDone = S.rounds.filter(r => r.circuit).map(r => ({ slug: r.slug, event: r.event, round: r.round, done: true }));
  const slugsUp = (S.upcoming || []).filter(u => !u.noData).map(u => ({ slug: u.slug, event: u.event, from: u.from, alt: u.alt, done: false }));
  const circuits = [...slugsDone.sort((a, b) => a.round - b.round), ...slugsUp];
  const rel = {};   // team -> slug -> calibrated gap-to-best (s)
  for (const c of circuits) {
    const vals = teams.map(([tm]) => S.fits[tm]?.[c.slug]).filter(v => v != null);
    if (!vals.length) continue;
    const base = Math.min(...vals);
    for (const [tm] of teams) {
      const f = S.fits[tm]?.[c.slug];
      if (f != null) (rel[tm] = rel[tm] || {})[c.slug] = (f - base) * k;
    }
  }

  /* team cards */
  main.insertAdjacentHTML("beforeend", `<p class="note" style="margin:14px 2px 8px">full bar = best car in that area, shorter = slower · number = time lost per lap to that best car, on an average ${esc(y)} circuit (${AC.counts.slow}/${AC.counts.med}/${AC.counts.fast} slow/med/fast corners + ${AC.flatKm} km flat-out) · ★ = benchmark · ◦ = predicted from the track’s last visit · tyre life = same-compound race-stint degradation · hover any bar for raw numbers</p>`);
  const grid = document.createElement("div"); grid.className = "dna-grid"; main.appendChild(grid);
  const evName = slug => (circuits.find(c => c.slug === slug) || {}).event || slug;

  for (const [tm, t] of teams) {
    const col = teamCol(S.colors[tm] || "#888");
    const el = document.createElement("div"); el.className = "card dna-card"; grid.appendChild(el);
    const rows = [["Slow corners", "slow"], ["Medium corners", "med"], ["Fast corners", "fast"], ["Straights", "sl"], ["Tyre life", "deg"]].map(([lab, e]) => {
      const v = lapLoss[tm][e];
      const rel2 = v != null ? v - minEl[e] : null;
      const rk = rankEl[e].get(tm);
      const tip = e === "deg"
        ? `extra tyre degradation vs the kindest car: +${t.deg ?? "?"} ms/lap (clean race stints, same-compound comparison, fuel-corrected) ≈ +${t.deg != null ? (t.deg * 20 / 1000).toFixed(1) : "?"}s over a 20-lap stint · ${t.degN ?? "?"} races`
        : e === "sl"
        ? `flat-out pace: +${t.slp ?? "?"} ms per km vs the best car`
        : `${t.defT && t.defT[e] != null ? "+" + t.defT[e] + " ms per corner (zone time)" : ""}${t.def && t.def[e] != null ? " · apex speed −" + t.def[e] + " km/h vs per-corner best" : ""}`;
      const span = e === "deg" ? Math.max(maxEl.deg - minEl.deg, 0.01) : worstRel;
      return { lab, e, rel2, w: rel2 != null ? Math.max(5, 100 * (1 - rel2 / span)) : 0, rk, best: rk === 1, tip };
    });
    const myRel = rel[tm] || {};
    const own = median(Object.values(myRel)) ?? 0;
    const ranked = Object.entries(myRel).map(([slug, v]) => [slug, v - own]).sort((a, b) => a[1] - b[1]);
    const best3 = ranked.slice(0, 3), worst3 = ranked.slice(-3).reverse();
    const up = new Set(slugsUp.map(u => u.slug));
    const fmtC = ([slug, v]) => `${esc(evName(slug)).replace(" Grand Prix", "")}${up.has(slug) ? " ◦" : ""} <span class="num" style="color:var(--ink3)">${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}</span>`;

    let altNote = "";
    if (t.alt && Math.abs(t.alt.r) >= 0.45) {
      const worse = t.alt.slopeKm > 0;
      const secKm = Math.abs(t.alt.slopeKm) / 100 * avgPoleS;
      altNote = `<p class="dna-temp" title="quali gap ${worse ? "grows" : "shrinks"} ${secKm.toFixed(2)}s per 1000 m of track altitude \u2014 correlation over ${t.alt.n} rounds, suggestive not proof">\u26f0 ${worse ? "weaker" : "stronger"} at high-altitude tracks (r = ${t.alt.r})</p>`;
    }
    let tempNote = "";
    if (t.temp && Math.abs(t.temp.r) >= 0.45) {
      const hot = t.temp.slope10 < 0;
      tempNote = `<p class="dna-temp" title="race-pace gap ${hot ? "shrinks" : "grows"} ${Math.abs(t.temp.slope10).toFixed(2)}s per +10 °C track temp over ${t.temp.n} races — suggestive, not proof">${hot ? "🌡 stronger in hot races" : "❄ stronger in cool races"} (r = ${t.temp.r})</p>`;
    }

    el.innerHTML = `
      <div class="dna-head"><span class="dot" style="background:${col};width:12px;height:12px"></span><b>${esc(tm)}</b>
        <span class="dna-gaps num">Quali ${fmtQ(t)}${fmtR(t) != null ? ` · Race ${fmtR(t)}` : ""}</span></div>
      <div class="dna-bars">${rows.map(r => `
        <div class="dna-row" title="${r.tip}"><span class="dna-lab">${r.lab}${r.rk ? ` <b class="num" style="color:${r.rk === 1 ? "var(--green)" : "var(--ink3)"}">P${r.rk}</b>` : ""}</span>
          <span class="dna-track"><i style="width:${r.w.toFixed(1)}%;background:${col}"></i></span>
          <span class="num dna-val" ${r.best ? 'style="color:var(--green);font-weight:700"' : ""}>${r.rel2 == null ? "—" : r.rk === 1 ? (r.e === "deg" ? "kindest ★" : "best ★") : r.e === "deg" ? "+" + (r.rel2 * 1000).toFixed(0) + " ms/lap" : "+" + (r.rel2 < 0.05 ? r.rel2.toFixed(3) : r.rel2.toFixed(2)) + "s"}</span></div>`).join("")}
      </div>
      ${ranked.length ? `<div class="dna-fit" title="±s vs this car's own average circuit — layout sensitivity, not a cross-team ranking"><span><b>Best layouts:</b> ${best3.map(fmtC).join(" · ")}</span>
      <span><b>Worst layouts:</b> ${worst3.map(fmtC).join(" · ")}</span></div>` : ""}
      ${altNote}${tempNote}`;
  }

  /* circuit predictor: pick any track → full predicted order with margins */
  const ownMed0 = {};
  for (const [tm] of teams) ownMed0[tm] = median(Object.values(rel[tm] || {})) ?? 0;
  {
    const cp = card(main, "Circuit predictor",
      `pick a circuit → likely pecking order before the weekend${S.accMean != null ? ` · reliability ρ = ${S.accMean.toFixed(2)} (checked below)` : ""}`);
    const selEl = document.createElement("select");
    const opts = circuits.filter(c => teams.some(([tm]) => rel[tm]?.[c.slug] != null));
    const firstUp = opts.find(c => !c.done);
    if (!renderTeams._pick || !opts.some(c => c.slug === renderTeams._pick)) renderTeams._pick = (firstUp || opts.at(-1) || {}).slug;
    selEl.innerHTML = opts.map(c => `<option value="${esc(c.slug)}" ${c.slug === renderTeams._pick ? "selected" : ""}>${c.done ? "✓" : "◦"} ${esc(c.event)}${c.from ? ` ('${String(c.from).slice(2)} layout)` : ""}${c.alt >= 400 ? ` ⛰ ${c.alt} m` : ""}</option>`).join("");
    cp.querySelector(".right").appendChild(selEl);
    const holder = document.createElement("div"); cp.appendChild(holder);
    const drawPick = () => {
      holder.innerHTML = "";
      const slug = renderTeams._pick;
      const rows = teams.map(([tm, t]) => {
        const r = rel[tm]?.[slug];
        if (r == null) return null;
        const swing = r - ownMed0[tm];
        return { tm, q: t.quali / 100 * avgPoleS + swing, r: t.race != null ? t.race + swing : null, swing };
      }).filter(Boolean).sort((a, b) => a.q - b.q);
      if (!rows.length) { holder.innerHTML = `<div class="empty">No prediction possible here.</div>`; return; }
      const qBase = rows[0].q, rBase = Math.min(...rows.map(x => x.r).filter(v => v != null));
      const wrp = document.createElement("div"); wrp.className = "tblwrap"; holder.appendChild(wrp);
      wrp.innerHTML = `<table class="t"><thead><tr><th class="r">#</th><th>Team</th><th class="r">Predicted quali gap</th><th class="r">Predicted race pace</th><th class="r" title="how much this layout helps (green) or hurts (red) the car vs its own average circuit">Layout swing</th></tr></thead><tbody>` +
        rows.map((x, i) => `<tr><td class="r num">${i + 1}</td>
          <td><span class="drv-cell"><span class="dot" style="background:${teamCol(S.colors[x.tm] || "#888")}"></span>${esc(x.tm)}</span></td>
          <td class="r num ${i === 0 ? "best" : ""}" style="background:${heatBg(x.q - qBase, rows.at(-1).q - qBase)}">${i === 0 ? "fastest" : "+" + (x.q - qBase).toFixed(2) + "s"}</td>
          <td class="r num" style="background:${x.r == null ? "none" : heatBg(x.r - rBase, Math.max(...rows.map(z => (z.r ?? rBase) - rBase)))}">${x.r == null ? "—" : x.r === rBase ? "fastest" : "+" + (x.r - rBase).toFixed(2) + " s/lap"}</td>
          <td class="r num" style="color:${x.swing < -0.03 ? "var(--green)" : x.swing > 0.03 ? "var(--red)" : "var(--ink3)"}">${x.swing >= 0 ? "+" : "−"}${Math.abs(x.swing).toFixed(2)}s</td></tr>`).join("") + "</tbody></table>";
    };
    selEl.addEventListener("change", () => { renderTeams._pick = selEl.value; drawPick(); });
    drawPick();
  }

  /* prediction matrix: each car anchored to its measured season quali pace,
     the model contributes only circuit-to-circuit variation */
  const cm = card(main, "Circuit fit — every team at every circuit",
    `estimated gap (s) to the best car · ✓ raced in ${y} · ◦ predicted`);
  const w = document.createElement("div"); w.className = "tblwrap"; cm.appendChild(w);
  const ownMed = {};
  for (const [tm] of teams) ownMed[tm] = median(Object.values(rel[tm] || {})) ?? 0;
  const pred = (tm, slug) => {
    const r = rel[tm]?.[slug];
    if (r == null) return null;
    return S.teams[tm].quali / 100 * avgPoleS + (r - ownMed[tm]);
  };
  const cells = circuits.filter(c => teams.some(([tm]) => pred(tm, c.slug) != null));
  let vMax = 0.5;
  const relCell = {};
  for (const c of cells) {
    const vals = teams.map(([tm]) => pred(tm, c.slug)).filter(v => v != null);
    const base = Math.min(...vals);
    relCell[c.slug] = {};
    for (const [tm] of teams) {
      const v = pred(tm, c.slug);
      if (v != null) { relCell[c.slug][tm] = v - base; vMax = Math.max(vMax, v - base); }
    }
  }
  w.innerHTML = `<table class="t dna-mat"><thead><tr><th>Circuit</th>${teams.map(([tm]) =>
    `<th class="r"><span class="dot" style="background:${teamCol(S.colors[tm] || "#888")}"></span> ${tAbbr(tm)}</th>`).join("")}</tr></thead><tbody>` +
    cells.map(c => `<tr><td>${c.done ? "✓" : "◦"} ${esc(c.event.replace(" Grand Prix", " GP"))}${c.from ? ` <span class="hint">'${String(c.from).slice(2)}</span>` : ""}</td>` +
      teams.map(([tm]) => {
        const v = relCell[c.slug]?.[tm];
        if (v == null) return `<td class="r num">—</td>`;
        return `<td class="r num" style="background:${heatBg(v, vMax)}">${v < 1e-9 ? "best" : "+" + v.toFixed(2)}</td>`;
      }).join("") + "</tr>").join("") + "</tbody></table>";

  /* honesty table */
  if (S.acc && S.acc.length) {
    const ca = card(main, "Prediction accuracy, checked",
      "each weekend predicted by a model that never saw it (leave-one-out), then compared with the real quali order");
    const wa = document.createElement("div"); wa.className = "tblwrap"; ca.appendChild(wa);
    wa.innerHTML = `<table class="t"><thead><tr><th>Round</th><th>Grand Prix</th><th class="r">ρ predicted vs actual</th><th style="min-width:130px"></th></tr></thead><tbody>` +
      S.acc.map(a => `<tr><td class="num">R${a.round}</td><td>${esc(a.event)}</td><td class="r num">${a.rho.toFixed(2)}</td>
        <td><div style="height:6px;border-radius:3px;background:var(--surface3);overflow:hidden"><div style="height:100%;width:${Math.max(0, a.rho * 100).toFixed(0)}%;background:${a.rho > 0.6 ? "var(--green)" : a.rho > 0.3 ? "var(--yellow)" : "var(--red)"}"></div></div></td></tr>`).join("") +
      `</tbody></table>`;
    ca.insertAdjacentHTML("beforeend", `<p class="note">average ρ = <b class="num">${S.accMean.toFixed(2)}</b> · 1 = exact order, 0 = random</p>`);
  }
}
