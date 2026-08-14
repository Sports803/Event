# Sports 803 TV — Phase 1 Audit

**Audit date:** 14 August 2026  
**Live site:** [sports803tv.blogspot.com](https://sports803tv.blogspot.com/?m=1)  
**Repository:** `Sports803/Event`

## Executive summary

Sports 803 TV already has a substantial working foundation. The public Blogger site exposes Home, Live Events, Schedule, Channels, Categories, search, event filtering, favorites, reminders, stream controls, WhatsApp, Telegram, and support links. It should therefore be **upgraded rather than replaced**.

The primary weakness is not missing functionality; it is the lack of a sufficiently clear, mobile-first product hierarchy. The current page presents many controls and event cards at once, while the large hero/player area can appear empty or black before a useful stream state is available. The experience should be reorganized around **Live Now**, **Starting Soon**, **Today’s Events**, **Live TV**, and a compact mobile navigation system.

The checked-out GitHub repository is not the Blogger theme. It is the event-generation and automation layer that aggregates OneBall-backed events, writes Firebase records, creates Blogger posts, generates thumbnails, and optionally uses AI utilities. The redesign must keep these as coordinated but separate deliverables: the XML theme remains the production frontend, while the repository provides normalized event data and publishing automation.

## Current-site audit

| Area | Confirmed current behavior | Finding | Priority |
|---|---|---|---|
| Navigation | Home, Live Events, Schedule, Channels, Categories, search, WhatsApp and Telegram links are present | The captured desktop composition is left-heavy and leaves a large unused central region. It feels closer to a navigation rail plus dashboard than a focused streaming home | High |
| Live events | Cards show live status, time, competition, teams, stream button, link/share control, favorites, and reminders | The cards are information-dense and repetitive. In the captured viewport, team logos appear as generic circular placeholders, reducing recognition and scanability | High |
| Hero/player | A large featured panel with a live badge and explanatory copy is present | The initial captured state contains a large black/empty player region. Loading, unavailable, retry, and fallback states need stronger messaging and should not dominate the homepage | High |
| Search | A search field labeled “Search events...” is present | Search exists, but the captured initial state does not establish grouped results across teams, competitions, channels, and sports | Medium |
| Filters | Events and Live TV tabs plus All, sport categories, and Favorites are present | The number of controls creates visual competition. The filter system should be unified, horizontally scrollable on small screens, and clearer about the active state | Medium |
| Schedule | Schedule navigation and time-based event cards are present | A clear Today/Tomorrow/This Week model was not evident in the initial captured view and should be made explicit | Medium |
| Channels | Live TV tab and per-event stream buttons exist | A dedicated categorized channel catalog with logo, category, live state, and watch action should be more prominent | Medium |
| Mobile UX | A responsive Blogger frontend and navigation elements are present | A full iPhone, Android, tablet, and desktop regression pass remains necessary. Mobile should use horizontal live-card rails, bottom navigation, safe-area spacing, and touch-safe controls | High |
| Accessibility | Skip-to-main and skip-to-search links are present; many controls have labels or hints | Focus states, semantic headings, status announcements, keyboard traversal, and non-color status labels need systematic verification | Medium |
| SEO | The XML includes title, description, canonical, Open Graph, and Twitter metadata | Event-specific titles, structured data, image alt text, and event-page metadata should be strengthened and tested | Medium |

## Theme findings

The uploaded XML contains a coherent design-token system with red primary branding, gold secondary accents, dark backgrounds, Inter/Poppins/Barlow Condensed typography, reusable radii and shadows, hero-image variables, a ticker, featured panel, tabs, event cards, countdown/live states, picture-in-picture, and cinema-mode behavior. This is a strong base for the requested modernization.

The theme also includes Google Analytics, Firebase URL metadata, Google Fonts, Blogger expressions, and a large inline CSS/JavaScript implementation. Blogger compatibility is possible, but future edits must preserve CDATA boundaries, XML escaping, Blogger expressions, and valid entity syntax. The XML should be validated automatically before import.

The current visual layer includes ticker motion, Ken Burns hero animation, blur effects, pulse effects, sticky surfaces, and picture-in-picture. These should be retained selectively. Reduced-motion support, lighter default effects, and deferred player loading are important for mobile networks and low-end devices.

## Repository and automation findings

The repository README documents a GitHub Actions workflow that runs every ten minutes, aggregates OneBall-backed events, writes normalized records under `s803config/todaysMatches`, validates them by reading them back, generates Blogger article content and thumbnails, uploads thumbnails to ImgBB, and records Blogger publication state in Firebase. It also contains a manual Firebase verifier and optional AI utilities that are disabled by default and provide deterministic fallbacks.

This is a useful automation foundation, but it is not the production theme. Editing the repository’s `index.html` alone will not redesign the public Blogger site. The repository should be used to improve event-schema guarantees, publication safety, observability, idempotency, and compatibility with the XML frontend.

A significant configuration inconsistency requires attention. `.github/workflows/auto-publish.yml` sets `FIREBASE_PUBLIC_WRITE: 'true'`, while the README says the database should not be made publicly writable and recommends service-account authentication. This should be reviewed before production changes. The safer default is to remove the public-write override and require authenticated service-account writes, unless code inspection proves the variable has no security effect.

The ten-minute schedule and five-event run cap are reasonable for deterministic synchronization, provided that records are idempotent, duplicate Blogger posts are prevented, failures are retryable, and expired events are excluded from live and upcoming views.

## Recommended implementation sequence

| Phase | Work | Outcome |
|---|---|---|
| 1 | Audit current theme, live site, repository, and workflow | Completed in this report |
| 2 | Define the mobile-first information architecture, card states, event-detail view, player states, and navigation model | A precise redesign specification before code changes |
| 3 | Harden Firebase schema and workflow authentication; remove or justify public-write behavior; define status calculation from timestamps | Safer and more predictable data flow |
| 4 | Refactor the Blogger XML around reusable rendering helpers while preserving existing features | Modernized frontend with lower regression risk |
| 5 | Implement the mobile-first hierarchy: Live Now, Starting Soon, Today’s Events, Live TV, categories, search, favorites, and event details | App-like user experience across viewports |
| 6 | Add lazy loading, player-on-demand behavior, reduced motion, structured SEO metadata, accessibility improvements, and explicit error states | Better performance, discoverability, and resilience |
| 7 | Test iPhone, Android, tablet, desktop, Firebase reads, countdown transitions, search, filters, stream switching, cinema mode, PIP, console errors, broken links, and XML import validity | Release-quality validation report |

## Phase 1 conclusion

The strongest path is a controlled modernization. The existing theme already implements many requested functions, and the GitHub repository already supports automated event synchronization and Blogger publication. The next step should be a formal UI/UX and architecture specification followed by targeted edits to the Blogger XML and workflow, not the creation of a generic replacement website.

> **Important:** Before implementation, the Firebase write configuration should be corrected or explicitly justified. The current public-write setting conflicts with the repository’s stated security guidance.

## References

[1]: https://sports803tv.blogspot.com/?m=1 "Sports 803 TV public Blogger site"
[2]: https://github.com/Sports803/Event "Sports803/Event GitHub repository"
