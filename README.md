# Syllabi

An AI-first personal manager for students, optimized for iPad. Installs as a PWA.

## Features

- **AI assistant** via secure server-side OpenRouter - planning, explanations, quizzes, summaries, and tool-backed app actions
- **AI Tutor Mode** and **Exam Simulator** for active revision
- **Short onboarding** with account setup, profile basics, and non-blocking setup nudges
- **AI Study Coach** daily brief on the Dashboard
- **Account page** with profile picture, stats, sync status, and achievement badges
- **Web Push reminders** for installed iPad PWAs and desktop browsers
- **Dashboard** with today's classes, upcoming work, habits, coach brief, and stats
- **Notes** with Markdown, KaTeX, tags, templates, and AI actions
- **Assignments** kanban with priorities and AI step-by-step breakdowns
- **Timetable** weekly grid with days-top and days-left layouts
- **Calendar** month view with events and class overlay
- **Study** pomodoro timer with subject and assignment linking
- **Revision** decks with spaced repetition and AI card generation
- **Subjects / Grades** with weighted averages and target progress
- **Files** with private Supabase storage and AI note/cards/map actions
- **Journal**, **Habits**, **Reading**, **Goals**, and **Mind Maps**
- Light/dark/system themes, offline support, installable PWA

## Run

```bash
npm install
npm run dev
```

Open on iPad Safari, then Share -> **Add to Home Screen**.

## AI

Set `OPENROUTER_API_KEY` on Cloudflare Pages/Workers. The browser never asks students for a key and never sends one from user settings. Students choose **Normal** or **High intelligence**; the worker maps those modes to the approved OpenRouter models and enforces usage quotas.

## Cloudflare push reminders

Run `supabase-schema.sql` in Supabase, then set these Cloudflare Pages/Worker variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `OPENROUTER_API_KEY`

For High intelligence burst limiting, create a Cloudflare KV namespace and bind it to the Pages project as `AI_BURST_KV`. If the binding is missing, the worker still enforces Supabase-backed 5-hour and weekly quotas.

The Pages Functions under `functions/api` handle AI and push subscription/test endpoints. The scheduled reminder worker lives in `worker/reminders` and has separate cron triggers for 15-minute reminders and hourly coach checks.
