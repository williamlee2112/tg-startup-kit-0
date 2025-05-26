import inquirer from 'inquirer';
import chalk from 'chalk';
import { execa } from 'execa';
import ora from 'ora';
import { logger } from '../utils/logger.js';

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
    await execa('supabase', ['--version'], { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

async function authenticateSupabaseCLI(): Promise<boolean> {
  try {
    // Check if already authenticated by trying to list projects
    const { stdout } = await execa('supabase', ['projects', 'list'], { stdio: 'pipe' });
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
    await execa('supabase', ['login'], { stdio: 'inherit' });
    
    // Verify authentication worked
    await execa('supabase', ['projects', 'list'], { stdio: 'pipe' });
    logger.success('Successfully authenticated with Supabase!');
    return true;
  } catch (error) {
    logger.warning('Authentication failed or was cancelled');
    return false;
  }
}

async function listSupabaseProjects(): Promise<SupabaseProject[]> {
  try {
    const { stdout } = await execa('supabase', ['projects', 'list', '--output', 'json'], { stdio: 'pipe' });
    const projects = JSON.parse(stdout);
    return Array.isArray(projects) ? projects : [];
  } catch (error) {
    logger.debug(`Failed to list Supabase projects: ${error}`);
    return [];
  }
}

async function createSupabaseProject(name: string, orgId?: string): Promise<SupabaseProject | null> {
  const spinner = ora('Creating new Supabase project...').start();
  
  try {
    const args = ['projects', 'create', name, '--output', 'json'];
    if (orgId) {
      args.push('--org-id', orgId);
    }
    
    const { stdout } = await execa('supabase', args, { stdio: 'pipe' });
    const project = JSON.parse(stdout);
    spinner.succeed(`Project "${name}" created successfully!`);
    return project;
  } catch (error) {
    spinner.fail('Failed to create project');
    logger.debug(`Project creation error: ${error}`);
    return null;
  }
}

export async function setupSupabaseDatabase(): Promise<DatabaseConfig> {
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

  if (projects.length === 0) {
    console.log(chalk.yellow('No existing Supabase projects found.'));
    logger.newLine();
    
    const { projectName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Enter a name for your new Supabase project:',
        default: 'volo-app-db',
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

    const newProject = await createSupabaseProject(projectName);
    if (!newProject) {
      logger.warning('Failed to create new project. Using manual setup instead.');
      return await setupSupabaseDatabaseManual();
    }

    // For new projects, we still need manual connection string setup
    logger.info('Project created successfully! Now we need to get the database connection string.');
    logger.newLine();
    console.log(chalk.blue('📋 To get your connection string:'));
    console.log(chalk.gray('1. Go to: https://supabase.com/dashboard/project/' + newProject.id + '/settings/database'));
    console.log(chalk.gray('2. Copy the "URI" connection string'));
    console.log(chalk.gray('3. Paste it below'));
    logger.newLine();

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

  // User has existing projects
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
    const { projectName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Enter a name for your new Supabase project:',
        default: 'volo-app-db',
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

    const newProject = await createSupabaseProject(projectName);
    if (!newProject) {
      logger.warning('Failed to create new project. Using manual setup instead.');
      return await setupSupabaseDatabaseManual();
    }
    projectRef = newProject.id;
  } else {
    projectRef = selectedProject;
  }

  // Get connection string - currently requires manual input due to CLI limitations
  logger.info('Now we need to get the database connection string from your Supabase dashboard.');
  logger.newLine();
  console.log(chalk.blue('📋 To get your connection string:'));
  console.log(chalk.gray('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/settings/database'));
  console.log(chalk.gray('2. Copy the "URI" connection string'));
  console.log(chalk.gray('3. Paste it below'));
  logger.newLine();

  const { openDashboard } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'openDashboard',
      message: 'Would you like me to open the Supabase dashboard in your browser?',
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