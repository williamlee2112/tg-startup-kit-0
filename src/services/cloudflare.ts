import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { validateWorkerName } from '../utils/validation.js';
import { execWrangler } from '../utils/cli.js';

interface CloudflareConfig {
  workerName: string;
}

async function checkWranglerAuth(): Promise<boolean> {
  try {
    const { stdout } = await execWrangler(['whoami']);
    return stdout.includes('@') || stdout.includes('You are logged in');
  } catch {
    return false;
  }
}

export async function setupCloudflare(projectName: string, fastMode = false): Promise<CloudflareConfig> {
  logger.newLine();
  console.log(chalk.yellow.bold('🌐 Setting up Cloudflare Deployment'));
  console.log(chalk.white('Cloudflare hosts your app globally for lightning-fast performance.'));
  console.log(chalk.white('Your backend API runs on Workers, frontend on Pages - both free tiers available!'));
  logger.newLine();

  // Check if user is authenticated with Cloudflare
  const isAuthenticated = await checkWranglerAuth();
  if (!isAuthenticated) {
    logger.warning('Cloudflare authentication skipped.');
    logger.newLine();
    console.log(chalk.yellow.bold('⚡ You can authenticate later:'));
    console.log(chalk.cyan('   cd server && wrangler login'));
    logger.newLine();
  } else {
    logger.success('Already authenticated with Cloudflare ✓');
  }

  // Generate default worker name based on project name
  const defaultWorkerName = `${projectName}-api`;

  let workerName: string;
  
  if (fastMode) {
    // In fast mode, use the default worker name without prompting
    workerName = defaultWorkerName;
    logger.info(`Using worker name: ${workerName} (fast mode)`);
  } else {
    const response = await inquirer.prompt([
      {
        type: 'input',
        name: 'workerName',
        message: 'Enter a name for your Cloudflare Worker:',
        default: defaultWorkerName,
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Worker name is required';
          }
          if (!validateWorkerName(input)) {
            return 'Worker name should be lowercase, contain only letters, numbers, and hyphens, and not start/end with hyphen';
          }
          return true;
        }
      }
    ]);
    workerName = response.workerName;
  }

  // Provide setup instructions
  await provideCloudflareInstructions(workerName, isAuthenticated || await checkWranglerAuth());

  logger.success('Cloudflare Workers configured!');
  logger.newLine();

  return {
    workerName
  };
}

async function provideCloudflareInstructions(workerName: string, isAuthenticated: boolean): Promise<void> {
  logger.info('Cloudflare deployment setup...');
  logger.newLine();

  console.log(chalk.yellow('📋 Setup information:'));
  console.log(chalk.gray('Your Worker will be named: ') + chalk.cyan(workerName));
  
  if (isAuthenticated) {
    console.log(chalk.green('✅ You\'re authenticated and ready to deploy!'));
  } else {
    console.log(chalk.yellow('⚠️  You\'ll need to authenticate before deployment.'));
    console.log(chalk.gray('Run: cd server && wrangler login'));
  }
  logger.newLine();
} 