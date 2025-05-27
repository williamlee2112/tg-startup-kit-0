import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { validateUrl } from '../utils/validation.js';
import { execNeonctl } from '../utils/neonctl.js';

interface DatabaseConfig {
  url: string;
  provider: 'neon' | 'supabase' | 'other';
}

interface NeonProject {
  id: string;
  name: string;
  region_id: string;
  pg_version: number;
}

export async function setupDatabase(databasePreference?: string): Promise<DatabaseConfig> {
  logger.newLine();
  console.log(chalk.yellow.bold('🗄️  Setting up PostgreSQL Database'));
  console.log(chalk.white('Your app needs a database to store application data (posts, user profiles, etc).'));
  console.log(chalk.white('Note: This is separate from Firebase Auth - Firebase handles login, database stores your app data.'));
  logger.newLine();

  let provider: string;

  if (databasePreference && ['neon', 'supabase', 'other'].includes(databasePreference)) {
    provider = databasePreference;
    logger.info(`Using your preferred database provider: ${provider}`);
    logger.newLine();
  } else {
    const { selectedProvider } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedProvider',
        message: 'Which database provider would you like to use?',
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
          }
        ]
      }
    ]);
    provider = selectedProvider;
  }

  switch (provider) {
    case 'neon':
      return await setupNeonDatabase();
    case 'supabase':
      // Import and use the dedicated Supabase service
      const { setupSupabaseDatabase } = await import('./supabase.js');
      return await setupSupabaseDatabase();
    case 'other':
      return await setupOtherDatabase();
    default:
      throw new Error('Invalid database provider selected');
  }
}

async function checkNeonCLI(): Promise<boolean> {
  try {
    logger.debug('Checking if neonctl CLI is available...');
    await execNeonctl(['--version'], { stdio: 'pipe', timeout: 10000 }); // 10 second timeout
    logger.debug('neonctl CLI check successful');
    return true;
  } catch (error: any) {
    if (error.message.includes('neonctl is not available and could not be installed globally')) {
      logger.debug('Failed to install neonctl globally');
    } else if (error.message.includes('command timed out')) {
      logger.debug('neonctl CLI check timed out');
    } else {
      logger.debug(`neonctl CLI check failed: ${error.message}`);
    }
    return false;
  }
}

async function authenticateNeonCLI(): Promise<boolean> {
  try {
    // Check if already authenticated
    const { stdout } = await execNeonctl(['me'], { stdio: 'pipe' });
    if (stdout.includes('@')) {
      return true;
    }
  } catch (error) {
    // Not authenticated
  }

  console.log(chalk.yellow.bold('🔐 Neon Authentication Required'));
  console.log(chalk.white('We need to connect to your Neon account to create/manage your database.'));
  console.log(chalk.white('This is secure and only takes 30 seconds.'));
  logger.newLine();

  const { authenticate } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'authenticate',
      message: 'Would you like to authenticate with Neon now? (This will open your browser)',
      default: true
    }
  ]);

  if (!authenticate) {
    return false;
  }

  try {
    console.log(chalk.blue('Opening browser for Neon authentication...'));
    await execNeonctl(['auth'], { stdio: 'inherit' });
    
    // Verify authentication worked
    await execNeonctl(['me'], { stdio: 'pipe' });
    logger.success('Successfully authenticated with Neon!');
    return true;
  } catch (error) {
    logger.warning('Authentication failed or was cancelled');
    return false;
  }
}

async function listNeonProjects(): Promise<NeonProject[]> {
  try {
    const { stdout } = await execNeonctl(['projects', 'list', '--output', 'json'], { stdio: 'pipe' });
    const data = JSON.parse(stdout);
    return data.projects || [];
  } catch (error) {
    logger.debug(`Failed to list projects: ${error}`);
    return [];
  }
}

async function createNeonProject(name: string): Promise<NeonProject | null> {
  const spinner = ora('Creating new Neon project...').start();
  
  try {
    const { stdout } = await execNeonctl(['projects', 'create', '--output', 'json', '--name', name], { stdio: 'pipe' });
    const project = JSON.parse(stdout).project;
    spinner.succeed(`Project "${name}" created successfully!`);
    return project;
  } catch (error) {
    spinner.fail('Failed to create project');
    logger.debug(`Project creation error: ${error}`);
    return null;
  }
}

async function getNeonConnectionString(projectId: string): Promise<string | null> {
  try {
    const { stdout } = await execNeonctl(['connection-string', '--project-id', projectId], { stdio: 'pipe' });
    return stdout.trim();
  } catch (error) {
    logger.debug(`Failed to get connection string: ${error}`);
    return null;
  }
}

async function setupNeonDatabase(): Promise<DatabaseConfig> {
  logger.info('Setting up Neon database...');
  logger.newLine();

  // Check if Neon CLI is available with a timeout fallback
  logger.debug('Starting neonctl CLI availability check...');
  let hasNeonCLI = false;
  
  try {
    // Race between CLI check and timeout
    hasNeonCLI = await Promise.race([
      checkNeonCLI(),
      new Promise<boolean>((resolve) => {
        setTimeout(() => {
          logger.debug('CLI check timed out, falling back to manual setup');
          resolve(false);
        }, 15000); // 15 second overall timeout
      })
    ]);
  } catch (error) {
    logger.debug(`CLI check failed with error: ${error}`);
    hasNeonCLI = false;
  }
  
  if (!hasNeonCLI) {
    logger.warning('Neon CLI not available or could not be installed.');
    logger.info('This can happen when:');
    logger.info('  • npm global installation permissions are restricted');
    logger.info('  • Network connectivity issues during installation');
    logger.info('  • The neonctl package is not available in npm registry');
    logger.info('Using manual setup instead - you\'ll need to create the database yourself.');
    logger.newLine();
    return await setupNeonDatabaseManual();
  }

  logger.success('Neon CLI is available!');
  logger.newLine();

  // Authenticate with Neon
  const isAuthenticated = await authenticateNeonCLI();
  if (!isAuthenticated) {
    logger.warning('Neon authentication failed. Using manual setup instead.');
    return await setupNeonDatabaseManual();
  }

  // List existing projects
  const spinner = ora('Loading your Neon projects...').start();
  const projects = await listNeonProjects();
  spinner.stop();

  if (projects.length === 0) {
    console.log(chalk.yellow('No existing Neon projects found.'));
    logger.newLine();
    
    const { projectName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Enter a name for your new Neon project:',
        default: 'volo-app-db',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Project name is required';
          }
          if (input.length > 63) {
            return 'Project name must be 63 characters or less';
          }
          return true;
        }
      }
    ]);

    const newProject = await createNeonProject(projectName);
    if (!newProject) {
      logger.warning('Failed to create new project. Using manual setup instead.');
      return await setupNeonDatabaseManual();
    }

    const connectionString = await getNeonConnectionString(newProject.id);
    if (!connectionString) {
      logger.warning('Failed to retrieve connection string. Using manual setup instead.');
      return await setupNeonDatabaseManual();
    }

    logger.success('Neon database configured!');
    logger.newLine();

    return {
      url: connectionString,
      provider: 'neon'
    };
  }

  // User has existing projects
  console.log(chalk.green(`Found ${projects.length} existing Neon project(s)`));
  logger.newLine();

  const projectChoices = [
    ...projects.map(project => ({
      name: `${project.name} (${project.id})`,
      value: project.id,
      short: project.name
    })),
    {
      name: '+ Create a new project',
      value: 'new',
      short: 'New project'
    }
  ];

  const { selectedProject } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedProject',
      message: 'Which Neon project would you like to use?',
      choices: projectChoices
    }
  ]);

  let projectId: string;

  if (selectedProject === 'new') {
    const { projectName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Enter a name for your new Neon project:',
        default: 'volo-app-db',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Project name is required';
          }
          if (input.length > 63) {
            return 'Project name must be 63 characters or less';
          }
          return true;
        }
      }
    ]);

    const newProject = await createNeonProject(projectName);
    if (!newProject) {
      logger.warning('Failed to create new project. Using manual setup instead.');
      return await setupNeonDatabaseManual();
    }
    projectId = newProject.id;
  } else {
    projectId = selectedProject;
  }

  // Get connection string for the selected/created project
  const connectionString = await getNeonConnectionString(projectId);
  if (!connectionString) {
    logger.warning('Failed to retrieve connection string. Using manual setup instead.');
    return await setupNeonDatabaseManual();
  }

  logger.success('Neon database configured!');
  logger.newLine();

  return {
    url: connectionString,
    provider: 'neon'
  };
}

async function setupNeonDatabaseManual(): Promise<DatabaseConfig> {
  console.log(chalk.yellow('📋 Manual setup required:'));
  console.log(chalk.gray('1. Go to: https://neon.tech'));
  console.log(chalk.gray('2. Sign up for a free account (if you don\'t have one)'));
  console.log(chalk.gray('3. Create a new project'));
  console.log(chalk.gray('4. Copy the connection string from the dashboard'));
  console.log(chalk.gray('   It should look like: postgresql://user:password@host/dbname'));
  logger.newLine();

  const { hasAccount } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'hasAccount',
      message: 'Do you already have a Neon account?',
      default: false
    }
  ]);

  if (!hasAccount) {
    console.log(chalk.blue('👉 Opening Neon signup page...'));
    console.log(chalk.gray('Please create an account and return here when you have your connection string.'));
    logger.newLine();
    
    console.log(chalk.blue('Sign up at: https://neon.tech'));
    logger.newLine();
  }

  const { connectionString } = await inquirer.prompt([
    {
      type: 'input',
      name: 'connectionString',
      message: 'Enter your Neon connection string:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Connection string is required';
        }
        if (!input.startsWith('postgresql://')) {
          return 'Connection string should start with "postgresql://"';
        }
        return true;
      }
    }
  ]);

  logger.success('Neon database configured!');
  logger.newLine();

  return {
    url: connectionString,
    provider: 'neon'
  };
}

export async function setupOtherDatabase(): Promise<DatabaseConfig> {
  logger.info('Setting up custom PostgreSQL database...');
  logger.newLine();

  console.log(chalk.gray('You can use any PostgreSQL provider that gives you a connection string.'));
  console.log(chalk.gray('Popular options include:'));
  console.log(chalk.gray('  • Railway (railway.app)'));
  console.log(chalk.gray('  • PlanetScale (planetscale.com)'));
  console.log(chalk.gray('  • ElephantSQL (elephantsql.com)'));
  console.log(chalk.gray('  • Amazon RDS'));
  console.log(chalk.gray('  • Self-hosted PostgreSQL'));
  logger.newLine();

  const { connectionString } = await inquirer.prompt([
    {
      type: 'input',
      name: 'connectionString',
      message: 'Enter your PostgreSQL connection string:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Connection string is required';
        }
        if (!input.startsWith('postgresql://') && !input.startsWith('postgres://')) {
          return 'Connection string should start with "postgresql://" or "postgres://"';
        }
        return true;
      }
    }
  ]);

  logger.success('Custom PostgreSQL database configured!');
  logger.newLine();

  return {
    url: connectionString,
    provider: 'other'
  };
} 