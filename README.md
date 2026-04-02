# Wishlist App

A full-stack web app for tracking wishlists of items to purchase.

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
# Terminal 1 — backend:
cd server && npm run dev

# Terminal 2 — frontend:
cd client && npm run dev
```

Then open **http://localhost:5173**

## Features

- View wishlists per user
- Create new wishlists
- Add items manually (name, description, price, image, buy link)
- Add items by pasting a URL — data is pre-populated automatically via Open Graph / HTML scraping
- Delete items

## Seed Data

The database is pre-seeded with 2 users (Alice Smith, Bob Jones), 3 wishlists, and ~13 items for testing.

## Notes

URL scraping works for sites that expose Open Graph metadata. Amazon and some retailers block bot requests, so results may vary — the UI handles failures gracefully and lets you fill fields manually.
