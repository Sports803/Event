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

## Optional AI utilities

The repository includes `scripts/ai-tools.mjs` for optional structured event comparison, SEO/social content suggestions, and event-repair suggestions. AI is disabled unless `AI_ENABLED=true`, `AI_API_URL`, and `AI_API_KEY` are supplied. The utilities never apply repair suggestions automatically; uncertain changes require explicit review.

Examples:

```bash
AI_ENABLED=true AI_API_URL=https://your-openai-compatible-endpoint/v1 AI_API_KEY=... node scripts/ai-tools.mjs compare event-pair.json
AI_ENABLED=true AI_API_URL=https://your-openai-compatible-endpoint/v1 AI_API_KEY=... node scripts/ai-tools.mjs content event.json
AI_ENABLED=true AI_API_URL=https://your-openai-compatible-endpoint/v1 AI_API_KEY=... node scripts/ai-tools.mjs repair event.json
```

The production publisher continues to use deterministic source aggregation and the existing article templates by default. AI is an opt-in enhancement and is not required for Firebase synchronization or Blogger publication.

## Firebase verification and admin diagnostics

The manual workflow **Verify Firebase event cards** reads `s803config/todaysMatches`, validates the website-compatible card fields, counts valid and invalid records, and never writes or deletes data. It uses the same Firebase service-account secret as the publisher and can be started from the GitHub Actions tab when investigating a missing card or broken stream.

The live database currently contains legacy records from earlier manual/imported workflows. The verifier accepts legacy records without an `id` field but reports records with no valid stream URL so they can be reviewed before being presented as playable events.

## NVIDIA Build multi-model AI router

The repository includes `scripts/ai-router.mjs`, a provider-agnostic AI layer. The deterministic event engine remains the source of truth and the AI layer is disabled by default. When enabled, requests are routed by task rather than sending every event to one model.

The currently configured role defaults are:

| Role | Default model ID | Purpose |
|---|---|---|
| Matching | `qwen/qwen3-next-80b-a3b-instruct` | Ambiguous event comparison after deterministic and embedding stages |
| Writing | `meta/llama-3.3-70b-instruct` | Optional SEO and social content |
| Fast | `nvidia/nemotron-3-nano-30b-a3b` | Classification and lightweight extraction |
| Reasoning | `openai/gpt-oss-120b` | Difficult repair suggestions |
| Embedding | `nvidia/nemotron-3-embed-1b` | Semantic similarity and duplicate lookup |

Model IDs are configurable through GitHub Actions variables and should be checked against the current NVIDIA Build catalog before enabling production requests. In particular, the Qwen3-Next page currently marks its free endpoint as deprecated while partner and downloadable deployment options remain available.

Optional configuration includes `NVIDIA_API_KEY`, `AI_ENABLED`, `NVIDIA_API_URL`, `AI_MODEL_MATCHING`, `AI_MODEL_WRITING`, `AI_MODEL_FAST`, `AI_MODEL_REASONING`, `AI_MODEL_EMBEDDING`, `AI_MAX_CONCURRENCY`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_CACHE_ENABLED`, `AI_CACHE_TTL_HOURS`, `AI_CIRCUIT_BREAKER_ENABLED`, `AI_CIRCUIT_FAILURE_THRESHOLD`, `AI_CIRCUIT_RESET_MS`, and `AI_MAX_REQUESTS_PER_RUN`.

The router provides a single provider interface, task-based model routing, structured JSON parsing, deterministic cache keys, a persistent local cache, configurable concurrency, exponential backoff with jitter, `Retry-After` handling, circuit breaking, fallback models, request budgets, and run statistics. Transient NVIDIA failures, invalid JSON, rate limits, and model unavailability return deterministic fallbacks rather than failing Firebase or Blogger processing. API keys are never included in logs or cache data.

Useful commands:

```bash
npm run ai-router
npm run test-ai-router
```

The test suite covers deterministic aliases, cache hits, transient failure and fallback, retry counting, and concurrency limits. AI should be enabled only after adding `NVIDIA_API_KEY` as a GitHub Actions secret and confirming the selected model IDs are available to the account. The production event workflow remains functional with `AI_ENABLED=false`.


## Finished Blogger theme and validation

The production Blogger theme is stored at `sports803-theme.xml`. It preserves the current Sports 803 event, Live TV, search, category, favorites, reminder, cinema-mode, picture-in-picture, Firebase, and stream-button functionality while providing the audited dark sports-platform design foundation.

Before importing the theme, run:

```bash
npm run validate-theme
```

The validator checks the required Blogger structure, event and Live TV sections, search input, mobile navigation, Firebase metadata, and balanced CDATA blocks. It is a structural preflight check; Blogger should still be used for the final import validation.

To install the theme, open Blogger, go to **Theme**, choose **Restore**, upload `sports803-theme.xml`, and preview the result before publishing. Keep a backup of the current theme XML. After import, verify the homepage, Live Events, Schedule, Channels, search, category filters, event stream buttons, cinema mode, picture-in-picture, favorites, reminders, Telegram/WhatsApp links, and mobile bottom navigation.

The automation workflow no longer enables the public Firebase-write bypass. Event writes now require `FIREBASE_SERVICE_ACCOUNT_JSON` or the explicitly supported legacy `FIREBASE_AUTH_TOKEN`. Do not make Firebase publicly writable to work around authentication failures.


## Reference-aligned dashboard design

The theme now includes the reference-aligned visual system documented in `SPORTS803-REFERENCE-DESIGN.md`. The desktop layout uses a fixed Sports 803 sidebar, compact top bar, central live player and match workspace, and a secondary right rail. Mobile removes the sidebar, keeps the live content first, uses compact sticky controls, and relies on fixed bottom navigation. The design uses a near-black dashboard palette with charcoal surfaces and a restrained green live accent.

The reference styling is implemented as a CSS-first layer in `sports803-theme.xml`, so existing Firebase mounts, event cards, channel buttons, search, category filters, favorites, reminders, cinema mode, picture-in-picture, and player hooks remain intact.
