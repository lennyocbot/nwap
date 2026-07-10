/* ============ app shell & boot ============ */
"use strict";

/* tabs are contextual to the ONE selected session: pick Qualifying and you get
   quali tools, pick Race and you get race tools — the tab row never shows a
   tool that belongs to a session you're not looking at */
const TABS = [
  ["overview", "Overview", viewOverview, () => true],
  ["pace", "Pace", viewPace, () => true],
  ["deg", "Tyres & Deg", viewDeg, sid => ["R", "S", "FP1", "FP2", "FP3"].includes(sid)],
  ["longruns", "Long Runs", viewLongRuns, sid => sid.startsWith("FP")],
  ["quali", "Gaps & Sectors", viewQuali, sid => sid === "Q" || sid === "SQ"],
  ["race", "Trace & Replay", viewRace, sid => sid === "R" || sid === "S"],
  ["straights", "Straights", viewStraights, () => true],
  ["tel", "Telemetry", viewTel, () => true],
  ["weather", "Weather", viewWeather, () => true],
];
/* when a session switch removes the current tab, land on its analog */
const TAB_ANALOG = { race: "quali", quali: "race", longruns: "deg", deg: "longruns" };
const MODE = typeof HUB_MODE !== "undefined" ? HUB_MODE : "embedded";

function renderTabs() {
  const S = HUB.S, nav = document.getElementById("tabs");
  if (!nav) return;
  const avail = TABS.filter(t => t[3](S.sid));
  if (!avail.some(t => t[0] === S.tab)) {
    const alt = TAB_ANALOG[S.tab];
    S.tab = avail.some(t => t[0] === alt) ? alt : "overview";
  }
  nav.innerHTML = avail.map(t =>
    `<button data-tab="${t[0]}" class="${t[0] === S.tab ? "on" : ""}">${t[1]}${t[0] === "tel" && S.compare.length ? ` <span class="cnt">${S.compare.length}</span>` : ""}</button>`).join("");
  nav.querySelectorAll("button").forEach(b =>
    b.addEventListener("click", () => { S.tab = b.dataset.tab; HUB.render(); }));
}

function refreshSessionSelect() {
  const el = document.getElementById("psess");
  if (!el || !HUB.data) return;
  const d = HUB.data;
  const order = d.sids || d.sessions.map(s => s.id);
  el.innerHTML = order.map(sid => {
    const loaded = !!HUB.session(sid);
    const failed = (d.failed || []).includes(sid);
    return `<option value="${sid}" ${sid === HUB.S.sid ? "selected" : ""}>${SNAMES[sid] || sid}${failed ? " · retry" : loaded ? "" : " · loading…"}</option>`;
  }).join("");
}

HUB.render = function render(keepScroll) {
  const S = HUB.S;
  const sy = keepScroll ? scrollY : null;
  refreshSessionSelect();
  renderTabs();
  const main = document.getElementById("view");
  if (!main) return;
  main.innerHTML = "";
  tipHide();
  // selected session still downloading (or failed) → holder instead of a view
  if (!HUB.session(S.sid)) {
    if ((HUB.data.pending || []).includes(S.sid)) {
      main.innerHTML = `<div class="empty"><div class="bar" style="margin:0 auto 14px"><i></i></div>loading ${SNAMES[S.sid] || S.sid}…</div>`;
      ensureSession(S.sid);
      return;
    }
    if ((HUB.data.failed || []).includes(S.sid)) {
      main.innerHTML = `<div class="empty"><b>Couldn't load ${SNAMES[S.sid] || S.sid}.</b><br><br><button class="btn pri" id="sessRetry">Retry</button></div>`;
      main.querySelector("#sessRetry").addEventListener("click", () => { retrySession(S.sid); });
      return;
    }
  }
  const tab = TABS.find(t => t[0] === S.tab) || TABS[0];
  try { tab[2](main); }
  catch (err) {
    main.innerHTML = `<div class="empty">Something broke rendering this view: <b>${esc(err.message)}</b></div>`;
    console.error(err);
  }
  if (sy != null) scrollTo(0, sy);
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

  // weekend + session selectors live together, top-left
  let titleHtml;
  if (MODE === "site" && HUB.manifest) {
    const years = Object.keys(HUB.manifest.years).sort();
    titleHtml = `<span class="picker">
      <button id="homeBtn" class="btn" title="All weekends" aria-label="All weekends">≡</button>
      <select id="pyear" aria-label="Season">${years.map(y => `<option ${+y === d.year ? "selected" : ""}>${y}</option>`).join("")}</select>
      <select id="pevent" aria-label="Grand Prix">${HUB.manifest.years[String(d.year)].map(e => `<option value="${e.round}" ${e.round === d.round ? "selected" : ""}>R${e.round} · ${esc(e.event)}</option>`).join("")}</select>
      <select id="psess" aria-label="Session"></select>
      <button id="dnaBtn" class="btn" title="Team DNA — season car profiles" aria-label="Team DNA">🧬</button>
    </span>`;
  } else {
    titleHtml = `<span class="gp">${esc(d.event)} ${d.year}</span><span class="picker"><select id="psess" aria-label="Session"></select></span>`;
  }

  root.innerHTML = `
  <header class="top"><div class="top-inner">
    <div class="title-row">
      ${titleHtml}
      <span class="meta" id="wkMeta"></span>
      <span class="brand">Mini<b>sector</b> · F1 analysis</span>
      <span id="themeSlot"></span>
    </div>
    <div class="ctrl-row">
      <nav class="tabs" id="tabs"></nav>
    </div>
  </div></header>
  <main id="view"></main>
  <footer>Data: F1 live timing via <span class="mono">FastF1</span> · lap telemetry resampled to 280 points/lap · times are official classification where available.
  ${MODE === "site" && HUB.manifest ? `Data updated <span class="num">${esc((HUB.manifest.generated || "").slice(0, 16).replace("T", " "))} UTC</span> · ` : ""}Unofficial analysis tool for personal use — not associated with Formula 1.</footer>`;

  refreshMeta();
  const ps = document.getElementById("psess");
  refreshSessionSelect();
  ps.addEventListener("change", () => {
    const v = ps.value;
    if ((d.failed || []).includes(v)) { retrySession(v); }
    HUB.S.sid = v; HUB.S.lrSel = null; HUB.render();
  });

  if (MODE === "site" && HUB.manifest) {
    const py = document.getElementById("pyear"), pe = document.getElementById("pevent");
    py.addEventListener("change", () => {
      const list = HUB.manifest.years[py.value];
      selectWeekend(+py.value, list.at(-1).round);
    });
    pe.addEventListener("change", () => selectWeekend(d.year, +pe.value));
    document.getElementById("homeBtn").addEventListener("click", showPicker);
    document.getElementById("dnaBtn").addEventListener("click", () => showTeams(d.year));
  }
  const slot = document.getElementById("themeSlot");
  if (slot && MODE === "site") slot.appendChild(themeToggleBtn());
}

function refreshMeta() {
  const el = document.getElementById("wkMeta");
  const d = HUB.data;
  if (!el || !d) return;
  const dts = d.sessions.length ? [d.sessions[0].date, d.sessions.at(-1).date].map(x => new Date(x)) : [];
  const dates = dts.length ? dts[0].toLocaleDateString(undefined, { day: "numeric", month: "short" }) + (d.pending?.length ? "" : " – " + dts[1].toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })) : "";
  el.textContent = `Round ${d.round} · ${d.location}, ${d.country}${dates ? " · " + dates : ""}${String(d.format).includes("sprint") ? " · Sprint weekend" : ""}`;
}

/* landing screen: choose a weekend */
function showPicker() {
  const m = HUB.manifest;
  const root = document.getElementById("app");
  const years = Object.keys(m.years).sort().reverse();
  root.innerHTML = `<div class="pick-screen">
    <div class="pick-brand">Mini<b>sector</b><span id="pickTheme"></span></div>
    <div class="pick-sub">F1 race-weekend analysis — pick a Grand Prix</div>
    <button class="btn dna-launch" id="dnaLaunch">🧬 Team DNA — what each car is good at, and which circuits should suit it</button>
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
  const dna = root.querySelector("#dnaLaunch");
  if (dna) dna.addEventListener("click", () => showTeams(years[0]));
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
  S.telSid = null; S.telDrv = null; S.tpOpen = undefined;
  HUB._selCustom = false;
  HUB.restore();
}

/* first paint waits only for the newest session; the rest of the weekend
   streams in behind it and views refresh in place as sessions arrive */
async function selectWeekend(year, round) {
  const entry = (HUB.manifest.years[String(year)] || []).find(e => e.round === round);
  if (!entry) return;
  HUB._last = { y: year, r: round };
  const sids = Object.keys(entry.sessions);
  const firstSid = sids.at(-1);   // the session the page lands on
  showLoading(`fetching ${entry.event} ${year}…`);
  // cores (lap tables, results, map, weather — no telemetry) are ~3% of the
  // bytes; paint from those and stream telemetry behind
  const srcOf = e => e.core || e.file;
  let first;
  try {
    const fe = entry.sessions[firstSid];
    const total = (fe.core ? fe.coreSize : fe.size) || 0;
    let got = 0;
    first = await fetchSession(srcOf(fe), n => {
      got = Math.max(0, got + n);
      const el = document.getElementById("loadmsg");
      if (el && total) el.textContent = `fetching ${entry.event} ${year} — ${Math.min(100, got / total * 100).toFixed(0)}%`;
    });
  } catch (err) {
    showError(err.message);
    return;
  }
  if (!first.tel) first.tel = null;   // telemetry arrives separately
  HUB.data = {
    year: +year, round: entry.round, event: entry.event, location: entry.location,
    country: entry.country, format: entry.format, sessions: [first],
    sids, pending: sids.filter(s => s !== firstSid), failed: [], entry,
  };
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
  for (const sid of [...HUB.data.pending]) ensureSession(sid);
  ensureTel(firstSid);
  pumpTels(HUB.data);
}

const SESS_INFLIGHT = new Set();
async function ensureSession(sid) {
  const d = HUB.data;
  if (!d || !d.entry || !(d.pending || []).includes(sid) || SESS_INFLIGHT.has(sid)) return;
  const token = `${d.year}/${d.round}`;
  SESS_INFLIGHT.add(sid);
  try {
    const ent = d.entry.sessions[sid];
    const s = await fetchSession(ent.core || ent.file);
    if (HUB.data !== d || HUB.viewing !== token) return;   // user moved on
    if (!s.tel) s.tel = null;
    const idx = i => d.sids.indexOf(i);
    d.sessions.push(s);
    d.sessions.sort((a, b) => idx(a.id) - idx(b.id));
    d.pending = d.pending.filter(x => x !== sid);
    // desktop keeps "everyone" selected as new rosters arrive (unless the user
    // has already customised the rail); basket laps re-validate when tel lands
    if (innerWidth >= 700 && !HUB._selCustom) for (const dd of s.drivers) HUB.S.sel.add(dd.abbr);
    if (s.tel) HUB.S.compare = HUB.S.compare.filter(c => c.sid !== sid || s.tel[c.drv + "-" + c.lap]);
    refreshMeta();
    HUB.render(true);   // keep scroll position — this is a background refresh
  } catch (e) {
    if (HUB.data !== d || HUB.viewing !== token) return;
    d.pending = d.pending.filter(x => x !== sid);
    d.failed = [...(d.failed || []), sid];
    refreshSessionSelect();
    if (HUB.S.sid === sid) HUB.render(true);
  } finally {
    SESS_INFLIGHT.delete(sid);
  }
}

/* telemetry stage: the full session file (the heavy one) fetched behind the
   scenes; merged into the already-rendered core session */
const TEL_INFLIGHT = new Set();
async function ensureTel(sid, force) {
  const d = HUB.data;
  const s = d && HUB.session(sid);
  if (!d || !d.entry || !s || s.tel || TEL_INFLIGHT.has(sid)) return;
  if (!force && (s._telFail || 0) >= 3) return;
  const ent = d.entry.sessions[sid];
  if (!ent || !ent.core) return;     // full file was fetched directly — nothing to do
  const token = `${d.year}/${d.round}`;
  TEL_INFLIGHT.add(sid);
  try {
    const full = await fetchSession(ent.file);
    if (HUB.data !== d || HUB.viewing !== token) return;
    s.tel = full.tel || {};
    HUB.S.compare = HUB.S.compare.filter(c => c.sid !== sid || s.tel[c.drv + "-" + c.lap]);
    const S = HUB.S;
    // refresh only the views that were actually waiting on this telemetry
    if (S.tab === "tel" || (S.tab === "straights" && S.sid === sid)
      || (S.tab === "race" && (sid === "R" || sid === "S"))) HUB.render(true);
    else renderTabs();
  } catch (e) {
    if (HUB.data === d) s._telFail = (s._telFail || 0) + 1;
  } finally {
    TEL_INFLIGHT.delete(sid);
  }
}

/* background loop: current session's telemetry first, then the rest of the
   weekend in order; waits politely for cores that are still arriving */
async function pumpTels(d) {
  while (HUB.data === d && HUB.viewing === `${d.year}/${d.round}`) {
    const next = [HUB.S.sid, ...d.sids].find(x => {
      const s = HUB.session(x);
      return s && !s.tel && (s._telFail || 0) < 3 && d.entry.sessions[x]?.core && !TEL_INFLIGHT.has(x);
    });
    if (next) { await ensureTel(next); continue; }
    if (!d.pending.length && !TEL_INFLIGHT.size) return;   // everything settled
    await new Promise(r => setTimeout(r, 350));            // a core is still on its way
  }
}
function retrySession(sid) {
  const d = HUB.data;
  if (!d || !(d.failed || []).includes(sid)) return;
  d.failed = d.failed.filter(x => x !== sid);
  d.pending.push(sid);
  ensureSession(sid);
  HUB.render(true);
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
    const tm = location.hash.match(/^#teams(?:\/(\d{4}))?$/);
    if (tm) {
      if (!String(HUB.viewing || "").startsWith("teams") || (tm[1] && HUB.viewing !== "teams/" + tm[1])) showTeams(tm[1]);
      return;
    }
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
    // deep link #year/round or #teams goes straight in; otherwise the chooser
    const tmm = location.hash.match(/^#teams(?:\/(\d{4}))?$/);
    const m = location.hash.match(/^#(\d{4})\/(\d+)$/);
    if (tmm)
      showTeams(tmm[1]);
    else if (m && manifest.years[m[1]] && manifest.years[m[1]].some(e => e.round === +m[2]))
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
