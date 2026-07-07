# Hosting the F1 Analysis Hub — free, self-updating

End state: `minisector.app` shows the hub with a **year + weekend picker**; a GitHub Action
checks every 2 hours for newly published sessions and adds them automatically. After the
Madrid GP's FP1 ends, the data shows up on your site ~1–3 hours later without you touching
anything. Total cost: **$0/year hosting + ~$10/year for the domain**.

## 1. Create the hub repository (5 min)

1. Create a **new public GitHub repo** (public = unlimited free Actions minutes), e.g. `minisector`.
2. Copy this `f1hub/` folder's contents into it laid out like this:

```
index.html                     <- built site app:  python3 tools/build.py --site index.html
manifest.json                  <- created by update_data.py
data/                          <- created by update_data.py
tools/
  extract.py  update_data.py  build.py  template.html  src/
.github/workflows/f1-data.yml  <- move workflows/f1-data.yml here
```

3. Commit and push.

## 2. Turn on GitHub Pages (2 min)

Repo **Settings → Pages → Source: “Deploy from a branch”**, branch `main`, folder `/ (root)`.
Your hub is now live at `https://<user>.github.io/<repo>/`. Every push (including the bot's
data commits) redeploys automatically.

## 3. Let it fill itself with data

- **New sessions (automatic):** the workflow's cron picks up anything from the last 14 days.
  Nothing to do — Madrid GP FP1 will appear on its own.
- **Backfill a weekend:** repo → Actions → *F1 data updater* → *Run workflow* → year `2026`, round `9`.
- **Backfill a whole season:** run it with just the year (leave round blank). One season takes
  1–4 hours of (free) runner time; do one season per run, 2018–2026 gives you every weekend
  FastF1 supports. Each weekend is ~4–6 MB, a full archive is roughly 1 GB — fine for a repo,
  and the app only ever downloads the weekend you open (~5 MB).

Note: GitHub disables cron on repos with no pushes for 60 days — any commit re-enables it,
and during the season the bot's own commits keep it alive.

## 4. Custom domain (10 min)

1. Buy the domain — **Cloudflare Registrar** (at-cost, ~$10/yr for .com) or Namecheap/Porkbun.
2. Repo **Settings → Pages → Custom domain** → enter `minisector.app` (this commits a
   `CNAME` file). Check *Enforce HTTPS* once the cert is issued.
3. At your DNS provider add: `CNAME  www  <user>.github.io   (and use the A records below for the apex)`
   (For the apex domain `minisector.app` itself, add A records to GitHub Pages IPs:
   185.199.108.153 / .109. / .110. / .111.)

### Alternative: Cloudflare Pages
Same repo, zero config: Cloudflare dashboard → Workers & Pages → connect the GitHub repo,
build command *none*, output dir `/`. You get faster global CDN and one-click custom domains
if the domain is already on Cloudflare. Everything else (Actions updater) stays identical.

## 5. Updating the app itself

Edit `tools/src/*`, then rebuild and commit:

```bash
python3 tools/build.py --site index.html
```

## Troubleshooting

- **Session missing hours after it ended** — F1 sometimes publishes late; the next cron run
  gets it. Check the Actions log: "not ready" means the API hasn't published yet.
- **Action fails on one session** — it skips and continues; re-run with year+round+force to retry.
- **Testing locally** — `python3 -m http.server` in the repo root, open `http://localhost:8000`.
  (Opening index.html as a `file://` URL won't work in site mode — fetch needs HTTP.)
