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
    document.title = `Team DNA ${y} — Minisector`;
  } catch (e) { }

  root.innerHTML = `
  <header class="top"><div class="top-inner">
    <div class="title-row">
      <span class="picker">
        <button id="homeBtn" class="btn" title="All weekends" aria-label="All weekends">≡</button>
        <select id="dnaYear" aria-label="Season">${years.map(yy => `<option ${yy === y ? "selected" : ""}>${yy}</option>`).join("")}</select>
        <span class="gp" style="font-size:16px">Team DNA — ${esc(y)} only</span>
      </span>
      <span class="meta">one season at a time: cars change every year, so no performance data crosses seasons</span>
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

  /* header card: what this is + honesty */
  const doneN = S.rounds.filter(r => r.circuit).length;
  const intro = card(main, `What the ${y} cars are actually good at`,
    `built ONLY from ${y}'s ${doneN} dry weekend${doneN > 1 ? "s" : ""} — other seasons are never mixed in`);
  intro.insertAdjacentHTML("beforeend", `<p class="note"><b>How to read the cards:</b> every corner of every ${y} track is sorted into
    <b>slow</b> (&lt;150 km/h), <b>medium</b> (&lt;230) or <b>fast</b> (≥230), and each car's best qualifying speed through it is compared with
    the fastest car through that same corner. A bar of <span class="num">−6.7 km/h</span> in slow corners means: through slow corners, this car
    is on average 6.7 km/h down on whoever is quickest there. Shorter bar = stronger. Straight-line comes from speed traps.
    ${S.accMean != null ? `The circuit predictions are checked against reality below — average rank correlation <b class="num">ρ = ${S.accMean.toFixed(2)}</b> across ${S.acc.length} rounds (1 = predicts the exact order, 0 = random guessing).` : ""}</p>`);

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
  const maxDef = {};
  for (const cls of ["slow", "med", "fast"]) maxDef[cls] = Math.max(...teams.map(([, t]) => t.def[cls] ?? 0), 1);
  const maxTrap = Math.max(...teams.map(([, t]) => t.trap ?? 0), 1);
  const evName = slug => (circuits.find(c => c.slug === slug) || {}).event || slug;

  for (const [tm, t] of teams) {
    const col = teamCol(S.colors[tm] || "#888");
    const el = document.createElement("div"); el.className = "card dna-card"; grid.appendChild(el);
    const rows = [
      ["Slow corners", t.def.slow, maxDef.slow, "km/h", t.defN?.slow],
      ["Medium corners", t.def.med, maxDef.med, "km/h", t.defN?.med],
      ["Fast corners", t.def.fast, maxDef.fast, "km/h", t.defN?.fast],
      ["Straight-line", t.trap, maxTrap, "km/h", null],
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
        <span class="dna-gaps num">Quali ${t.quali === 0 ? "fastest" : "+" + t.quali.toFixed(2) + "%"}${t.race != null ? ` · Race ${t.race === 0 ? "fastest" : "+" + t.race.toFixed(2) + " s/lap"}` : ""}</span></div>
      <div class="dna-bars">${rows.map(([lab, v, mx, unit, n]) => `
        <div class="dna-row"><span class="dna-lab">${lab}</span>
          <span class="dna-track"><i style="width:${v == null ? 0 : Math.max(3, v / mx * 100).toFixed(1)}%;background:${col}"></i></span>
          <span class="num dna-val">${v == null ? "—" : "−" + v.toFixed(1) + " " + unit}</span></div>`).join("")}
      </div>
      <p class="dna-note hint">speed given up to the best car through each corner type · averaged over ${t.n} dry ${esc(y)} weekends</p>
      ${ranked.length ? `<div class="dna-fit"><span><b>Should over-perform at:</b> ${best3.map(fmtC).join(" · ")}</span>
      <span><b>Should struggle at:</b> ${worst3.map(fmtC).join(" · ")}</span>
      <span class="hint">±s vs this car's own average circuit — its layout sensitivity, not a cross-team ranking</span></div>` : ""}
      ${tempNote}`;
  }
  main.insertAdjacentHTML("beforeend", `<p class="note">◦ = circuit not run yet in ${y}: layout characterised from the most recent archived visit — a genuine prediction.</p>`);

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
