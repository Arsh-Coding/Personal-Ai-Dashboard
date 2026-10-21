import { google } from "@ai-sdk/google";
import {
  APICallError,
  convertToModelMessages,
  createUIMessageStreamResponse,
  LoadAPIKeyError,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from "ai";
import { assistantTools, type AssistantMessage } from "@/lib/assistantTools";
import { firstName } from "@/lib/names";
import { readSessionUserId } from "@/server/session";
import { findUserById } from "@/server/users";

/**
 * The assistant's chat endpoint.
 *
 * It can only *propose*: the tools it hands the model have no `execute`, so the
 * strongest thing a reply can do is put a confirm card on screen. Sending and
 * scheduling happen through the existing tRPC mutations, called from that card
 * when the user presses its button. See `@/lib/assistantTools`.
 *
 * The model is Google Gemini, called directly with a key from Google AI Studio.
 * Its free tier needs no card, which is why it was picked over Vercel AI
 * Gateway (free credits there require a card on file). The key goes in
 * `GOOGLE_GENERATIVE_AI_API_KEY`, locally in `.env` and on Vercel as an
 * environment variable; `@ai-sdk/google` reads it from there by default.
 */

export const maxDuration = 30;

/**
 * Flash-Lite is Gemini's fastest, cheapest tier, and the free tier allows it the
 * most requests per day. That is plenty for turning one request into a draft.
 * `CHAT_MODEL` swaps it for any other Gemini model id without a code change.
 */
const MODEL = process.env.CHAT_MODEL?.trim() || "gemini-3.5-flash-lite";

const NOT_CONFIGURED =
  "The assistant isn't set up yet. Add GOOGLE_GENERATIVE_AI_API_KEY (a free key from Google AI Studio) and restart the server.";

/** Older turns add cost and nothing useful to a one-shot action. */
const MAX_MESSAGES = 30;
/** Generous for chat text; refuses anything that is not a chat. */
const MAX_BODY_BYTES = 200_000;

export async function POST(request: Request) {
  const userId = readSessionUserId(request.headers.get("cookie"));
  const user = userId ? await findUserById(userId) : null;
  if (!user) return fail(401, "Sign in to continue.");

  // Checked up front so a missing key is a clear message, not a failed model call.
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) return fail(503, NOT_CONFIGURED);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return fail(413, "This conversation is too long. Clear the chat and try again.");
  }

  let parsed: { messages?: unknown; timeZone?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail(400, "Invalid request.");
  }
  if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
    return fail(400, "Invalid request.");
  }

  // The history comes from the browser, so it is checked against the same
  // schemas the tools declare before any of it reaches the model.
  let messages: AssistantMessage[];
  try {
    messages = await validateUIMessages<AssistantMessage>({
      messages: parsed.messages.slice(-MAX_MESSAGES),
      tools: assistantTools,
    });
  } catch {
    return fail(400, "The conversation couldn't be read. Clear the chat and try again.");
  }

  const timeZone = safeTimeZone(parsed.timeZone);

  const result = streamText({
    model: google(MODEL),
    instructions: buildInstructions(user, timeZone),
    messages: await convertToModelMessages(resolvePendingCards(messages)),
    tools: assistantTools,
    maxOutputTokens: 1200,
    abortSignal: request.signal,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, onError: describeError }),
  });
}

/**
 * Plain text rather than JSON: `useChat` shows a failed response's body as the
 * error message verbatim, so this is exactly what the user reads.
 */
function fail(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Cards the user never confirmed or cancelled.
 *
 * A tool call with no result is invalid history: sending it to the model fails
 * with `MissingToolResultsError`. That happens whenever someone types a new
 * message while a card is still open, so treat those as cancelled. Nothing was
 * sent for them, and saying so keeps the model from assuming otherwise.
 */
function resolvePendingCards(messages: AssistantMessage[]): AssistantMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (
          (part.type === "tool-draftEmail" || part.type === "tool-scheduleMeeting") &&
          (part.state === "input-available" || part.state === "input-streaming")
        ) {
          return {
            type: part.type,
            toolCallId: part.toolCallId,
            state: "output-available",
            input: part.input,
            output: {
              status: "cancelled",
              note: "The user moved on without confirming. Nothing was sent.",
            },
          } as AssistantMessage["parts"][number];
        }
        return part;
      }),
    };
  });
}

/** The browser's IANA zone if it is a real one, otherwise UTC. */
function safeTimeZone(value: unknown): string {
  if (typeof value === "string" && value.length > 0 && value.length < 64) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return value;
    } catch {
      // Fall through to UTC.
    }
  }
  return "UTC";
}

function buildInstructions(
  user: { name: string | null; email: string },
  timeZone: string,
): string {
  const now = new Date();
  const spoken = new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(now);
  // en-CA formats as YYYY-MM-DD, the shape the tools ask for.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  // Same name the dashboard title uses, so emails are signed the way the
  // workspace greets the user.
  const first = firstName(user.name, user.email);

  return [
    `You are the assistant in ${user.name ?? first}'s personal dashboard. You do exactly two things:`,
    "1. Draft an email, with the draftEmail tool.",
    "2. Schedule a Google Meet meeting with one person, with the scheduleMeeting tool.",
    "",
    "Rules:",
    "- Calling a tool only shows the user a card to review. Nothing is sent or scheduled until they press its button, so never say something was sent or scheduled unless a tool result says so.",
    "- You cannot read the user's inbox or calendar. If asked to, say so in one sentence.",
    "- Never guess or invent an email address. If you don't have one, ask for it.",
    "- If the date or start time is missing or ambiguous, ask before calling scheduleMeeting.",
    `- Write emails in plain text, no markdown, signed "${first}".`,
    "- Keep chat replies to one or two short sentences.",
    "",
    `The user is ${user.name ?? first} <${user.email}>.`,
    `Current time for the user: ${spoken} (${timeZone}). Today is ${today}.`,
    "Resolve relative dates such as \"tomorrow\" or \"next Thursday\" against that, in that time zone.",
  ].join("\n");
}

/**
 * What the chat shows when a reply fails.
 *
 * The cases worth naming are the ones the user can act on: no key, a rejected
 * key, and the free tier's rate limits. Everything else is logged in full and
 * shown as a generic line, since raw provider errors can carry internals.
 *
 * Errors arrive wrapped. After retries the SDK throws a `RetryError` whose
 * `lastError` is the real `APICallError`, so both `cause` and `lastError` are
 * followed.
 */
function describeError(error: unknown): string {
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];
  while (queue.length > 0) {
    const e = queue.shift();
    if (e === null || typeof e !== "object" || seen.has(e)) continue;
    seen.add(e);

    if (LoadAPIKeyError.isInstance(e)) return NOT_CONFIGURED;
    if (APICallError.isInstance(e)) {
      if (e.statusCode === 429) {
        return "Gemini's free-tier limit is reached for now. Wait a minute and try again; if it keeps happening, the daily quota is used up until tomorrow.";
      }
      if (e.statusCode === 400 || e.statusCode === 401 || e.statusCode === 403) {
        if (/api key/i.test(`${e.message} ${e.responseBody ?? ""}`)) {
          return "Google rejected the API key. Check GOOGLE_GENERATIVE_AI_API_KEY and restart the server.";
        }
      }
      if (e.statusCode === 404) {
        return `Gemini doesn't recognise the model "${MODEL}". Check CHAT_MODEL.`;
      }
    }

    const { cause, lastError } = e as { cause?: unknown; lastError?: unknown };
    queue.push(cause, lastError);
  }
  console.error("Assistant chat failed:", error);
  return "The assistant couldn't respond. Try again in a moment.";
}
