import chalk from 'chalk';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { setupCloudflare } from '../../services/cloudflare.js';
import { 
  createReadlineInterface, 
  question, 
  getProjectNameFromPackageJson,
  confirmProductionSetup,
  confirmReconfiguration
} from './shared.js';
import readline from 'readline';

export async function connectDeploy(projectPath: string): Promise<void> {
  const rl = createReadlineInterface();
  
  try {
    console.log(chalk.cyan.bold('🚀 Production Deployment Setup'));
    console.log('This will set up production deployment using Cloudflare Workers + Pages.\n');
    
    // Check current deployment configuration
    const currentConfig = await detectCurrentDeploymentConfig(projectPath);
    
    if (currentConfig.isConfigured) {
      console.log(chalk.green('✅ Deployment configuration found'));
      console.log(chalk.gray(`   Worker name: ${currentConfig.workerName}`));
      
      if (!(await confirmReconfiguration(rl, 'deployment settings'))) {
        console.log(chalk.blue('👋 No changes made'));
        return;
      }
    } else {
      console.log(chalk.blue('🆕 Setting up new deployment configuration'));
    }
    
    // Confirm before proceeding
    if (!(await confirmProductionSetup(rl, 'production deployment'))) {
      console.log(chalk.blue('👋 Operation cancelled'));
      return;
    }
    
    // Get project name for default worker naming (consistent with createFull.ts)
    const projectName = await getProjectNameFromPackageJson(projectPath);
    
    // Use existing Cloudflare setup from services (fast mode = false for interactive setup)
    console.log(chalk.blue('\n🔐 Setting up Cloudflare...'));
    const cloudflareResult = await setupCloudflare(projectName, false);
    
    // Update wrangler configuration
    await updateWranglerConfig(projectPath, { workerName: cloudflareResult.workerName });
    
    // Set up environment variables
    await setupWorkerEnvironment(projectPath);
    
    // Provide deployment instructions
    await setupPagesDeployment(rl);
    
    console.log(chalk.green('\n🎉 Production deployment setup completed!'));
    console.log(chalk.cyan('\n📋 Next steps:'));
    console.log(`   1. Deploy your API: cd server && pnpm run deploy`);
    console.log('   2. Set up Cloudflare Pages for your frontend (see instructions above)');
    console.log('   3. Update your frontend environment variables with production values');
    console.log('   4. Test your production deployment thoroughly');
    
    console.log(chalk.blue('\n🔧 Useful commands:'));
    console.log('   - Deploy Worker: cd server && pnpm run deploy');
    console.log('   - View Worker logs: cd server && npx wrangler tail');
    console.log('   - Update secrets: cd server && npx wrangler secret put VARIABLE_NAME');
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  } finally {
    rl.close();
  }
}

async function detectCurrentDeploymentConfig(projectPath: string) {
  const wranglerPath = path.join(projectPath, 'server', 'wrangler.toml');
  
  if (!existsSync(wranglerPath)) {
    return { isConfigured: false, workerName: null };
  }
  
  try {
    const wranglerContent = await readFile(wranglerPath, 'utf-8');
    const nameMatch = wranglerContent.match(/name\s*=\s*["']([^"']+)["']/);
    
    return {
      isConfigured: !!nameMatch,
      workerName: nameMatch?.[1] || null
    };
  } catch (error) {
    return { isConfigured: false, workerName: null };
  }
}

async function updateWranglerConfig(projectPath: string, config: any) {
  const wranglerPath = path.join(projectPath, 'server', 'wrangler.toml');
  
  const wranglerConfig = `name = "${config.workerName}"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
NODE_ENV = "production"

[[migrations]]
tag = "v1"
new_classes = ["VoLo"]
`;

  await writeFile(wranglerPath, wranglerConfig);
  console.log(chalk.green('✅ Wrangler configuration updated'));
}

async function setupWorkerEnvironment(projectPath: string) {
  console.log(chalk.yellow('\n🔧 Setting up Worker environment variables...'));
  
  // Read current environment variables from .env
  const envPath = path.join(projectPath, 'server', '.env');
  let envVars: Record<string, string> = {};
  
  if (existsSync(envPath)) {
    const envContent = await readFile(envPath, 'utf-8');
    
    // Parse environment variables
    envContent.split('\n').forEach(line => {
      const cleanLine = line.trim();
      if (cleanLine && !cleanLine.startsWith('#')) {
        const [key, ...valueParts] = cleanLine.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
  }
  
  // Show required environment variables
  const requiredVars = ['DATABASE_URL', 'FIREBASE_PROJECT_ID'];
  
  console.log(chalk.blue('\n📝 Required environment variables for Worker:'));
  for (const varName of requiredVars) {
    if (envVars[varName]) {
      console.log(chalk.green(`   ✅ ${varName} (found in local .env)`));
    } else {
      console.log(chalk.yellow(`   ⚠️  ${varName} (not found in local .env)`));
    }
  }
  
  console.log(chalk.gray('\n💡 You can set these in your Worker after deployment with:'));
  console.log(chalk.gray('   cd server && npx wrangler secret put VARIABLE_NAME'));
  
  console.log(chalk.green('✅ Worker environment configuration prepared'));
}

async function setupPagesDeployment(rl: readline.Interface) {
  console.log(chalk.cyan('\n📄 Setting up Cloudflare Pages deployment'));
  console.log('For the frontend, you\'ll need to connect your Git repository to Cloudflare Pages.\n');
  
  console.log(chalk.blue('📋 Steps to deploy your frontend:'));
  console.log('1. Push your code to a Git repository (GitHub, GitLab, etc.)');
  console.log('2. Go to https://dash.cloudflare.com/');
  console.log('3. Navigate to "Workers & Pages" > "Create application" > "Pages"');
  console.log('4. Connect your Git repository');
  console.log('5. Configure build settings:');
  console.log('   - Framework preset: Vite');
  console.log('   - Build command: cd ui && pnpm run build');
  console.log('   - Build output directory: ui/dist');
  console.log('6. Add environment variables in Pages settings:');
  console.log('   - Add your Firebase config variables');
  console.log('   - Set VITE_API_URL to your Worker URL\n');
  
  const shouldOpenDashboard = await question(rl, 'Would you like to open Cloudflare Dashboard to set up Pages? (y/N): ');
  
  if (shouldOpenDashboard.toLowerCase() === 'y') {
    try {
      const { default: open } = await import('open');
      await open('https://dash.cloudflare.com/');
      console.log(chalk.green('🌐 Opened Cloudflare Dashboard in your browser'));
    } catch (error) {
      console.log(chalk.blue('Please visit: https://dash.cloudflare.com/'));
    }
  }
} 