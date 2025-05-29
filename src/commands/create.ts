import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import { execa } from 'execa';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { cloneTemplate } from '../utils/template.js';
import { setupFirebase } from '../services/firebase.js';
import { setupCloudflare } from '../services/cloudflare.js';
import { generateConfigFiles } from '../utils/config.js';
import { validateProjectName } from '../utils/validation.js';
import { setupDatabase } from '../services/database.js';
import { withProgress } from '../utils/progress.js';
import { execFirebase } from '../utils/cli.js';
import { execNeonctl } from '../utils/neonctl.js';

interface CreateOptions {
  template: string;
  branch?: string;
  db?: string;
  fast?: boolean;
  skipPrereqs: boolean;
  verbose: boolean;
  databasePreference?: string;
}

interface ProjectConfig {
  name: string;
  directory: string;
  firebase: {
    projectId: string;
    apiKey: string;
    messagingSenderId: string;
    appId: string;
    measurementId: string;
  };
  database: {
    url: string;
    provider: 'neon' | 'supabase' | 'other';
  };
  cloudflare: {
    workerName: string;
  };
}

interface AuthStatus {
  firebase: boolean;
  neon: boolean;
  cloudflare: boolean;
}

async function checkAuthenticationStatus(databaseProvider?: string): Promise<AuthStatus> {
  const status: AuthStatus = {
    firebase: false,
    neon: false,
    cloudflare: false
  };

  // Check Firebase auth
  try {
    const { stdout } = await execFirebase(['login:list'], { stdio: 'pipe' });
    status.firebase = stdout.includes('@');
  } catch {
    status.firebase = false;
  }

  // Check Neon auth (only if using Neon)
  if (databaseProvider === 'neon') {
    try {
      const { stdout } = await execNeonctl(['me'], { stdio: 'pipe' });
      status.neon = stdout.includes('@');
    } catch {
      status.neon = false;
    }
  } else {
    status.neon = true; // Not needed for other providers
  }

  // Check Cloudflare auth
  try {
    const { execa } = await import('execa');
    const { stdout } = await execa('wrangler', ['whoami'], { stdio: 'pipe' });
    status.cloudflare = stdout.includes('@') || stdout.includes('You are logged in');
  } catch {
    status.cloudflare = false;
  }

  return status;
}

async function handleBatchAuthentication(authStatus: AuthStatus, databaseProvider?: string): Promise<void> {
  const needsAuth: string[] = [];
  
  if (!authStatus.firebase) needsAuth.push('Firebase');
  if (!authStatus.neon && databaseProvider === 'neon') needsAuth.push('Neon');
  if (!authStatus.cloudflare) needsAuth.push('Cloudflare');

  if (needsAuth.length === 0) {
    logger.success('All services are already authenticated! ✨');
    return;
  }

  logger.newLine();
  console.log(chalk.yellow.bold('🔐 Authentication Required'));
  console.log(chalk.white(`We need to authenticate with ${needsAuth.length} service${needsAuth.length > 1 ? 's' : ''}:`));
  
  for (const service of needsAuth) {
    console.log(chalk.white(`  • ${service}`));
  }
  
  logger.newLine();
  console.log(chalk.white('This will open browser tabs for secure authentication.'));
  console.log(chalk.white('Each authentication takes about 30 seconds.'));
  logger.newLine();

  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: `Open ${needsAuth.length} browser tab${needsAuth.length > 1 ? 's' : ''} for authentication?`,
      default: true
    }
  ]);

  if (!proceed) {
    throw new Error('Authentication is required to continue');
  }

  // Authenticate services sequentially (browser-based auth can't be truly parallel)
  for (const service of needsAuth) {
    const spinner = ora(`Authenticating with ${service}...`).start();
    
    try {
      switch (service) {
        case 'Firebase':
          await execFirebase(['login'], { stdio: 'inherit' });
          break;
        case 'Neon':
          await execNeonctl(['auth'], { stdio: 'inherit' });
          break;
        case 'Cloudflare':
          const { execa } = await import('execa');
          await execa('wrangler', ['login'], { stdio: 'inherit' });
          break;
      }
      spinner.succeed(`${service} authentication completed`);
    } catch (error) {
      spinner.fail(`${service} authentication failed`);
      throw new Error(`Failed to authenticate with ${service}`);
    }
  }

  logger.newLine();
  logger.success('All authentications completed! 🎉');
}

export async function createApp(projectName: string | undefined, options: CreateOptions): Promise<void> {
  // Get project name
  const name = await getProjectName(projectName);
  const directory = path.resolve(process.cwd(), name);

  // Validate project directory
  if (await fs.pathExists(directory)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `Directory "${name}" already exists. Do you want to overwrite it?`,
        default: false
      }
    ]);

    if (!overwrite) {
      logger.info('Operation cancelled.');
      return;
    }

    await fs.remove(directory);
  }

  logger.step(`Creating project "${name}"...`);
  logger.newLine();

  // Step 1: Clone template
  const cloneSpinner = ora({
    text: 'Cloning template...',
    spinner: 'line'
  }).start();
  
  try {
    await cloneTemplate(options.template, directory, options.branch);
    cloneSpinner.succeed('Template cloned successfully');
  } catch (error) {
    cloneSpinner.fail('Failed to clone template');
    throw error;
  }

  // Step 2: Handle authentication and configuration
  logger.newLine();
  
  // Determine database provider (prioritize --db flag, then databasePreference, then default to neon in fast mode)
  const databaseProvider = options.db || options.databasePreference || (options.fast ? 'neon' : undefined);
  
  if (options.fast) {
    console.log(chalk.cyan.bold('🚀 Fast Mode: Setting up your app with smart defaults...'));
    console.log(chalk.white('Your volo-app will be configured with:'));
    console.log(chalk.white(`  • Database - ${databaseProvider || 'Neon'} (new database)`));
    console.log(chalk.white('  • Firebase - new project with auto-generated name'));
    console.log(chalk.white('  • Cloudflare - new worker with auto-generated name'));
    logger.newLine();
    console.log(chalk.gray('Note: Google Sign-In will be skipped but can be set up later in Firebase Console.'));
    logger.newLine();
  } else {
    console.log(chalk.cyan.bold('🔧 Setting up your app services...'));
    console.log(chalk.white('Your volo-app needs three key services to work:'));
    console.log(chalk.white('  • Database - for storing your app data'));
    console.log(chalk.white('  • Firebase - for user authentication (login/signup)'));
    console.log(chalk.white('  • Cloudflare - for hosting your app globally'));
    logger.newLine();
  }

  // Check authentication status
  const authStatus = await checkAuthenticationStatus(databaseProvider);
  await handleBatchAuthentication(authStatus, databaseProvider);

  const config: ProjectConfig = {
    name,
    directory,
    // Database setup first
    database: await setupDatabaseWithRetry(databaseProvider, undefined, options.fast, name),
    // Firebase setup after database
    firebase: await setupFirebaseWithRetry(undefined, options.fast, name),
    cloudflare: await setupCloudflare(name, options.fast)
  };

  // Step 3: Generate configuration files
  const configSpinner = ora({
    text: 'Generating configuration files...',
    spinner: 'line'
  }).start();
  
  try {
    await generateConfigFiles(config);
    configSpinner.succeed('Configuration files generated');
  } catch (error) {
    configSpinner.fail('Failed to generate configuration files');
    throw error;
  }

  // Step 4: Run post-setup
  const postSetupSpinner = ora({
    text: 'Running post-setup tasks (this may take 30-60 seconds).',
    spinner: 'line'
  }).start();
  
  // Add animated dots effect for the long-running post-setup
  let dotCount = 1;
  const dotsInterval = setInterval(() => {
    const dots = '.'.repeat(dotCount);
    postSetupSpinner.text = `Running post-setup tasks (this may take 30-60 seconds)${dots}`;
    dotCount = dotCount === 3 ? 1 : dotCount + 1;
  }, 500);
  
  try {
    await execa('pnpm', ['post-setup'], { 
      cwd: directory, 
      stdio: options.verbose ? 'inherit' : 'pipe' 
    });
    clearInterval(dotsInterval);
    postSetupSpinner.succeed('Post-setup completed successfully!');
  } catch (error) {
    clearInterval(dotsInterval);
    postSetupSpinner.fail('Post-setup encountered issues');
    logger.warning('You can run it manually later');
    logger.newLine();
    console.log(chalk.yellow.bold('⚡ Complete setup manually:'));
    console.log(chalk.cyan(`   cd ${name}`));
    console.log(chalk.cyan('   pnpm post-setup'));
    logger.newLine();
    logger.debug(`Post-setup error: ${error}`);
  }

  // Step 5: Success message
  logger.newLine();
  logger.success('🎉 Your volo-app has been created successfully!');
  logger.newLine();
  
  console.log(chalk.cyan.bold('🚀 What you got:'));
  console.log(chalk.white('  • React + TypeScript + Tailwind CSS + ShadCN frontend'));
  console.log(chalk.white('  • Hono API backend for Cloudflare Workers'));
  console.log(chalk.white('  • Firebase Authentication (Google Sign-In)'));
  console.log(chalk.white('  • PostgreSQL database with Drizzle ORM'));
  console.log(chalk.white('  • Production deployment ready'));
  logger.newLine();
  
  console.log(chalk.green.bold('▶️  Next steps:'));
  console.log(chalk.cyan(`   cd ${name}`));
  console.log(chalk.cyan('   pnpm run dev:start'));
  
  if (options.fast) {
    logger.newLine();
    console.log(chalk.yellow.bold('📝 Optional: Set up Google Sign-In'));
    console.log(chalk.white('   1. Visit Firebase Console: https://console.firebase.google.com'));
    console.log(chalk.white(`   2. Go to your project: ${config.firebase.projectId}`));
    console.log(chalk.white('   3. Navigate to Authentication > Sign-in method'));
    console.log(chalk.white('   4. Enable Google provider'));
  }
  
  logger.newLine();
  
  // Ask if user wants to start the app now
  const { startNow } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'startNow',
      message: 'Would you like to start the development server now?',
      default: true
    }
  ]);

  if (startNow) {
    logger.newLine();
    console.log(chalk.green('🚀 Starting your volo-app...'));
    logger.newLine();
    
    try {
      // Change to the project directory and start the dev server
      await execa('pnpm', ['run', 'dev:start'], { 
        cwd: directory, 
        stdio: 'inherit' 
      });
    } catch (error) {
      logger.error('Failed to start the development server');
      logger.info('You can start it manually by running:');
      console.log(chalk.cyan(`   cd ${name}`));
      console.log(chalk.cyan('   pnpm run dev:start'));
    }
  } else {
    console.log(chalk.blue('📚 Need help? Check the README.md in your project directory'));
    logger.newLine();
    console.log(chalk.gray('When you\'re ready to start developing:'));
    console.log(chalk.cyan(`   cd ${name}`));
    console.log(chalk.cyan('   pnpm run dev:start'));
  }
}

async function getProjectName(provided?: string): Promise<string> {
  if (provided && validateProjectName(provided)) {
    return provided;
  }

  if (provided) {
    logger.warning(`"${provided}" is not a valid project name.`);
    logger.info('Project names should be lowercase, contain only letters, numbers, and hyphens.');
  }

  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'What is your project name?',
      default: 'my-volo-app',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Project name is required';
        }
        if (!validateProjectName(input)) {
          return 'Project name should be lowercase, contain only letters, numbers, and hyphens';
        }
        return true;
      }
    }
  ]);

  return name;
}

async function setupFirebaseWithRetry(maxRetries = 2, fastMode = false, projectName?: string): Promise<ProjectConfig['firebase']> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
              return await setupFirebase(fastMode, projectName);
    } catch (error) {
      logger.warning(`Firebase setup failed (attempt ${attempt}/${maxRetries})`);
      
      if (attempt === maxRetries) {
        logger.error('Firebase setup failed after multiple attempts');
        logger.newLine();
        console.log(chalk.yellow.bold('⚡ Manual Firebase setup required:'));
        console.log(chalk.cyan('   1. Visit https://console.firebase.google.com'));
        console.log(chalk.cyan('   2. Create a new project'));
        console.log(chalk.cyan('   3. Enable Google Authentication'));
        console.log(chalk.cyan('   4. Create a web app and update your config files'));
        logger.newLine();
        throw error;
      }

      const { retry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'retry',
          message: 'Would you like to retry Firebase setup?',
          default: true
        }
      ]);

      if (!retry) {
        throw error;
      }

      logger.info('Retrying Firebase setup...');
    }
  }
  
  throw new Error('Firebase setup failed');
}

async function setupDatabaseWithRetry(databasePreference?: string, maxRetries = 2, fastMode = false, projectName?: string): Promise<ProjectConfig['database']> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      switch (databasePreference) {
        case 'neon':
          return await setupDatabase(databasePreference, fastMode, projectName);
        case 'supabase':
          const { setupSupabaseDatabase } = await import('../services/supabase.js');
          return await setupSupabaseDatabase(fastMode, projectName);
        case 'other':
          const { setupOtherDatabase } = await import('../services/database.js');
          return await setupOtherDatabase();
        default:
          return await setupDatabase(databasePreference, fastMode, projectName); // fallback
      }
    } catch (error) {
      logger.warning(`Database setup failed (attempt ${attempt}/${maxRetries})`);
      
      if (attempt === maxRetries) {
        logger.error('Database setup failed after multiple attempts');
        logger.newLine();
        console.log(chalk.yellow.bold('⚡ Manual database setup required:'));
        console.log(chalk.cyan('   1. Create a PostgreSQL database (Neon, Supabase, or other)'));
        console.log(chalk.cyan('   2. Update DATABASE_URL in server/.dev.vars'));
        console.log(chalk.cyan('   3. Run: cd server && pnpm run db:push'));
        logger.newLine();
        throw error;
      }

      const { retry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'retry',
          message: 'Would you like to retry database setup?',
          default: true
        }
      ]);

      if (!retry) {
        throw error;
      }

      logger.info('Retrying database setup...');
    }
  }
  
  throw new Error('Database setup failed');
} 