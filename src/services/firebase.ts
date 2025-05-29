import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { validateFirebaseProjectId } from '../utils/validation.js';
import { execFirebase } from '../utils/cli.js';

interface FirebaseConfig {
  projectId: string;
  apiKey: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
}

export async function setupFirebase(fastMode = false, projectName?: string): Promise<FirebaseConfig> {
  logger.newLine();
  console.log(chalk.yellow.bold('🔐 Setting up Firebase Authentication'));
  console.log(chalk.white('Firebase handles secure user login/signup for your app.'));
  console.log(chalk.white('This includes Google Sign-In, password reset, and user management.'));
  logger.newLine();

  // Check if user is logged into Firebase
  const isLoggedIn = await checkFirebaseAuth();
  if (!isLoggedIn) {
    logger.warning('Firebase authentication required. Please authenticate first.');
    throw new Error('Firebase authentication required');
  }

  let projectId: string;

  if (fastMode) {
    // In fast mode, always create a new project with project name
    projectId = await createFirebaseProjectFast(projectName || 'volo-app');
  } else {
    // Choose between creating new project or using existing
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Would you like to create a new Firebase project or use an existing one?',
        choices: [
          { name: 'Create a new Firebase project', value: 'create' },
          { name: 'Use an existing Firebase project', value: 'existing' }
        ]
      }
    ]);

    if (action === 'create') {
      projectId = await createFirebaseProject();
    } else {
      projectId = await selectExistingProject();
    }
  }

  // Set up authentication (skip Google Sign-In in fast mode)
  if (!fastMode) {
    await setupFirebaseAuth(projectId);
  }

  // Create and configure web app
  const webAppConfig = await createWebApp(projectId);

  logger.success('Firebase setup completed!');
  logger.newLine();

  return webAppConfig;
}

async function checkFirebaseAuth(): Promise<boolean> {
  try {
    const { stdout } = await execFirebase(['login:list']);
    return stdout.includes('@');
  } catch {
    return false;
  }
}

async function createFirebaseProjectFast(baseProjectName: string): Promise<string> {
  // Sanitize project name for Firebase (lowercase, hyphens only)
  const sanitizedName = baseProjectName.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-').replace(/^-|-$/g, '');
  let projectId = sanitizedName;
  let displayName = baseProjectName;
  let attempt = 0;

  while (attempt < 10) { // Limit attempts to avoid infinite loop
    const spinner = ora(`Creating Firebase project "${projectId}"...`).start();

    try {
      await execFirebase(['projects:create', projectId, '--display-name', displayName]);
      spinner.succeed(`Firebase project "${projectId}" created successfully`);
      return projectId;
    } catch (error) {
      spinner.stop();
      
      // If project ID already exists, try with a number suffix
      if (error instanceof Error && error.message.includes('already exists')) {
        attempt++;
        projectId = `${sanitizedName}-${attempt}`;
        displayName = `${baseProjectName} ${attempt}`;
        logger.debug(`Project ID "${sanitizedName}" exists, trying "${projectId}"`);
        continue;
      }
      
      // Other error, fail immediately
      spinner.fail('Failed to create Firebase project');
      throw new Error(`Failed to create Firebase project: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  throw new Error('Failed to create Firebase project after multiple attempts');
}

async function createFirebaseProject(): Promise<string> {
  const { projectId } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectId',
      message: 'Enter a project ID for your new Firebase project:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Project ID is required';
        }
        if (!validateFirebaseProjectId(input)) {
          return 'Project ID must be 6-30 characters, lowercase letters, numbers, and hyphens only, start with letter';
        }
        return true;
      }
    }
  ]);

  const { displayName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'displayName',
      message: 'Enter a display name for your project:',
      default: projectId
    }
  ]);

  const spinner = ora(`Creating Firebase project "${projectId}"...`).start();

  try {
    await execFirebase(['projects:create', projectId, '--display-name', displayName]);
    spinner.succeed(`Firebase project "${projectId}" created successfully`);
    return projectId;
  } catch (error) {
    spinner.fail('Failed to create Firebase project');
    
    // Check if project ID already exists
    if (error instanceof Error && error.message.includes('already exists')) {
      logger.warning(`Project ID "${projectId}" already exists. Please choose a different one.`);
      return await createFirebaseProject();
    }
    
    throw new Error(`Failed to create Firebase project: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function selectExistingProject(): Promise<string> {
  const spinner = ora('Fetching your Firebase projects...').start();
  
  try {
    const { stdout } = await execFirebase(['projects:list', '-j']);
    const response = JSON.parse(stdout);
    
    // Extract projects from the nested response
    const projects = response.result;
    
    spinner.stop();
    
    if (!projects || projects.length === 0) {
      logger.info('No existing Firebase projects found. Let\'s create a new one.');
      return await createFirebaseProject();
    }
    
    const { projectId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'projectId',
        message: 'Select a Firebase project:',
        choices: projects.map((project: any) => ({
          name: `${project.displayName || project.projectId} (${project.projectId})`,
          value: project.projectId
        }))
      }
    ]);
    
    return projectId;
  } catch (error) {
    spinner.fail('Failed to fetch Firebase projects');
    throw new Error(`Failed to fetch projects: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function setupFirebaseAuth(projectId: string): Promise<void> {
  logger.info('Setting up Firebase Authentication...');
  logger.newLine();

  console.log(chalk.gray('Firebase Authentication provides secure user login for your app.'));
  console.log(chalk.gray('We recommend setting up Google Sign-In as it\'s the most popular option.'));
  logger.newLine();

  const { setupGoogleAuth } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'setupGoogleAuth',
      message: 'Would you like to set up Google Sign-In now?',
      default: true
    }
  ]);

  if (!setupGoogleAuth) {
    logger.info('Skipping Google Sign-In setup. You can configure authentication later.');
    console.log(chalk.blue('📚 To set up authentication later:'));
    console.log(chalk.gray('1. Go to: https://console.firebase.google.com/project/' + projectId + '/authentication/providers'));
    console.log(chalk.gray('2. Choose your preferred authentication methods'));
    console.log(chalk.gray('3. Follow the setup instructions for each provider'));
    logger.newLine();
    return;
  }

  // Provide step-by-step Google Sign-In setup
  logger.info('Setting up Google Sign-In...');
  logger.newLine();

  console.log(chalk.yellow('📋 Please follow these steps in your browser:'));
  console.log(chalk.blue('1. Open Firebase Console:'));
  console.log(chalk.cyan(`   https://console.firebase.google.com/project/${projectId}/authentication/providers`));
  logger.newLine();

  console.log(chalk.blue('2. Enable Google Sign-In:'));
  console.log(chalk.gray('   • Click on "Google" in the Sign-in providers list'));
  console.log(chalk.gray('   • Toggle the "Enable" switch'));
  console.log(chalk.gray('   • Enter a project support email (your email)'));
  console.log(chalk.gray('   • Click "Save"'));
  logger.newLine();

  console.log(chalk.blue('3. Configure authorized domains (for deployment):'));
  console.log(chalk.gray('   • Go to Authentication > Settings > Authorized domains'));
  console.log(chalk.gray('   • Add your domain when you deploy (e.g., your-app.pages.dev)'));
  console.log(chalk.gray('   • localhost is already authorized for development'));
  logger.newLine();

  console.log(chalk.yellow('⏳ Take your time to complete the setup in the browser...'));
  logger.newLine();

  const { completed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'completed',
      message: 'Have you completed the Google Sign-In setup in Firebase Console?',
      default: true // Default to 'yes' since they chose to set it up
    }
  ]);

  if (completed) {
    logger.success('Google Sign-In setup completed! 🎉');
    logger.newLine();
    console.log(chalk.green('✅ Your app now supports Google authentication'));
    console.log(chalk.gray('Users will be able to sign in with their Google accounts'));
  } else {
    logger.warning('Google Sign-In setup incomplete.');
    logger.info('Don\'t worry! You can complete this setup anytime by:');
    console.log(chalk.cyan('1. Going to: https://console.firebase.google.com/project/' + projectId + '/authentication/providers'));
    console.log(chalk.cyan('2. Following the steps outlined above'));
    logger.newLine();
    console.log(chalk.yellow('💡 Your app will work for development, but users won\'t be able to sign in until you complete this setup.'));
  }

  logger.newLine();
}

async function createWebApp(projectId: string): Promise<FirebaseConfig> {
  // First, check if there are existing web apps
  const existingApps = await getExistingWebApps(projectId);
  
  let appId: string;
  
  if (existingApps.length > 0) {
    logger.info(`Found ${existingApps.length} existing web app(s) in this project.`);
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Would you like to use an existing web app or create a new one?',
        choices: [
          { name: 'Use an existing web app', value: 'existing' },
          { name: 'Create a new web app', value: 'create' }
        ]
      }
    ]);
    
    if (action === 'existing') {
      const { selectedAppId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedAppId',
          message: 'Select a web app:',
          choices: existingApps.map((app: any) => ({
            name: `${app.displayName || 'Unnamed App'} (${app.appId})`,
            value: app.appId
          }))
        }
      ]);
      appId = selectedAppId;
    } else {
      appId = await createNewWebApp(projectId);
    }
  } else {
    logger.info('No existing web apps found. Creating a new one...');
    appId = await createNewWebApp(projectId);
  }
  
  // Get app configuration
  return await getWebAppConfig(projectId, appId);
}

async function getExistingWebApps(projectId: string): Promise<any[]> {
  try {
    const { stdout } = await execFirebase(['apps:list', 'WEB', '--project', projectId, '-j']);
    const response = JSON.parse(stdout);
    return response.result || [];
  } catch (error) {
    logger.debug(`Failed to fetch existing apps: ${error}`);
    return [];
  }
}

async function createNewWebApp(projectId: string): Promise<string> {
  const spinner = ora('Creating Firebase web app...').start();
  
  try {
    // Create web app (remove --json flag as it doesn't work)
    const { stdout } = await execFirebase([
      'apps:create', 
      'WEB', 
      'volo-app',
      '--project', projectId
    ]);
    
    // Try multiple patterns for different CLI versions
    const patterns = [
      /- App ID: (.+)/,
      /App ID:\s*(.+)/,
      /appId[:\s]+(.+)/i,
      /App\s+ID[:\s]+(.+)/i
    ];

    let appId: string | null = null;
    for (const pattern of patterns) {
      const match = stdout.match(pattern);
      if (match) {
        appId = match[1].trim();
        break;
      }
    }

    if (!appId) {
      logger.debug(`Firebase CLI output: ${stdout}`);
      throw new Error('Failed to extract App ID. Please check Firebase CLI output format.');
    }
    
    logger.debug(`Extracted App ID: ${appId}`);
    spinner.succeed('Firebase web app created successfully');
    
    return appId;
  } catch (error) {
    spinner.fail('Failed to create Firebase web app');
    throw error;
  }
}

async function getWebAppConfig(projectId: string, appId: string): Promise<FirebaseConfig> {
  const spinner = ora('Getting web app configuration...').start();
  
  try {
    // Get app configuration
    const { stdout: configOutput } = await execFirebase([
      'apps:sdkconfig', 
      'WEB', 
      appId,
      '--project', projectId,
      '--json'
    ]);
    
    const config = JSON.parse(configOutput);
    
    // Extract the SDK config from the nested response
    const sdkConfig = config.result?.sdkConfig;
    if (!sdkConfig) {
      throw new Error('Invalid response format from Firebase CLI');
    }
    
    spinner.succeed('Firebase web app configured');
    
    return {
      projectId: sdkConfig.projectId,
      apiKey: sdkConfig.apiKey,
      messagingSenderId: sdkConfig.messagingSenderId,
      appId: sdkConfig.appId,
      measurementId: sdkConfig.measurementId || 'G-PLACEHOLDER'
    };
    
  } catch (error) {
    spinner.fail('Failed to get web app configuration');
    throw new Error(`Failed to get web app config: ${error instanceof Error ? error.message : String(error)}`);
  }
} 