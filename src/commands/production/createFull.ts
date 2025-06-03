import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../../utils/logger.js';
import { cloneTemplate } from '../../utils/template.js';
import { setupCloudflare } from '../../services/cloudflare.js';
import { generateConfigFiles } from '../../utils/config.js';
import { execPnpm, execPnpmDetached } from '../../utils/cli.js';
import { CreateOptions, ProjectConfig } from '../shared/types.js';
import { getProjectName, validateAndPrepareDirectory } from '../shared/project.js';
import { askToStartDevelopmentServer } from '../shared/prompts.js';
import { checkAuthenticationStatus, handleBatchAuthentication } from './authentication.js';
import { setupFirebaseWithRetry, setupDatabaseWithRetry } from './serviceSetup.js';

export async function createAppFull(projectName: string | undefined, options: CreateOptions): Promise<void> {
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

  // Step 3: Handle authentication and configuration
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

  // Step 4: Generate configuration files
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

  // Step 5: Run post-setup
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
    await execPnpm(['post-setup'], { 
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

  // Step 6: Success message
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
  console.log(chalk.cyan('   pnpm run dev'));
  
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
  const startNow = await askToStartDevelopmentServer();

  if (startNow) {
    logger.newLine();
    console.log(chalk.green('🚀 Starting your volo-app...'));
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
      if (config.firebase.projectId !== 'demo-project') {
        console.log(chalk.white(`  • Firebase Console: https://console.firebase.google.com/project/${config.firebase.projectId}`));
      }
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
    logger.newLine();
    console.log(chalk.gray('When you\'re ready to start developing:'));
    console.log(chalk.cyan(`   cd ${name}`));
    console.log(chalk.cyan('   pnpm run dev'));
  }
} 