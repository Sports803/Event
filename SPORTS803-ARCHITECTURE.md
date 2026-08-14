# Sports 803 TV — Final UI and Architecture Specification

## Product hierarchy

The public frontend should prioritize immediate access to live content. On mobile, the order is: sticky header and search, **Live Now**, **Starting Soon**, **Today’s Events**, **Live TV**, sport filters, and a fixed bottom navigation containing Home, Live, Schedule, TV, and Search. On desktop, the same hierarchy expands into a two-column layout without allowing the hero/player region to overpower the event list.

## Event state model

Event status must be calculated from timestamps whenever possible. An event is **UPCOMING** before `startTime`, **LIVE** from `startTime` through `endTime`, and **FINISHED** after `endTime`. If `endTime` is unavailable, the configured duration or a conservative active grace period should be used. The interface must communicate status with text and iconography, not color alone.

| State | Required card content | Primary action |
|---|---|---|
| Live | Live label, sport, competition, teams, score when available, elapsed time or status, available stream count | Watch Live |
| Upcoming | Start time, event title, competition, countdown, sport, favorite/reminder state | Follow or open event |
| Finished | Full Time label, teams, final score when available, event date | View details or related events |

## Firebase contract

The frontend should consume normalized records under `s803config/todaysMatches` and tolerate legacy records. A normalized record should include `id`, `title`, `sport`, `competition`, `homeTeam`, `awayTeam`, `homeLogo`, `awayLogo`, `startTime`, `endTime`, `status`, `featured`, `thumbnail`, `streams`, and `description`. The client calculates transient status from timestamps and treats the stored status as advisory only.

The publisher must write with a service-account token or explicitly configured legacy auth token. Public database writes are not an accepted fallback. Every write should be followed by read-back and schema validation, and publication identifiers should remain idempotent so retries do not create duplicate Blogger posts.

## Player and event details

The homepage should not instantiate a player for every event. A player is created only after the user opens an event or selects a stream. The player view must expose loading, unavailable, retry, server selection, refresh, fullscreen, picture-in-picture, and cinema-mode states. If a configured server fails, the user should be able to select another configured server without losing event context.

## Performance and accessibility

Images should use lazy loading and explicit dimensions where possible. Event lists should render from normalized data with minimal DOM duplication, and Firebase listeners should be scoped to the current data need. Motion-heavy effects should respect `prefers-reduced-motion`. Interactive elements need visible focus states and labels, and fixed navigation must reserve bottom safe-area space so it does not cover content.

## Blogger compatibility rules

All JavaScript and CSS must remain compatible with Blogger XML. Inline code belongs inside CDATA where appropriate, literal ampersands must be escaped, Blogger expressions must remain intact, and the final artifact must pass the repository preflight validator before import. The theme should be backed up before each Blogger restore operation.
