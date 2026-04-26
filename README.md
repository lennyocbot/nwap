# Syllabi

An AI-first personal manager for students, optimized for iPad. Installs as a PWA.

## Features

- **AI assistant** (Anthropic Claude or OpenAI) — planning, explanations, quizzes, summaries
- **Dashboard** with today's classes, upcoming work, habits, and stats
- **Notes** with Markdown, tags, and AI actions (summarize, rewrite, generate flashcards/quizzes)
- **Assignments** kanban with priorities and AI step-by-step breakdowns
- **Timetable** weekly grid
- **Calendar** month view with events + class overlay
- **Study** pomodoro timer with per-subject logging, streak bars
- **Revision** decks with spaced repetition (SM-2-ish), AI card generation
- **Subjects / Grades** with weighted averages and target progress
- **Goals** with milestones
- **Habits** 30-day grid with streaks
- **Files** (local) for PDFs, images, docs
- **Reading list**
- **Journal** with mood & weekly AI review
- **Mind maps** with AI sub-concept expansion
- Dark mode, offline support, installable

## Run

```
npm install
npm run dev
```

Open on iPad Safari, then Share → **Add to Home Screen**.

## AI keys

Add your own Anthropic or OpenAI API key in **Settings → AI**. Keys stay on-device; requests go directly from the browser to the provider.
