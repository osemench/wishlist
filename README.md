# Wishlist App

A full-stack web app for creating and sharing wishlists. Paste a product URL to auto-fill item details, share a list with friends so they can mark items as purchased, and keep purchases a surprise until you choose to reveal them.

## Stack

- **Frontend**: React + Vite (port 5173)
- **Backend**: Node.js + Express + SQLite (port 3001)

## Getting Started

### Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### Run the app

Open two terminals:

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

Then open **http://localhost:5173**

## Modes

### Test mode (default)

The app starts in **test mode**, which skips authentication and shows a user-selector dropdown pre-populated with seeded accounts (Alice Smith and Bob Jones). No configuration needed.

### Auth mode

Set `TEST_MODE=false` to enable real authentication (email/password and optional third-party providers).

```bash
# Terminal 1 — backend in auth mode
cd server && TEST_MODE=false JWT_SECRET=change-me npm run dev
```

| Environment variable | Default | Description |
|---|---|---|
| `TEST_MODE` | `true` | Set to `false` to enable real auth |
| `JWT_SECRET` | `wishlist-dev-secret-…` | Secret used to sign session tokens — **change this in production** |

## Features

- Create wishlists and add items manually or by pasting a product URL
- URL scraping auto-fills name, description, price, and image via Open Graph / HTML metadata
- Image picker shows candidate images from the page; the best (largest, most square) is pre-selected
- Images are downloaded, resized to 600 px, and stored in the database as JPEG blobs
- Share a wishlist via a link — recipients can mark items as "I'm buying this"
- Purchases are anonymous by default; the list owner can reveal names with a toggle
- Responsive layout — works on mobile (sidebar slides in as a drawer)

## Authentication

Authentication is only active when `TEST_MODE=false`.

### Email / password

Users register with a name, email, and password (min 8 characters). Passwords are hashed with bcrypt.

### Microsoft (Outlook.com / Entra ID)

Supports personal Microsoft accounts (Outlook.com, Hotmail) and work/school accounts via Microsoft Entra ID.

#### 1. Register an application in Azure

1. Go to [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Give it a name (e.g. *Wishlist App*)
3. Under **Supported account types**, select **Accounts in any organizational directory and personal Microsoft accounts**
4. Under **Redirect URI**, choose **Web** and enter:
   ```
   http://localhost:3001/api/auth/microsoft/callback
   ```
   (Update the host/port for production deployments)
5. Click **Register**

#### 2. Create a client secret

1. In your new app registration, go to **Certificates & secrets** → **New client secret**
2. Copy the secret **value** immediately — it is only shown once

#### 3. Start the server with the credentials

```bash
cd server && \
  TEST_MODE=false \
  JWT_SECRET=change-me \
  MICROSOFT_CLIENT_ID=<Application (client) ID> \
  MICROSOFT_CLIENT_SECRET=<client secret value> \
  npm run dev
```

The **Application (client) ID** is shown on the app registration overview page.

| Environment variable | Description |
|---|---|
| `MICROSOFT_CLIENT_ID` | Application (client) ID from the app registration |
| `MICROSOFT_CLIENT_SECRET` | Client secret value |
| `MICROSOFT_REDIRECT_URI` | Callback URL (default: `http://localhost:3001/api/auth/microsoft/callback`) |
| `APP_BASE_URL` | Frontend origin the callback redirects to (default: `http://localhost:5173`) |

When `MICROSOFT_CLIENT_ID` is set, a **Sign in with Microsoft** button appears on the login page. Signing in creates a new account automatically, or links to an existing account if the email address matches.

## Seed Data

The database is pre-seeded with 2 users (Alice Smith, Bob Jones), 3 wishlists, and ~13 items. Seeding only runs once, when the database is first created.

## Notes

- URL scraping works best on sites that expose Open Graph metadata. Some retailers (e.g. Amazon) block automated requests; the UI falls back to manual entry gracefully.
- Share links are public — anyone with the link can view the list and mark items as purchased.
- The SQLite database file (`server/wishlist.db`) is excluded from version control.
