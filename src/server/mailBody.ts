import DOMPurify from "isomorphic-dompurify";

/**
 * Turns a stored Gmail `payload` into something safe to drop into an iframe.
 *
 * Bodies are already on disk — `refreshMail` hydrates with `messages.get`, whose
 * default format is `full`, and the whole MIME tree is kept on the entity. So
 * this module never talks to Gmail; it walks, decodes, and sanitises.
 *
 * The plugin also stores a pre-decoded `body` field, which looks like a shortcut past
 * the MIME walk but isn't: measured across 400 hydrated rows it is populated on 356
 * (89%) and absent on 44, whereas walking `payload` finds a body on all of them. It
 * would also still need everything below it here, since what it holds is raw
 * unsanitised sender HTML. Not worth trading 11% coverage to skip a tree walk.
 *
 * Everything here runs server-side on purpose. The browser gets a finished
 * document and never sees raw email HTML, base64 blobs, or the MIME tree, which
 * keeps the trust boundary in one place. Email is attacker-controlled input —
 * anyone can send you mail — so rendering it unsanitised would be stored XSS
 * with access to the session and the Gmail tokens behind it.
 */

/** One node of Gmail's MIME tree, as stored on the message entity. */
export type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name?: string; value?: string }[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
};

export type MailAttachment = {
  filename: string;
  mimeType: string;
  size: number;
  /** Absent for inline parts that ship their own bytes. */
  attachmentId?: string;
};

export type MailBody = {
  /** Whether the source part was `text/html` or the `text/plain` fallback. */
  kind: "html" | "text";
  /** A complete HTML document, ready for `srcDoc`. */
  document: string;
  /**
   * Images withheld for privacy that opting in *will* load. Drives the
   * "Display images" bar, so it must only count images that button can fix.
   */
  blockedImages: number;
  /**
   * Images that cannot load however the user answers — `cid:` references to
   * embedded parts, and relative URLs with no base to resolve against. Counted
   * apart from `blockedImages` so the UI doesn't offer a button that would do
   * nothing: measured across the mail on disk, all 66 `cid:` references point at
   * parts holding only an `attachmentId`, and fetching those needs an endpoint the
   * gmail plugin doesn't expose.
   */
  inlineImages: number;
  truncated: boolean;
  attachments: MailAttachment[];
};

/**
 * Guard against a pathological message, not a routine path — the largest body
 * measured on disk is 249 KB. Applied to the decoded string before sanitising so
 * it also bounds how much work the sanitiser is asked to do.
 */
const MAX_BODY_CHARS = 1_000_000;

/**
 * Depth-first search for a body part of exactly `want`.
 *
 * Exact matching is deliberate. Some senders include `text/x-amp-html` beside the
 * real `text/html` inside `multipart/alternative`, and AMP markup isn't meant to
 * be rendered standalone; a looser "first HTML-ish part" walk would pick it. Part
 * ordering within `multipart/alternative` is a convention rather than a guarantee,
 * so matching the type outright avoids relying on it.
 *
 * A part with a `filename` is an attachment whatever its type claims, so those are
 * skipped as body candidates — `text/calendar` on a meeting invite sits alongside
 * the real body and must not replace it.
 */
function findPart(part: GmailPart | undefined, want: string): GmailPart | undefined {
  if (!part) return undefined;
  if (!part.filename && part.mimeType === want && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const hit = findPart(child, want);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Gmail hands body data back in the URL-safe base64 alphabet, so `-` and `_` stand
 * in for `+` and `/` and the padding is stripped. This is the mirror of the encode
 * `mail.sendMessage` already does. `Buffer.from` tolerates missing padding, so no
 * manual `=` fixup is needed.
 *
 * Decoded as UTF-8 unconditionally. A legacy-charset message may come out as
 * mojibake; the part's own `Content-Type` header records the real charset if that
 * ever needs addressing, and detecting it is not worth a dependency here.
 */
function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

/** Every named part in the tree, depth-first, in document order. */
function collectAttachments(
  part: GmailPart | undefined,
  out: MailAttachment[] = [],
): MailAttachment[] {
  if (!part) return out;
  if (part.filename) {
    out.push({
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body?.size ?? 0,
      attachmentId: part.body?.attachmentId,
    });
  }
  for (const child of part.parts ?? []) collectAttachments(child, out);
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strip anything executable, and optionally defang images.
 *
 * DOMPurify already removes `on*` handlers and `javascript:` URLs by default; the
 * `FORBID_*` lists below subtract the embedding and form vectors on top of that.
 *
 * `<style>` blocks do not survive, and that is a deliberate choice rather than an
 * oversight. DOMPurify lists `style` in `DEFAULT_FORBID_CONTENTS`, so keeping the
 * rules would mean passing `FORBID_CONTENTS` explicitly — which *replaces* that
 * default, pinning a copy of a security-relevant list that upstream actively adds
 * to (`selectedcontent` was added to it for a DoS fix). A stale copy silently loses
 * whatever they add next. Measured against the mail actually on disk, the trade is
 * cheap: of 396 HTML messages, 94.9% carry inline `style` attributes, which DOMPurify
 * keeps, and only 3 use `class` with no inline styling at all. Responsive `@media`
 * rules are the real loss; the frame is wide enough that it rarely shows.
 *
 * Image handling is a privacy measure rather than an XSS one: a remote image load
 * tells the sender you opened the mail. Blocking drops `src`/`srcset` so nothing is
 * requested and the browser falls back to `alt` text. The count is what lets the UI
 * offer to load them. Note this alone is not sufficient — inline
 * `style="background-image:url(...)"` survives sanitising untouched, so the shell's
 * `img-src` is what actually stops that request.
 */
function sanitize(
  html: string,
  allowImages: boolean,
): { html: string; blockedImages: number; inlineImages: number } {
  let blockedImages = 0;
  let inlineImages = 0;

  // Hooks are global to the DOMPurify instance, so this only stays correct because
  // adding, sanitising, and removing all happen in one synchronous block — nothing
  // else can interleave. `finally` guarantees the hook can't leak into later calls.
  const hook = (node: Element) => {
    if (node.nodeName !== "IMG") return;

    const src = node.getAttribute("src") ?? "";

    /**
     * `cid:` points at an embedded part rather than anywhere fetchable, and a bare
     * relative path has no base to resolve against inside a `srcdoc` document. Both
     * are dead regardless of the privacy choice, so drop them and count them apart —
     * leaving them in renders a broken-image icon, and counting them as "blocked"
     * would promise that "Display images" fixes them.
     *
     * Protocol-relative `//host/x.png` is left alone: it inherits the parent's
     * scheme and does load.
     */
    if (src !== "" && !/^(?:https?:|data:|\/\/)/i.test(src)) {
      node.removeAttribute("src");
      node.removeAttribute("srcset");
      inlineImages++;
      return;
    }

    if (allowImages) return;
    if (node.hasAttribute("src") || node.hasAttribute("srcset")) {
      node.removeAttribute("src");
      node.removeAttribute("srcset");
      blockedImages++;
    }
  };

  DOMPurify.addHook("afterSanitizeAttributes", hook as never);
  try {
    const clean = DOMPurify.sanitize(html, {
      // Fragment rather than whole document: the surrounding shell (and its CSP)
      // is ours, and a document from the sender must not get to define it.
      WHOLE_DOCUMENT: false,
      FORBID_TAGS: [
        "script",
        "iframe",
        "frame",
        "frameset",
        "object",
        "embed",
        "applet",
        "form",
        "input",
        "button",
        "select",
        "textarea",
        "base",
        "link",
        "meta",
        "noscript",
      ],
      FORBID_ATTR: ["srcdoc", "formaction", "ping", "http-equiv"],
      ALLOW_DATA_ATTR: false,
    });
    return { html: String(clean), blockedImages, inlineImages };
  } finally {
    DOMPurify.removeHook("afterSanitizeAttributes");
  }
}

/**
 * Wrap sanitised content in the document that actually gets rendered.
 *
 * The `<meta>` CSP is the second line of defence, and the one that catches what a
 * DOM sanitiser structurally cannot: `url()` inside a surviving inline `style`
 * attribute. Blocking `img[src]` alone would still leak an open signal through
 * `background-image`, so `img-src` is what closes that. `default-src 'none'` denies
 * every fetch type not named here, meaning scripts, fonts, frames and form posts are
 * off regardless of what got through sanitising.
 *
 * `style-src 'unsafe-inline'` permits the rules themselves but whitelists no URL, so
 * it cannot be used to pull a remote stylesheet.
 */
function wrapDocument(inner: string, allowImages: boolean): string {
  const imgSrc = allowImages ? "https: data:" : "'none'";
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    `img-src ${imgSrc}`,
    /**
     * 1.7% of image references in real mail are plain `http:`, and `img-src https:`
     * alone silently dropped every one of them. Rewriting the URLs would be guesswork
     * about which hosts serve TLS; this hands the decision to the browser, which
     * retries them over https and keeps the request encrypted either way. It also
     * covers `url()` in surviving style attributes, which no markup pass reaches.
     */
    "upgrade-insecure-requests",
  ].join("; ");

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  html { background: #ffffff; }
  body {
    margin: 0; padding: 16px; background: #ffffff; color: #0f172a;
    font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    overflow-wrap: break-word; word-break: break-word;
  }
  /* Wide tables are the norm in marketing mail; contain them instead of
     letting them force the whole document sideways. */
  img, table, video { max-width: 100% !important; }
  img { height: auto; }
  table { table-layout: auto !important; }
  pre { white-space: pre-wrap; font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  a { color: #4338ca; }
  /* Images stripped for privacy still occupy the flow via their alt text. */
  img:not([src]) { outline: 1px dashed #cbd5e1; outline-offset: 2px; color: #64748b; font-size: 12px; }
</style>
</head><body>${inner}</body></html>`;
}

/**
 * Build the renderable document for one message's stored `payload`.
 *
 * Returns `null` when no body part can be found at all, which the caller reports as
 * an error rather than rendering an empty frame. Measured against every hydrated
 * message on disk, `text/html` is reachable in all but two, and those two are
 * `text/plain`.
 */
export function extractMailBody(
  payload: GmailPart | undefined,
  options: { allowImages?: boolean } = {},
): MailBody | null {
  const allowImages = options.allowImages ?? false;
  const attachments = collectAttachments(payload);

  const htmlPart = findPart(payload, "text/html");
  const textPart = htmlPart ? undefined : findPart(payload, "text/plain");
  const source = htmlPart ?? textPart;
  if (!source?.body?.data) return null;

  const decoded = decodeBase64Url(source.body.data);
  const truncated = decoded.length > MAX_BODY_CHARS;
  const bounded = truncated ? decoded.slice(0, MAX_BODY_CHARS) : decoded;

  if (htmlPart) {
    const { html, blockedImages, inlineImages } = sanitize(bounded, allowImages);
    return {
      kind: "html",
      document: wrapDocument(html, allowImages),
      blockedImages,
      inlineImages,
      truncated,
      attachments,
    };
  }

  // Plain text is escaped, never parsed as markup, so it needs no sanitiser pass.
  return {
    kind: "text",
    document: wrapDocument(`<pre>${escapeHtml(bounded)}</pre>`, allowImages),
    blockedImages: 0,
    inlineImages: 0,
    truncated,
    attachments,
  };
}
