# Sports803 Events Automation

This repository contains the static Events Generator and a scheduled automation workflow for OneBall-backed events.

## Automatic workflow

The workflow in `.github/workflows/auto-publish.yml` runs every 10 minutes and can also be started manually from the GitHub Actions tab. It loads the existing Event Generator in a headless browser, runs the same source aggregation and smart matching logic, keeps unified matches that contain a OneBall source, and limits candidates to events from two hours ago through the next 24 hours.

For each eligible event, the worker first normalizes and writes the website-compatible event card to `s803config/todaysMatches/<event-key>`, reads it back, validates the required schema, then generates the existing match-preview article content and SEO sections, creates a thumbnail using the existing canvas renderer, uploads that thumbnail to ImgBB, and creates one Blogger post. The event card is then updated with `postUrl`, `bloggerPostId`, `publicationStatus`, and `publishedAt`. A Firebase record under `automation/bloggerPosts` stores the stable match key and Blogger post ID. Successfully posted events are skipped on later runs; failed attempts remain eligible for retry. Each run posts at most five events.

## Required GitHub Actions secrets

Configure these repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `BLOGGER_BLOG_ID` | Blogger blog identifier |
| `GOOGLE_CLIENT_ID` | Google OAuth application client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret for the same Google application |
| `GOOGLE_REFRESH_TOKEN` | Long-lived Blogger authorization refresh token |
| `IMGBB_KEY` | ImgBB upload API key |
| `FIREBASE_DATABASE_URL` | Firebase Realtime Database URL |
| `FIREBASE_AUTH_TOKEN` | Optional legacy Firebase REST authentication value; leave empty when using the service account |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Required secure service-account JSON for authenticated Firebase writes |

Never commit the OAuth client secret, refresh token, Firebase token, or ImgBB key to the repository. The OAuth client ID and Blogger blog ID are identifiers, but they should still be supplied through the Actions secrets for consistent deployment.

The workflow uses the Blogger API with the `https://www.googleapis.com/auth/blogger` scope and requires an OAuth refresh token. The client ID alone cannot authorize background posting. The first authorization must be completed for the Google account that owns or can publish to the Blogger blog. Firebase writes use a service-account OAuth token generated from `FIREBASE_SERVICE_ACCOUNT_JSON`; do not make the database publicly writable to bypass permission errors.

## Validation

The worker supports a local detection-only check by setting `MAX_POSTS_PER_RUN=0`. This runs the browser-based source aggregation and prints detected OneBall-backed matches without contacting Firebase, ImgBB, or Blogger. Normal workflow runs require authenticated Firebase access through `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_AUTH_TOKEN`; the database should not be made publicly writable. Each Firebase event write is followed by a read-back and schema check.
