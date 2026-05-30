# GA4 Event Naming Taxonomy

A web app for managing your GA4 event taxonomy — documenting events and parameters, tracking implementation checklists, and syncing with your GA4 property.

## Features

- **Events** — create, edit, search and filter all GA4 events with trigger descriptions, dataLayer and key event flags
- **Parameters** — manage parameters globally (apply to all events) or per-event; track GA4 custom dimension registration
- **Implementation checklist** per event: Documentation done · dataLayer doc done · Set up in GTM · Passes in GTM · Key event in GA4
- **GA4 Sync** — connect to your GA4 property, find undocumented events, auto-tick key event and custom dimension checklists
- **Google Sheets import** — import existing taxonomy spreadsheets with column mapping

## Setup

### 1. Install dependencies

```bash
cd ga4-taxonomy
npm install
```

### 2. Set up Google Cloud

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create or select a project
2. Enable these APIs:
   - **Google Analytics Data API**
   - **Google Analytics Admin API**
   - **Google Sheets API**
3. Go to **OAuth consent screen** → set User Type to **Internal** (skips Google verification, requires Google Workspace)
   - Add scopes: `analytics.readonly`, `analytics.edit`, `spreadsheets.readonly`
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
5. Copy the **Client ID** and **Client Secret**

### 3. Configure environment

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
openssl rand -base64 32  # use this output as AUTH_SECRET
```

### 4. Set up the database

```bash
npx prisma db push
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your Google account.

## Usage

### Adding events

1. Click **+ New event** on the Events page
2. Enter the event name (e.g. `purchase`, `form_submit`)
3. Add the trigger description
4. Check **Requires dataLayer push** if the event needs a dataLayer push to fire
5. Check **Mark as key event** if this should be tracked as a GA4 key event

### Managing parameters

- Go to **Parameters** to create parameters
- Mark a parameter as **Global** to automatically apply it to all events
- Mark **Requires GA4 custom dimension registration** for parameters that need to be registered in GA4

### Using the checklist

Each event has a 5-item implementation checklist:

| Item | Notes |
|---|---|
| Documentation done | Written up in your docs system |
| dataLayer document done | dataLayer spec is documented |
| Set up in GTM | Tag/trigger created in GTM |
| Work passes in GTM | Tested and verified in GTM preview |
| Key event set up in GA4 | Only shown for key events |

### GA4 Sync

1. Go to **GA4 Sync** and enter your GA4 Property ID (found in GA4 Admin → Property Settings)
2. Click **Fetch GA4 events** to compare what's firing in GA4 vs. what's documented
3. Click **Run sync** to automatically tick:
   - "Key event set up in GA4" for key events that exist in GA4
   - "Registered in GA4" for parameters found as custom dimensions

### Importing from Google Sheets

1. Go to **Import** and paste your Google Sheet URL
2. Select the header row and map columns to event name, trigger, and parameter columns
3. Click **Import** — existing events are skipped (no duplicates created)

## Tech stack

- **Next.js 16** (App Router)
- **Prisma 7** + SQLite (via `@prisma/adapter-better-sqlite3`)
- **Auth.js v5** with Google OAuth — single login for GA4 + Sheets access
- **Shadcn/ui** with Base UI components
- **Google Analytics Data API** + **Admin API** + **Sheets API**
