import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../../utils/logger.js';
import { cloneTemplate } from '../../utils/template.js';
import { execPnpm, execPnpmDetached } from '../../utils/cli.js';
import { CreateOptions } from '../shared/types.js';
import { getProjectName, validateAndPrepareDirectory } from '../shared/project.js';
import { askToStartDevelopmentServer } from '../shared/prompts.js';
import { generateLocalConfigFiles } from './localConfig.js';

export async function createAppLocal(projectName: string | undefined, options: CreateOptions): Promise<void> {
  // Get project name
  const name = await getProjectName(projectName);
  const directory = await validateAndPrepareDirectory(name);

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

  // Step 2: Install dependencies
  const installSpinner = ora({
    text: 'Installing dependencies...',
    spinner: 'line'
  }).start();
  
  try {
    await execPnpm(['install'], { 
      cwd: directory, 
      stdio: options.verbose ? 'inherit' : 'pipe' 
    });
    installSpinner.succeed('Dependencies installed successfully');
  } catch (error) {
    installSpinner.fail('Failed to install dependencies');
    throw error;
  }

  // Step 3: Generate local config files
  const configSpinner = ora({
    text: 'Setting up local development environment...',
    spinner: 'line'
  }).start();
  
  try {
    // Generate basic config files for local development
    await generateLocalConfigFiles(name, directory);
    configSpinner.succeed('Local configuration generated');
  } catch (error) {
    configSpinner.fail('Failed to generate local configuration');
    throw error;
  }

  // Step 4: Run setup-local.js
  const setupSpinner = ora({
    text: 'Initializing local services...',
    spinner: 'line'
  }).start();
  
  try {
    await execPnpm(['run', 'setup:local'], { 
      cwd: directory, 
      stdio: options.verbose ? 'inherit' : 'pipe' 
    });
    setupSpinner.succeed('Local services initialized successfully');
  } catch (error) {
    setupSpinner.fail('Local services initialization encountered issues');
    logger.warning('You can run it manually later with: pnpm run setup:local');
  }

  // Step 5: Success message for local development
  logger.newLine();
  logger.success('🎉 Your local volo-app is ready for development!');
  logger.newLine();
  
  console.log(chalk.cyan.bold('🚀 What you got:'));
  console.log(chalk.white('  • React + TypeScript + Tailwind CSS + ShadCN frontend'));
  console.log(chalk.white('  • Hono API backend running locally'));
  console.log(chalk.white('  • Firebase Auth emulator (no login required)'));
  console.log(chalk.white('  • Embedded PostgreSQL database'));
  console.log(chalk.white('  • Hot reload for instant development'));
  logger.newLine();
  
  console.log(chalk.green.bold('▶️  Next steps:'));
  console.log(chalk.cyan(`   cd ${name}`));
  console.log(chalk.cyan('   pnpm run dev'));
  logger.newLine();
  
  console.log(chalk.blue.bold('🌐 Local URLs:'));
  console.log(chalk.white('  • Frontend: http://localhost:5173'));
  console.log(chalk.white('  • Backend API: http://localhost:8787'));
  console.log(chalk.white('  • Firebase Emulator UI: http://localhost:4000'));
  logger.newLine();
  
  console.log(chalk.yellow.bold('🔄 Ready for production?'));
  console.log(chalk.white('  Use these commands to connect production services:'));
  console.log(chalk.cyan('   pnpm connect:auth     # Connect Firebase Auth'));
  console.log(chalk.cyan('   pnpm connect:database # Connect production database'));
  console.log(chalk.cyan('   pnpm connect:deploy   # Setup Cloudflare deployment'));
  logger.newLine();
  
  // Ask if user wants to start the app now
  const startNow = await askToStartDevelopmentServer();

  if (startNow) {
    logger.newLine();
    console.log(chalk.green('🚀 Starting your local volo-app...'));
    logger.newLine();
    
    try {
      // Start the dev server in detached mode so CLI can exit cleanly
      await execPnpmDetached(['run', 'dev'], { 
        cwd: directory
      });
      
      logger.newLine();
      logger.success('✅ Development server started successfully!');
      logger.info('The server is now running in the background.');
      logger.info('You can close this terminal - the dev server will continue running.');
      logger.newLine();
      console.log(chalk.blue.bold('🌐 Your app should open automatically in your browser at:'));
      console.log(chalk.white('  • Frontend: http://localhost:5173'));
      console.log(chalk.white('  • Backend API: http://localhost:8787'));
      console.log(chalk.white('  • Firebase Emulator UI: http://localhost:4000'));
      logger.newLine();
      console.log(chalk.yellow('💡 To stop the server later, use Ctrl+C in the terminal where it\'s running.'));
      
    } catch (error) {
      logger.error('Failed to start the development server');
      logger.info('You can start it manually by running:');
      console.log(chalk.cyan(`   cd ${name}`));
      console.log(chalk.cyan('   pnpm run dev'));
    }
  } else {
    console.log(chalk.blue('📚 Need help? Check the README.md in your project directory'));
  }
} 