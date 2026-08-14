# Sports 803 TV — Phase 1 Audit

**Audit date:** 14 August 2026  
**Audited site:** [Sports 803 TV](https://sports803tv.blogspot.com/?m=1)  
**Repository:** `Sports803/Event`

## Executive assessment

The live site is already a functioning dark sports-event frontend rather than a blank Blogger template. It exposes Home, Live Events, Schedule, Channels, Categories, search, event filtering, favorites, reminders, stream buttons, WhatsApp, Telegram, and support links. The current implementation has a credible feature base, but its visual hierarchy and mobile behavior are not yet at the standard of a polished sports-streaming product.

The repository is not the Blogger theme itself. It is an event generator and automation publisher that uses Playwright, Firebase, Blogger, ImgBB, and optional AI helpers. Therefore, the Blogger XML theme and the GitHub automation system must be treated as two coordinated deliverables: the theme is the consumer frontend, while the repository is the data-ingestion and publishing backend.

## Live-site findings

| Area | What is present | Main issue observed | Priority |
|---|---|---|---|
| Header/navigation | Sticky branding area, Home, Live Events, Schedule, Channels, Categories, search, WhatsApp and Telegram links | The desktop screenshot shows a narrow, left-heavy navigation rail and a large unused center area; the layout feels more like an admin/sidebar composition than a focused streaming home | High |
| Live/events | Event cards expose live status, time, league, teams, stream button, share/link control, favorites, and reminders | Cards are dense and repetitive. Team logos appear as generic circular placeholders in the captured viewport, and the first live section is visually subordinate to the large hero/player region | High |
| Hero/player | Large featured panel with live badge and explanatory copy | The captured page shows an empty/black player area with copy rather than an immediately useful live presentation. Loading, unavailable, and fallback states need stronger user guidance | High |
| Search | Search input with “Search events...” placeholder | Search is present, but the audited viewport does not demonstrate grouped results across teams, competitions, channels, and sports | Medium |
| Filters | Events/Live TV tabs, All, ten sport categories, Favorites | There are many controls competing for attention, and the category row becomes visually cramped on desktop/mobile. The active state should be clearer and the filter system should be unified | Medium |
| Schedule | Schedule navigation and time-based event cards | The page exposes event times and countdown-like values, but a clear Today/Tomorrow/This Week date model was not evident in the captured initial view | Medium |
| Channels | Live TV tab and per-event stream buttons | A dedicated, categorized channel catalog with channel logo, category, live status, and watch action should be made more explicit | Medium |
| Mobile UX | Responsive Blogger page and fixed-style navigation elements are present | A complete iPhone/Android viewport pass is still required. The design should use horizontal live-card rails, bottom navigation, safe-area spacing, and touch-safe controls rather than only compressing desktop layout | High |
| Accessibility | Skip-to-main and skip-to-search links are present; buttons have several hints/labels | Focus styling, semantic headings, status announcements, keyboard traversal, and non-color status labels need systematic verification | Medium |
| SEO | Title, description, canonical, Open Graph, and Twitter metadata are present in the XML | Event-specific titles, structured data, image alt text, and metadata quality need verification on event pages | Medium |

## Theme implementation findings

The XML theme defines a coherent token system: red primary branding, gold secondary accent, dark backgrounds, Inter/Poppins/Barlow Condensed typography, reusable radii, shadows, gradients, hero image variables, ticker, featured panel, tabs, event cards, countdown/live states, picture-in-picture, cinema curtain, and mobile breakpoint behavior. This is a strong base for a controlled modernization.

The theme also contains Google Analytics, Firebase URL metadata, Google Fonts, a hero image URL, Blogger expressions, and a large inline CSS/JavaScript implementation. The use of CDATA and Blogger expressions is appropriate, but every future edit must preserve XML escaping and must be validated as importable XML.

The visible theme CSS includes substantial animation and visual complexity: ticker motion, Ken Burns hero animation, pulse effects, blur layers, sticky surfaces, and picture-in-picture behavior. These features should be retained only where they improve comprehension. Reduced-motion support, less expensive blur/animation defaults, and a no-player homepage path should be added.

## Repository and automation findings

The repository README describes a ten-minute GitHub Actions workflow that aggregates OneBall-backed events, writes normalized records to Firebase, generates Blogger articles and thumbnails, and records Blogger publication state. It also includes a manual Firebase verifier and optional AI utilities with deterministic fallbacks.

The repository is operationally useful, but it is not a frontend implementation repository. The requested redesign cannot be completed by editing `index.html` alone; the Blogger XML remains the production frontend artifact. The repository should instead be improved to guarantee a stable event schema, safe publication, read-back validation, observability, and compatibility with the theme.

A high-risk inconsistency was found in `.github/workflows/auto-publish.yml`: it sets `FIREBASE_PUBLIC_WRITE: 'true'`, while the repository README explicitly says the database should not be made publicly writable and recommends service-account authentication. This should be reviewed before any production changes. The safer default is to remove the public-write override and require authenticated service-account writes, unless the code path proves that the variable is harmless and unused.

The workflow is scheduled every ten minutes and publishes up to five events per run. That is appropriate for deterministic synchronization, but the publisher must remain idempotent, avoid duplicate Blogger posts, and handle stale/expired events without leaving them in the frontend’s live/upcoming sections.

## Prioritized modernization plan

| Priority | Change | Rationale |
|---|---|---|
| P0 | Preserve current event, channel, stream, Firebase, favorites, reminder, cinema, PIP, and navigation behavior while creating a normalized frontend component layer | Prevents regression of the useful existing platform |
| P0 | Validate and harden Firebase authentication and workflow configuration, especially the public-write flag | Prevents accidental database exposure and production write failures |
| P0 | Add a formal event-state calculation based on `startTime` and `endTime`, with explicit LIVE, UPCOMING, and FINISHED labels | Removes stale manual status and makes transitions reliable |
| P1 | Redesign mobile-first hierarchy around LIVE NOW, Starting Soon, Today’s Events, channels, and sport filters | Aligns the site with the requested app-like experience |
| P1 | Improve event cards with clear status, teams, time/score, competition, countdown, watch action, and fallback state | Makes scanning and action selection faster |
| P1 | Make the homepage player lazy and load the player only on an event/player view | Improves mobile performance and reduces unnecessary embeds |
| P1 | Create a reusable event detail/player view with server fallback, retry, unavailable, loading, fullscreen, cinema, and PIP states | Consolidates the existing stream architecture into a predictable UX |
| P2 | Add structured event metadata, event-specific titles, accessibility semantics, reduced-motion behavior, and image lazy loading | Improves search visibility, usability, and low-end device performance |
| P2 | Add a browser-based regression checklist for iPhone, Android, tablet, and desktop plus XML validation | Makes future theme changes safer |

## Phase 1 conclusion

The correct strategy is an **upgrade, not a replacement**. The existing theme already implements many of the requested features, while the repository already automates event synchronization and Blogger publishing. The next phase should produce a concrete UI/UX and architecture specification, followed by targeted edits to the Blogger XML and the repository workflow rather than a generic new site.

## Source notes

The live-site observations above are based on the captured public page at [sports803tv.blogspot.com/?m=1](https://sports803tv.blogspot.com/?m=1). Repository observations are based on the checked-out `Sports803/Event` files, including `README.md`, `index.html`, `package.json`, and `.github/workflows/`.
