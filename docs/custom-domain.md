# Custom domain

By default your instance lives at `https://<worker-name>.<your-subdomain>.workers.dev`.
It works, but a form endpoint on your own domain (`https://forms.example.com/f/…`) looks
better to people submitting it, and it survives if you ever rename the Worker.

You need a domain whose DNS is on Cloudflare (an active zone in the same account).

## 1. Add the domain in `wrangler.jsonc` (recommended)

Your repository is the source of truth for the Worker's config: every push redeploys it.
Adding the domain there means no later deploy can drop it.

In **your** copy of the repository, add a `routes` entry to `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "forms.example.com", "custom_domain": true }]
```

Commit and push. Workers Builds redeploys, and Cloudflare creates the DNS record and
certificate for you. It usually works within a minute.

Use a hostname with no existing DNS record: Cloudflare refuses to create a custom domain
over an existing `CNAME`. Delete the old record first if there is one.

> **Updating later:** `wrangler.jsonc` is a file both you and FormFlare releases touch.
> `scripts/check-update.mjs` applies each file with a three-way merge, so your `routes`
> line survives unless a release edits the same lines. If it doesn't, the file shows up
> in `.formflare/pending-updates.json`. See the README section on updates.

### Or: the dashboard

**Workers & Pages** → your Worker → **Domains** → **Add** → **Custom domain**.

This is quicker, but Cloudflare treats `wrangler.jsonc` as authoritative for routes. If
you ever add a `routes` key to the file, the next deploy replaces what the dashboard set.
Pick one place and stick with it.

## 2. Tell FormFlare its new address

FormFlare remembers the first address it was opened on. It uses that address for links
it builds without a browser request to read it from: double opt-in confirmation emails,
and the confirm links shown in Inbox.

After the domain works, open the dashboard **on the new domain**. Go to **Settings →
Email → Advanced — instance URL** and set it to `https://forms.example.com`. Otherwise
those links keep pointing at `workers.dev`. If email is off, there's nothing to change.

Things that just follow whichever address you're on, no change needed:

- Embed snippets and the widget `<script>` on each form page. **Re-copy them** from
  the dashboard on the new domain, and update the sites that use the old ones.
- The dashboard login. Cookies are per-domain, so you sign in once more on the new
  address.

## 3. Optional: turn off `workers.dev`

Once everything points at the custom domain, you can stop the `workers.dev` address
from serving the same instance:

```jsonc
"workers_dev": false
```

Only do this after you've updated every site that embeds the old address. Forms
posting to it fail as soon as this deploys.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Hostname already has externally managed DNS records" | Delete the existing record for that hostname, then add the domain again |
| Certificate errors for a few minutes after adding it | Normal. Cloudflare is issuing the certificate. Wait, then retry |
| Confirmation emails link to `workers.dev` | Set the instance URL (step 2) |
| Forms on your site return `403 origin_not_allowed` | Unrelated to the instance domain. The form's **Allowed origins** lists *your site*, not FormFlare's |
