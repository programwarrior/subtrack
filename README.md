# SubTrack

A calm, local-first subscription tracker built with Next.js, TypeScript, and accessible custom components.

## Historical tracking

Add an optional **First payment date** to generate past renewal entries. Generated entries are labeled **Estimated** so they remain distinct from payments you explicitly mark as paid or missed.

Use **Price change** from a subscription's details to record the old cost, new cost, effective date, and a note. SubTrack recalculates estimated past renewals using the price that applied on each date while preserving confirmed payment records.

## Smart import

Choose **Smart import** to scan one or more PDF statements, Excel/CSV files, or receipt images. SubTrack extracts likely recurring services in the browser, normalizes their billing details, flags uncertain fields, and shows a review screen before saving anything. Images use OCR and may download a language model the first time they are scanned; the source file itself is not uploaded to SubTrack.

## Account sync

Sign in under Settings → Account & cloud sync to keep the same collection on every device without relying on a Mac or the same Wi-Fi network. On a device's first login, SubTrack always asks whether to download the cloud copy, merge both collections, or deliberately replace the cloud copy. Signing in alone never uploads local data.

The account database stores the complete collection atomically with optimistic version checks. Each update archives the previous database version, bulk-deletion protection remains enabled, and deleted subscriptions stay recoverable in Settings for 30 days. Browser storage is an offline cache and pre-cloud safety backup rather than the primary source.

## Hosted app

SubTrack is deployed as a static Next.js export on GitHub Pages at `https://programwarrior.github.io/subtrack/`. Supabase provides authentication and the protected account database, so the hosted app does not depend on a Mac or local network.

Pushes to `main` deploy automatically through `.github/workflows/deploy-pages.yml`.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The app still works offline, but a signed-in Supabase account is the primary cross-device copy.

## Supabase setup

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor.
3. Copy `.env.example` to `.env.local` and provide the public project URL and anonymous key.
4. Restart the app. Email/password, magic-link, and Google authentication will appear under Settings → Account & cloud sync.

The schema enables Row Level Security on every user-owned table. The GitHub Pages workflow reads the Supabase URL from the `NEXT_PUBLIC_SUPABASE_URL` repository variable and the publishable key from the `NEXT_PUBLIC_SUPABASE_ANON_KEY` repository secret.

## Checks

```bash
pnpm test
pnpm build
pnpm test:e2e
```

The end-to-end suite covers desktop and mobile profiles. If Playwright has not been used on the machine before, install its browser once with `pnpm exec playwright install chromium`.

## PWA

The manifest, icon, and service worker live in `public/`. Production deployments can be installed from supported browsers. Browser notification permission is requested only when the user enables notifications in Settings.
