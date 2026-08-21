import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const meetingNotes = sqliteTable("meeting_note", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull().unique(),
  content: text("content").default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(() => new Date()),
});
