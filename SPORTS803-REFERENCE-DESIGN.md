# Sports 803 — Reference-Aligned Design Direction

## Visual language

The supplied references establish a premium sports dashboard rather than a traditional blog. The visual language is near-black with charcoal panels, subtle borders, muted gray text, and a single bright green accent used for live states, selected navigation, follow actions, and key calls to action. The design should remain dense and information-rich without becoming visually noisy.

## Desktop composition

Desktop uses a fixed left navigation rail with Sports 803 branding, primary navigation, and optional community links. A compact top bar contains the current site identity, a live indicator, search, and utility actions. The central column is the primary workspace: a live player or featured event followed by match tabs, filters, and a dense event list. A narrower right column is reserved for upcoming matches, related channels, and secondary information.

The central player should use a 16:9 frame with restrained overlays, a clear live label, and action controls that do not obscure the stream. Match rows should emphasize team names, scores or kickoff times, competition, status, and compact actions. Panel borders should be subtle, and hover states should use the green accent rather than large gradients.

## Mobile composition

Mobile removes the desktop sidebar and converts navigation into a compact sticky top bar plus fixed bottom navigation. Search becomes an icon-sized control that can expand when activated. Live content appears first, followed by horizontally scrollable category controls and compact event cards. The right desktop rail becomes a normal lower section, and no fixed element may cover event content or player controls.

The mobile player remains prominent but not oversized. Match cards use smaller team logos, concise competition labels, readable status text, and touch-friendly stream/favorite/reminder controls. The design must avoid horizontal page overflow and preserve safe-area spacing above the bottom navigation.

## Preserved behavior

The redesign is CSS-first and keeps the current Blogger markup and JavaScript event wiring. Existing Firebase event rendering, live/upcoming/finished state logic, search, categories, Live TV, stream buttons, favorites, reminders, cinema mode, picture-in-picture, Telegram, WhatsApp, and support links remain in place.
