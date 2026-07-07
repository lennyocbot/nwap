/* ============ app shell & boot ============ */
"use strict";

const TABS = [
  ["overview", "Overview", viewOverview],
  ["pace", "Pace", viewPace],
  ["deg", "Tyres & Deg", viewDeg],
  ["longruns", "Long Runs", viewLongRuns],
  ["quali", "Qualifying", viewQuali],
  ["race", "Race", viewRace],
  ["tel", "Telemetry", viewTel],
  ["weather", "Weather", viewWeather],
];
const MODE = typeof HUB_MODE !== "undefined" ? HUB_MODE : "embedded";

HUB.render = function render() {
  const S = HUB.S;
  document.querySelectorAll("#sessions button").forEach(b => b.classList.toggle("on", b.dataset.sid === S.sid));
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
  const main = document.getElementById("view");
  if (!main) return;
  main.innerHTML = "";
  tipHide();
  const tab = TABS.find(t => t[0] === S.tab) || TABS[0];
  try { tab[2](main); }
  catch (err) {
    main.innerHTML = `<div class="empty">Something broke rendering this view: <b>${esc(err.message)}</b></div>`;
    console.error(err);
  }
};

function showLoading(msg) {
  document.getElementById("app").innerHTML =
    `<div id="loading"><div style="font-size:15px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Mini<span style="color:var(--accent)">sector</span></div><div class="bar"><i></i></div><div style="font-size:12px" id="loadmsg">${esc(msg)}</div></div>`;
}
function showError(msg) {
  document.getElementById("app").innerHTML = `<div id="loading"><div class="empty"><b>Could not load data.</b><br>${esc(msg)}</div></div>`;
}

function buildShell() {
  const d = HUB.data;
  const root = document.getElementById("app");
  const dates = d.sessions.length ? new Date(d.sessions[0].date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " – " + new Date(d.sessions.at(-1).date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

  let titleHtml;
  if (MODE === "site" && HUB.manifest) {
    const years = Object.keys(HUB.manifest.years).sort();
    titleHtml = `<span class="picker">
      <select id="pyear">${years.map(y => `<option ${+y === d.year ? "selected" : ""}>${y}</option>`).join("")}</select>
      <select id="pevent">${HUB.manifest.years[String(d.year)].map(e => `<option value="${e.round}" ${e.round === d.round ? "selected" : ""}>R${e.round} · ${esc(e.event)}</option>`).join("")}</select>
    </span>`;
  } else {
    titleHtml = `<span class="gp">${esc(d.event)} ${d.year}</span>`;
  }

  root.innerHTML = `
  <header class="top"><div class="top-inner">
    <div class="title-row">
      ${titleHtml}
      <span class="meta">Round ${d.round} · ${esc(d.location)}, ${esc(d.country)} · ${esc(dates)}${String(d.format).includes("sprint") ? " · Sprint weekend" : ""}</span>
      <span class="brand">Mini<b>sector</b> · F1 analysis</span>
    </div>
    <div class="ctrl-row">
      <div class="seg" id="sessions">${d.sessions.map(s => `<button data-sid="${s.id}">${SNAMES[s.id] || s.id}</button>`).join("")}</div>
      <nav class="tabs" id="tabs">${TABS.map(t => `<button data-tab="${t[0]}">${t[1]}</button>`).join("")}</nav>
    </div>
  </div></header>
  <main id="view"></main>
  <footer>Data: F1 live timing via <span class="mono">FastF1</span> · lap telemetry resampled to 280 points/lap · times are official classification where available.
  ${MODE === "site" && HUB.manifest ? `Data updated <span class="num">${esc((HUB.manifest.generated || "").slice(0, 16).replace("T", " "))} UTC</span> · ` : ""}Unofficial analysis tool for personal use — not associated with Formula 1.</footer>`;

  document.querySelectorAll("#sessions button").forEach(b =>
    b.addEventListener("click", () => { HUB.S.sid = b.dataset.sid; HUB.S.lrSel = null; HUB.render(); }));
  document.querySelectorAll("#tabs button").forEach(b =>
    b.addEventListener("click", () => { HUB.S.tab = b.dataset.tab; HUB.render(); }));

  if (MODE === "site" && HUB.manifest) {
    const py = document.getElementById("pyear"), pe = document.getElementById("pevent");
    py.addEventListener("change", () => {
      const list = HUB.manifest.years[py.value];
      selectWeekend(+py.value, list.at(-1).round);
    });
    pe.addEventListener("change", () => selectWeekend(d.year, +pe.value));
  }
}

function initState() {
  const S = HUB.S;
  const last = HUB.data.sessions.at(-1);
  S.sid = last ? last.id : HUB.data.sessions[0].id;
  S.sel = new Set(HUB.session().drivers.map(dd => dd.abbr));
  S.compare = []; S.telZoom = null; S.lrSel = null; S.degCmp = null; S.qseg = 3;
  HUB.restore();
}

async function selectWeekend(year, round) {
  const entry = (HUB.manifest.years[String(year)] || []).find(e => e.round === round);
  if (!entry) return;
  showLoading(`fetching ${entry.event} ${year}…`);
  try {
    const sids = Object.keys(entry.sessions);
    const loaded = await Promise.all(sids.map(sid => fetchSession(entry.sessions[sid].file)));
    HUB.data = {
      year: +year, round: entry.round, event: entry.event, location: entry.location,
      country: entry.country, format: entry.format, sessions: loaded,
    };
  } catch (err) {
    showError(err.message);
    return;
  }
  initState();
  buildShell();
  HUB.render();
  try { history.replaceState(null, "", `#${year}/${round}`); } catch (e) { }
}

let listenersArmed = false;
function armGlobalListeners() {
  if (listenersArmed) return;
  listenersArmed = true;
  let rT;
  addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => HUB.data && HUB.render(), 220); });
  addEventListener("hashchange", () => {
    if (MODE !== "site" || !HUB.manifest) return;
    const m = location.hash.match(/^#(\d{4})\/(\d+)$/);
    if (m && HUB.data && !(+m[1] === HUB.data.year && +m[2] === HUB.data.round)
        && (HUB.manifest.years[m[1]] || []).some(e => e.round === +m[2]))
      selectWeekend(+m[1], +m[2]);
  });
  new MutationObserver(() => HUB.data && HUB.render()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => HUB.data && HUB.render());
}

(async function boot() {
  armGlobalListeners();
  if (MODE === "site") {
    let manifest;
    try {
      const r = await fetch("manifest.json", { cache: "no-cache" });
      if (!r.ok) throw new Error("manifest.json: HTTP " + r.status);
      manifest = await r.json();
    } catch (err) { showError(err.message); return; }
    HUB.manifest = manifest;
    const years = Object.keys(manifest.years).sort();
    if (!years.length) { showError("No weekends in the data set yet — run the data updater."); return; }
    // deep link #year/round, else latest weekend of latest season
    let y = +years.at(-1), r = manifest.years[years.at(-1)].at(-1).round;
    const m = location.hash.match(/^#(\d{4})\/(\d+)$/);
    if (m && manifest.years[m[1]] && manifest.years[m[1]].some(e => e.round === +m[2])) { y = +m[1]; r = +m[2]; }
    await selectWeekend(y, r);
  } else {
    try { HUB.data = await decodeBundle(); }
    catch (err) { showError("Failed to decode data bundle: " + err.message); return; }
    initState();
    buildShell();
    HUB.render();
  }
})();
