/**
 * A value that is safe to put after `Subject: ` in a raw RFC 2822 message.
 *
 * Two problems, both of which the assistant makes likely because it writes
 * subjects on the user's behalf:
 *
 *   - A line break ends the header, and whatever follows becomes a new one. A
 *     subject of "Hi\r\nBcc: someone@example.com" would quietly copy the mail to
 *     a third party. Line breaks are collapsed to spaces.
 *   - Headers are 7-bit ASCII. Curly quotes, dashes, emoji or non-Latin text sent
 *     raw can reach the recipient garbled, so anything non-ASCII is sent as an
 *     RFC 2047 encoded word, which every mail client decodes.
 */
export function encodeHeaderValue(value: string): string {
  const singleLine = value.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7E]*$/.test(singleLine)) return singleLine;
  return `=?UTF-8?B?${Buffer.from(singleLine, "utf8").toString("base64")}?=`;
}
