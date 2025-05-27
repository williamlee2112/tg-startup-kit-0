# create-volo-app

CLI tool to create a new full-stack Volo app with Firebase Auth, Neon DB, and Cloudflare deployment.

## Quick Start

```bash
npx create-volo-app my-app
cd my-app
pnpm run dev:start
```

## What you get

The CLI creates a production-ready full-stack application with:

**Frontend:**
- ⚛️ React with TypeScript
- ⚡ Vite for fast development
- 🎨 Tailwind CSS for styling
- 🧩 ShadCN/UI components
- 🔐 Firebase Authentication (Google Sign-In)

**Backend:**
- 🔥 Hono web framework
- ☁️ Cloudflare Workers for edge deployment
- 🗄️ PostgreSQL with Drizzle ORM
- 🔑 Firebase Admin SDK for auth verification

**Infrastructure:**
- 🌐 Cloudflare Pages for frontend hosting
- ⚡ Cloudflare Workers for API hosting
- 🗄️ Neon (or other) PostgreSQL database
- 🔐 Firebase Authentication

## Features

- ✅ **Comprehensive setup**: Handles all service configuration automatically
- ✅ **Prerequisites checking**: Validates required tools and guides installation
- ✅ **Service integration**: Creates Firebase projects, configures databases, sets up Cloudflare
- ✅ **Error handling**: Helpful error messages and recovery suggestions
- ✅ **Educational**: Explains each step and provides learning resources

## Requirements

- Node.js 18+ 
- pnpm 8+
- Git
- Firebase CLI

The CLI will check for these and guide you through installation if needed.

## Usage

### Basic usage
```bash
npx create-volo-app my-app
```

### Advanced options
```bash
npx create-volo-app my-app --template https://github.com/custom/template.git
npx create-volo-app my-app --skip-prereqs --verbose
```

### Options

- `--template <url>`: Use a custom template repository (default: official volo-app template)
- `--skip-prereqs`: Skip prerequisite checks (not recommended)
- `--verbose`: Enable detailed logging

## What the CLI does

1. **Prerequisites Check**: Validates Node.js, pnpm, Git, Firebase CLI
2. **Template Cloning**: Downloads the latest volo-app template
3. **Service Setup**: 
   - Firebase: Creates project, enables auth, configures web app
   - Database: Sets up Neon, Supabase, or custom PostgreSQL 
   - Cloudflare: Configures Worker name and deployment settings
4. **Configuration**: Generates all config files with real values
5. **Post-setup**: Installs dependencies, deploys database schema
6. **Ready to code**: `pnpm run dev:start` launches your app

## Supported Services

### Authentication
- Firebase Authentication (Google Sign-In preconfigured)

### Database
- **Neon** (Recommended - Serverless PostgreSQL)
- **Supabase** (PostgreSQL + additional features)
- **Custom PostgreSQL** (any provider with connection string)

### Deployment
- **Cloudflare Workers** (Backend API)
- **Cloudflare Pages** (Frontend hosting)

## Deployment

Your volo-app is designed for deployment on Cloudflare's platform, providing global edge performance and seamless integration between your frontend and backend.

### Prerequisites

Before deploying, ensure you have:
- ✅ Completed the initial setup with `create-volo-app`
- ✅ Tested your app locally with `pnpm run dev:start`
- ✅ Committed your code to a Git repository (for frontend deployment)

### Backend Deployment (Cloudflare Workers)

Your Hono API will be deployed to Cloudflare Workers for global edge performance.

#### 1. Authenticate with Cloudflare (if not done during setup)
```bash
cd server
wrangler login
```

#### 2. Deploy your API
```bash
cd server
pnpm run deploy
```

This will:
- Deploy your Hono API to Cloudflare Workers
- Use the worker name configured during setup
- Make your API available at `https://your-worker-name.your-subdomain.workers.dev`

#### 3. Configure production environment variables
After deployment, set your production environment variables in the Cloudflare dashboard:
1. Go to [Cloudflare Workers Dashboard](https://dash.cloudflare.com/workers)
2. Select your worker
3. Go to Settings > Variables
4. Add your production variables:
   - `DATABASE_URL`: Your production database connection string
   - `FIREBASE_PROJECT_ID`: Your Firebase project ID
   - `FIREBASE_PRIVATE_KEY`: Your Firebase service account private key
   - `FIREBASE_CLIENT_EMAIL`: Your Firebase service account email

### Frontend Deployment (Cloudflare Pages)

Your React frontend will be deployed to Cloudflare Pages with automatic deployments on every Git push.

#### 1. Connect your repository to Cloudflare Pages
1. Go to [Cloudflare Pages Dashboard](https://dash.cloudflare.com/pages)
2. Click "Create a project"
3. Connect your Git provider (GitHub, GitLab, etc.)
4. Select your repository

#### 2. Configure build settings
Set the following build configuration:
- **Build command**: `pnpm run build`
- **Build output directory**: `ui/dist`
- **Root directory**: `/` (leave empty)

#### 3. Configure environment variables (if needed)
Add any frontend environment variables in the Pages dashboard:
- Go to your Pages project > Settings > Environment variables
- Add variables like `VITE_API_URL` if you need to override the default

#### 4. Deploy
- **Automatic**: Push to your main branch to trigger deployment
- **Manual**: Click "Create deployment" in the Pages dashboard

### Quick Deploy Commands

For convenience, your project includes these npm scripts:

```bash
# Deploy backend only
cd server && pnpm run deploy
```

### Post-Deployment Checklist

After deploying both frontend and backend:

1. **Test your deployed API**:
   ```bash
   curl https://your-worker-name.your-subdomain.workers.dev/health
   ```

2. **Update Firebase authorized domains**:
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Navigate to Authentication > Settings > Authorized domains
   - Add your Pages domain (e.g., `your-app.pages.dev`)

3. **Test authentication flow**:
   - Visit your deployed frontend
   - Try signing in with Google
   - Verify API calls work correctly

4. **Monitor your deployments**:
   - **Workers**: [Cloudflare Workers Dashboard](https://dash.cloudflare.com/workers)
   - **Pages**: [Cloudflare Pages Dashboard](https://dash.cloudflare.com/pages)

### Troubleshooting Deployment

**Backend Issues:**
- Check worker logs in the Cloudflare dashboard
- Verify environment variables are set correctly
- Ensure database is accessible from Cloudflare Workers

**Frontend Issues:**
- Check build logs in Pages dashboard
- Verify build command and output directory
- Check browser console for API connection errors

**Authentication Issues:**
- Verify Firebase authorized domains include your deployed domain
- Check Firebase configuration in your frontend
- Ensure CORS is properly configured in your API

### Custom Domains

To use your own domain:

1. **For frontend (Pages)**:
   - Go to Pages project > Custom domains
   - Add your domain and follow DNS instructions

2. **For backend (Workers)**:
   - Go to Workers dashboard > your worker > Triggers
   - Add a custom domain route

For more detailed deployment guides, visit:
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)

## Development

```bash
# Clone this repository
git clone https://github.com/VoloBuilds/create-volo-app.git
cd create-volo-app

# Install dependencies
pnpm install

# Build the CLI
pnpm run build

# Test locally
node bin/cli.js test-app

# Run in development mode
pnpm dev test-app
```

## Template Requirements

Custom templates must include:
- `package.json` with `template.placeholders` configuration
- Template files with `{{PLACEHOLDER}}` markers
- `scripts/post-setup.js` for post-installation tasks

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT

## Support

- 📖 [Documentation](https://github.com/VoloBuilds/volo-app)
- 🐛 [Report Issues](https://github.com/VoloBuilds/create-volo-app/issues)
- 💬 [Discussions](https://github.com/VoloBuilds/create-volo-app/discussions) 