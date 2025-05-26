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

interface CreateOptions {
  template: string;
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
  const spinner = ora('Cloning template...').start();
  try {
    await cloneTemplate(options.template, directory);
    spinner.succeed('Template cloned successfully');
  } catch (error) {
    spinner.fail('Failed to clone template');
    throw error;
  }

  // Step 2: Gather configuration
  logger.step('Setting up services...');
  logger.newLine();

  const config: ProjectConfig = {
    name,
    directory,
    firebase: await setupFirebaseWithRetry(),
    database: await setupDatabaseWithRetry(options.databasePreference),
    cloudflare: await setupCloudflare(name)
  };

  // Step 3: Generate configuration files
  logger.step('Generating configuration files...');
  await generateConfigFiles(config);
  logger.success('Configuration files generated');

  // Step 4: Run post-setup
  logger.step('Running post-setup tasks...');
  try {
    await execa('pnpm', ['post-setup'], { 
      cwd: directory, 
      stdio: options.verbose ? 'inherit' : 'pipe' 
    });
    logger.success('Post-setup completed');
  } catch (error) {
    logger.warning('Post-setup encountered issues, but you can run it manually later');
    logger.info('To complete setup manually, run:');
    console.log(chalk.cyan(`  cd ${name}`));
    console.log(chalk.cyan('  pnpm post-setup'));
    logger.debug(`Post-setup error: ${error}`);
  }

  // Step 5: Success message
  logger.newLine();
  logger.success('🎉 Your Volo app has been created successfully!');
  logger.newLine();
  
  console.log(chalk.cyan.bold('Next steps:'));
  console.log(`  cd ${name}`);
  console.log(`  pnpm run dev:start`);
  logger.newLine();
  
  console.log(chalk.gray('Your app includes:'));
  console.log(chalk.gray('  ✅ React frontend with TypeScript, Vite, and Tailwind CSS'));
  console.log(chalk.gray('  ✅ Hono backend API ready for Cloudflare Workers'));
  console.log(chalk.gray('  ✅ Firebase Authentication (Google Sign-In configured)'));
  console.log(chalk.gray('  ✅ PostgreSQL database with Drizzle ORM'));
  console.log(chalk.gray('  ✅ Production deployment configuration'));
  logger.newLine();
  
  console.log(chalk.blue('📚 Need help? Check the README.md file in your project for setup guides and deployment instructions'));
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

async function setupFirebaseWithRetry(maxRetries = 2): Promise<ProjectConfig['firebase']> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await setupFirebase();
    } catch (error) {
      logger.warning(`Firebase setup failed (attempt ${attempt}/${maxRetries})`);
      
      if (attempt === maxRetries) {
        logger.error('Firebase setup failed after multiple attempts');
        logger.info('You can set up Firebase manually later by:');
        console.log(chalk.cyan('1. Creating a Firebase project at https://console.firebase.google.com'));
        console.log(chalk.cyan('2. Enabling Google Authentication'));
        console.log(chalk.cyan('3. Creating a web app and updating your config files'));
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

async function setupDatabaseWithRetry(databasePreference?: string, maxRetries = 2): Promise<ProjectConfig['database']> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      switch (databasePreference) {
        case 'neon':
          return await setupDatabase(databasePreference);
        case 'supabase':
          const { setupSupabaseDatabase } = await import('../services/supabase.js');
          return await setupSupabaseDatabase();
        case 'other':
          const { setupOtherDatabase } = await import('../services/database.js');
          return await setupOtherDatabase();
        default:
          return await setupDatabase(databasePreference); // fallback
      }
    } catch (error) {
      logger.warning(`Database setup failed (attempt ${attempt}/${maxRetries})`);
      
      if (attempt === maxRetries) {
        logger.error('Database setup failed after multiple attempts');
        logger.info('You can set up your database manually later by:');
        console.log(chalk.cyan('1. Creating a PostgreSQL database (Neon, Supabase, or other)'));
        console.log(chalk.cyan('2. Updating the DATABASE_URL in server/.dev.vars'));
        console.log(chalk.cyan('3. Running: cd server && pnpm run db:push'));
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