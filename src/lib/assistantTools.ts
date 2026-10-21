import { tool, type InferUITools, type UIDataTypes, type UIMessage } from "ai";
import { z } from "zod";

/**
 * The assistant's two actions, as proposals only.
 *
 * Neither tool has an `execute` function, and that is the whole safety model.
 * When the model calls one, the AI SDK stops and hands the call to the browser,
 * which renders an editable confirm card. The only code that sends mail or
 * schedules a meeting is the existing `mail.sendMessage` / `meet.scheduleMeeting`
 * tRPC mutations, and the only thing that calls them is the user pressing the
 * card's button. The chat route itself has no way to act, whatever the model is
 * told or tricked into saying.
 *
 * Inputs are deliberately loose (plain strings rather than `z.email()` or regex
 * patterns). A model that gets a format slightly wrong should still produce a
 * card the user can fix, not a dead "invalid input" error. Real validation
 * happens on the card and again in the tRPC input schemas.
 *
 * Safe to import from client components, though they only need the types.
 */

/** What the card records once the user has acted, so the model knows next turn. */
const outcomeSchema = z.object({
  status: z.enum(["sent", "scheduled", "cancelled"]),
  /** One line, shown on the card and read by the model on the next turn. */
  note: z.string(),
  meetLink: z.string().optional(),
});

export type AssistantOutcome = z.infer<typeof outcomeSchema>;

export const assistantTools = {
  draftEmail: tool({
    description:
      "Show the user an email draft to review. This does NOT send anything: the user " +
      "sees an editable card and must press Send themselves.",
    inputSchema: z.object({
      to: z
        .string()
        .describe("Recipient email address exactly as the user gave it. Never guess one."),
      subject: z.string().describe("Short subject line, no line breaks."),
      body: z
        .string()
        .describe("The email body in plain text. No HTML, no markdown. Sign with the user's first name."),
    }),
    outputSchema: outcomeSchema,
  }),

  scheduleMeeting: tool({
    description:
      "Show the user a meeting to review. On confirmation it creates a Google Meet link, " +
      "adds the event to both calendars and emails the invite. This does NOT schedule " +
      "anything by itself: the user must press the button on the card.",
    inputSchema: z.object({
      summary: z.string().describe("Meeting title."),
      description: z.string().optional().describe("Optional agenda, plain text."),
      date: z.string().describe("Date as YYYY-MM-DD, in the user's time zone."),
      startTime: z.string().describe("Start time as HH:mm (24-hour), in the user's time zone."),
      durationMinutes: z
        .number()
        .describe("Length in minutes. Use 30 if the user did not say."),
      attendeeEmail: z
        .string()
        .describe("The invitee's email address exactly as the user gave it. Never guess one."),
    }),
    outputSchema: outcomeSchema,
  }),
};

export type AssistantUITools = InferUITools<typeof assistantTools>;

export type AssistantMessage = UIMessage<unknown, UIDataTypes, AssistantUITools>;
