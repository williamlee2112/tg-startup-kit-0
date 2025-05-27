import { execa } from 'execa';
import which from 'which';
import semver from 'semver';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
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
  canInstallLocally?: boolean;
  npmPackage?: string;
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
    },
    canInstallLocally: true,
    npmPackage: 'firebase-tools'
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
    },
    canInstallLocally: true,
    npmPackage: 'wrangler'
  }
];

const databasePrerequisites: Record<string, Prerequisite> = {
  neon: {
    name: 'Neon CLI',
    command: 'skip',
    version: 'skip',
    installUrl: 'https://neon.tech/docs/reference/neon-cli',
    description: 'Neon CLI for managing PostgreSQL databases (bundled with create-volo-app)',
    optional: true,
    checkVersion: () => 'bundled'
  },
  supabase: {
    name: 'Supabase CLI',
    command: 'supabase',
    version: '--version',
    installUrl: 'https://supabase.com/docs/guides/cli',
    description: 'Supabase CLI for managing PostgreSQL databases',
    optional: true,
    canInstallLocally: true,
    npmPackage: 'supabase',
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

async function installCliTool(prereq: Prerequisite): Promise<boolean> {
  if (!prereq.canInstallLocally || !prereq.npmPackage) {
    return false;
  }

  const spinner = ora(`Installing ${prereq.name}...`).start();
  
  try {
    // Install locally to avoid permission issues and global namespace pollution
    await execa('npm', ['install', prereq.npmPackage, '--no-save'], {
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    spinner.succeed(`${prereq.name} installed locally`);
    return true;
  } catch (error) {
    spinner.fail(`Failed to install ${prereq.name}`);
    logger.debug(`Installation error: ${error}`);
    return false;
  }
}

async function checkLocalCliTool(prereq: Prerequisite): Promise<{ status: 'ok' | 'missing', currentVersion?: string | null }> {
  if (!prereq.canInstallLocally || !prereq.npmPackage) {
    return { status: 'missing' };
  }

  // Skip npx check for bundled dependencies to avoid nested npx calls
  if (prereq.command === 'skip') {
    return { status: 'ok', currentVersion: 'bundled' };
  }

  try {
    // Try to run the locally installed CLI tool via npx
    const { stdout } = await execa('npx', [prereq.command, prereq.version || '--version'], {
      stdio: 'pipe',
      timeout: 10000
    });
    
    const currentVersion = prereq.checkVersion ? prereq.checkVersion(stdout) : stdout.trim();
    
    if (currentVersion && prereq.minVersion && !semver.gte(currentVersion, prereq.minVersion)) {
      return { status: 'missing' }; // Treat outdated local version as missing
    }
    
    return { status: 'ok', currentVersion };
  } catch (error) {
    logger.debug(`Local ${prereq.name} check failed: ${error}`);
    return { status: 'missing' };
  }
}

async function checkDatabaseChoice(): Promise<string | null> {
  console.log(chalk.cyan.bold('👋 Welcome! Let\'s build your full-stack app.'));
  logger.newLine();
  console.log(chalk.white('You\'ll need accounts with Firebase, Cloudflare, and a database provider.'));
  console.log(chalk.white('Let\'s start with your database choice:'));
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

async function checkPrerequisite(prereq: Prerequisite): Promise<{ status: 'ok' | 'missing' | 'outdated' | 'installed_locally', currentVersion?: string | null }> {
  try {
    // Handle bundled dependencies that don't need CLI checks
    if (prereq.command === 'skip' && prereq.version === 'skip') {
      return { status: 'ok', currentVersion: 'bundled' };
    }
    
    // First, check if command exists globally
    if (prereq.command === 'skip') {
      return { status: 'ok', currentVersion: 'available via npx' };
    }

    // Try to find global installation
    let globalFound = false;
    let globalVersion: string | null = null;
    
    try {
      const commandPath = await which(prereq.command);
      logger.debug(`Found ${prereq.name} globally at: ${commandPath}`);
      globalFound = true;

      // Check version if specified
      if (prereq.version) {
        const { stdout } = await execa(prereq.command, [prereq.version]);
        globalVersion = prereq.checkVersion ? prereq.checkVersion(stdout) : stdout.trim();

        if (globalVersion) {
          logger.debug(`Global ${prereq.name} version: ${globalVersion}`);

          if (prereq.minVersion && !semver.gte(globalVersion, prereq.minVersion)) {
            // Global version is outdated, check if we can use/install local version
            if (prereq.canInstallLocally) {
              const localResult = await checkLocalCliTool(prereq);
              if (localResult.status === 'ok') {
                return { status: 'installed_locally', currentVersion: localResult.currentVersion };
              }
              // Will offer to install locally below
            } else {
              return { status: 'outdated', currentVersion: globalVersion };
            }
          } else {
            return { status: 'ok', currentVersion: globalVersion };
          }
        }
      } else {
        return { status: 'ok' };
      }
    } catch (error) {
      logger.debug(`${prereq.name} not found globally: ${error}`);
      globalFound = false;
    }

    // If global not found or outdated, check for local installation
    if (prereq.canInstallLocally) {
      const localResult = await checkLocalCliTool(prereq);
      if (localResult.status === 'ok') {
        return { status: 'installed_locally', currentVersion: localResult.currentVersion };
      }
    }

    // Neither global nor local found
    return { status: 'missing' };
    
  } catch (error) {
    logger.debug(`${prereq.name} check failed: ${error}`);
    return { status: 'missing' };
  }
}

interface PrerequisiteOptions {
  autoInstall?: boolean;
  databasePreference?: string;
  fastMode?: boolean;
}

export async function checkPrerequisites(options: PrerequisiteOptions = {}): Promise<{ databasePreference?: string }> {
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
  }

  // Check database preference for CLI validation
  let databaseChoice: string | null;
  
  if (options.databasePreference) {
    // Use provided database preference
    databaseChoice = options.databasePreference;
    logger.info(`Using database provider: ${databaseChoice}`);
  } else if (options.fastMode) {
    // Default to Neon in fast mode
    databaseChoice = 'neon';
    logger.info('Fast mode: Using Neon as database provider');
  } else {
    // Ask user for preference
    databaseChoice = await checkDatabaseChoice();
  }
  
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
      case 'installed_locally':
        logger.success(`${prereq.name} ${result.currentVersion || ''} ✓ (installed locally)`);
        break;
    }
  }

  // Handle missing prerequisites
  if (missing.length > 0) {
    logger.newLine();
    
    // Separate missing tools into those that can be installed locally vs those that need manual installation
    const canInstallLocally = missing.filter(p => p.canInstallLocally);
    const needManualInstall = missing.filter(p => !p.canInstallLocally);
    
    if (canInstallLocally.length > 0) {
      logger.info('Missing CLI tools that can be installed automatically:');
      logger.newLine();
      
      for (const prereq of canInstallLocally) {
        console.log(chalk.yellow(`⚠️  ${prereq.name}`));
        console.log(chalk.gray(`   ${prereq.description}`));
        console.log('');
      }
      
      let shouldInstallLocally = options.autoInstall || false;
      
      if (!options.autoInstall) {
        const response = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'shouldInstallLocally',
            message: 'Install missing tools automatically? (Recommended)',
            default: true
          }
        ]);
        shouldInstallLocally = response.shouldInstallLocally;
      }
      
      if (shouldInstallLocally) {
        logger.newLine();
        logger.info('Installing CLI tools...');
        logger.newLine();
        
        const failedInstalls: Prerequisite[] = [];
        
        for (const prereq of canInstallLocally) {
          const success = await installCliTool(prereq);
          if (!success) {
            failedInstalls.push(prereq);
          }
        }
        
        if (failedInstalls.length === 0) {
          logger.newLine();
          logger.success('All CLI tools installed locally! ✨');
        } else {
          logger.newLine();
          logger.warning(`Some tools couldn't be installed automatically:`);
          for (const prereq of failedInstalls) {
            console.log(chalk.yellow(`  • ${prereq.name}`));
          }
          needManualInstall.push(...failedInstalls);
        }
      } else {
        logger.info('Skipping automatic installation.');
        needManualInstall.push(...canInstallLocally);
      }
    }
    
    if (needManualInstall.length > 0) {
      if (canInstallLocally.length > 0) {
        logger.newLine();
      }
      logger.error('Tools requiring manual installation:');
      logger.newLine();

      for (const prereq of needManualInstall) {
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