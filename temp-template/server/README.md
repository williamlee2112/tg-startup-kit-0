# Chat App API

This is the API server for the Chat App, built with Cloudflare Workers.

## Environment Setup

The API uses `.dev.vars` for local development configuration and Cloudflare's dashboard for production environment variables. Follow these steps to get started:

1. Create your local development variables file:
   ```bash
   # Copy the example vars file
   cp .dev.vars.example .dev.vars
   ```

2. Configure your environment variables in `.dev.vars`:
   ```
   DATABASE_URL=postgresql://user:password@your-db-host/your-db-name
   FIREBASE_PROJECT_ID=your-firebase-project-id
   ```

3. Update the worker name in `wrangler.toml`:
   ```toml
   name = "your-worker-name"    # This is your Cloudflare Worker name
   ```

## Firebase Setup

The API uses Firebase Authentication. To set up Firebase:

1. Go to the [Firebase Console](https://console.firebase.google.com)
2. Select or create your project
3. Copy your project ID from the project settings
4. Add it to your environment variables as `FIREBASE_PROJECT_ID`

The API uses Firebase's public JWKS endpoint to verify tokens, so no additional credentials are needed.

## Development Server Configuration

The development server configuration is set in `wrangler.toml`. By default, it runs on port 8787. To use a different port:

1. **Option 1**: Modify `wrangler.toml` directly
   ```toml
   [dev]
   port = YOUR_PREFERRED_PORT  # Replace with your desired port number
   local_protocol = "http"
   ```

2. **Option 2**: Use the CLI flag (temporary override)
   ```bash
   pnpm wrangler dev --port YOUR_PREFERRED_PORT
   ```

## Development

To run the API locally:
```bash
pnpm wrangler dev
```

This will:
- Load variables from `.dev.vars`
- Start the development server (default port: 8787)
- Enable local development tools

Your API will be available at `http://localhost:8787` (or your configured port).

## Build Process

**No build step required!** Cloudflare Workers automatically handle the build process during both development (`wrangler dev`) and deployment (`wrangler deploy`). The TypeScript files in `src/` are processed directly by Wrangler.

This is different from traditional Node.js applications that require a separate build step to compile TypeScript to JavaScript.

## API Authentication

All routes under `/api/v1/protected/*` require authentication. To authenticate requests:

1. Include the Firebase ID token in the Authorization header:
   ```
   Authorization: Bearer <firebase-id-token>
   ```

2. The token will be verified and the user information will be available in protected routes.

Example protected route: `/api/v1/protected/me` returns the current user's information.

## Deployment

To deploy to production:
```bash
pnpm wrangler deploy
```

This will deploy to your Cloudflare Workers environment using the name specified in `wrangler.toml`. Make sure to configure your production environment variables in the Cloudflare dashboard with your production values for:
- DATABASE_URL
- FIREBASE_PROJECT_ID

## Environment Variables

### Local Development
- `.dev.vars`: Contains your development environment variables
- `.dev.vars.example`: Template file showing required variables (safe to commit)

### Production
Configure your production environment variables in the Cloudflare Dashboard:
1. Go to Workers & Pages
2. Select your application (it will be listed under the name specified in `wrangler.toml`)
3. Navigate to Settings > Environment Variables
4. Add your environment variables with production values

⚠️ Important: Never commit your `.dev.vars` file to version control. It should be listed in `.gitignore`.

## Troubleshooting

If you encounter issues:

1. Ensure all required environment variables are set in `.dev.vars` for local development
2. Verify your database connection string is correct for your environment
3. Check that you're using the correct port and it's not in use by another application
4. Make sure your Cloudflare account has the necessary permissions and configurations
5. Verify that your worker name in `wrangler.toml` matches your intended Cloudflare Worker name
6. For Firebase authentication issues:
   - Verify your Firebase project ID is correctly set in your environment variables
   - Ensure the client is sending a valid Firebase ID token 

## Database Setup

### Working with the Database

This project uses [Drizzle ORM](https://orm.drizzle.team) with a Neon Postgres database. The database schema is defined in TypeScript under `src/schema/`.

### Setting Up Your Database

1. Get your database connection string from Neon:
   ```
   DATABASE_URL=postgres://user:password@your-neon-host/dbname
   ```

2. Add it to your `.dev.vars`:
   ```
   DATABASE_URL=your-connection-string
   ```

3. Push the schema to your database:
   ```bash
   npx dotenv-cli -e .dev.vars -- pnpm db:push
   ```

This command will create or update your database tables to match your schema. Run it whenever you make changes to files in `src/schema/`. 