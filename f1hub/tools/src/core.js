/* ============ core: data decode, state, helpers ============ */
"use strict";
const HUB = window.HUB = {};

/* ---- gzip decoding (embedded base64 or fetched .json.gz) ---- */
async function gunzipJSON(bytes) {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const text = await new Response(stream).text();
  return JSON.parse(text);
}
async function decodeBundle() {
  const b64 = document.getElementById("data").textContent.trim();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return gunzipJSON(bytes);
}
async function fetchSession(url) {
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return gunzipJSON(new Uint8Array(await r.arrayBuffer()));
}

/* ---- formatting ---- */
function fmtLap(ms) {
  if (ms == null) return "—";
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = (ms % 60000) / 1000;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
  return m > 0 ? `${m}:${s.toFixed(3).padStart(6, "0")}` : s.toFixed(3);
}
function fmtSec(ms, dp = 3) { return ms == null ? "—" : (ms / 1000).toFixed(dp); }
function fmtDelta(ms, dp = 3) {
  if (ms == null) return "—";
  const v = ms / 1000;
  return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(dp);
}
function fmtClock(ms) {
  if (ms == null) return "—";
  const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---- color helpers ---- */
function hexRgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function rgbHex(r, g, b) { return "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join(""); }
function lum(h) { const [r, g, b] = hexRgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; }
function mix(h, target, k) { const a = hexRgb(h), b = hexRgb(target); return rgbHex(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k); }
function isDark() {
  const t = document.documentElement.getAttribute("data-theme");
  if (t) return t === "dark";
  return matchMedia("(prefers-color-scheme: dark)").matches;
}
/* team colors tuned per theme so they hold contrast on both grounds */
function teamCol(hex) {
  if (!hex) return "#888";
  let h = hex;
  if (isDark()) { let n = 0; while (lum(h) < 0.10 && n++ < 6) h = mix(h, "#ffffff", 0.22); }
  else { let n = 0; while (lum(h) > 0.62 && n++ < 6) h = mix(h, "#0a0d12", 0.18); }
  return h;
}
const CMP_LETTER = { SOFT: "S", MEDIUM: "M", HARD: "H", INTERMEDIATE: "I", WET: "W", UNKNOWN: "?", TEST_UNKNOWN: "T" };
function cmpCol(c) {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--cmp-" + (c || "UNKNOWN"));
  return v.trim() || "#9ca3af";
}
function cmpDot(c, sz) {
  const l = CMP_LETTER[c] || "?";
  return `<span class="cmp-dot" style="border-color:${cmpCol(c)};color:${cmpCol(c)};${sz ? `width:${sz}px;height:${sz}px;` : ""}" title="${esc(c)}">${l}</span>`;
}

/* ---- track status ---- */
function tsFlags(ts) {
  const s = String(ts || "1");
  return { yellow: s.includes("2"), sc: s.includes("4"), red: s.includes("5"), vsc: s.includes("6") || s.includes("7"), green: !/[24567]/.test(s) };
}

/* ---- session helpers ---- */
const SNAMES = { FP1: "FP1", FP2: "FP2", FP3: "FP3", SQ: "Sprint Quali", S: "Sprint", Q: "Qualifying", R: "Race" };
HUB.session = id => HUB.data.sessions.find(s => s.id === (id ?? HUB.S.sid));
HUB.driver = (abbr, sid) => (HUB.session(sid) || {}).drivers.find(d => d.abbr === abbr) || HUB.session("R")?.drivers.find(d => d.abbr === abbr);
function drvColor(abbr, sid) { const d = HUB.driver(abbr, sid); return teamCol(d ? d.color : "#888"); }
function drvDash(abbr, sid) { const d = HUB.driver(abbr, sid); return d && d.style === 1 ? "6 3" : null; }
function lapsOf(sid, drv) {
  const s = HUB.session(sid);
  if (!s) return [];
  return drv ? s.laps.filter(l => l.drv === drv) : s.laps;
}
/* clean = representative racing lap */
function isClean(l) {
  return l.t != null && !l.in && !l.out && !l.del && tsFlags(l.ts).green && l.acc;
}
function fuelCorr(l, sid) {
  /* fuel-corrected time: remove the advantage of a lighter car late in the race */
  const S = HUB.S, s = HUB.session(sid);
  if (!S.fuelOn || !s || !(s.id === "R" || s.id === "S") || !s.totalLaps) return l.t;
  return l.t - (s.totalLaps - l.lap) * S.fuelK * 1000;
}

/* ---- linear fit (least squares) -> {a intercept, b slope, n} ---- */
function linfit(pts) {
  const n = pts.length;
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const den = n * sxx - sx * sx;
  if (Math.abs(den) < 1e-9) return null;
  const b = (n * sxy - sx * sy) / den, a = (sy - b * sx) / n;
  return { a, b, n };
}
function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const p = (s.length - 1) * q, lo = Math.floor(p);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (p - lo);
}

/* ---- state ---- */
HUB.S = {
  sid: "R",
  tab: "overview",
  sel: new Set(),          // selected driver abbrs (driver rail)
  colorMode: "team",       // team | compound (pace chart)
  fuelOn: false, fuelK: 0.06,
  showOff: false,          // include slow/outlier laps
  compare: [],             // [{sid, drv, lap}] telemetry basket (max 6)
  degCmp: null,            // compound filter on deg tab
  qseg: 3,                 // quali segment
  raceView: "trace",
  mapMode: "dom",
  telZoom: null,           // [r0, r1]
  telPanels: { delta: true, v: true, th: true, b: true, g: true, n: false, d: true },
};
HUB.storeKey = () => `f1hub_${HUB.data.year}_${HUB.data.round}`;
HUB.save = () => { try { localStorage.setItem(HUB.storeKey(), JSON.stringify({ compare: HUB.S.compare, fuelK: HUB.S.fuelK })); } catch (e) { } };
HUB.restore = () => {
  try {
    const s = JSON.parse(localStorage.getItem(HUB.storeKey()) || "{}");
    HUB.S.compare = (s.compare || []).filter(c => HUB.session(c.sid)?.tel[c.drv + "-" + c.lap]);
    if (s.fuelK) HUB.S.fuelK = s.fuelK;
  } catch (e) { }
};

/* ---- toast ---- */
let toastT;
function toast(msg) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div"); el.id = "toast";
    el.style.cssText = "position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:var(--ink);color:var(--bg);padding:8px 16px;border-radius:8px;font-size:12.5px;font-weight:600;z-index:99;opacity:0;transition:opacity .15s";
    document.body.appendChild(el);
  }
  el.textContent = msg; el.style.opacity = "1";
  clearTimeout(toastT); toastT = setTimeout(() => el.style.opacity = "0", 1900);
}
function addCompare(sid, drv, lap) {
  const S = HUB.S;
  if (S.compare.some(c => c.sid === sid && c.drv === drv && c.lap === lap)) { toast("Already in compare"); return; }
  if (!HUB.session(sid)?.tel[drv + "-" + lap]) { toast("No telemetry for this lap"); return; }
  if (S.compare.length >= 6) { toast("Compare is full (6 laps max)"); return; }
  S.compare.push({ sid, drv, lap });
  HUB.save();
  toast(`Added ${drv} L${lap} (${SNAMES[sid]}) — ${S.compare.length} in Telemetry`);
  if (S.tab === "tel") HUB.render(); else if (typeof renderTabs === "function") renderTabs();
  const b = document.querySelector('nav.tabs button[data-tab="tel"]');
  if (b) { b.style.color = "var(--accent)"; setTimeout(() => b.style.color = "", 1200); }
}
