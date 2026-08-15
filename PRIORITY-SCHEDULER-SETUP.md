# Sports803 Priority Event Scheduler

The Event app now includes a **Priority Schedule** inside the Calendar tab. Scheduled records are stored at `automation/scheduledEvents` in Firebase. The GitHub Actions worker reads this queue every ten minutes, gives enabled scheduled events priority over automatically detected fixtures, merges matching detected streams when available, writes the final website-compatible event to `s803config/todaysMatches`, and posts each event to Blogger once through the existing deduplication ledger.

## Required Firebase rule

Add this child under the existing `automation` node. Keep the rest of your current rules unchanged:

```json
"automation": {
  ".read": true,
  "bloggerPosts": {
    ".read": true,
    ".write": true
  },
  "scheduledEvents": {
    ".read": true,
    ".write": true
  }
}
```

If your current Firebase rules already declare `automation`, merge only the `scheduledEvents` child into that existing object. Do not add a second top-level `automation` key.

## How to schedule an event

Open [Sports803 Event](https://sports803.github.io/Event/), select **Calendar**, and use the **Priority Schedule** panel. Enter a stable Schedule ID, such as `arsenal-chelsea-2026-08-16`, then enter the competition, sport, date, kickoff time, teams, duration, and stream URL. Use the validated raw stream URL or an existing Sports803 player URL. The worker normalizes both forms and writes the canonical player URL.

Leave **Enabled and ready for automatic publishing** selected. Set a higher priority when several manual events are waiting. The default value is `1000`, which is higher than automatically detected events. The schedule ID must remain stable so the Blogger deduplication record recognizes the same event on later runs.

The web app also supports editing, pausing, enabling, deleting, and refreshing the queue. If the device loses connectivity while saving, the event is stored in a local offline outbox and is synchronized automatically when the browser becomes online again.

## What happens after saving

The GitHub Actions workflow continues to run on its ten-minute schedule even when your phone or computer is offline. It loads `automation/scheduledEvents`, ignores disabled or out-of-window records, merges a matching automatically detected event when one exists, ranks its available streams, writes it to `s803config/todaysMatches/match_manual_<schedule-id>`, and attempts the Blogger post.

The manual schedule has priority in three ways. Manual events are selected before automatic events, their explicit priority values are respected, and a matching automatic event is merged into the manually scheduled record rather than creating a duplicate. The existing `automation/bloggerPosts` ledger prevents the same schedule ID from being posted again after a successful Blogger publication.

## Important offline limitation

The automation can continue without your device or personal internet connection **after the schedule has already been saved to Firebase**. A device that is completely offline cannot upload a new schedule to Firebase at that moment. In that case, use the app’s offline outbox; it will upload the draft automatically the next time the device reconnects.

A scheduled event should contain at least one valid stream URL before it can be published. If no stream is available yet, the record remains in the schedule queue but the worker will wait until a usable stream is present. When automatic detection later finds a matching stream, the worker can merge it into the scheduled event.

## Workflow settings

The workflow uses these defaults:

| Setting | Value | Meaning |
|---|---:|---|
| Run interval | 10 minutes | GitHub Actions checks the queue and detected sources regularly |
| Manual schedule path | `automation/scheduledEvents` | Firebase location used by the Event app and worker |
| Manual window | 24 hours ahead | Events outside the active window are not posted yet |
| Default priority | 1000 | Manual events outrank automatic events |
| Maximum posts per run | 5 | Existing Blogger rate-limit protection remains active |

The worker changes are in `scripts/auto-publish.mjs`, the workflow settings are in `.github/workflows/auto-publish.yml`, and the Event app changes are in `index.html`.
