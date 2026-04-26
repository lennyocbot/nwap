# QA Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all confirmed bugs and UX issues from the 26 April 2026 QA session: invisible bar charts, stale note deck names, study timer pre-start button, dashboard onboarding dismiss, empty kanban columns, and mobile bottom navigation.

**Architecture:** All changes are isolated to their respective view/component files with no new dependencies. The bar chart fix restructures the flex layout so percentage heights resolve correctly. Mobile nav reuses the existing Sidebar nav-item list. No new state keys or API routes needed.

**Tech Stack:** React (hooks), Tailwind utility classes via `cx()`, existing `useApp` context, `src/index.css` for any new utility classes.

---

## File Map

| File | Change |
|------|--------|
| `src/views/Dashboard.jsx` | Fix bar chart layout (D2), add nudge dismiss-all (D3) |
| `src/views/Study.jsx` | Fix bar chart layout (D7) |
| `src/views/Notes.jsx` | Fix deck name from stale single-char title (BUG-4) |
| `src/views/Assignments.jsx` | Reduce empty kanban column weight (D8) |
| `src/components/Sidebar.jsx` | Add mobile bottom nav bar (D9) |
| `src/lib/timetable.js` | Improve club activity fallback label |

---

## Task 1: Fix invisible bar charts in Dashboard and Study (D2, D7)

**Root cause:** The bar outer container uses `flex items-end h-24` but each column child has no explicit height — it's sized by content. So `height: X%` on the bar div inside is `X%` of an undefined height, which the browser resolves to 0. Bars are invisible.

**Fix:** Remove `items-end` from the outer flex container; add `h-full` to column divs so their height is the container's 96 px (Dashboard) or 112 px (Study); wrap the bar in a `flex-1 flex-col justify-end` zone so the percentage height resolves against that well-defined height.

**Files:**
- Modify: `src/views/Dashboard.jsx:239-253`
- Modify: `src/views/Study.jsx:147-161`

- [ ] **Step 1: Fix Dashboard chart layout**

In `src/views/Dashboard.jsx`, replace lines 239–253:

```jsx
        <div className="relative flex items-end gap-2 h-24">
          {week.studyTotal === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-500">
              Start a focus session to see activity.
            </div>
          )}
          {week.days.map((day) => (
            <div key={day.key} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-lg bg-brand-500/10 dark:bg-brand-500/20 relative overflow-hidden" style={{ height: `${Math.max(8, (day.study / week.maxStudy) * 100)}%` }}>
                <div className={cx('absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-600 to-brand-400', day.study === 0 && 'opacity-20')} style={{ height: day.study === 0 ? '100%' : '100%' }} />
              </div>
              <div className="text-[10px] text-ink-500">{day.label}</div>
            </div>
          ))}
        </div>
```

with:

```jsx
        <div className="relative flex gap-2 h-24">
          {week.studyTotal === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-500">
              Start a focus session to see activity.
            </div>
          )}
          {week.days.map((day) => (
            <div key={day.key} className="flex-1 h-full flex flex-col items-center gap-1">
              <div className="flex-1 w-full flex flex-col justify-end">
                <div className="w-full rounded-t-lg bg-brand-500/10 dark:bg-brand-500/20 relative overflow-hidden" style={{ height: `${Math.max(8, (day.study / week.maxStudy) * 100)}%` }}>
                  <div className={cx('absolute inset-0 bg-gradient-to-t from-brand-600 to-brand-400', day.study === 0 && 'opacity-20')} />
                </div>
              </div>
              <div className="text-[10px] text-ink-500">{day.label}</div>
            </div>
          ))}
        </div>
```

- [ ] **Step 2: Fix Study chart layout**

In `src/views/Study.jsx`, replace lines 147–162:

```jsx
          <div className="relative flex items-end gap-2 h-28">
            {stats.minutesToday === 0 && stats.last7.every((d) => d.m === 0) && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-500">
                Start a focus session to see activity.
              </div>
            )}
            {stats.last7.map((d) => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-brand-500/10 dark:bg-brand-500/20 rounded-t-lg relative overflow-hidden" style={{ height: `${Math.max(8, (d.m / stats.max) * 100)}%` }}>
                  <div className={cx('absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-600 to-brand-400', d.m === 0 && 'opacity-20')} style={{ height: '100%' }} />
                </div>
                <div className="text-[10px] text-ink-500">{d.label}</div>
                <div className="text-[10px] font-semibold">{d.m}m</div>
              </div>
            ))}
          </div>
```

with:

```jsx
          <div className="relative flex gap-2 h-28">
            {stats.minutesToday === 0 && stats.last7.every((d) => d.m === 0) && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-500">
                Start a focus session to see activity.
              </div>
            )}
            {stats.last7.map((d) => (
              <div key={d.key} className="flex-1 h-full flex flex-col items-center gap-1">
                <div className="flex-1 w-full flex flex-col justify-end">
                  <div className="w-full bg-brand-500/10 dark:bg-brand-500/20 rounded-t-lg relative overflow-hidden" style={{ height: `${Math.max(8, (d.m / stats.max) * 100)}%` }}>
                    <div className={cx('absolute inset-0 bg-gradient-to-t from-brand-600 to-brand-400', d.m === 0 && 'opacity-20')} />
                  </div>
                </div>
                <div className="text-[10px] text-ink-500">{d.label}</div>
                <div className="text-[10px] font-semibold">{d.m}m</div>
              </div>
            ))}
          </div>
```

- [ ] **Step 3: Commit bar chart fixes**

```bash
git add src/views/Dashboard.jsx src/views/Study.jsx
git commit -m "fix: resolve invisible bar chart heights on Dashboard and Study

Percentage heights on flex children require a parent with a definite
height. Added h-full to column divs and a flex-1 bar-zone wrapper so
the percentage resolves correctly against the container's fixed height."
```

---

## Task 2: Fix stale note title in deck name (BUG-4)

**Root cause:** `saveCardsToDeck` in Notes.jsx uses `note.title` directly for the deck name. When the note's title auto-set to the first character the user typed (e.g. "I"), the deck is saved as "I - cards" even though the note content has a proper `# Integration by Parts` heading.

**Fix:** In `saveCardsToDeck`, fall back to `titleFromContent(note.content)` when `note.title` is 2 chars or fewer, or matches the generic "Untitled" sentinel.

**Files:**
- Modify: `src/views/Notes.jsx:251-259`

- [ ] **Step 1: Update `saveCardsToDeck` to derive a better title**

In `src/views/Notes.jsx`, replace the `saveCardsToDeck` function (lines 251–259):

```js
  const saveCardsToDeck = (cards) => {
    if (!cards?.length) return
    const deckName = `${note.title} - cards`
    const deck = add('decks', { name: deckName, subjectId: note.subjectId || null, color: 'brand' })
    cards.forEach((c) => add('flashcards', {
      deckId: deck.id, front: normalizeAIText(c.front), back: normalizeAIText(c.back),
      ease: 2.5, interval: 1, due: Date.now(), reviews: 0,
    }))
    showToast(`Saved ${cards.length} cards to "${deckName}"`, 'success')
  }
```

with:

```js
  const saveCardsToDeck = (cards) => {
    if (!cards?.length) return
    const rawTitle = note.title || ''
    const isGeneric = !rawTitle || /^(untitled|quick note|new note)$/i.test(rawTitle.trim()) || rawTitle.trim().length <= 2
    const displayTitle = isGeneric ? (titleFromContent(note.content) || rawTitle || 'Note') : rawTitle
    const deckName = `${displayTitle} - cards`
    const deck = add('decks', { name: deckName, subjectId: note.subjectId || null, color: 'brand' })
    cards.forEach((c) => add('flashcards', {
      deckId: deck.id, front: normalizeAIText(c.front), back: normalizeAIText(c.back),
      ease: 2.5, interval: 1, due: Date.now(), reviews: 0,
    }))
    showToast(`Saved ${cards.length} cards to "${deckName}"`, 'success')
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/views/Notes.jsx
git commit -m "fix: derive flashcard deck name from note heading not stale auto-title

When the note title was auto-set to the first character typed (e.g. 'I'),
the saved deck was named 'I - cards'. Now falls back to the first heading
extracted from note content when the stored title is too short or generic."
```

---

## Task 3: Dashboard "Complete your profile" — add dismiss-all (D3)

**Root cause:** The `SetupNudges` section shows until every individual nudge is dismissed or its condition is met. There's no way to collapse the whole section in one action, so returning users keep seeing it on every visit.

**Fix:** Add a small "×" dismiss-all button to the section header. When clicked, all currently-visible nudge IDs are added to `dismissedNudges` at once, hiding the section permanently (unless a new nudge condition becomes true and that nudge hasn't been dismissed).

**Files:**
- Modify: `src/views/Dashboard.jsx:383-422` (`SetupNudges` component)

- [ ] **Step 1: Update `SetupNudges` to accept and wire a dismiss-all action**

In `src/views/Dashboard.jsx`, replace the `SetupNudges` function signature and section header:

Find:
```jsx
function SetupNudges({ state, navigate, setSettings }) {
  const items = []
  const dismissed = state.settings.dismissedNudges || []
  const dismiss = (id) => setSettings({ dismissedNudges: [...new Set([...dismissed, id])] })
  const addNudge = (item) => { if (!dismissed.includes(item.id)) items.push({ ...item, dismiss: () => dismiss(item.id) }) }
```

Replace with:
```jsx
function SetupNudges({ state, navigate, setSettings }) {
  const items = []
  const dismissed = state.settings.dismissedNudges || []
  const dismiss = (id) => setSettings({ dismissedNudges: [...new Set([...dismissed, id])] })
  const dismissAll = (ids) => setSettings({ dismissedNudges: [...new Set([...dismissed, ...ids])] })
  const addNudge = (item) => { if (!dismissed.includes(item.id)) items.push({ ...item, dismiss: () => dismiss(item.id) }) }
```

Then find the section header inside the return:
```jsx
      <div className="flex items-center gap-2 mb-3">
        <Icon.check className="w-4 h-4 text-brand-600" />
        <h3 className="font-display font-semibold">Complete your profile</h3>
      </div>
```

Replace with:
```jsx
      <div className="flex items-center gap-2 mb-3">
        <Icon.check className="w-4 h-4 text-brand-600" />
        <h3 className="font-display font-semibold">Complete your profile</h3>
        <div className="flex-1" />
        <button
          className="text-xs text-ink-400 hover:text-ink-600 transition"
          onClick={() => dismissAll(items.map((i) => i.id))}
          title="Dismiss all"
        >
          Dismiss all
        </button>
      </div>
```

- [ ] **Step 2: Commit**

```bash
git add src/views/Dashboard.jsx
git commit -m "fix: add dismiss-all to Dashboard profile nudge section (D3)

Users completing onboarding could not collapse the 'Complete your profile'
section without individually dismissing each nudge. Added a 'Dismiss all'
button that hides the section in one click."
```

---

## Task 4: Reduce empty kanban column visual weight (D8)

**Root cause:** All three kanban columns (To do / In progress / Done) share equal grid width. When "In progress" and "Done" are empty they show at full width with a prominent dashed placeholder, making the board feel unbalanced for new users.

**Fix:** Collapse empty non-"todo" columns to a narrower width on desktop (`lg:col-span-1` at reduced visual weight). Keep "To do" always full width when the other two are empty.

**Files:**
- Modify: `src/views/Assignments.jsx:78-120`

- [ ] **Step 1: Make empty secondary columns visually lighter**

In `src/views/Assignments.jsx`, replace the kanban grid container and card div:

Find:
```jsx
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {lists.map((col) => (
          <div key={col.key} className={cx('card p-3', col.items.length === 0 && 'bg-white/58 dark:bg-ink-900/70')}>
            <div className="flex items-center justify-between px-2 py-1">
              <div className="font-display font-semibold">{col.label}</div>
              <span className="chip">{col.items.length}</span>
            </div>
            <div className="space-y-2 mt-2">
              {col.items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-ink-200/80 bg-white/45 px-3 py-5 text-center text-sm text-ink-400 dark:border-ink-700 dark:bg-ink-900/40">
                  {col.key === 'todo' ? 'Add a task to get started.' : col.key === 'doing' ? 'Drag work here when you start.' : 'Completed work lands here.'}
                </div>
              )}
```

Replace with:
```jsx
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {lists.map((col) => {
          const isEmpty = col.items.length === 0
          const isSecondary = col.key !== 'todo'
          return (
          <div key={col.key} className={cx('card p-3', isEmpty && 'bg-white/58 dark:bg-ink-900/70', isEmpty && isSecondary && 'opacity-60')}>
            <div className="flex items-center justify-between px-2 py-1">
              <div className="font-display font-semibold">{col.label}</div>
              <span className="chip">{col.items.length}</span>
            </div>
            <div className="space-y-2 mt-2">
              {isEmpty && (
                <div className={cx('rounded-2xl border border-dashed border-ink-200/80 bg-white/45 text-center text-sm text-ink-400 dark:border-ink-700 dark:bg-ink-900/40', isSecondary ? 'px-3 py-3' : 'px-3 py-5')}>
                  {col.key === 'todo' ? 'Add a task to get started.' : col.key === 'doing' ? 'Start a task to see it here.' : 'Completed tasks land here.'}
                </div>
              )}
```

Also close the new `return (` — find the closing `</div>` of the card column and wrap it:

Find (immediately after the `{col.items.map(...)` block end):
```jsx
          </div>
        ))}
```

Replace with:
```jsx
          </div>
          )
        })}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/Assignments.jsx
git commit -m "fix: reduce empty kanban column visual weight for new users (D8)

Empty 'In progress' and 'Done' columns no longer dominate the board.
Secondary empty columns are faded and use a shorter placeholder."
```

---

## Task 5: Mobile bottom navigation bar (D9)

**Root cause:** On screens below `md:` (768 px), the sidebar collapses to a hamburger. There is no persistent bottom navigation, which is the expected pattern for mobile-first student apps.

**Fix:** Add a `<BottomNav>` component that renders 5 key tabs at the bottom of the screen on `<md` viewports, using `env(safe-area-inset-bottom)` for iPhone notch safety. Reuse existing nav routing and icons.

**Files:**
- Modify: `src/components/Sidebar.jsx` — add `BottomNav` export and wire into the mobile layout
- Modify: `src/App.jsx` — render `<BottomNav>` inside the page shell

- [ ] **Step 1: Add BottomNav component to Sidebar.jsx**

In `src/components/Sidebar.jsx`, add the following after the existing `export default function Sidebar` block (at the bottom of the file):

```jsx
const bottomTabs = [
  { id: 'dashboard',   label: 'Home',      icon: 'home' },
  { id: 'notes',       label: 'Notes',     icon: 'note' },
  { id: 'assignments', label: 'Tasks',     icon: 'task' },
  { id: 'revision',    label: 'Revision',  icon: 'cards' },
  { id: 'ai',          label: 'AI',        icon: 'chat' },
]

export function BottomNav() {
  const { route, navigate } = useApp()
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden bg-white/90 dark:bg-ink-950/90 backdrop-blur-md border-t border-ink-100 dark:border-ink-800"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {bottomTabs.map(({ id, label, icon }) => {
        const Ic = Icon[icon]
        const active = route.name === id
        return (
          <button
            key={id}
            className={cx(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition',
              active ? 'text-brand-600 dark:text-brand-300' : 'text-ink-500 dark:text-ink-400'
            )}
            onClick={() => navigate(id)}
          >
            <Ic className={cx('w-5 h-5', active && 'drop-shadow-[0_0_6px_rgba(79,98,233,0.5)]')} />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Render BottomNav in App.jsx and add bottom padding**

Open `src/App.jsx`. Find the import of Sidebar and add BottomNav:

Find:
```jsx
import Sidebar from './components/Sidebar.jsx'
```

Replace with:
```jsx
import Sidebar, { BottomNav } from './components/Sidebar.jsx'
```

Then find the main page shell wrapper. Look for where `<Sidebar>` is rendered in the layout — add `<BottomNav />` as a sibling and add `pb-16 md:pb-0` to the main content area to prevent content hiding behind the nav:

Find (the main scrollable area — will contain `<main` or similar):
```jsx
<main
```

This is a targeted search — read the App.jsx shell first to identify the exact class string on the `<main>` element, then add `pb-16 md:pb-0` to its className, and add `<BottomNav />` just before the closing `</div>` of the outermost shell wrapper.

- [ ] **Step 3: Read App.jsx to find exact insertion points**

Read `src/App.jsx` in full before making the edit in Step 2, so the class strings are exact.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sidebar.jsx src/App.jsx
git commit -m "feat: add persistent mobile bottom navigation bar (D9)

Adds a 5-tab bottom nav (Home, Notes, Tasks, Revision, AI) visible only
on <md viewports. Uses env(safe-area-inset-bottom) for notch safety.
Active tab shows brand color with subtle glow."
```

---

## Task 6: Improve timetable club activity fallback label

**Root cause:** In `src/lib/timetable.js`, `labelForSlot()` returns `'Activity'` for `kind === 'club'`. When the AI creates a slot with no explicit title (should not happen given the system prompt, but acts as a safety net), the timetable row label shows "Activity" instead of something more useful.

**Files:**
- Modify: `src/lib/timetable.js:62-68`

- [ ] **Step 1: Update labelForSlot fallback for club kind**

In `src/lib/timetable.js`, replace:

```js
function labelForSlot(slot) {
  if (slot.kind === 'club') return 'Activity'
  if (slot.kind === 'study') return 'Study block'
  if (slot.kind === 'before') return 'Before school'
  if (slot.kind === 'after') return 'After school'
  return 'Custom slot'
}
```

with:

```js
function labelForSlot(slot) {
  if (slot.kind === 'club') return slot.title?.trim() || 'Club / activity'
  if (slot.kind === 'study') return 'Study block'
  if (slot.kind === 'before') return 'Before school'
  if (slot.kind === 'after') return 'After school'
  return 'Custom slot'
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/timetable.js
git commit -m "fix: use slot title as timetable row label for club activities

Fallback was 'Activity' regardless of what the user or AI named the
slot. Now uses the descriptive title (e.g. 'Volleyball training') when
available, falling back to 'Club / activity'."
```

---

## Task 7: Verify and build

- [ ] **Step 1: Run build to confirm no TypeScript/lint errors**

```bash
npm.cmd run build
```

Expected: build succeeds with no errors. If there are errors, fix them before proceeding.

- [ ] **Step 2: Verify bar charts render correctly using Claude in Chrome**

Navigate to `https://syllabi.cc` (or the local dev server) using Claude in Chrome:
1. Go to Dashboard — confirm the "This week" chart shows bars with correct heights (even if all zero, bars should be visible at minimum height with faint styling)
2. Go to Study — confirm "Last 7 days" chart shows bars

- [ ] **Step 3: Verify note deck naming fix**

1. Create a new note
2. Start typing content: `# Integration by Parts`
3. While title auto-sets to "I" or "In", immediately click "Make flashcards"
4. Confirm the saved deck is named "Integration by Parts - cards", not "I - cards"

- [ ] **Step 4: Verify dashboard dismiss-all**

1. Open Dashboard as a new user with no profile picture and reminders off
2. Confirm "Dismiss all" button appears in the "Complete your profile" section header
3. Click it — confirm all nudges disappear and section collapses
4. Reload — confirm the nudges stay dismissed

- [ ] **Step 5: Verify mobile bottom nav**

Resize browser to below 768 px width (or use device emulation):
1. Confirm bottom nav bar appears with 5 tabs
2. Tap each tab — confirm navigation works
3. Confirm active tab highlights in brand color
4. Confirm page content is not obscured by the nav (has bottom padding)

- [ ] **Step 6: Push to production**

```bash
git push
```

Wait for Cloudflare Pages auto-deploy, then verify at `https://syllabi.cc`.
