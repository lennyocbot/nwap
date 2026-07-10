/* ============ app shell & boot ============ */
"use strict";

/* tabs are contextual: only the ones that make sense for the current session show up */
const TABS = [
  ["overview", "Overview", viewOverview, () => true],
  ["pace", "Pace", viewPace, () => true],
  ["deg", "Tyres & Deg", viewDeg, sid => ["R", "S", "FP1", "FP2", "FP3"].includes(sid)],
  ["longruns", "Long Runs", viewLongRuns, sid => sid.startsWith("FP")],
  ["quali", "Qualifying", viewQuali, sid => sid === "Q" || sid === "SQ"],
  ["race", "Race", viewRace, sid => sid === "R" || sid === "S"],
  ["straights", "Straights", viewStraights, () => true],
  ["tel", "Telemetry", viewTel, () => true],
  ["weather", "Weather", viewWeather, () => true],
];
const MODE = typeof HUB_MODE !== "undefined" ? HUB_MODE : "embedded";

function renderTabs() {
  const S = HUB.S, nav = document.getElementById("tabs");
  if (!nav) return;
  const avail = TABS.filter(t => t[3](S.sid));
  if (!avail.some(t => t[0] === S.tab)) S.tab = "overview";
  nav.innerHTML = avail.map(t =>
    `<button data-tab="${t[0]}" class="${t[0] === S.tab ? "on" : ""}">${t[1]}${t[0] === "tel" && S.compare.length ? ` <span class="cnt">${S.compare.length}</span>` : ""}</button>`).join("");
  nav.querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => { S.tab = b.dataset.tab; HUB.render(); }));
}

HUB.render = function render() {
  const S = HUB.S;
  document.querySelectorAll("#sessions button").forEach(b => b.classList.toggle("on", b.dataset.sid === S.sid));
  renderTabs();
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
  const canEscape = MODE === "site" && HUB.manifest;
  document.getElementById("app").innerHTML =
    `<div id="loading"><div style="font-size:15px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Mini<span style="color:var(--accent)">sector</span></div><div class="bar"><i></i></div><div style="font-size:12px" id="loadmsg">${esc(msg)}</div>${canEscape ? '<button class="btn" id="cancelLoad">← all weekends</button>' : ""}</div>`;
  const c = document.getElementById("cancelLoad");
  if (c) c.addEventListener("click", showPicker);
}
function showError(msg) {
  const canEscape = MODE === "site" && HUB.manifest;
  document.getElementById("app").innerHTML =
    `<div id="loading"><div class="empty"><b>Could not load data.</b><br>${esc(msg)}<br><br>
    ${HUB._last ? '<button class="btn pri" id="retryBtn">Retry</button> ' : ""}${canEscape ? '<button class="btn" id="backBtn">All weekends</button>' : ""}</div></div>`;
  const r = document.getElementById("retryBtn");
  if (r) r.addEventListener("click", () => selectWeekend(HUB._last.y, HUB._last.r));
  const b = document.getElementById("backBtn");
  if (b) b.addEventListener("click", showPicker);
}

function buildShell() {
  const d = HUB.data;
  const root = document.getElementById("app");
  const dates = d.sessions.length ? new Date(d.sessions[0].date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " – " + new Date(d.sessions.at(-1).date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

  let titleHtml;
  if (MODE === "site" && HUB.manifest) {
    const years = Object.keys(HUB.manifest.years).sort();
    titleHtml = `<span class="picker">
      <button id="homeBtn" class="btn" title="All weekends" aria-label="All weekends">≡</button>
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
      <span id="themeSlot"></span>
    </div>
    <div class="ctrl-row">
      <div class="seg" id="sessions">${d.sessions.map(s => `<button data-sid="${s.id}">${SNAMES[s.id] || s.id}</button>`).join("")}</div>
      <nav class="tabs" id="tabs"></nav>
    </div>
  </div></header>
  <main id="view"></main>
  <footer>Data: F1 live timing via <span class="mono">FastF1</span> · lap telemetry resampled to 280 points/lap · times are official classification where available.
  ${MODE === "site" && HUB.manifest ? `Data updated <span class="num">${esc((HUB.manifest.generated || "").slice(0, 16).replace("T", " "))} UTC</span> · ` : ""}Unofficial analysis tool for personal use — not associated with Formula 1.</footer>`;

  document.querySelectorAll("#sessions button").forEach(b =>
    b.addEventListener("click", () => { HUB.S.sid = b.dataset.sid; HUB.S.lrSel = null; HUB.render(); }));

  if (MODE === "site" && HUB.manifest) {
    const py = document.getElementById("pyear"), pe = document.getElementById("pevent");
    py.addEventListener("change", () => {
      const list = HUB.manifest.years[py.value];
      selectWeekend(+py.value, list.at(-1).round);
    });
    pe.addEventListener("change", () => selectWeekend(d.year, +pe.value));
    document.getElementById("homeBtn").addEventListener("click", showPicker);
  }
  const slot = document.getElementById("themeSlot");
  if (slot && MODE === "site") slot.appendChild(themeToggleBtn());
}

/* landing screen: choose a weekend */
function showPicker() {
  const m = HUB.manifest;
  const root = document.getElementById("app");
  const years = Object.keys(m.years).sort().reverse();
  root.innerHTML = `<div class="pick-screen">
    <div class="pick-brand">Mini<b>sector</b><span id="pickTheme"></span></div>
    <div class="pick-sub">F1 race-weekend analysis — pick a Grand Prix</div>
    ${years.map(y => `<div class="pick-year">${y} <span>${m.years[y].length} weekend${m.years[y].length > 1 ? "s" : ""}</span></div>
      <div class="pick-grid">${[...m.years[y]].reverse().map(e => `
        <button class="pick-card" data-y="${y}" data-r="${e.round}">
          <span class="pc-top"><span class="pc-round">R${e.round}</span>${String(e.format).includes("sprint") ? '<span class="pc-sprint">SPRINT</span>' : ""}</span>
          <span class="pc-name">${esc(e.event)}</span>
          <span class="pc-meta">${esc(e.location)}, ${esc(e.country)}${e.date ? " · " + new Date(e.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""}</span>
          <span class="pc-sess">${Object.keys(e.sessions).map(sid => `<i>${SNAMES[sid] || sid}</i>`).join("")}</span>
        </button>`).join("")}</div>`).join("")}
    <div class="pick-foot">Data via FastF1 · new sessions appear automatically ~1–3 h after they end · unofficial, not associated with Formula 1</div>
  </div>`;
  root.querySelectorAll(".pick-card").forEach(b =>
    b.addEventListener("click", () => selectWeekend(+b.dataset.y, +b.dataset.r)));
  const ts = root.querySelector("#pickTheme");
  if (ts && MODE === "site") ts.appendChild(themeToggleBtn());
  HUB.viewing = null;
  try {
    if (location.hash) history.pushState(null, "", location.pathname + location.search);
    document.title = "Minisector — F1 analysis";
  } catch (e) { }
}

function initState() {
  const S = HUB.S;
  const last = HUB.data.sessions.at(-1);
  S.sid = last ? last.id : HUB.data.sessions[0].id;
  // phones start with the top 5 selected — 22 lines on a small screen is soup;
  // desktop gets the union of every session's roster so FP-only rookies show up too
  const order = [...HUB.session().drivers].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  if (innerWidth < 700) S.sel = new Set(order.slice(0, 5).map(dd => dd.abbr));
  else S.sel = new Set(HUB.data.sessions.flatMap(ss => ss.drivers.map(dd => dd.abbr)));
  S.compare = []; S.telZoom = null; S.lrSel = null; S.degCmp = null; S.qseg = 3;
  HUB.restore();
}

async function selectWeekend(year, round) {
  const entry = (HUB.manifest.years[String(year)] || []).find(e => e.round === round);
  if (!entry) return;
  HUB._last = { y: year, r: round };
  showLoading(`fetching ${entry.event} ${year}…`);
  try {
    const sids = Object.keys(entry.sessions);
    const total = sids.reduce((a, sid) => a + (entry.sessions[sid].size || 0), 0);
    let got = 0;
    const onBytes = n => {
      got = Math.max(0, got + n);
      const el = document.getElementById("loadmsg");
      if (el && total) el.textContent = `fetching ${entry.event} ${year} — ${(got / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`;
    };
    const loaded = await Promise.all(sids.map(sid => fetchSession(entry.sessions[sid].file, onBytes)));
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
  HUB.viewing = `${year}/${round}`;
  try {
    const target = `#${year}/${round}`;
    // push a history entry when actually navigating so the phone back button
    // walks weekend -> picker; replace when it's the same weekend (reload etc.)
    if (location.hash !== target) history.pushState(null, "", target);
    else history.replaceState(null, "", target);
    document.title = `${entry.event} ${year} — Minisector`;
  } catch (e) { }
}

let listenersArmed = false;
function armGlobalListeners() {
  if (listenersArmed) return;
  listenersArmed = true;
  // re-render on width change only — mobile URL-bar show/hide fires height-only
  // resizes on every scroll, and re-rendering there yanks the page back to the top
  let rT, lastW = innerWidth;
  addEventListener("resize", () => {
    clearTimeout(rT);
    rT = setTimeout(() => {
      if (innerWidth === lastW) return;
      lastW = innerWidth;
      if (HUB.data) HUB.render();
    }, 220);
  });
  addEventListener("hashchange", () => {
    if (MODE !== "site" || !HUB.manifest) return;
    const m = location.hash.match(/^#(\d{4})\/(\d+)$/);
    const want = m ? `${+m[1]}/${+m[2]}` : null;
    if (want === HUB.viewing) return;
    if (!want) { showPicker(); return; }
    if ((HUB.manifest.years[m[1]] || []).some(e => e.round === +m[2])) selectWeekend(+m[1], +m[2]);
  });
  new MutationObserver(() => HUB.data && HUB.render()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => HUB.data && HUB.render());
}

/* theme: standalone site defaults to light; a header toggle persists choice.
   (embedded artifact leaves theme to its host, which stamps data-theme.) */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("f1hub_theme", t); } catch (e) { }
}
function initTheme() {
  if (MODE !== "site") return;
  let t = "light";
  try { t = localStorage.getItem("f1hub_theme") || "light"; } catch (e) { }
  document.documentElement.setAttribute("data-theme", t);
}
function themeToggleBtn() {
  const cur = document.documentElement.getAttribute("data-theme") || "light";
  const b = document.createElement("button");
  b.className = "btn theme-btn";
  b.setAttribute("aria-label", "Toggle light/dark theme");
  b.textContent = cur === "dark" ? "☀" : "☾";
  b.addEventListener("click", () => {
    const next = (document.documentElement.getAttribute("data-theme") || "light") === "dark" ? "light" : "dark";
    applyTheme(next);   // MutationObserver re-renders
  });
  return b;
}

(async function boot() {
  initTheme();
  if (typeof DecompressionStream === "undefined") {
    showError("This browser is too old for Minisector (it lacks built-in gzip support). Any browser from 2023 onward works — Chrome 80+, Safari 16.4+, Firefox 113+.");
    return;
  }
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
    // deep link #year/round goes straight in; otherwise show the weekend chooser
    const m = location.hash.match(/^#(\d{4})\/(\d+)$/);
    if (m && manifest.years[m[1]] && manifest.years[m[1]].some(e => e.round === +m[2]))
      await selectWeekend(+m[1], +m[2]);
    else
      showPicker();
  } else {
    try { HUB.data = await decodeBundle(); }
    catch (err) { showError("Failed to decode data bundle: " + err.message); return; }
    initState();
    buildShell();
    HUB.render();
  }
})();
