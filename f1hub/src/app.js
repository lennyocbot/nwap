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

HUB.render = function render() {
  const S = HUB.S;
  // session seg
  document.querySelectorAll("#sessions button").forEach(b => b.classList.toggle("on", b.dataset.sid === S.sid));
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
  const main = document.getElementById("view");
  main.innerHTML = "";
  tipHide();
  const tab = TABS.find(t => t[0] === S.tab) || TABS[0];
  try { tab[2](main); }
  catch (err) {
    main.innerHTML = `<div class="empty">Something broke rendering this view: <b>${esc(err.message)}</b></div>`;
    console.error(err);
  }
};

function buildShell() {
  const d = HUB.data;
  const root = document.getElementById("app");
  const dates = d.sessions.length ? new Date(d.sessions[0].date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " – " + new Date(d.sessions.at(-1).date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
  root.innerHTML = `
  <header class="top"><div class="top-inner">
    <div class="title-row">
      <span class="gp">${esc(d.event)} ${d.year}</span>
      <span class="meta">Round ${d.round} · ${esc(d.location)}, ${esc(d.country)} · ${esc(dates)}${d.format.includes("sprint") ? " · Sprint weekend" : ""}</span>
      <span class="brand">F1 <b>Analysis Hub</b></span>
    </div>
    <div class="ctrl-row">
      <div class="seg" id="sessions">${d.sessions.map(s => `<button data-sid="${s.id}">${SNAMES[s.id] || s.id}</button>`).join("")}</div>
      <nav class="tabs" id="tabs">${TABS.map(t => `<button data-tab="${t[0]}">${t[1]}</button>`).join("")}</nav>
    </div>
  </div></header>
  <main id="view"></main>
  <footer>Data: F1 live timing via <span class="mono">FastF1</span> · lap telemetry resampled to ${280} points/lap · times are official classification where available.
  Unofficial analysis tool for personal use — not associated with Formula 1.</footer>`;

  document.querySelectorAll("#sessions button").forEach(b =>
    b.addEventListener("click", () => { HUB.S.sid = b.dataset.sid; HUB.S.lrSel = null; HUB.render(); }));
  document.querySelectorAll("#tabs button").forEach(b =>
    b.addEventListener("click", () => { HUB.S.tab = b.dataset.tab; HUB.render(); }));

  // re-render on resize / theme change (colors + widths are sampled at render time)
  let rT;
  addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(HUB.render, 220); });
  new MutationObserver(() => HUB.render()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => HUB.render());
}

(async function boot() {
  try {
    HUB.data = await decodeBundle();
  } catch (err) {
    document.getElementById("loading").innerHTML = "Failed to decode data bundle: " + esc(err.message);
    return;
  }
  const S = HUB.S;
  const last = HUB.data.sessions.at(-1);
  S.sid = last ? last.id : HUB.data.sessions[0].id;
  S.sel = new Set(HUB.session().drivers.map(d => d.abbr));
  HUB.restore();
  document.getElementById("loading").remove();
  buildShell();
  HUB.render();
})();
