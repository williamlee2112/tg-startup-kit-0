# create-volo-app

CLI tool to create a production-ready full-stack app with React, Firebase Auth, Postgres DB, and Cloudflare deployment - all preconfigured.

## Quick Start

```bash
npx create-volo-app my-app
cd my-app
pnpm run dev:start
```

## What You Get

**Frontend:**
- ⚛️ React + TypeScript + Vite
- 🎨 Tailwind CSS + ShadCN/UI components
- 🔐 Firebase Authentication (Google Sign-In)

**Backend:**
- 🔥 Hono API backend on Cloudflare Workers
- 🗄️ PostgreSQL with Drizzle ORM
- 🔑 Firebase Admin SDK

**Deployment:**
- 🌐 Cloudflare Pages (frontend)
- ⚡ Cloudflare Workers (API)
- 🗄️ Neon, Supabase, or any PostgreSQL DB

## Requirements

- Node.js 18+, pnpm 8+, Git, Firebase CLI

The CLI will check these and guide installation if needed.

## Usage

### Basic
```bash
npx create-volo-app my-app
```

### Fast Mode (Recommended for beginners)
```bash
npx create-volo-app my-app --fast
```

Fast mode uses smart defaults: creates new Firebase project, defaults to Neon DB, auto-generates Cloudflare Worker name, and skips Google Sign-In setup (configure later in Firebase Console).

### Options
- `--fast` - Quick setup with smart defaults
- `--template <url>` - Use custom template
- `-b, --branch <name>` - Use specific branch of volo-app template (advanced)
- `--db <provider>` - Database provider (neon, supabase, other)
- `--skip-prereqs` - Skip prerequisite checks
- `--verbose` - Detailed logging

## Deployment

### Backend (Cloudflare Workers)
```bash
cd server
pnpm run deploy
```

**Set production environment variables** (use `wrangler` for easier management):
```bash
# Recommended: Use wrangler CLI
cd server
wrangler secret put DATABASE_URL
wrangler secret put FIREBASE_PROJECT_ID  
wrangler secret put FIREBASE_PRIVATE_KEY
wrangler secret put FIREBASE_CLIENT_EMAIL

# Alternative: Set in Cloudflare dashboard
# Go to Workers Dashboard > Your Worker > Settings > Variables
```

### Frontend (Cloudflare Pages)

**Manual Setup:**
1. Go to [Cloudflare Pages](https://dash.cloudflare.com/pages) → "Create a project"
2. Connect your Git repository
3. Configure build settings:
   - **Build command**: `pnpm run build`
   - **Output directory**: `ui/dist`
4. Deploy automatically on Git push

**Add your Pages domain to Firebase:**
- Go to Firebase Console → Authentication → Settings → Authorized domains
- Add your `*.pages.dev` domain

### Automated Deployment

For CI/CD, use GitHub Actions or similar with Cloudflare API tokens:
- **Workers**: Use `wrangler deploy` in your pipeline
- **Pages**: Automatic on Git push (or use Cloudflare API)

## Development

```bash
git clone https://github.com/VoloBuilds/create-volo-app.git
cd create-volo-app
pnpm install
pnpm run build
node bin/cli.js test-app
```

## Support

- 📖 [Documentation](https://github.com/VoloBuilds/volo-app)
- 🐛 [Issues](https://github.com/VoloBuilds/create-volo-app/issues)
- 💬 [Discussions](https://github.com/VoloBuilds/create-volo-app/discussions)

## License

MIT 