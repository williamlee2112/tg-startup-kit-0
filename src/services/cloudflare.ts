import inquirer from 'inquirer';
import chalk from 'chalk';
import { execa } from 'execa';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { validateWorkerName } from '../utils/validation.js';

interface CloudflareConfig {
  workerName: string;
}

async function checkWranglerAuth(): Promise<boolean> {
  try {
    const { stdout } = await execa('wrangler', ['whoami'], { stdio: 'pipe' });
    return stdout.includes('@') || stdout.includes('You are logged in');
  } catch {
    return false;
  }
}

async function authenticateWrangler(): Promise<boolean> {
  logger.info('Cloudflare authentication required for deployment.');
  
  const { authenticate } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'authenticate',
      message: 'Would you like to authenticate with Cloudflare now? (This will open your browser)',
      default: true
    }
  ]);

  if (!authenticate) {
    return false;
  }

  const spinner = ora('Opening browser for Cloudflare authentication...').start();
  
  try {
    await execa('wrangler', ['login'], { stdio: 'inherit' });
    
    // Verify authentication worked
    const isAuthenticated = await checkWranglerAuth();
    if (isAuthenticated) {
      spinner.succeed('Successfully authenticated with Cloudflare!');
      return true;
    } else {
      spinner.fail('Authentication verification failed');
      return false;
    }
  } catch (error) {
    spinner.fail('Authentication failed or was cancelled');
    logger.debug(`Wrangler auth error: ${error}`);
    return false;
  }
}

export async function setupCloudflare(projectName: string): Promise<CloudflareConfig> {
  logger.step('Setting up Cloudflare Workers...');
  logger.newLine();

  console.log(chalk.gray('Cloudflare Workers will host your backend API at the edge for fast global performance.'));
  console.log(chalk.gray('Your frontend will be deployed to Cloudflare Pages for optimal integration.'));
  logger.newLine();

  // Check if user is authenticated with Cloudflare
  const isAuthenticated = await checkWranglerAuth();
  if (!isAuthenticated) {
    logger.info('To enable seamless deployment, we recommend authenticating with Cloudflare now.');
    const authSuccess = await authenticateWrangler();
    
    if (!authSuccess) {
      logger.warning('Cloudflare authentication skipped. You can authenticate later by running:');
      console.log(chalk.cyan('  cd server && wrangler login'));
      logger.newLine();
    }
  } else {
    logger.success('Already authenticated with Cloudflare ✓');
  }

  // Generate default worker name based on project name
  const defaultWorkerName = `${projectName}-api`;

  const { workerName } = await inquirer.prompt([
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