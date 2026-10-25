# Personal AI Dashboard

A personal workspace that brings your Gmail, Google Calendar and Google Meet into one dashboard, plus an assistant that drafts emails and schedules Meet calls for you to confirm. Each person signs in with their own Google account and gets their own private workspace.

Built with Next.js 16, tRPC, Postgres (Neon) and [Corsair](https://docs.corsair.dev), which handles the Google integrations: OAuth, token refresh, encrypted credential storage and syncing data into your database.

**Features**

- Gmail: synced inbox, full email view with sanitized HTML, compose and send.
- Calendar: upcoming agenda, today's stats, create events, private notes per event.
- Meet: schedule a meeting that creates a Meet link, puts it on both calendars and emails the invite.
- Assistant: "Email Ravi that I'll be late" or "Set up 30 minutes with ravi@example.com tomorrow at 3pm". It proposes, you confirm.
- Multi-user: anyone can sign in and only ever sees their own data.

---

## Set up your own workspace

You'll create four things: a Postgres database, a Google Cloud project with an OAuth client, a KEK, and (optionally) a Gemini key for the assistant. Allow about 30 minutes.

**You need:** Node.js 22 or newer, a Google account, a free [Neon](https://neon.tech) account, and optionally a free [Vercel](https://vercel.com) account for hosting.

### 1. Clone and install

```bash
git clone https://github.com/Arsh-Coding/Personal-Ai-Dashboard.git
cd Personal-Ai-Dashboard
npm ci
```

If you're running your own public copy, change the app name and contact email in `src/lib/site.ts`. They appear on the sign-in page, the privacy policy (`/privacy`) and the terms (`/terms`).

Then create your env file from the template:

```bash
cp .env.example .env              # macOS / Linux
Copy-Item .env.example .env       # Windows PowerShell
```

### 2. Create the database (Neon)

1. In the [Neon console](https://console.neon.tech), create a project.
2. Click **Connect**, turn on **Connection pooling**, and copy the connection string. The host should contain `-pooler`.
3. Paste it into `.env` as `DATABASE_URL`, with the password included.

The pooled endpoint matters on serverless hosts like Vercel, where every request can open a new connection.

### 3. Generate the KEK

The KEK (key-encryption key) protects every Google credential the app stores. See [How the KEK works](#the-kek-and-how-credentials-are-encrypted) before you skip past this.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Corsair's own suggestion, `openssl rand -base64 32`, gives the same kind of value. Put the output in `.env` as `CORSAIR_KEK`, and save a copy in a password manager. If you lose it, every connected account has to reconnect.

### 4. Create the Google Cloud project and OAuth client

All of this is in the [Google Cloud console](https://console.cloud.google.com).

1. **Create a project** from the project picker at the top.
2. **Enable three APIs** under APIs & Services → Library:
   - Gmail API
   - Google Calendar API
   - Google Meet REST API
3. **Configure the consent screen** under Google Auth Platform (formerly "OAuth consent screen"):
   - **Branding:** app name, support email, developer contact email.
   - **Audience:** choose **External**. While the app is in Testing, add your own Gmail address under **Test users**.
   - **Data Access:** add the scopes the app requests, so the consent screen matches what the code asks for:
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/gmail.compose`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/gmail.labels`
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/meetings.space.created`
     - `https://www.googleapis.com/auth/meetings.space.readonly`
     - plus `openid`, `email` and `profile` for sign-in.
4. **Create the OAuth client** under Clients → **Create client** → type **Web application**. Add these **Authorized redirect URIs** (not "JavaScript origins"):
   ```
   http://localhost:3000/api/auth/callback/google
   http://localhost:3000/oauth/callback
   ```
   The first is for signing in. The second is where Google returns after you connect Gmail, Calendar or Meet. You'll add the production pair when you deploy.
5. **Copy the Client ID and Client secret** straight away. Newer versions of the console only show the secret once.

### 5. Create the tables

```bash
npm run db:init    # Corsair's tables: corsair_integrations, _accounts, _entities, _events, _permissions
npm run db:push    # the app's tables: app_user, meeting_note, sync_restore_buffer, sync_lock
```

Both are safe to re-run.

### 6. Give Corsair your OAuth client

Corsair stores the OAuth client itself, encrypted in the database, instead of reading it from env vars. All three Google plugins use the same client:

```bash
npx corsair setup --gmail client_id="YOUR_CLIENT_ID" client_secret="YOUR_CLIENT_SECRET" --googlecalendar client_id="YOUR_CLIENT_ID" client_secret="YOUR_CLIENT_SECRET" --googlemeet client_id="YOUR_CLIENT_ID" client_secret="YOUR_CLIENT_SECRET"
```

The CLI finds the Corsair instance at `src/server/corsair.ts` and reads `.env` through it, so run it from the project root after steps 3 and 5. It creates one `corsair_integrations` row per plugin and encrypts the client secret with your KEK. To swap clients later, run it again with the new values.

Sign-in reuses this same client, so nothing can sign in until this step is done.

### 7. Run it and connect your Google account

```bash
npm run dev
```

Open http://localhost:3000. It has to be port 3000, because that's what you registered with Google.

1. **Sign in with Google.**
2. The **Connect Google** prompt opens. Connect Gmail, Calendar and Meet. Each is its own Google consent screen, so expect three of them.
3. Click **Sync Calendar** and **Sync Mail** to pull your data in. Mail syncs in batches, and an "N older to sync" badge means another click will fetch more.

### 8. Turn on the assistant (optional)

1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). No card is needed.
2. Add it to `.env` as `GOOGLE_GENERATIVE_AI_API_KEY` and restart `npm run dev`.
3. Click **✨ Assistant** in the bottom-right corner.

Without the key, the rest of the app works normally and the assistant says it isn't set up.

---

## Where every key comes from

| Variable | Required | Where to get it |
|---|---|---|
| `DATABASE_URL` | Yes | Neon console → your project → **Connect** → pooled connection string |
| `CORSAIR_KEK` | Yes | You generate it (step 3). Never stored anywhere except your env. |
| `CORSAIR_OAUTH_REDIRECT_URI` | Production only | `https://<your-domain>/oauth/callback`. Leave empty locally. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | For the assistant | [Google AI Studio → API keys](https://aistudio.google.com/apikey) |
| `GOOGLE_SIGNIN_REDIRECT_URI` | No | Override for the sign-in callback. Derived from the request when unset. |
| `CHAT_MODEL` | No | Any Gemini model id. Default `gemini-3.5-flash-lite`. |
| `GOOGLE_SITE_VERIFICATION` | For brand verification | [Google Search Console](https://search.google.com/search-console) → URL-prefix property → **HTML tag** method → the `content` value |
| Google Client ID and secret | Yes | Google Cloud console → Google Auth Platform → **Clients**. Stored in Corsair by step 6, not in env. |

`.env` is gitignored. `.env.example` is the only env file meant to be committed.

---

## Deploy to Vercel

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new). The defaults are correct, and Vercel deploys the `main` branch to production.
2. Under **Settings → Environment Variables**, add:
   - `DATABASE_URL`: the same Neon string.
   - `CORSAIR_KEK`: **exactly the same value** as locally. A different KEK can't decrypt what's already in the database.
   - `CORSAIR_OAUTH_REDIRECT_URI`: `https://<your-domain>/oauth/callback`.
   - `GOOGLE_GENERATIVE_AI_API_KEY`: if you use the assistant.
3. Add the production redirect URIs to your Google OAuth client, exactly as written:
   ```
   https://<your-domain>/api/auth/callback/google
   https://<your-domain>/oauth/callback
   ```
4. Redeploy. Env var changes only apply to new deployments.

Use your production domain, shown under Settings → Domains. Preview deployments get their own URLs, which aren't registered with Google, so sign-in only works on the production domain.

---

## Publishing the Google app

Your consent screen's **publishing status** decides who can use the app and how long connections last. It's set under Google Auth Platform → Audience. Google's own comparison is [here](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

| Status | Who can connect | What to expect |
|---|---|---|
| **Testing** | Only the test users you list (max 100) | Refresh tokens **expire after 7 days**, so the dashboard shows "Authorization expired" and you reconnect every week. Fine for building. |
| **In production, unverified** | Any Google account, **hard cap of 100 users** | No more 7-day expiry. People see a "Google hasn't verified this app" warning when connecting their data, and click Advanced → Go to app. Good for personal use or a handful of friends. |
| **In production, verified** | Anyone, no cap, no warning | Requires Google's verification review (see below). |

Signing in only asks for basic profile scopes, which never need verification. The warnings and caps apply to the Gmail, Calendar and Meet connections.

**Branding page, for an unverified publish:**

- **App name:** the same as `SITE.name` in `src/lib/site.ts`. Don't use another company's brand.
- **Logo:** leave it empty. Uploading one means the app must be verified before it can be published.
- **Home page:** `https://<your-domain>`. **Privacy policy:** `https://<your-domain>/privacy`. **Terms:** `https://<your-domain>/terms`. All three are public pages in this app.
- **Authorised domains:** only domains you actually use. Remove any you don't own, and remove the matching redirect URIs from the OAuth client.

Then go to **Audience → Publish app** and confirm.

**Brand verification** (optional for an unverified publish; it's what shows your app name on the consent screen) requires proving you own the homepage domain in Google Search Console:

1. In [Search Console](https://search.google.com/search-console), signed in as an **Owner of the Google Cloud project**, add a property of type **URL prefix** with your exact homepage, e.g. `https://your-app.vercel.app/`. A "Domain" property needs DNS records, which a `*.vercel.app` address can't have.
2. Pick the **HTML tag** method and copy only the `content="..."` value.
3. Set it as `GOOGLE_SITE_VERIFICATION` in Vercel and redeploy. The app adds the `<meta name="google-site-verification">` tag to every page.
4. Click **Verify** in Search Console.
5. Wait 24 hours, then in Google Auth Platform → Branding choose **I have fixed the issues → Request reverification**.

Every authorised domain must be one you can verify this way, so remove any you don't own. The public homepage (signed out) names the app, describes it and explains how Google data is used, which Google's reviewers also check.

**After you publish,** reconnect each Google service once from the dashboard. Grants made while in Testing keep their 7-day expiry, and only new ones are long-lived.

**About verification.** In Google's [Gmail scope classification](https://developers.google.com/workspace/gmail/api/auth/scopes), `gmail.modify` and `gmail.compose` are **restricted** scopes, and Calendar and `gmail.send` are sensitive. Because this app stores mail in its own database, verifying the restricted scopes also requires a **security assessment (CASA)** by a Google-approved lab, renewed every year. Verification also asks for a privacy policy, a homepage on a domain you've verified ownership of, and a demo video. Unless you're opening this to the public, publishing unverified is the practical choice.

---

## Important concepts

### Corsair

[Corsair](https://docs.corsair.dev) is the integration layer between this app and Google. The instance lives in `src/server/corsair.ts`, with three plugins: `gmail`, `googlecalendar` and `googlemeet`. Each plugin gives typed API calls such as `corsairFor(tenant).gmail.api.messages.send(...)`, refreshes access tokens on its own, and saves what it fetches into the `corsair_entities` table.

Corsair keeps credentials at two levels:

| Level | Table | One per | Holds |
|---|---|---|---|
| Integration | `corsair_integrations` | plugin | Your OAuth app's client id and secret (set in step 6) |
| Account | `corsair_accounts` | user and plugin | That user's access and refresh tokens (created when they connect) |

### Tenants: one workspace per Google account

The instance runs with `multiTenancy: true`. Every person who signs in gets a row in `app_user`, and its `id` (`u_<google account id>`) is their Corsair **tenant**. Every Corsair call goes through `corsairFor(ctx.tenantId)`, and `tenantId` comes only from the signed session cookie. No API route accepts a tenant or account as input, so there's no request that can read someone else's mail.

### Two separate Google OAuth flows

1. **Sign-in** (`/api/auth/signin` → `/api/auth/callback/google`) asks only for `openid email profile`. It answers "who is this?" and sets the session cookie.
2. **Data access** (`/oauth/callback`) asks for the Gmail, Calendar and Meet scopes. It answers "what may we read?" and stores tokens for that tenant. Each plugin is a separate grant, which is why connecting takes three consent screens.

Both flows use the same OAuth client, which is why each domain needs both redirect URIs.

### The KEK, and how credentials are encrypted

Corsair uses **envelope encryption**:

- Each integration row and each account row has its own random data key (**DEK**), stored in the database.
- The DEK encrypts that row's secrets: the OAuth client secret, or a user's tokens.
- Every DEK is itself encrypted with the **KEK** from `CORSAIR_KEK`, and the KEK is never stored in the database.

So a copy of the database alone can't reveal any token. You need the database **and** the KEK. The app also derives its session-cookie signing key from the KEK. A separate derived key is used for that, never the KEK itself.

What this means in practice:

- **Same KEK everywhere** that uses the same database: local, Vercel, and any scripts.
- **Losing or changing it** makes every stored credential unreadable. You'd re-run step 6 and every user would reconnect. Everyone is also signed out, because their cookies no longer verify.
- **If it leaks,** generate a new one and re-run step 6. Then reset the client secret in Google Cloud, and have users reconnect. This app has no automatic key rotation.

### Synced data and the Sync buttons

The dashboard reads from Postgres, not from Google, so pages load fast and work while Google is slow. The trade-off is that what you see is as fresh as your last sync. **Sync Calendar** and **Sync Mail** pull new data. Actions like sending mail, creating events and scheduling meetings call Google live.

### Email safety

Email is attacker-controlled input, since anyone can email you. Bodies are sanitized on the server with DOMPurify running on jsdom (`src/server/mailBody.ts`) before the browser sees them. Remote images, which tell the sender you opened the mail, stay blocked until you choose to load them.

`jsdom` is pinned to `26.1.0` on purpose. Newer versions `require()` ESM-only packages, which Vercel's runtime rejects with `ERR_REQUIRE_ESM`.

### The assistant: it proposes, you confirm

The assistant's two tools, `draftEmail` and `scheduleMeeting` in `src/lib/assistantTools.ts`, have **no server-side execute step**. A model reply can only put an editable card on screen. Only pressing **Send** or **Schedule & send invite** calls the existing `mail.sendMessage` or `meet.scheduleMeeting` routes. The chat endpoint (`src/app/api/chat/route.ts`) has no way to send anything itself, whatever the model is told.

It also can't read your inbox or calendar, so a malicious email can't instruct it.

It uses Google Gemini. On the free tier there are daily request limits, which you can see in AI Studio. Google's free-tier terms also let Google use your prompts to improve its products, and those prompts include your drafts. Paid tiers don't do this.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` / `npm start` | Production build and server. `start` needs `CORSAIR_OAUTH_REDIRECT_URI` set. |
| `npm run lint` | ESLint |
| `npm run db:init` | Creates Corsair's five `corsair_*` tables and indexes. Idempotent. |
| `npm run db:push` | Creates or updates the app's own tables with Drizzle |
| `npm run db:recover-sync` | Finishes a Gmail sync that was interrupted mid-way. Rarely needed. |
| `npm run db:seed-users` | **Only for the original deployment.** Links three pre-existing tenants to their owners' emails. Skip it on a new setup. |
| `npx corsair setup ...` | Stores OAuth client credentials in Corsair (step 6) |

## Project structure

```
src/
  app/
    api/auth/…            Google sign-in and sign-out
    api/chat/route.ts     Assistant endpoint (proposals only)
    api/trpc/[trpc]/      tRPC API
    oauth/callback/       Where Google returns after connecting Gmail, Calendar or Meet
    _components/          Dashboard UI, mail panel, modals, assistant panel
  lib/                    Client-safe helpers: assistant tools, plugin ids, names
  server/
    corsair.ts            The Corsair instance and corsairFor(tenant)
    pg.ts                 The single Postgres connection, shared by Corsair and Drizzle
    session.ts            Signed session cookies
    authHealth.ts         Works out whether a stored Google grant still works
    mailBody.ts           Email body extraction and sanitizing
    api/routers/          tRPC routers: auth, calendar, mail, meet, notes, session
    db/schema.ts          Drizzle tables
scripts/                  Database setup and maintenance
```

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| `Error 400: redirect_uri_mismatch` | The redirect URI isn't registered **exactly**. Click "error details" on Google's page to see the URI that was sent, and add it to the OAuth client. Each domain needs both callbacks. Locally, make sure you're on port 3000. |
| "Authorization expired" or `invalid_grant` | The grant was revoked, or the app is in Testing and the 7-day limit passed. Click Reconnect. To stop it recurring, see [Publishing](#publishing-the-google-app). |
| "No Google client_id/client_secret stored in Corsair" | Step 6 hasn't been run against this database. |
| `DATABASE_URL is not set` or `CORSAIR_KEK is not set` | `.env` is missing or incomplete. On Vercel, the env vars aren't set, or you haven't redeployed since adding them. |
| "Google Meet API has not been used in project…" | Enable the **Google Meet REST API** for the project (step 4). |
| Assistant says it isn't set up | `GOOGLE_GENERATIVE_AI_API_KEY` is missing. Add it and restart. |
| Assistant says the free-tier limit is reached | The per-minute limit clears within a minute. The daily quota resets the next day. |
| `'next' is not recognized` | `node_modules` is incomplete. Delete it and run `npm ci`. |
| Sign-in fails on a Vercel preview URL | Expected: only the production domain is registered with Google. |
