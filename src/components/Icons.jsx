// Minimal hand-rolled icon set so the app has zero icon-library deps.
const ic = (d, props = {}) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {d}
  </svg>
)

export const Icon = {
  home:       (p) => ic(<><path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/></>, p),
  note:       (p) => ic(<><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h8M8 11h8M8 15h5"/></>, p),
  task:       (p) => ic(<><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/></>, p),
  calendar:   (p) => ic(<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4"/></>, p),
  timetable:  (p) => ic(<><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M9 4v16"/></>, p),
  brain:      (p) => ic(<><path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 2.8V14a3 3 0 0 0 3 3h1a3 3 0 0 0 3 3V4z"/><path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.8V14a3 3 0 0 1-3 3h-1a3 3 0 0 1-3 3V4z"/></>, p),
  cards:      (p) => ic(<><rect x="3" y="6" width="14" height="14" rx="3"/><path d="M7 3h13a1 1 0 0 1 1 1v13"/></>, p),
  timer:      (p) => ic(<><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 3h6"/></>, p),
  subject:    (p) => ic(<><path d="M4 4h10a4 4 0 0 1 4 4v12"/><path d="M4 4v14a2 2 0 0 0 2 2h12"/><path d="M8 8h6"/></>, p),
  grade:      (p) => ic(<><path d="M12 3l3 6 6 .8-4.5 4.2 1.1 6-5.6-3-5.6 3 1.1-6L3 9.8 9 9z"/></>, p),
  goal:       (p) => ic(<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></>, p),
  habit:      (p) => ic(<><path d="M20.8 4.6a5 5 0 0 0-7.1 0L12 6.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z"/></>, p),
  files:      (p) => ic(<><path d="M4 5a2 2 0 0 1 2-2h6l2 3h6a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/></>, p),
  chat:       (p) => ic(<><path d="M21 12c0 4.4-4 8-9 8a10 10 0 0 1-3.6-.7L3 21l1.3-4.7A7.9 7.9 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"/></>, p),
  sparkle:    (p) => ic(<><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></>, p),
  plus:       (p) => ic(<path d="M12 5v14M5 12h14"/>, p),
  search:     (p) => ic(<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>, p),
  settings:   (p) => ic(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>, p),
  book:       (p) => ic(<><path d="M4 4h10a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4z"/><path d="M4 4v14a2 2 0 0 0 2 2h12"/></>, p),
  journal:    (p) => ic(<><path d="M6 3h12a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 0 1 2-2z"/></>, p),
  tag:        (p) => ic(<><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/></>, p),
  trash:      (p) => ic(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></>, p),
  pin:        (p) => ic(<><path d="M12 17v5M7 8l10-4v9l-10 4z"/></>, p),
  check:      (p) => ic(<path d="m5 12 5 5L20 7"/>, p),
  x:          (p) => ic(<path d="M6 6l12 12M6 18 18 6"/>, p),
  flag:       (p) => ic(<><path d="M5 21V4h12l-2 4 2 4H5"/></>, p),
  download:   (p) => ic(<><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16"/></>, p),
  upload:     (p) => ic(<><path d="M12 21V9m0 0 4 4m-4-4-4 4M4 3h16"/></>, p),
  play:       (p) => ic(<path d="M7 4v16l13-8z" fill="currentColor"/>, p),
  pause:      (p) => ic(<><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></>, p),
  reset:      (p) => ic(<><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/></>, p),
  menu:       (p) => ic(<><path d="M4 6h16M4 12h16M4 18h16"/></>, p),
  chevron:    (p) => ic(<path d="m9 6 6 6-6 6"/>, p),
  dots:       (p) => ic(<><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></>, p),
  mic:        (p) => ic(<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></>, p),
  send:       (p) => ic(<path d="M4 20 22 12 4 4l3 8-3 8zM7 12h15"/>, p),
  link:       (p) => ic(<><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></>, p),
  mindmap:    (p) => ic(<><circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 6c4 0 6 2 10 6M7 18c4 0 6-2 10-6"/></>, p),
  fire:       (p) => ic(<><path d="M12 3c2 4-1 6 1 9s4 3 4 6a5 5 0 0 1-10 0c0-2 1-3 2-5-1 1-2 1-2-1 0-3 3-5 5-9z"/></>, p),
  clock:      (p) => ic(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, p),
}
