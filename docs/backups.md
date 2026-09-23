# Backups and recovery

Your submissions live in **your** D1 database. Nobody else holds a copy, so this page is
how you keep them safe.

## D1 Time Travel (on by default)

D1 keeps a point-in-time history of every database automatically. There's nothing to
enable and it costs nothing:

| Plan | How far back you can restore |
| --- | --- |
| Workers Free | 7 days |
| Workers Paid | 30 days |

To restore, use the database name shown in the Cloudflare dashboard (**Storage &
Databases → D1**). It's `formflare` unless you renamed it at deploy time:

```bash
# Find the point you want (any time within the window above)
npx wrangler d1 time-travel info formflare --timestamp="2026-09-20T09:00:00Z"

# Restore to it
npx wrangler d1 time-travel restore formflare --timestamp="2026-09-20T09:00:00Z"
```

> **⚠️ A restore overwrites the whole database in place.** Every submission, form edit
> and signup made after that timestamp is gone. Export first (below) if there's anything
> newer you want to keep. You can restore again to a later point if you went too far.
> The restore doesn't delete the history, so you can still pick a later point.

Time Travel covers D1 only. Uploaded files in R2 aren't rewound: a restore can leave
files the database no longer references (the daily sweep removes them), and doesn't
bring back files you deleted.

## Longer than 7 or 30 days: export

**Settings → Download all data (JSON)** downloads every form and submission. Keep a copy somewhere
that isn't Cloudflare. **Inbox → Export CSV** exports whatever the current filters show,
ready for a spreadsheet.

For automatic long-term backups, Cloudflare documents a
[D1 → R2 export with Workflows](https://developers.cloudflare.com/workflows/examples/backup-d1/).
It needs an API token, which FormFlare deliberately never requires, so it isn't built in.
