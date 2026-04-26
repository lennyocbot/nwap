# Syllabi

An AI-first personal manager for students, optimized for iPad. Installs as a PWA.

## Features

- **AI assistant** (OpenRouter, Anthropic, OpenAI, or offline demo) - planning, explanations, quizzes, summaries, and tool-backed app actions
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

## AI keys

Add your own OpenRouter, Anthropic, or OpenAI API key in **Settings -> AI**. Personal keys stay on-device and are not synced to Supabase. On Cloudflare, `/api/ai` can also use server-side provider keys from environment variables.

## Cloudflare push reminders

Run `supabase-schema.sql` in Supabase, then set these Cloudflare Pages/Worker variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- optional `OPENROUTER_API_KEY`

The Pages Functions under `functions/api` handle AI and push subscription/test endpoints. The scheduled reminder worker lives in `worker/reminders` and has separate cron triggers for 15-minute reminders and hourly coach checks.
