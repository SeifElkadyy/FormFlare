# Embedding

The dashboard form page is a split view: settings on the left, a live hosted-page
preview on the right. Pick **one** way to share (my website / a link / a widget)
from the Share row. API keys are for **reading** submissions, not for this POST.

`POST https://your-instance/f/<publicId>`

The dashboard form page copies these snippets from the fields you configured.

## HTML

```html
<form action="https://your-instance/f/<publicId>" method="POST">
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off" />
  <input name="name" required />
  <input name="email" type="email" required />
  <textarea name="message" required></textarea>
  <button type="submit">Send</button>
</form>
```

Style the fields however you want. Leave the honeypot in.

## fetch / JSON

```js
const res = await fetch("https://your-instance/f/<publicId>", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    name: "Ada",
    email: "ada@example.com",
    message: "Hello",
  }),
});
const json = await res.json();
if (!json.ok) throw new Error(json.code);
```

No API key. If you lock **Allowed origins**, add the origin of the page that runs this
script (`https://yoursite.com`). Empty means any site may submit.

## React

Same endpoint, client-side `fetch`, `Accept: application/json`. Copy the React tab
on the form page so the field names match what you configured.

## Hosted page / widget

If you do not want to style anything: `/p/<slug-or-publicId>`, or

```html
<script src="https://your-instance/widget.js" data-form="PUBLIC_ID" async></script>
```

Those use FormFlare's look, not yours.

The widget sizes itself to the form, and to the thank-you message after a submit. You
don't need to set a height. Options:

| Attribute | Effect |
| --- | --- |
| `data-form` | The form's public id or slug (required) |
| `data-ref` | A waitlist referral code. Without it, a `?ref=` on the host page is used |
| `data-title` | The iframe's accessible title (default `Form`) |

A form with its own redirect URL leaves the iframe on submit and opens that page in
the full window, since most sites don't allow being framed.

## CORS and redirects

Browser `fetch` sends `Origin`. An allow-list that does not include that origin
returns `403 origin_not_allowed`. A plain HTML form POST navigates, so CORS does not
apply the same way.

`_redirect` is only honoured when it matches an allowed origin.
