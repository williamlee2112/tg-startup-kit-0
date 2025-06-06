import path from 'path';
import fs from 'fs-extra';

export async function generateLocalConfigFiles(projectName: string, directory: string): Promise<void> {
  // Read .env.example and replace template variables for local development
  const serverEnvExamplePath = path.join(directory, 'server', '.env.example');
  const serverEnvPath = path.join(directory, 'server', '.env');
  
  try {
    const envExampleContent = await fs.readFile(serverEnvExamplePath, 'utf-8');
    
    // Replace template variables with local development values
    const localServerEnv = envExampleContent
      .replace('{{DATABASE_URL}}', 'postgresql://postgres:password@localhost:5433/postgres')
      .replace('{{FIREBASE_PROJECT_ID}}', 'demo-project')
      .replace('{{WORKER_NAME}}', `${projectName}-local`);
    
    await fs.writeFile(serverEnvPath, localServerEnv);
  } catch (error) {
    // Fallback to hardcoded content if .env.example doesn't exist
    const fallbackServerEnv = `# Node.js Development Environment
PORT=8787
NODE_ENV=development

# Database Configuration
# For local development, embedded PostgreSQL is used automatically when DATABASE_URL points to localhost:5433
# For production deployment, you need a real PostgreSQL database
DATABASE_URL=postgresql://postgres:password@localhost:5433/postgres

# Firebase Configuration (JWKS approach)
FIREBASE_PROJECT_ID=demo-project

# Cloudflare Configuration
WORKER_NAME=${projectName}-local
IS_NODE_ENV=true
`;
    await fs.writeFile(serverEnvPath, fallbackServerEnv);
  }

  // Generate firebase config for local emulator
  const firebaseConfigPath = path.join(directory, 'ui', 'src', 'lib', 'firebase-config.json');
  const localFirebaseConfig = {
    apiKey: "demo-api-key",
    authDomain: "demo-project.firebaseapp.com", 
    projectId: "demo-project",
    storageBucket: "demo-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456",
    measurementId: "G-XXXXXXXXXX"
  };

  await fs.writeFile(firebaseConfigPath, JSON.stringify(localFirebaseConfig, null, 2));

  // Generate wrangler.toml for local development
  const wranglerConfigPath = path.join(directory, 'server', 'wrangler.toml');
  const localWranglerConfig = `name = "${projectName}-local"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[env.local]
vars = { NODE_ENV = "development" }

[[env.local.d1_databases]]
binding = "DB"
database_name = "${projectName}-local-db"
database_id = "local-db"
`;

  await fs.writeFile(wranglerConfigPath, localWranglerConfig);
} 