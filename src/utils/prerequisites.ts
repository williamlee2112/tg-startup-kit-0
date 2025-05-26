import { execa } from 'execa';
import which from 'which';
import semver from 'semver';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from './logger.js';

interface Prerequisite {
  name: string;
  command: string;
  version?: string;
  minVersion?: string;
  installUrl: string;
  description: string;
  checkVersion?: (output: string) => string | null;
  optional?: boolean;
}

const corePrerequisites: Prerequisite[] = [
  {
    name: 'Node.js',
    command: 'node',
    version: '--version',
    minVersion: '18.0.0',
    installUrl: 'https://nodejs.org/',
    description: 'JavaScript runtime required for the CLI and development',
    checkVersion: (output) => output.replace('v', '').trim()
  },
  {
    name: 'pnpm',
    command: 'pnpm',
    version: '--version',
    minVersion: '8.0.0',
    installUrl: 'https://pnpm.io/installation',
    description: 'Fast, disk space efficient package manager',
    checkVersion: (output) => output.trim()
  },
  {
    name: 'Git',
    command: 'git',
    version: '--version',
    installUrl: 'https://git-scm.com/downloads',
    description: 'Version control system to clone the template',
    checkVersion: (output) => {
      const match = output.match(/git version (\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    }
  },
  {
    name: 'Firebase CLI',
    command: 'firebase',
    version: '--version',
    minVersion: '12.0.0',
    installUrl: 'https://firebase.google.com/docs/cli#install_the_firebase_cli',
    description: 'Firebase command line tools for authentication and project setup',
    checkVersion: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    }
  },
  {
    name: 'Wrangler CLI',
    command: 'wrangler',
    version: '--version',
    minVersion: '3.0.0',
    installUrl: 'https://developers.cloudflare.com/workers/wrangler/install-and-update/',
    description: 'Cloudflare Workers CLI for deployment and local development',
    checkVersion: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    }
  }
];

const databasePrerequisites: Record<string, Prerequisite> = {
  neon: {
    name: 'Neon CLI',
    command: 'skip',
    version: 'neonctl --version',
    installUrl: 'https://neon.tech/docs/reference/neon-cli',
    description: 'Neon CLI for managing PostgreSQL databases (installed via npx)',
    optional: true,
    checkVersion: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    }
  },
  supabase: {
    name: 'Supabase CLI',
    command: 'supabase',
    version: '--version',
    installUrl: 'https://supabase.com/docs/guides/cli',
    description: 'Supabase CLI for managing PostgreSQL databases',
    optional: true,
    checkVersion: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    }
  }
};

async function checkNetworkConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    await fetch('https://www.google.com', {
      signal: controller.signal,
      method: 'HEAD'
    });
    
    clearTimeout(timeoutId);
    return true;
  } catch {
    return false;
  }
}

async function checkDatabaseChoice(): Promise<string | null> {
  logger.info('To provide better setup experience, which database provider do you plan to use?');
  logger.newLine();

  const { provider } = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Database provider preference:',
      choices: [
        { 
          name: 'Neon', 
          value: 'neon',
          short: 'Neon'
        },
        { 
          name: 'Supabase', 
          value: 'supabase',
          short: 'Supabase'
        },
        { 
          name: 'Other PostgreSQL provider (I have a connection string)', 
          value: 'other',
          short: 'Other'
        },
        {
          name: 'Skip database CLI check (I\'ll set up manually)',
          value: 'skip',
          short: 'Skip'
        }
      ]
    }
  ]);

  return provider === 'skip' ? null : provider;
}

async function checkPrerequisite(prereq: Prerequisite): Promise<{ status: 'ok' | 'missing' | 'outdated', currentVersion?: string | null }> {
  try {
    // Check if command exists
    if (prereq.command === 'skip') {
      // Skip this check (used for npx tools when running inside npx)
      return { status: 'ok', currentVersion: 'available via npx' };
    } else if (prereq.command === 'npx') {
      // Special handling for npx commands with timeout to prevent hanging
      const versionArgs = prereq.version?.split(' ') || ['--version'];
      
      // Add timeout for npx commands to prevent hanging when running inside npx
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const { stdout } = await execa('npx', versionArgs, { 
          stdio: 'pipe',
          signal: controller.signal,
          timeout: 10000
        });
        clearTimeout(timeoutId);
        
        const currentVersion = prereq.checkVersion ? prereq.checkVersion(stdout) : stdout.trim();
        
        if (currentVersion && prereq.minVersion && !semver.gte(currentVersion, prereq.minVersion)) {
          return { status: 'outdated', currentVersion };
        }
        return { status: 'ok', currentVersion };
      } catch (error) {
        clearTimeout(timeoutId);
        // If npx command fails (common when running inside npx), treat as missing but optional
        logger.debug(`npx command failed: ${error}`);
        return { status: 'missing' };
      }
    } else {
      const commandPath = await which(prereq.command);
      logger.debug(`Found ${prereq.name} at: ${commandPath}`);

      // Check version if specified
      if (prereq.version) {
        const { stdout } = await execa(prereq.command, [prereq.version]);
        const currentVersion = prereq.checkVersion ? prereq.checkVersion(stdout) : stdout.trim();

        if (currentVersion) {
          logger.debug(`${prereq.name} version: ${currentVersion}`);

          if (prereq.minVersion && !semver.gte(currentVersion, prereq.minVersion)) {
            return { status: 'outdated', currentVersion };
          }
          return { status: 'ok', currentVersion };
        }
      }
      return { status: 'ok' };
    }
  } catch (error) {
    logger.debug(`${prereq.name} not found: ${error}`);
    return { status: 'missing' };
  }
}

export async function checkPrerequisites(): Promise<{ databasePreference?: string }> {
  logger.step('Checking prerequisites...');
  logger.newLine();

  // Check network connectivity first
  logger.info('Checking network connectivity...');
  const hasNetwork = await checkNetworkConnectivity();
  if (!hasNetwork) {
    logger.warning('No internet connection detected. Some features may not work properly.');
    logger.info('Please ensure you have a stable internet connection and try again.');
    
    const { continueOffline } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueOffline',
        message: 'Continue anyway? (You can set up services manually later)',
        default: false
      }
    ]);

    if (!continueOffline) {
      process.exit(1);
    }
  } else {
    logger.success('Network connectivity ✓');
  }

  // Check database preference for CLI validation
  const databaseChoice = await checkDatabaseChoice();
  
  // Build prerequisites list
  const prerequisites = [...corePrerequisites];
  if (databaseChoice && databasePrerequisites[databaseChoice]) {
    prerequisites.push(databasePrerequisites[databaseChoice]);
  }

  logger.newLine();
  logger.info('Checking required tools...');
  logger.newLine();

  const missing: Prerequisite[] = [];
  const outdated: { prereq: Prerequisite; currentVersion: string }[] = [];

  for (const prereq of prerequisites) {
    const result = await checkPrerequisite(prereq);
    
    switch (result.status) {
      case 'ok':
        logger.success(`${prereq.name} ${result.currentVersion || ''} ✓`);
        break;
      case 'missing':
        if (prereq.optional) {
          logger.warning(`${prereq.name} not found (optional - can be installed later)`);
        } else {
          missing.push(prereq);
        }
        break;
      case 'outdated':
        outdated.push({ prereq, currentVersion: result.currentVersion! });
        break;
    }
  }

  // Handle missing prerequisites
  if (missing.length > 0) {
    logger.newLine();
    logger.error('Missing required tools:');
    logger.newLine();

    for (const prereq of missing) {
      console.log(chalk.red(`❌ ${prereq.name}`));
      console.log(chalk.gray(`   ${prereq.description}`));
      console.log(chalk.blue(`   Install: ${prereq.installUrl}`));
      console.log('');
    }

    const { shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldContinue',
        message: 'Would you like to continue anyway? (Not recommended)',
        default: false
      }
    ]);

    if (!shouldContinue) {
      logger.info('Please install the missing tools and run create-volo-app again.');
      process.exit(1);
    }
  }

  // Handle outdated prerequisites
  if (outdated.length > 0) {
    logger.newLine();
    logger.warning('Outdated tools detected:');
    logger.newLine();

    for (const { prereq, currentVersion } of outdated) {
      console.log(chalk.yellow(`⚠️  ${prereq.name} ${currentVersion} (minimum: ${prereq.minVersion})`));
      console.log(chalk.gray(`   ${prereq.description}`));
      console.log(chalk.blue(`   Update: ${prereq.installUrl}`));
      console.log('');
    }

    const { shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldContinue',
        message: 'Would you like to continue with outdated tools? (May cause issues)',
        default: false
      }
    ]);

    if (!shouldContinue) {
      logger.info('Please update the outdated tools and run create-volo-app again.');
      process.exit(1);
    }
  }

  logger.newLine();
  logger.success('Prerequisites check completed!');
  logger.newLine();

  return { databasePreference: databaseChoice || undefined };
} 