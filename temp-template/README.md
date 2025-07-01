# Volo App Template

This is the official template repository for [create-volo-app](https://github.com/VoloBuilds/create-volo-app) - a CLI tool that creates production-ready full-stack applications with a decoupled React frontend and Hono backend.

> **⚡ Quick Start:** Use the CLI for the best experience:
> ```bash
> npx create-volo-app my-app
> ```

## 🎯 **Template Overview**

This template provides a highly opinionated, production-ready foundation for building full-stack applications with clear separation of concerns and secure handling of authentication and data.

**Core Philosophy:**
- **Decoupled Architecture**: Separate UI (React/Vite) and API (Hono/Cloudflare Workers) for independent development, scaling, and deployment
- **Rapid Feature Development**: Address foundational setup (auth, DB, UI) upfront so you can focus on building features
- **Production Ready**: Optimized for deployment on Cloudflare's ecosystem with global edge performance

## 🏗️ **Tech Stack**

**Frontend (UI):**
- ⚛️ React with TypeScript and Vite
- 🎨 Tailwind CSS + ShadCN/UI components
- 🔐 Firebase Authentication (Google Sign-In pre-configured)

**Backend (Server):**
- 🔥 Hono web framework for Cloudflare Workers
- 🗄️ PostgreSQL with Drizzle ORM (Neon/Supabase support)
- 🔒 Firebase Admin SDK for token verification
- ☁️ Edge deployment ready

**Infrastructure:**
- 🌐 Cloudflare Pages (frontend hosting)
- ⚡ Cloudflare Workers (API hosting)
- 🗄️ Neon/Supabase PostgreSQL
- 🔐 Firebase Authentication

## 📋 **Template Features**

✅ **Comprehensive Setup**: Handles all service configuration automatically via CLI  
✅ **Security Best Practices**: JWT verification, CORS, secure environment handling  
✅ **Type Safety**: Full TypeScript coverage across frontend and backend  
✅ **Modern Tooling**: Vite, pnpm, ESLint, Prettier  
✅ **Production Deployment**: Cloudflare Workers + Pages configuration  
✅ **Database Integration**: Drizzle ORM with schema management  
✅ **Authentication Flow**: Complete Google Sign-In implementation  

## 🛠️ **Template Structure**

```
├── ui/                          # React frontend
│   ├── src/
│   │   ├── components/         # ShadCN/UI components
│   │   ├── lib/               # Firebase config & utilities
│   │   │   └── firebase-config.template.json  # {{PLACEHOLDERS}}
│   │   └── App.tsx            # Main application
│   └── package.json
├── server/                     # Hono API backend
│   ├── src/
│   │   ├── middleware/        # Authentication middleware
│   │   ├── schema/           # Database schema (Drizzle)
│   │   └── index.ts          # API routes
│   ├── wrangler.toml         # Cloudflare config with {{WORKER_NAME}}
│   └── .dev.vars.example     # Environment template
├── scripts/
│   └── post-setup.js         # CLI post-processing
└── package.json              # Template configuration
```

## 🔧 **CLI Integration**

This template is designed to work seamlessly with `create-volo-app`:

### Placeholder System

The template uses a placeholder replacement system:

```json
{
  "WORKER_NAME": "string",
  "FIREBASE_PROJECT_ID": "string", 
  "FIREBASE_API_KEY": "string",
  "FIREBASE_MESSAGING_SENDER_ID": "string",
  "FIREBASE_APP_ID": "string", 
  "FIREBASE_MEASUREMENT_ID": "string",
  "DATABASE_URL": "string"
}
```

### CLI Workflow

1. CLI clones this template
2. CLI replaces `{{PLACEHOLDERS}}` with real service values
3. CLI calls `pnpm post-setup` for technical setup
4. User gets a working app with personalized README

## 📚 **Development (Template Contributors)**

To work on this template:

```bash
git clone https://github.com/VoloBuilds/volo-app.git
cd volo-app
pnpm install
```

### Testing Template Changes

Use the CLI in development mode:

```bash
# In create-volo-app repository
pnpm dev test-app --template /path/to/volo-app
```

### Template Requirements

- All configuration files must use `{{PLACEHOLDER}}` format
- `package.json` must include `template.placeholders` definition
- `scripts/post-setup.js` must handle technical setup tasks
- Template must be self-contained and buildable after placeholder replacement

---

## 📖 **For End Users**

**Want to create a new app?** Use the CLI for the best experience:

```bash
npx create-volo-app my-app
```

The CLI will:
- Set up Firebase, database, and Cloudflare automatically
- Generate all configuration files with real values
- Create a personalized README for your specific project
- Handle all technical setup so you can start coding immediately

## 🤝 **Contributing**

1. Fork this repository
2. Make your changes
3. Test with the CLI: `pnpm dev test-app --template /path/to/your-fork`
4. Submit a pull request

## 📝 **License**

MIT License - see [LICENSE](LICENSE) file for details.

---

**Questions?** Visit the [create-volo-app repository](https://github.com/VoloBuilds/create-volo-app) or [start a discussion](https://github.com/VoloBuilds/create-volo-app/discussions). 