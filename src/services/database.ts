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

export async function setupDatabase(databasePreference?: string, fastMode = false, projectName?: string): Promise<DatabaseConfig> {
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
  } else if (fastMode) {
    provider = 'neon'; // Default to Neon in fast mode
    logger.info('Using Neon as database provider (fast mode default)');
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
      return await setupNeonDatabase(fastMode, projectName);
    case 'supabase':
      // Import and use the dedicated Supabase service
      const { setupSupabaseDatabase } = await import('./supabase.js');
      return await setupSupabaseDatabase(fastMode, projectName);
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

async function isNeonAuthenticated(): Promise<boolean> {
  try {
    // Check if already authenticated
    const { stdout } = await execNeonctl(['me'], { stdio: 'pipe' });
    return stdout.includes('@');
  } catch (error) {
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

async function createNeonProject(baseName: string): Promise<NeonProject | null> {
  let projectName = baseName;
  let attempt = 0;

  while (attempt < 10) { // Limit attempts to avoid infinite loop
    const spinner = ora(`Creating new Neon project "${projectName}"...`).start();
    
    try {
      const { stdout } = await execNeonctl(['projects', 'create', '--output', 'json', '--name', projectName], { stdio: 'pipe' });
      const project = JSON.parse(stdout).project;
      spinner.succeed(`Project "${projectName}" created successfully!`);
      return project;
    } catch (error) {
      spinner.stop();
      
      // Check if it's a name conflict error
      if (error instanceof Error && (error.message.includes('already exists') || error.message.includes('name is taken'))) {
        attempt++;
        projectName = `${baseName}-${attempt}`;
        logger.debug(`Project name "${baseName}" exists, trying "${projectName}"`);
        continue;
      }
      
      // Other error, fail immediately
      spinner.fail('Failed to create project');
      logger.debug(`Project creation error: ${error}`);
      return null;
    }
  }
  
  logger.warning('Failed to create project after multiple attempts');
  return null;
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

async function setupNeonDatabase(fastMode = false, projectName?: string): Promise<DatabaseConfig> {
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
  const isAuthenticated = await isNeonAuthenticated();
  if (!isAuthenticated) {
    logger.warning('Neon authentication failed. Using manual setup instead.');
    return await setupNeonDatabaseManual();
  }

  // List existing projects
  const spinner = ora('Loading your Neon projects...').start();
  const projects = await listNeonProjects();
  spinner.stop();

  if (projects.length === 0 || fastMode) {
    if (projects.length === 0) {
      console.log(chalk.yellow('No existing Neon projects found.'));
    } else if (fastMode) {
      console.log(chalk.blue('Creating new Neon project (fast mode)...'));
    }
    logger.newLine();
    
    let dbProjectName: string;
    
    if (fastMode) {
      // Use project name in fast mode
      dbProjectName = `${projectName || 'volo-app'}-db`;
    } else {
      const response = await inquirer.prompt([
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
      dbProjectName = response.projectName;
    }

    const newProject = await createNeonProject(dbProjectName);
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

  // Declare projectId at function scope
  let projectId: string;

  // User has existing projects but not in fast mode
  if (!fastMode) {
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

    if (selectedProject === 'new') {
      const { dbProjectName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'dbProjectName',
          message: 'Enter a name for your new Neon project:',
          default: `${projectName || 'volo-app'}-db`,
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

      const newProject = await createNeonProject(dbProjectName);
      if (!newProject) {
        logger.warning('Failed to create new project. Using manual setup instead.');
        return await setupNeonDatabaseManual();
      }
      projectId = newProject.id;
    } else {
      projectId = selectedProject;
    }
  } else {
    // Fast mode: create new project even if existing ones exist
    const dbProjectName = `${projectName || 'volo-app'}-db`;
    
    const newProject = await createNeonProject(dbProjectName);
    if (!newProject) {
      logger.warning('Failed to create new project. Using manual setup instead.');
      return await setupNeonDatabaseManual();
    }
    projectId = newProject.id;
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