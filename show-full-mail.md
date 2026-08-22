# Show Full Mail

Design for reading a complete email in `MailPanel` instead of the one-line snippet
it shows today.

Status: proposed, not implemented. Every number below was measured against the
current `corsair.db`, not estimated.

## What the user sees now

`MailPanel` renders a thread list. Clicking a thread expands it into its messages,
and each message shows `from` plus `snippet` — Gmail's ~200 character preview.
There is no way to read the rest.

## What changes

Each expanded message gets a **Show full mail** button. Pressing it reveals the
real body, rendered, with a **Hide** to collapse it again. Buttons are per message,
not per thread, so a long thread doesn't dump everything at once.

## The finding that shapes this design

**The full body is already on disk. No new Gmail call is needed to display it.**

`refreshMail` hydrates messages with `gmail.api.messages.get({ id })`, whose
default format is `full`, and the stored entity keeps the whole `payload` — the
complete MIME tree including base64url body data. Sampling the gmail rows:

```
hydrated messages inspected: 398
  reachable text/html      : 396
  text/plain only          :   2
  neither                  :   0
```

A representative row:

```
payload keys : partId, mimeType, filename, headers, body, parts
mimeType     : multipart/mixed
headers      : 25
MIME tree:
  - multipart/mixed
    - multipart/alternative
      - text/html  size=73669  data=98228ch
```

So this is a decode-and-render problem, not a fetch problem. That is the single
biggest constraint on the design, and it means the feature is mostly local work.

## The weight problem this has to fix

`mail.getMessages` returns every message for the tenant through `unwrapEntities`,
which lifts `data` to the top level — **including `payload`**. The browser is
already downloading every full email body on every dashboard load:

| tenant | rows (hydrated) | total JSON | of which payload | without payload |
|---|---|---|---|---|
| personal | 340 (174) | 12.31 MB | 8.91 MB (72.4%) | 3.40 MB |
| jungleworks | 343 (174) | 9.52 MB | 7.30 MB (76.7%) | 2.22 MB |
| finance | 200 (50) | 3.40 MB | 2.49 MB (73.3%) | 0.91 MB |

Largest single message: 249 KB.

Roughly three quarters of that transfer is body data the current UI never renders.
Two consequences:

1. Splitting list from detail is a **prerequisite**, not an optimisation. `getMessages`
   must stop returning `payload`.
2. Once split, the feature costs almost nothing — one body at a time, on demand,
   instead of all of them, always.

Done in this order the change is net *negative* bytes for a typical session.

## Design

### Data flow

```
MailPanel                    server                        corsair.db
    |                          |                               |
    |-- getMessages ---------->|  strip `payload` ------------->|
    |<- list metadata ---------|                               |
    |                          |                               |
  [Show full mail]             |                               |
    |-- getMessageBody(id) --->|  read one row ---------------->|
    |                          |  walk MIME -> pick part       |
    |                          |  base64url decode             |
    |                          |  sanitize                     |
    |<- { html, attachments } -|                               |
```

Decoding and sanitising happen **server-side**. The client never sees raw email
HTML, base64 blobs, or the MIME tree. That keeps the trust boundary in one place
and keeps the payload proportional to what's being displayed.

### Body extraction

The MIME tree is not a fixed shape. Measured distribution across 398 hydrated
messages — 24 distinct shapes, up to three levels deep:

```
 143  text/html                                                   <- flat, data at root
 140  multipart/alternative[text/plain,text/html]
  35  multipart/mixed[text/html]
  14  multipart/mixed[multipart/alternative[text/html]]
  14  multipart/related[text/html,image/png]
  10  multipart/mixed[multipart/alternative[text/plain,text/html],application/pdf]
   9  multipart/alternative[text/html]
   7  multipart/mixed[multipart/alternative[text/plain,text/html,text/calendar],application/ics]
   5  multipart/mixed[text/html,text/plain]
   4  multipart/alternative[text/plain,text/x-amp-html,text/html]
   2  multipart/mixed[multipart/alternative[text/plain,text/html],video/mp4]
   1  multipart/related[multipart/alternative[text/plain,text/html],image/png x12]
   1  text/plain
   ... 11 more long-tail shapes
```

Rules that follow from the data:

- **Recurse depth-first.** A flat `text/html` root is the most common single shape,
  but two thirds of messages nest it one or two levels down.
- **Match `text/html` exactly.** Four messages carry `text/x-amp-html` inside
  `multipart/alternative`, which is not meant to be rendered standalone. In all four
  the real `text/html` happens to sit last, so a "last alternative child wins" rule
  would survive them — but a looser "first HTML-ish part" walk picks the AMP variant,
  and part ordering is a convention rather than something to lean on. Exact matching
  sidesteps the question.
- **Fall back to `text/plain`,** which two messages need, and render it escaped
  inside `<pre>` rather than as markup.
- **Skip parts with a `filename`.** Those are attachments, not body candidates,
  even when the MIME type looks renderable.
- **Ignore `text/calendar`** as a body source. Seven messages are meeting invites
  where it sits alongside the real body.

Sketch:

```ts
type Part = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: Part[];
  headers?: { name?: string; value?: string }[];
};

/** Depth-first search for the first part of `want` that carries inline data. */
function findPart(part: Part | undefined, want: string): Part | undefined {
  if (!part) return undefined;
  // A named part is an attachment, whatever its type claims.
  if (!part.filename && part.mimeType === want && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const hit = findPart(child, want);
    if (hit) return hit;
  }
  return undefined;
}

const htmlPart = findPart(payload, "text/html");
const textPart = htmlPart ? undefined : findPart(payload, "text/plain");
```

### base64url decoding

Gmail returns body data in the URL-safe alphabet, so `-` and `_` stand in for `+`
and `/` and the padding is stripped. `sendMessage` already does this transform in
the encode direction; this is its mirror:

```ts
function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
```

`Buffer.from` tolerates missing padding, so no manual `=` fixup is needed. Decode
as UTF-8 and accept mojibake on the rare legacy charset rather than shipping an
encoding-detection dependency for v1; the `Content-Type` header on the part records
the real charset if this ever needs revisiting.

### Rendering, and why this is the risky part

Email HTML is attacker-controlled input. Anyone can send you mail. Rendering it
carelessly is a stored-XSS hole that would run with your session and your Gmail
tokens. Two independent defences, because either alone has failure modes:

**1. Sanitise server-side.** Strip `<script>`, `<iframe>`, `<object>`, `<embed>`,
`<form>`, every `on*` handler, and `javascript:` / `data:` URLs on links. There is
no sanitiser in `package.json` today, so this adds a dependency — `isomorphic-dompurify`
is the conventional pick and runs in the Node path here.

> **Revised during implementation.** `<style>` blocks are dropped rather than kept.
> DOMPurify lists `style` in `DEFAULT_FORBID_CONTENTS`, so preserving the rules means
> passing `FORBID_CONTENTS` explicitly, which *replaces* that default and pins a copy
> of a list upstream actively adds to for security reasons. Measuring the real corpus
> made the trade easy: of 396 HTML messages, 94.9% carry inline `style` attributes
> (which DOMPurify keeps) and only 3 use `class` with no inline styling, so dropping
> `<style>` degrades 0.8% of mail cosmetically. Responsive `@media` rules are the
> genuine loss. Consequence worth noting: inline `style="background-image:url(...)"`
> survives sanitising untouched, so the CSP below is what actually blocks that
> tracking request, not the `src` stripping.

**2. Render inside a sandboxed iframe,** so a sanitiser miss still cannot execute:

```tsx
<iframe
  srcDoc={html}
  sandbox="allow-same-origin"
  className="h-[60vh] w-full rounded-lg border border-slate-800 bg-white"
/>
```

A note on that `sandbox` value, because the combination matters. Omitting
`allow-scripts` is what blocks execution. Including `allow-same-origin` **without**
`allow-scripts` is safe and buys you the ability to read
`contentDocument.documentElement.scrollHeight` from the parent to size the frame to
its content. Adding `allow-scripts` *and* `allow-same-origin` together defeats the
sandbox entirely and must not be done. If auto-sizing turns out to be fiddly, a fixed
`max-height` with internal scrolling is a perfectly good v1 and needs no measurement
at all.

Rendering into the main document with `dangerouslySetInnerHTML` is the tempting
shortcut and should be rejected: email CSS is written assuming it owns the page, so
beyond the security question it will fight the dashboard's styling.

**Block remote images by default.** 29 of the sampled messages carry `Content-ID`
parts and many more reference remote URLs. Loading them silently reports back to the
sender that the mail was opened. Rewrite `src` to a placeholder, show a
*Display images* bar, and let the user opt in per message. This is standard mail
client behaviour and it is a privacy feature as much as a security one.

### Messages that aren't hydrated yet

Hydration is bounded at `HYDRATE_PER_SYNC = 50` per sync, so a large mailbox has
stubs with no `payload` — currently 174 of 340 for `personal`. Pressing **Show full
mail** on one of those should hydrate it on demand: call
`gmail.api.messages.get({ id })`, then re-read the row. One API call, well inside
quota, and far better than telling the user to go press Sync.

This makes `getMessageBody` a `mutation` rather than a `query`, since it may write.
An alternative is to keep it a query and expose a separate `hydrateMessage` mutation
that the UI calls first when `payload` is absent; either works, but the two-call
version keeps caching semantics cleaner in react-query.

### Attachments: list, don't download

The gmail plugin exposes `messages.{list,get,send,delete,modify,batchModify,trash,untrash}`
and **no attachments endpoint**. Gmail's `users.messages.attachments.get` is not
reachable through the plugin's endpoint tree, so v1 cannot fetch attachment bytes.

47 of the sampled messages have parts with an `attachmentId`. What v1 *can* do is
list them — filename, MIME type, and `body.size` are all present in the payload
already — rendered as non-interactive chips so the user at least knows what's there.

Downloading later needs one of: the plugin adding the endpoint; a direct call through
corsair's `request` helper; or fetching `format: "raw"` and parsing the MIME
ourselves. All are follow-up work, and the third is the worst of the three.

## API surface

**Change `mail.getMessages`** to project away `payload` before returning. This is the
prerequisite. Worth checking whether any other caller depends on it — at time of
writing only `MailPanel` consumes this procedure, for `from` / `subject` /
`internalDate` / `threadId` / `snippet`.

**Add `mail.getMessageBody`:**

```ts
input:  { tenant: TenantId, messageId: string }
output: {
  ok: true,
  kind: "html" | "text",
  content: string,          // sanitised HTML, or escaped plain text
  blockedImages: number,    // drives the "Display images" bar
  truncated: boolean,
  attachments: { filename: string, mimeType: string, size: number }[],
} | { ok: false, error: string }
```

Returning a discriminated result rather than throwing matches how `refreshMail`,
`sendMessage`, and `getConnectUrl` already report failure in this codebase.

Cap `content` at ~1 MB and set `truncated`. The largest message on disk is 249 KB, so
this is a guard against a pathological message rather than a routine path.

## UI changes

`MailPanel`'s expanded-message block gains:

- a **Show full mail** / **Hide** toggle per message
- `expandedBodyId` state alongside the existing `expandedThreadId`, so one body is
  open at a time and switching messages doesn't accumulate iframes
- a loading state, since an unhydrated message means a Gmail round trip
- the attachment chip row
- the *Display images* bar when `blockedImages > 0`

Keep the snippet visible when the body is collapsed. Nothing about the current
collapsed appearance needs to change.

## Interaction with `refreshMail`

`refreshMail` already works around `messages.list` clobbering hydrated rows: it
snapshots hydrated messages, lets the list call overwrite, then restores the dropped
fields. `mergeable(snapshot)` spreads every field, so `payload` is already covered by
that mechanism and this feature needs no change there.

One thing to watch: the snapshot filter is `m.id && m.subject`, i.e. it treats
`subject` as the marker for "this row is hydrated". If a future change caches the
*decoded* body on the entity — the plugin's message schema does declare unused `body`
and `raw` fields — that marker needs revisiting so a partially-populated row isn't
mistaken for a complete one.

## Out of scope

- Attachment downloads (no plugin endpoint — see above)
- Inline `cid:` image resolution, which needs attachment bytes for parts without
  inline data
- Charset detection beyond UTF-8
- Reply / forward from the reading view
- Marking read on open, i.e. `messages.modify` to drop the `UNREAD` label
- Print or open-in-new-tab

## Verification

1. **Extraction across real shapes.** Run the extractor over every hydrated row in
   `corsair.db` and assert a body is found for 398 of 398. The two `text/plain`-only
   messages must come back as `kind: "text"`, and the four `text/x-amp-html` messages
   must select the real `text/html` sibling — those are the cases a naive walker gets
   wrong.
2. **Sanitiser.** Feed known XSS vectors (`<script>`, `<img onerror>`,
   `<a href="javascript:">`, `<svg onload>`) through and confirm each is neutralised.
3. **Sandbox.** Confirm the rendered iframe cannot execute script even when
   sanitisation is deliberately bypassed.
4. **Weight.** Measure the `getMessages` response before and after the `payload`
   split; expect roughly the drop in the table above (12.31 MB to 3.40 MB for
   `personal`).
5. **On-demand hydration.** Pick a stub with no `payload`, press the button, confirm
   one `messages.get` fires and the body renders.
6. **Multi-account.** Verify against all three tenants, since `finance` has a
   different hydration ratio (50 of 200) and will exercise the stub path most.
