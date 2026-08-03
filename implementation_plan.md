# Corsair Dashboard — Google Calendar + Gmail Integration

Build a complete Next.js T3 app in `corsair-dev-2/` with Corsair-powered Google Calendar and Gmail integrations, plus a premium dashboard UI.

## User Review Required

> [!IMPORTANT]
> **OAuth Credentials Required** — You mentioned you have most of the creds. Before we can run `npx corsair setup` and `npx corsair auth`, you'll need to provide:
> - **Google Calendar**: `client_id` + `client_secret` (GCP OAuth 2.0 — Calendar API enabled)
> - **Gmail**: `client_id` + `client_secret` (GCP OAuth 2.0 — Gmail API enabled)
>
> These can be the same GCP OAuth app if both APIs are enabled on it. I'll prompt you for them during the setup step.

> [!WARNING]
> **Encryption Key** — I'll generate a new `CORSAIR_KEK` for this project. The existing one in `corsair-dev-retry` will NOT be reused (different database).

> [!IMPORTANT]
> **Database** — The existing project uses PostgreSQL via Drizzle for app data + a separate `corsair.db` SQLite file for Corsair. I'll follow the same pattern: SQLite (`better-sqlite3`) for Corsair, PostgreSQL for Drizzle app tables (notes, etc.). If you don't have a Postgres instance running, let me know and I can switch the app DB to SQLite too.

## Open Questions

1. **Same GCP project?** — Can I reuse the same GCP OAuth Client ID for both Calendar and Gmail (just enable both APIs), or do you have separate credentials for each?
2. **PostgreSQL availability** — Do you have a local Postgres running, or should I switch the app's Drizzle DB to SQLite as well to keep things self-contained?
3. **Port** — The default T3 dev server runs on port 3000. If `corsair-dev-retry` is already using 3000, I'll use 3001. Is that fine?

---

## Proposed Changes

### 1. Scaffold T3 App

#### [NEW] `corsair-dev-2/` (entire project)

Scaffold using `create-t3-app` with tRPC + Tailwind + App Router:
```bash
npm create t3-app@latest ./corsair-dev-2 -- --CI --trpc --tailwind --appRouter
```

---

### 2. Install Corsair Dependencies

```bash
cd corsair-dev-2
npm install corsair @corsair-dev/googlecalendar @corsair-dev/gmail better-sqlite3
npm install --save-dev @types/better-sqlite3 @corsair-dev/cli
```

---

### 3. Environment & Database Setup

#### [NEW] `corsair-dev-2/.env`
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/corsair-dev-2"
CORSAIR_KEK="<generated-key>"
```

#### [NEW] `corsair-dev-2/migration.sql`
The standard 4-table Corsair migration (same as `corsair-dev-retry/migration.sql`).

Run migration:
```powershell
# Using better-sqlite3 via a small Node script since Windows doesn't have sqlite3 CLI by default
node migrate-corsair.js
```

---

### 4. Corsair Server Config

#### [NEW] `corsair-dev-2/src/server/corsair.ts`
```typescript
import 'dotenv/config';
import Database from 'better-sqlite3';
import { createCorsair } from 'corsair';
import { googlecalendar } from '@corsair-dev/googlecalendar';
import { gmail } from '@corsair-dev/gmail';

const db = new Database('corsair.db');

export const corsair = createCorsair({
    plugins: [googlecalendar(), gmail()],
    database: db,
    kek: process.env.CORSAIR_KEK!,
});
```

---

### 5. Plugin Auth Setup (interactive — requires your creds)

```bash
# Store Google Calendar OAuth credentials
npx corsair setup --plugin=googlecalendar client_id=YOUR_CLIENT_ID client_secret=YOUR_CLIENT_SECRET

# Start OAuth flow for Google Calendar
npx corsair auth --plugin=googlecalendar

# Store Gmail OAuth credentials
npx corsair setup --plugin=gmail client_id=YOUR_CLIENT_ID client_secret=YOUR_CLIENT_SECRET

# Start OAuth flow for Gmail
npx corsair auth --plugin=gmail
```

---

### 6. tRPC Routers

#### [NEW] `corsair-dev-2/src/server/api/routers/calendar.ts`
tRPC router with these procedures:
- `getEvents` — reads events from `corsair.googlecalendar.db.events.search({})`
- `getEventById` — single event lookup
- `createEvent` — calls `corsair.googlecalendar.api.events.create(...)` then returns fresh data
- `refreshEvents` — calls `corsair.googlecalendar.api.events.list()` to sync, then re-reads from `.db`
- `getTodayStats` — computes today's event count, week count, next meeting, hours blocked

#### [NEW] `corsair-dev-2/src/server/api/routers/mail.ts`
tRPC router with these procedures:
- `getThreads` — reads threads from `corsair.gmail.db.threads.search({})`
- `getMessages` — reads messages from `corsair.gmail.db.messages.search({})`
- `sendMessage` — calls `corsair.gmail.api.messages.send(...)`
- `refreshMail` — calls `corsair.gmail.api.threads.list()` to sync

#### [NEW] `corsair-dev-2/src/server/api/routers/notes.ts`
tRPC router for local meeting notes:
- `getNote` — fetch note by event ID
- `upsertNote` — create or update a note for an event
- Uses Drizzle with a `meeting_notes` table

#### [MODIFY] `corsair-dev-2/src/server/api/root.ts`
Register `calendar`, `mail`, and `notes` routers alongside the default `post` router.

---

### 7. Database Schema (Drizzle — for app-level data)

#### [MODIFY] `corsair-dev-2/src/server/db/schema.ts`
Add a `meeting_notes` table:
```typescript
export const meetingNotes = createTable("meeting_note", (d) => ({
    id: d.integer().primaryKey().generatedByDefaultAsIdentity(),
    eventId: d.varchar({ length: 512 }).notNull().unique(),
    content: d.text().default(""),
    createdAt: d.timestamp({ withTimezone: true }).$defaultFn(() => new Date()).notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
}));
```

---

### 8. Dashboard UI

#### [MODIFY] `corsair-dev-2/src/app/page.tsx`
Server component that prefetches calendar data and renders the dashboard.

#### [NEW] `corsair-dev-2/src/app/_components/Dashboard.tsx`
Main client component with:

**Header** — App title, Refresh button (syncs Calendar + Gmail), connection status indicators

**Stats Row** — 4 glassmorphism cards:
- 📅 Events Today (count)
- 📆 Events This Week (count)
- ⏰ Next Meeting (name + time)
- 🕐 Hours Blocked Today (total)

**Today's Agenda** — Chronological list of today's events with times, titles, color indicators, and expandable notes

**Upcoming Events** — Next 2 weeks grouped by day with event cards

**Create Meeting** — Modal form with date, time, title, description, duration fields → calls `corsair.googlecalendar.api.events.create()`

#### [NEW] `corsair-dev-2/src/app/_components/MailPanel.tsx`
Gmail panel with:
- Recent threads list with sender, subject, snippet, timestamp
- Thread expansion to see messages
- Compose button → modal to send a new email
- Unread count badge

#### [NEW] `corsair-dev-2/src/app/_components/EventCard.tsx`
Individual event card component with:
- Time display, title, description
- Inline editable notes field (saves to local DB via `notes.upsertNote`)
- Color accent based on calendar

#### [NEW] `corsair-dev-2/src/app/_components/CreateEventModal.tsx`
Modal form for creating new calendar events.

#### [NEW] `corsair-dev-2/src/app/_components/ComposeMailModal.tsx`
Modal form for composing and sending emails.

---

### 9. Styling

#### [MODIFY] `corsair-dev-2/src/styles/globals.css`
Premium design system additions:
- Dark theme with deep purple/indigo gradient background
- Glassmorphism card styles (backdrop-blur, semi-transparent backgrounds)
- Smooth animations and transitions
- Custom scrollbar styling
- Responsive grid layouts

#### [MODIFY] `corsair-dev-2/src/app/layout.tsx`
Update metadata (title, description), add Inter font from Google Fonts.

---

### 10. Environment Validation

#### [MODIFY] `corsair-dev-2/src/env.js`
- Remove the `DATABASE_URL` requirement (or make it optional) if we go SQLite-only
- Add `CORSAIR_KEK` to server schema

---

## Execution Order

1. Scaffold T3 app in `corsair-dev-2/`
2. Install Corsair + dependencies
3. Generate KEK, create `.env`, run Corsair migration
4. Create `src/server/corsair.ts` with both plugins
5. **Pause for user** — run `corsair setup` + `corsair auth` for both plugins (needs creds)
6. Add `meeting_notes` schema, run Drizzle migration
7. Build tRPC routers (calendar, mail, notes)
8. Wire routers into `root.ts`
9. Build dashboard UI components
10. Polish styles, test `npm run dev`

## Verification Plan

### Automated Tests
```bash
npm run build          # Verify the project compiles
npm run typecheck      # TypeScript validation
```

### Manual Verification
- Run `npm run dev` and verify the dashboard loads at `http://localhost:3000` (or 3001)
- Confirm calendar events display after OAuth auth + refresh
- Confirm Gmail threads display after OAuth auth + refresh
- Test creating a new calendar event via the UI
- Test adding/editing notes on events
- Test composing and sending an email
- Test the Refresh button syncs fresh data
