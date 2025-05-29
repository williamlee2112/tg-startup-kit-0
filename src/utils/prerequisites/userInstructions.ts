import chalk from 'chalk';
import inquirer from 'inquirer';
import type { Prerequisite } from './types.js';
import { logger } from '../logger.js';

export async function checkDatabaseChoice(): Promise<string | null> {
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

export async function getGitInstallInstructions(): Promise<string> {
  const platform = process.platform;
  
  switch (platform) {
    case 'win32':
      return `Windows:
  • Download from: https://git-scm.com/download/win
  • Or use package manager:
    - winget install Git.Git
    - choco install git (if you have Chocolatey)
    - scoop install git (if you have Scoop)`;
    
    case 'darwin':
      return `macOS:
  • Download from: https://git-scm.com/download/mac
  • Or use Homebrew: brew install git
  • Or install Xcode Command Line Tools: xcode-select --install`;
    
    case 'linux':
      return `Linux:
  • Ubuntu/Debian: sudo apt update && sudo apt install git
  • RedHat/CentOS: sudo yum install git
  • Fedora: sudo dnf install git
  • Arch: sudo pacman -S git`;
    
    default:
      return `Install Git from: https://git-scm.com/downloads`;
  }
}

export async function displayManualInstallInstructions(systemTools: Prerequisite[]): Promise<boolean> {
  logger.newLine();
  console.log(chalk.cyan.bold('🔧 Manual Installation Required'));
  logger.newLine();
  
  console.log(chalk.white('The following tools need to be installed manually:'));
  logger.newLine();

  for (const prereq of systemTools) {
    console.log(chalk.yellow(`⚠️  ${prereq.name}`));
    console.log(chalk.gray(`   ${prereq.description}`));
    
    if (prereq.name === 'Git') {
      const instructions = await getGitInstallInstructions();
      console.log(chalk.cyan(instructions));
    } else {
      console.log(chalk.blue(`   Install from: ${prereq.installUrl}`));
    }
    console.log('');
  }

  console.log(chalk.white('After installation:'));
  console.log(chalk.white('1. Restart your terminal to refresh PATH'));
  console.log(chalk.white('2. Verify installation by running: node test/verify-setup.js'));
  console.log(chalk.white('3. Or manually check with --version commands'));
  logger.newLine();

  const { readyToContinue } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'readyToContinue',
      message: 'Have you installed the required tools and are ready to continue?',
      default: false
    }
  ]);

  if (!readyToContinue) {
    const { whatNext } = await inquirer.prompt([
      {
        type: 'list',
        name: 'whatNext',
        message: 'What would you like to do?',
        choices: [
          {
            name: 'Exit and install tools manually (recommended)',
            value: 'exit'
          },
          {
            name: 'Continue anyway (may cause errors)',
            value: 'continue'
          },
          {
            name: 'Re-check for installed tools',
            value: 'recheck'
          }
        ]
      }
    ]);

    if (whatNext === 'exit') {
      logger.info('Please install the required tools and run create-volo-app again.');
      process.exit(0);
    } else if (whatNext === 'recheck') {
      return false; // Signal to re-run the check
    }
    // If 'continue', fall through to return true
  }

  return true;
} 