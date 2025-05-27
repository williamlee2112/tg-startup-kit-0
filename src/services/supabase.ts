import inquirer from 'inquirer';
import chalk from 'chalk';
import { execa } from 'execa';
import ora from 'ora';
import { logger } from '../utils/logger.js';
import { execSupabase } from '../utils/cli.js';

interface DatabaseConfig {
  url: string;
  provider: 'supabase';
}

interface SupabaseProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
  created_at: string;
}

async function checkSupabaseCLI(): Promise<boolean> {
  try {
    await execSupabase(['--version'], { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

async function authenticateSupabaseCLI(): Promise<boolean> {
  try {
    // Check if already authenticated by trying to list projects
    const { stdout } = await execSupabase(['projects', 'list'], { stdio: 'pipe' });
    return stdout.includes('ID') || stdout.includes('Name'); // Basic check for project list output
  } catch (error) {
    // Not authenticated
  }

  console.log(chalk.yellow('🔐 Supabase CLI authentication required'));
  console.log(chalk.gray('We need to authenticate with Supabase to manage your projects programmatically.'));
  logger.newLine();

  const { authenticate } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'authenticate',
      message: 'Would you like to authenticate with Supabase now? (This will open your browser)',
      default: true
    }
  ]);

  if (!authenticate) {
    return false;
  }

  try {
    console.log(chalk.blue('Opening browser for Supabase authentication...'));
    await execSupabase(['login'], { stdio: 'inherit' });
    
    // Verify authentication worked
    await execSupabase(['projects', 'list'], { stdio: 'pipe' });
    logger.success('Successfully authenticated with Supabase!');
    return true;
  } catch (error) {
    logger.warning('Authentication failed or was cancelled');
    return false;
  }
}

async function listSupabaseProjects(): Promise<SupabaseProject[]> {
  try {
    const { stdout } = await execSupabase(['projects', 'list', '--output', 'json'], { stdio: 'pipe' });
    const projects = JSON.parse(stdout);
    return Array.isArray(projects) ? projects : [];
  } catch (error) {
    logger.debug(`Failed to list Supabase projects: ${error}`);
    return [];
  }
}

async function getDefaultOrgId(): Promise<string | null> {
  try {
    // Try to get organization ID from existing projects first
    const projects = await listSupabaseProjects();
    if (projects.length > 0) {
      return projects[0].organization_id;
    }
    
    // If no projects, try to list organizations
    const { stdout } = await execSupabase(['orgs', 'list', '--output', 'json'], { stdio: 'pipe' });
    const orgs = JSON.parse(stdout);
    if (Array.isArray(orgs) && orgs.length > 0) {
      return orgs[0].id;
    }
    
    return null;
  } catch (error) {
    logger.debug(`Failed to get organization ID: ${error}`);
    return null;
  }
}

async function createSupabaseProject(baseName: string, orgId?: string, dbPassword?: string): Promise<SupabaseProject | null> {
  let projectName = baseName;
  let attempt = 0;

  // Get organization ID if not provided
  if (!orgId) {
    const defaultOrgId = await getDefaultOrgId();
    if (!defaultOrgId) {
      logger.warning('Could not determine organization ID for project creation');
      return null;
    }
    orgId = defaultOrgId;
  }

  // Generate a secure database password if not provided
  if (!dbPassword) {
    // Generate a random password with letters, numbers, and special characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    dbPassword = Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    logger.debug('Generated secure database password');
  }

  while (attempt < 10) { // Limit attempts to avoid infinite loop
    const spinner = ora(`Creating new Supabase project "${projectName}"...`).start();
    
    try {
      const args = [
        'projects', 'create', projectName,
        '--org-id', orgId,
        '--db-password', dbPassword,
        '--region', 'us-east-1', // Default to us-east-1, most common region
        '--output', 'json'
      ];
      
      logger.debug(`Executing: supabase projects create ${projectName} --org-id ${orgId} --db-password [REDACTED] --region us-east-1 --output json`);
      const { stdout } = await execSupabase(args, { stdio: 'pipe' });
      logger.debug(`Supabase CLI stdout: ${stdout}`);
      
      const project = JSON.parse(stdout);
      spinner.succeed(`Project "${projectName}" created successfully!`);
      
      // Store the password for later use
      (project as any).dbPassword = dbPassword;
      
      return project;
    } catch (error) {
      spinner.stop();
      
      // Enhanced error logging
      logger.debug(`Supabase CLI command failed: supabase projects create ${projectName} --org-id ${orgId} --db-password [REDACTED] --region us-east-1 --output json`);
      
      if (error instanceof Error) {
        logger.debug(`Error message: ${error.message}`);
        // Try to extract stderr if available
        if ('stderr' in error && typeof error.stderr === 'string') {
          logger.debug(`Error stderr: ${error.stderr}`);
        }
        if ('stdout' in error && typeof error.stdout === 'string') {
          logger.debug(`Error stdout: ${error.stdout}`);
        }
      } else {
        logger.debug(`Error object: ${JSON.stringify(error, null, 2)}`);
      }
      
      // Check if it's a name conflict error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('already exists') || errorMessage.includes('name is taken') || errorMessage.includes('duplicate')) {
        attempt++;
        projectName = `${baseName}-${attempt}`;
        logger.debug(`Project name "${baseName}" exists, trying "${projectName}"`);
        continue;
      }
      
      // Other error, fail immediately
      spinner.fail('Failed to create project');
      console.log(chalk.red('Error details:'), errorMessage);
      return null;
    }
  }
  
  logger.warning('Failed to create project after multiple attempts');
  return null;
}

async function getSupabaseConnectionString(projectRef: string): Promise<string | null> {
  try {
    // Modern Supabase CLI approach: use the db command to get connection info
    const { stdout } = await execSupabase(['projects', 'get', projectRef, '--output', 'json'], { stdio: 'pipe' });
    const project = JSON.parse(stdout);
    
    if (!project) {
      logger.debug('Project not found');
      return null;
    }

    // Try to get the database URL directly from the project info
    // Supabase projects have a standard connection string format
    const connectionString = `postgresql://postgres:[YOUR-PASSWORD]@db.${projectRef}.supabase.co:5432/postgres`;
    
    return connectionString;
  } catch (error) {
    logger.debug(`Failed to get connection string: ${error}`);
    return null;
  }
}

async function promptForSupabasePassword(projectRef: string, fastMode = false): Promise<string> {
  if (fastMode) {
    console.log(chalk.blue('🔑 One Quick Step: Database Password'));
    console.log(chalk.white('We need your Supabase database password to complete the setup.'));
    console.log(chalk.gray('This is the only manual step required in fast mode.'));
  } else {
    console.log(chalk.blue('🔑 Database Password Required'));
    console.log(chalk.white('Supabase requires your database password to create the connection string.'));
    console.log(chalk.gray('You can find this in your Supabase dashboard under Settings > Database.'));
  }
  logger.newLine();

  const { openDashboard } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'openDashboard',
      message: 'Would you like me to open the Supabase dashboard to get your password?',
      default: true
    }
  ]);

  if (openDashboard) {
    const spinner = ora('Opening Supabase dashboard...').start();
    try {
      const url = `https://supabase.com/dashboard/project/${projectRef}/settings/database`;
      
      // Cross-platform browser opening
      const command = process.platform === 'win32' ? 'start' : 
                    process.platform === 'darwin' ? 'open' : 'xdg-open';
      
      await execa(command, [url], { stdio: 'ignore' });
      spinner.succeed('Supabase dashboard opened in browser');
    } catch (error) {
      spinner.fail('Failed to open browser');
      console.log(chalk.yellow('Please manually open: ') + chalk.cyan(`https://supabase.com/dashboard/project/${projectRef}/settings/database`));
    }
  }

  const { password } = await inquirer.prompt([
    {
      type: 'password',
      name: 'password',
      message: 'Enter your Supabase database password:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Database password is required';
        }
        return true;
      }
    }
  ]);

  return password;
}

export async function setupSupabaseDatabase(fastMode = false, projectName?: string): Promise<DatabaseConfig> {
  logger.info('Setting up Supabase database...');
  logger.newLine();

  // Check if Supabase CLI is available
  const hasSupabaseCLI = await checkSupabaseCLI();
  if (!hasSupabaseCLI) {
    logger.warning('Supabase CLI not found. Using manual setup instead.');
    return await setupSupabaseDatabaseManual();
  }

  // Authenticate with Supabase
  const isAuthenticated = await authenticateSupabaseCLI();
  if (!isAuthenticated) {
    logger.warning('Supabase authentication failed. Using manual setup instead.');
    return await setupSupabaseDatabaseManual();
  }

  // List existing projects
  const spinner = ora('Loading your Supabase projects...').start();
  const projects = await listSupabaseProjects();
  spinner.stop();

  if (projects.length === 0 || fastMode) {
    if (projects.length === 0) {
      console.log(chalk.yellow('No existing Supabase projects found.'));
    } else if (fastMode) {
      console.log(chalk.blue('Creating new Supabase project (fast mode)...'));
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
          message: 'Enter a name for your new Supabase project:',
          default: `${projectName || 'volo-app'}-db`,
          validate: (input: string) => {
            if (!input.trim()) {
              return 'Project name is required';
            }
            if (input.length > 50) {
              return 'Project name must be 50 characters or less';
            }
            return true;
          }
        }
      ]);
      dbProjectName = response.projectName;
    }

    const newProject = await createSupabaseProject(dbProjectName);
    if (!newProject) {
      logger.warning('Failed to create new project. Using manual setup instead.');
      return await setupSupabaseDatabaseManual();
    }

    // Use the generated password from project creation
    const password = (newProject as any).dbPassword;
    
    const connectionString = `postgresql://postgres:${password}@db.${newProject.id}.supabase.co:5432/postgres`;

    logger.success('Supabase database configured!');
    logger.newLine();

    return {
      url: connectionString,
      provider: 'supabase'
    };
  }

  // User has existing projects but not in fast mode
  if (!fastMode) {
    console.log(chalk.green(`Found ${projects.length} existing Supabase project(s)`));
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
        message: 'Which Supabase project would you like to use?',
        choices: projectChoices
      }
    ]);

    let projectRef: string;

    if (selectedProject === 'new') {
      const { dbProjectName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'dbProjectName',
          message: 'Enter a name for your new Supabase project:',
          default: `${projectName || 'volo-app'}-db`,
          validate: (input: string) => {
            if (!input.trim()) {
              return 'Project name is required';
            }
            if (input.length > 50) {
              return 'Project name must be 50 characters or less';
            }
            return true;
          }
        }
      ]);

      const newProject = await createSupabaseProject(dbProjectName);
      if (!newProject) {
        logger.warning('Failed to create new project. Using manual setup instead.');
        return await setupSupabaseDatabaseManual();
      }
      projectRef = newProject.id;
      
      // Use the generated password for new projects
      const password = (newProject as any).dbPassword;
      const connectionString = `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;

      logger.success('Supabase database configured!');
      logger.newLine();

      return {
        url: connectionString,
        provider: 'supabase'
      };
    } else {
      projectRef = selectedProject;
      
      // Get the database password for existing projects
      const password = await promptForSupabasePassword(projectRef, false);
      const connectionString = `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;

      logger.success('Supabase database configured!');
      logger.newLine();

             return {
         url: connectionString,
         provider: 'supabase'
       };
     }
  } else {
    // Fast mode: create new project even if existing ones exist
    const dbProjectName = `${projectName || 'volo-app'}-db`;
    
    const newProject = await createSupabaseProject(dbProjectName);
    if (!newProject) {
      logger.warning('Failed to create new project. Using manual setup instead.');
      return await setupSupabaseDatabaseManual();
    }

    // Use the generated password from project creation
    const password = (newProject as any).dbPassword;
    const connectionString = `postgresql://postgres:${password}@db.${newProject.id}.supabase.co:5432/postgres`;

    logger.success('Supabase database configured!');
    logger.newLine();

    return {
      url: connectionString,
      provider: 'supabase'
    };
  }
}

async function setupSupabaseDatabaseManual(): Promise<DatabaseConfig> {
  console.log(chalk.yellow('📋 Manual setup required:'));
  console.log(chalk.gray('1. Go to: https://supabase.com/dashboard'));
  console.log(chalk.gray('2. Sign up for a free account (if you don\'t have one)'));
  console.log(chalk.gray('3. Create a new project'));
  console.log(chalk.gray('4. Go to Settings > Database'));
  console.log(chalk.gray('5. Copy the connection string (URI format)'));
  console.log(chalk.gray('   It should look like: postgresql://postgres:[password]@[host]:5432/postgres'));
  logger.newLine();

  const { hasAccount } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'hasAccount',
      message: 'Do you already have a Supabase account?',
      default: false
    }
  ]);

  if (!hasAccount) {
    console.log(chalk.blue('👉 Opening Supabase signup page...'));
    console.log(chalk.gray('Please create an account and return here when you have your connection string.'));
    logger.newLine();
    
    console.log(chalk.blue('Sign up at: https://supabase.com/dashboard'));
    logger.newLine();
  }

  const { connectionString } = await inquirer.prompt([
    {
      type: 'input',
      name: 'connectionString',
      message: 'Enter your Supabase connection string:',
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

  logger.success('Supabase database configured!');
  logger.newLine();

  return {
    url: connectionString,
    provider: 'supabase'
  };
} 