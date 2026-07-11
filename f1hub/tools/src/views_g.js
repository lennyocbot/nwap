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
  root.innerHTML = `<div id="loading"><div style="font-size:15px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Team <span style="color:var(--accent)">DNA</span></div><div class="bar"><i></i></div><div style="font-size:12px">loading team profiles…</div></div>`;
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
  <footer>Every input is measured: corner minimum speeds (±90 m windows, best car per corner as reference), speed traps, dry qualifying and clean-lap race gaps. The circuit-fit score pushes those deficits through simple kinematics (Δt = L·Δv/v² per corner) with one season calibration constant — wet sessions excluded, no hand-tuning. Unofficial analysis, not associated with Formula 1.</footer>`;

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
  const minQuali = Math.min(...teams.map(([, t]) => t.quali));
  const minRace = Math.min(...teams.map(([, t]) => t.race).filter(v => v != null));
  const relQ = t => t.quali - minQuali;
  const relR = t => t.race != null ? t.race - minRace : null;
  const fmtQ = t => relQ(t) < 0.005 ? "fastest" : "+" + relQ(t).toFixed(2) + "%";
  const fmtR = t => relR(t) == null ? null : relR(t) < 0.005 ? "fastest" : "+" + relR(t).toFixed(2) + " s/lap";

  /* header card: what this is + honesty */
  const doneN = S.rounds.filter(r => r.circuit).length;
  const intro = card(main, `What the ${y} cars are actually good at`,
    `built ONLY from ${y}'s ${doneN} dry weekend${doneN > 1 ? "s" : ""} — other seasons are never mixed in`);
  intro.insertAdjacentHTML("beforeend", `<p class="note"><b>How to read the cards:</b> every corner of every ${y} track is sorted into
    <b>slow</b> (&lt;150 km/h), <b>medium</b> (&lt;230) or <b>fast</b> (≥230), and each car's best qualifying speed through it is compared with
    the fastest car through that same corner. A bar of <span class="num">−6.7 km/h</span> in slow corners means: through slow corners, this car
    is on average 6.7 km/h down on whoever is quickest there. Shorter bar = stronger. Straight-line comes from speed traps.
    <br><br><b>Why no corner bar shows 0.0:</b> the reference there is the best car at each <i>individual</i> corner — no team is quickest through every slow corner on the calendar, so even the class leader (marked ★, ranked P1) averages a little above zero. The quali and race <b>gaps</b>, by contrast, are shown relative to the leading team: the fastest car reads “fastest”, everyone else their gap to it.
    ${S.accMean != null ? `<br><br>The circuit predictions are checked against reality below — average rank correlation <b class="num">ρ = ${S.accMean.toFixed(2)}</b> across ${S.acc.length} rounds (1 = predicts the exact order, 0 = random guessing).` : ""}</p>`);

  /* season pace ranking: who has the fastest car right now */
  {
    const cr = card(main, `${y} season pace ranking`,
      "gaps to the fastest car · quali = median dry qualifying gap · race = median clean-lap race pace");
    const wr = document.createElement("div"); wr.className = "tblwrap"; cr.appendChild(wr);
    wr.innerHTML = `<table class="t"><thead><tr><th class="r">#</th><th>Team</th><th class="r">Quali gap</th><th class="r">Race pace</th><th class="r">Weekends</th></tr></thead><tbody>` +
      teams.map(([tm, t], i) => `<tr><td class="r num">${i + 1}</td>
        <td><span class="drv-cell"><span class="dot" style="background:${teamCol(S.colors[tm] || "#888")}"></span>${esc(tm)}</span></td>
        <td class="r num ${relQ(t) < 0.005 ? "best" : ""}">${fmtQ(t)}</td>
        <td class="r num ${relR(t) != null && relR(t) < 0.005 ? "best" : ""}">${fmtR(t) ?? "—"}</td>
        <td class="r num">${t.n}</td></tr>`).join("") + "</tbody></table>";
  }

  /* pace evolution: gap to each weekend's pole, round by round — upgrades
     (or a car falling behind the development race) show up as the trend */
  {
    const dryRounds = S.rounds.filter(r => !r.wetQ && r.quali && Object.keys(r.quali).length >= 6);
    if (dryRounds.length >= 3) {
      const ce = card(main, "Pace evolution — gap to pole, round by round",
        "dry qualifying only · 0% = fastest that weekend · a line trending down = the car is gaining relative pace (upgrades working)");
      const div = document.createElement("div"); div.className = "chart"; ce.appendChild(div);
      const allV = dryRounds.flatMap(r => teams.map(([tm]) => r.quali[tm]).filter(v => v != null));
      const rMin = Math.min(...dryRounds.map(r => r.round)), rMax = Math.max(...dryRounds.map(r => r.round));
      const mob = innerWidth < 700;
      const ch = Chart(div, {
        h: mob ? 300 : 380, mr: 52, xd: [rMin - 0.4, rMax + 0.4], yd: [-0.1, Math.min(Math.max(...allV) + 0.3, quantile(allV, 0.97) + 0.8)],
        yflip: true, xticksArr: dryRounds.map(r => r.round), xfmt: v => "R" + v,
        yfmt: v => v.toFixed(1) + "%", xlab: "round", ylab: "quali gap to pole", label: "Pace evolution",
      });
      const endL = [];
      const nodes = [], nData = [];
      for (const [tm] of teams) {
        const col = teamCol(S.colors[tm] || "#888");
        const pts = dryRounds.map(r => r.quali[tm] != null ? [r.round, r.quali[tm]] : null);
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
        return `<div class="t-title">${esc(tm)} — R${p[0]} ${esc(rnd ? rnd.event : "")}</div>quali gap to pole: <b class="num">${p[1] === 0 ? "fastest" : "+" + p[1].toFixed(2) + "%"}</b>`;
      });
      ce.insertAdjacentHTML("beforeend", `<p class="note">Wet qualifying weekends are left out (gaps mean nothing in changing rain). Round-to-round wiggle is normal — circuits suit different cars — so read the <b>trend</b>, not single spikes.</p>`);
    }
  }

  /* relative calibrated fits: per circuit, gap to the best team's score */
  const k = S.calib || 1;
  const slugsDone = S.rounds.filter(r => r.circuit).map(r => ({ slug: r.slug, event: r.event, round: r.round, done: true }));
  const slugsUp = (S.upcoming || []).map(u => ({ slug: u.slug, event: u.event, from: u.from, done: false }));
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
  const grid = document.createElement("div"); grid.className = "dna-grid"; main.appendChild(grid);
  const maxDef = {}, minDef = {};
  for (const cls of ["slow", "med", "fast"]) {
    const vals = teams.map(([, t]) => t.def[cls]).filter(v => v != null);
    maxDef[cls] = Math.max(...vals, 1);
    minDef[cls] = Math.min(...vals);
  }
  const trapVals = teams.map(([, t]) => t.trap).filter(v => v != null);
  const maxTrap = Math.max(...trapVals, 1), minTrap = Math.min(...trapVals);
  // rank every team within each corner class (and straight-line)
  const rankIn = {};
  for (const cls of ["slow", "med", "fast"]) {
    const order = teams.filter(([, t]) => t.def[cls] != null).sort((a, b) => a[1].def[cls] - b[1].def[cls]);
    rankIn[cls] = new Map(order.map(([tm], i) => [tm, i + 1]));
  }
  rankIn.trap = new Map(teams.filter(([, t]) => t.trap != null).sort((a, b) => a[1].trap - b[1].trap).map(([tm], i) => [tm, i + 1]));
  const evName = slug => (circuits.find(c => c.slug === slug) || {}).event || slug;

  for (const [tm, t] of teams) {
    const col = teamCol(S.colors[tm] || "#888");
    const el = document.createElement("div"); el.className = "card dna-card"; grid.appendChild(el);
    const rows = [
      ["Slow corners", t.def.slow, maxDef.slow, "km/h", t.def.slow != null && t.def.slow === minDef.slow, rankIn.slow.get(tm)],
      ["Medium corners", t.def.med, maxDef.med, "km/h", t.def.med != null && t.def.med === minDef.med, rankIn.med.get(tm)],
      ["Fast corners", t.def.fast, maxDef.fast, "km/h", t.def.fast != null && t.def.fast === minDef.fast, rankIn.fast.get(tm)],
      ["Straight-line", t.trap, maxTrap, "km/h", t.trap != null && t.trap === minTrap, rankIn.trap.get(tm)],
    ];
    // best/worst tracks relative to the car's OWN average across circuits —
    // never a cross-team claim (the pure corner model has per-team bias)
    const myRel = rel[tm] || {};
    const own = median(Object.values(myRel)) ?? 0;
    const ranked = Object.entries(myRel).map(([slug, v]) => [slug, v - own]).sort((a, b) => a[1] - b[1]);
    const best3 = ranked.slice(0, 3), worst3 = ranked.slice(-3).reverse();
    const up = new Set(slugsUp.map(u => u.slug));
    const fmtC = ([slug, v]) => `${esc(evName(slug)).replace(" Grand Prix", "")}${up.has(slug) ? " ◦" : ""} <span class="num" style="color:var(--ink3)">${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}</span>`;

    let tempNote = "";
    if (t.temp && Math.abs(t.temp.r) >= 0.45) {
      const hot = t.temp.slope10 < 0;
      tempNote = `<p class="dna-temp">${hot ? "🌡 relatively stronger in <b>hot</b> races" : "❄ relatively stronger in <b>cool</b> races"} — race-pace gap ${hot ? "shrinks" : "grows"} ${Math.abs(t.temp.slope10).toFixed(2)}s per +10 °C track temp (correlation r = ${t.temp.r}, ${t.temp.n} races; suggestive, not proof)</p>`;
    }

    el.innerHTML = `
      <div class="dna-head"><span class="dot" style="background:${col};width:12px;height:12px"></span><b>${esc(tm)}</b>
        <span class="dna-gaps num">Quali ${fmtQ(t)}${fmtR(t) != null ? ` · Race ${fmtR(t)}` : ""}</span></div>
      <div class="dna-bars">${rows.map(([lab, v, mx, unit, best, rk]) => `
        <div class="dna-row"><span class="dna-lab">${lab}${rk ? ` <b class="num" style="color:${rk === 1 ? "var(--green)" : "var(--ink3)"}">P${rk}</b>` : ""}</span>
          <span class="dna-track"><i style="width:${v == null ? 0 : Math.max(3, v / mx * 100).toFixed(1)}%;background:${col}"></i></span>
          <span class="num dna-val" ${best ? 'style="color:var(--green);font-weight:700" title="best of all teams in this corner type"' : ""}>${v == null ? "—" : "−" + v.toFixed(1) + " " + unit}${best ? " ★" : ""}</span></div>`).join("")}
      </div>
      <p class="dna-note hint">speed given up to the best car through each corner type · averaged over ${t.n} dry ${esc(y)} weekends</p>
      ${ranked.length ? `<div class="dna-fit"><span><b>Should over-perform at:</b> ${best3.map(fmtC).join(" · ")}</span>
      <span><b>Should struggle at:</b> ${worst3.map(fmtC).join(" · ")}</span>
      <span class="hint">±s vs this car's own average circuit — its layout sensitivity, not a cross-team ranking</span></div>` : ""}
      ${tempNote}`;
  }
  main.insertAdjacentHTML("beforeend", `<p class="note">◦ = circuit not run yet in ${y}: layout characterised from the most recent archived visit — a genuine prediction.</p>`);

  /* circuit predictor: pick any track → full predicted order with margins */
  const ownMed0 = {};
  for (const [tm] of teams) ownMed0[tm] = median(Object.values(rel[tm] || {})) ?? 0;
  {
    const cp = card(main, "Circuit predictor",
      "pick a circuit — predicted order with margins, before the weekend happens · baseline = measured season pace, circuit swing from the corner-class model");
    const selEl = document.createElement("select");
    const opts = circuits.filter(c => teams.some(([tm]) => rel[tm]?.[c.slug] != null));
    const firstUp = opts.find(c => !c.done);
    if (!renderTeams._pick || !opts.some(c => c.slug === renderTeams._pick)) renderTeams._pick = (firstUp || opts.at(-1) || {}).slug;
    selEl.innerHTML = opts.map(c => `<option value="${esc(c.slug)}" ${c.slug === renderTeams._pick ? "selected" : ""}>${c.done ? "✓" : "◦"} ${esc(c.event)}${c.from ? ` ('${String(c.from).slice(2)} layout)` : ""}</option>`).join("");
    cp.querySelector(".right").appendChild(selEl);
    const holder = document.createElement("div"); cp.appendChild(holder);
    const drawPick = () => {
      holder.innerHTML = "";
      const slug = renderTeams._pick;
      const rows = teams.map(([tm, t]) => {
        const r = rel[tm]?.[slug];
        if (r == null) return null;
        const swing = r - ownMed0[tm];
        return { tm, q: t.quali / 100 * 90 + swing, r: t.race != null ? t.race + swing : null, swing };
      }).filter(Boolean).sort((a, b) => a.q - b.q);
      if (!rows.length) { holder.innerHTML = `<div class="empty">No prediction possible here.</div>`; return; }
      const qBase = rows[0].q, rBase = Math.min(...rows.map(x => x.r).filter(v => v != null));
      const wrp = document.createElement("div"); wrp.className = "tblwrap"; holder.appendChild(wrp);
      wrp.innerHTML = `<table class="t"><thead><tr><th class="r">#</th><th>Team</th><th class="r">Predicted quali gap</th><th class="r">Predicted race pace</th><th class="r">Layout swing</th></tr></thead><tbody>` +
        rows.map((x, i) => `<tr><td class="r num">${i + 1}</td>
          <td><span class="drv-cell"><span class="dot" style="background:${teamCol(S.colors[x.tm] || "#888")}"></span>${esc(x.tm)}</span></td>
          <td class="r num ${i === 0 ? "best" : ""}">${i === 0 ? "fastest" : "+" + (x.q - qBase).toFixed(2) + "s"}</td>
          <td class="r num">${x.r == null ? "—" : x.r - rBase < 0.005 ? "fastest" : "+" + (x.r - rBase).toFixed(2) + " s/lap"}</td>
          <td class="r num" style="color:${x.swing < -0.03 ? "var(--green)" : x.swing > 0.03 ? "var(--red)" : "var(--ink3)"}">${x.swing >= 0 ? "+" : "−"}${Math.abs(x.swing).toFixed(2)}s</td></tr>`).join("") + "</tbody></table>";
      holder.insertAdjacentHTML("beforeend", `<p class="note">Layout swing = how much this track's corner mix helps (green) or hurts (red) each car vs its own average circuit — that's the model's contribution; the rest is measured ${y} pace. Quali gaps on a nominal 90 s lap; race pace in s/lap. Reliability of the ordering: ρ = ${S.accMean != null ? S.accMean.toFixed(2) : "—"} (leave-one-out, see bottom).</p>`);
    };
    selEl.addEventListener("change", () => { renderTeams._pick = selEl.value; drawPick(); });
    drawPick();
  }

  /* prediction matrix: each car anchored to its measured season quali pace,
     the model contributes only circuit-to-circuit variation */
  const cm = card(main, "Circuit fit — every team at every circuit",
    `estimated quali gap (s) to the strongest car · baseline = measured ${y} quali pace (nominal 90 s lap), circuit swing from the corner-class model · ✓ raced in ${y} · ◦ prediction`);
  const w = document.createElement("div"); w.className = "tblwrap"; cm.appendChild(w);
  const ownMed = {};
  for (const [tm] of teams) ownMed[tm] = median(Object.values(rel[tm] || {})) ?? 0;
  const pred = (tm, slug) => {
    const r = rel[tm]?.[slug];
    if (r == null) return null;
    return S.teams[tm].quali / 100 * 90 + (r - ownMed[tm]);
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
        const heat = Math.min(1, v / vMax);
        return `<td class="r num" style="background:rgba(224,57,58,${(heat * 0.28).toFixed(3)})">${v < 0.005 ? "best" : "+" + v.toFixed(2)}</td>`;
      }).join("") + "</tr>").join("") + "</tbody></table>";

  /* honesty table */
  if (S.acc && S.acc.length) {
    const ca = card(main, "How honest is this model?",
      "leave-one-out: each weekend is predicted by a model rebuilt WITHOUT that weekend's data, then compared with the real qualifying order");
    const wa = document.createElement("div"); wa.className = "tblwrap"; ca.appendChild(wa);
    wa.innerHTML = `<table class="t"><thead><tr><th>Round</th><th>Grand Prix</th><th class="r">ρ predicted vs actual</th><th style="min-width:130px"></th></tr></thead><tbody>` +
      S.acc.map(a => `<tr><td class="num">R${a.round}</td><td>${esc(a.event)}</td><td class="r num">${a.rho.toFixed(2)}</td>
        <td><div style="height:6px;border-radius:3px;background:var(--surface3);overflow:hidden"><div style="height:100%;width:${Math.max(0, a.rho * 100).toFixed(0)}%;background:${a.rho > 0.6 ? "var(--green)" : a.rho > 0.3 ? "var(--yellow)" : "var(--red)"}"></div></div></td></tr>`).join("") +
      `</tbody></table>`;
    ca.insertAdjacentHTML("beforeend", `<p class="note">Average ρ = <b class="num">${S.accMean.toFixed(2)}</b>. The model only knows corner speeds, speed traps and lap geometry from <i>other</i> weekends — it never sees the lap times or results of the weekend it predicts.</p>`);
  }
}
