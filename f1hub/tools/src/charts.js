/* ============ charts: minimal SVG toolkit ============ */
"use strict";
const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs || {}) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}
function cvar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function niceTicks(lo, hi, n = 6) {
  if (!(hi > lo)) return [lo];
  const span = hi - lo, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
  const t = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) t.push(+v.toFixed(10));
  return t;
}

/*
 * Chart(container, opts):
 *   h, mt/mr/mb/ml margins, xd [lo,hi], yd [lo,hi], xfmt/yfmt tick formatters,
 *   xlab/ylab axis labels, yflip (true => smaller at top), xticks/yticks counts
 * Returns { svg, plot, x(), y(), W, H, iw, ih, hover(), bands(), clip }
 */
let CLIP_ID = 0;
function Chart(container, o) {
  const W = o.w || Math.max(320, container.clientWidth || 800);
  const H = o.h || 300;
  const mt = o.mt ?? 12, mr = o.mr ?? 14, mb = o.mb ?? (o.xlab ? 40 : 26), ml = o.ml ?? 58;
  const iw = W - ml - mr, ih = H - mt - mb;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, null);
  if (o.label) svg.setAttribute("aria-label", o.label);
  container.appendChild(svg);
  const [x0, x1] = o.xd, [y0, y1] = o.yd;
  const x = v => ml + (v - x0) / (x1 - x0 || 1) * iw;
  const y = o.yflip
    ? v => mt + (v - y0) / (y1 - y0 || 1) * ih
    : v => mt + ih - (v - y0) / (y1 - y0 || 1) * ih;

  const gGrid = svgEl("g", {}, svg);
  const clipId = "clip" + (++CLIP_ID);
  const defs = svgEl("defs", {}, svg);
  const cp = svgEl("clipPath", { id: clipId }, defs);
  svgEl("rect", { x: ml, y: mt, width: iw, height: ih }, cp);
  const plot = svgEl("g", { "clip-path": `url(#${clipId})` }, svg);
  const gAxis = svgEl("g", {}, svg);

  // gridlines + ticks
  const yt = o.yticksArr || niceTicks(Math.min(y0, y1), Math.max(y0, y1), o.yticks || 6);
  for (const v of yt) {
    if (v < Math.min(y0, y1) - 1e-9 || v > Math.max(y0, y1) + 1e-9) continue;
    svgEl("line", { x1: ml, x2: ml + iw, y1: y(v), y2: y(v), stroke: cvar("--grid"), "stroke-width": 1 }, gGrid);
    svgEl("text", { x: ml - 7, y: y(v) + 3.5, "text-anchor": "end", "font-size": 10.5, fill: cvar("--ink3"), class: "num" }, gAxis).textContent = o.yfmt ? o.yfmt(v) : v;
  }
  const xt = o.xticksArr || niceTicks(x0, x1, o.xticks || 8);
  for (const v of xt) {
    if (v < x0 - 1e-9 || v > x1 + 1e-9) continue;
    if (o.xgrid !== false) svgEl("line", { x1: x(v), x2: x(v), y1: mt, y2: mt + ih, stroke: cvar("--grid"), "stroke-width": 1 }, gGrid);
    svgEl("text", { x: x(v), y: mt + ih + 15, "text-anchor": "middle", "font-size": 10.5, fill: cvar("--ink3"), class: "num" }, gAxis).textContent = o.xfmt ? o.xfmt(v) : v;
  }
  // frame baseline
  svgEl("line", { x1: ml, x2: ml + iw, y1: mt + ih, y2: mt + ih, stroke: cvar("--line"), "stroke-width": 1 }, gAxis);
  if (o.xlab) svgEl("text", { x: ml + iw / 2, y: H - 6, "text-anchor": "middle", class: "xlab" }, gAxis).textContent = o.xlab;
  if (o.ylab) {
    const t = svgEl("text", { x: 0, y: 0, "text-anchor": "middle", class: "ylab", transform: `translate(12,${mt + ih / 2}) rotate(-90)` }, gAxis);
    t.textContent = o.ylab;
  }
  return { svg, plot, defs, x, y, W, H, iw, ih, ml, mt, mr, mb, xd: o.xd, yd: o.yd };
}

function linePath(pts, x, y) {
  let d = "";
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p == null || p[1] == null) { continue; }
    d += (d && pts[i - 1] && pts[i - 1][1] != null ? "L" : "M") + x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1);
  }
  return d;
}
function stepPath(pts, x, y) {
  let d = "", prev = null;
  for (const p of pts) {
    if (p == null || p[1] == null) { prev = null; continue; }
    const px = x(p[0]).toFixed(1), py = y(p[1]).toFixed(1);
    d += prev == null ? `M${px},${py}` : `H${px}V${py}`;
    prev = p;
  }
  return d;
}

/* spread label y-positions so they don't collide; items: [{y,...}] mutated in place */
function spreadLabels(items, gap, lo, hi) {
  if (!items.length) return items;
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) if (items[i].y < items[i - 1].y + gap) items[i].y = items[i - 1].y + gap;
  if (hi != null && items.at(-1).y > hi) {
    items.at(-1).y = hi;
    for (let i = items.length - 2; i >= 0; i--) if (items[i].y > items[i + 1].y - gap) items[i].y = items[i + 1].y - gap;
  }
  if (lo != null) {
    if (items[0].y < lo) items[0].y = lo;
    for (let i = 1; i < items.length; i++) if (items[i].y < items[i - 1].y + gap) items[i].y = items[i - 1].y + gap;
  }
  return items;
}

/* shared tooltip */
let TIP;
function tip() {
  if (!TIP) { TIP = document.createElement("div"); TIP.className = "tip"; document.body.appendChild(TIP); }
  return TIP;
}
function tipShow(html, ev) {
  const t = tip(); t.innerHTML = html; t.classList.add("show");
  const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
  let X = ev.clientX + pad, Y = ev.clientY + pad;
  if (X + w > innerWidth - 8) X = ev.clientX - w - pad;
  if (Y + h > innerHeight - 8) Y = ev.clientY - h - pad;
  t.style.left = X + "px"; t.style.top = Y + "px";
}
function tipHide() { if (TIP) TIP.classList.remove("show"); }

/* attach per-mark hover to a set of svg nodes */
function hoverMarks(nodes, html) {
  nodes.forEach((n, i) => {
    n.addEventListener("pointerenter", ev => tipShow(html(i), ev));
    n.addEventListener("pointermove", ev => tipShow(html(i), ev));
    n.addEventListener("pointerleave", tipHide);
  });
}

/* legend */
function legend(container, items) {
  const el = document.createElement("div"); el.className = "legend";
  el.innerHTML = items.map(it =>
    `<span class="li"><span class="${it.dot ? "swd" : "sw"}" style="background:${it.color};${it.dash ? "background:repeating-linear-gradient(90deg," + it.color + " 0 4px,transparent 4px 7px);" : ""}"></span>${esc(it.label)}</span>`).join("");
  container.appendChild(el);
  return el;
}

/* horizontal drag-zoom on a chart; cb([v0,v1]) in x-domain units, cb(null) on reset */
function dragZoom(ch, cb) {
  const { svg, ml, mt, iw, ih } = ch;
  let sx = null, rect = null;
  const toVal = px => ch.xd[0] + (px - ml) / iw * (ch.xd[1] - ch.xd[0]);
  svg.style.cursor = "crosshair";
  svg.addEventListener("pointerdown", e => {
    const p = pt(e); if (p.x < ml || p.x > ml + iw) return;
    sx = p.x; svg.setPointerCapture(e.pointerId);
    rect = svgEl("rect", { x: sx, y: mt, width: 0, height: ih, fill: "var(--accent)", opacity: .12 }, svg);
  });
  svg.addEventListener("pointermove", e => {
    if (sx == null || !rect) return;
    const p = pt(e), a = Math.min(sx, p.x), w = Math.abs(p.x - sx);
    rect.setAttribute("x", a); rect.setAttribute("width", w);
  });
  svg.addEventListener("pointerup", e => {
    if (sx == null) return;
    const p = pt(e), a = Math.min(sx, p.x), b = Math.max(sx, p.x);
    if (rect) rect.remove(); rect = null;
    const s0 = sx; sx = null;
    if (b - a > 12) cb([toVal(a), toVal(b)]);
  });
  svg.addEventListener("dblclick", () => cb(null));
  function pt(e) {
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * ch.W, y: (e.clientY - r.top) / r.height * ch.H };
  }
  ch.toVal = toVal; ch.pt = pt;
}
