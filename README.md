# STOCK — Inventory Exchange

A single-file, no-build-step web app: login/registration with simulated
email verification, and a shared listings marketplace (name, image,
description, quantity, price, category tabs).

## ⚠️ Important: about "shared" listings on GitHub Pages

The version you're running inside Claude uses Claude's built-in artifact
storage, which is genuinely shared across every visitor. **This exported
`index.html` file cannot use that storage outside claude.ai** — there's no
server. To keep it working with zero setup, it falls back to your
**browser's `localStorage`**, which means:

- Accounts and listings persist across reloads on your device ✅
- They are **not** visible to other people visiting the page on their own
  devices/browsers ❌ — each visitor gets their own private copy of the data

If you want the "anyone can see anyone's item" behavior to work for real
visitors on the internet, you need an actual shared backend. The easiest
free options:
- **Firebase** (Firestore + Auth) — generous free tier, works great with
  static hosting like GitHub Pages
- **Supabase** (Postgres + Auth) — also free tier, similar setup

Say the word and I can wire either of those into this file for you — it's a
moderate rewrite of the storage/auth calls, but the UI stays the same.

## Deploying to GitHub Pages

1. Create a new repository on GitHub (e.g. `stock-app`).
2. Add this `index.html` file to the root of the repo (via the GitHub web
   UI's "Add file → Upload files", or with git):
   ```bash
   git init
   git add index.html
   git commit -m "Add STOCK app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages**.
4. Under "Build and deployment", set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`. Save.
5. GitHub will give you a live URL, usually:
   `https://<your-username>.github.io/<repo-name>/`
   (takes a minute or two to go live after the first push).

That's it — no build tools, no `npm install`, just the one HTML file.
