import chalk from 'chalk';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { connectAuth } from './auth.js';
import { connectDatabase } from './database.js';
import { connectDeploy } from './deploy.js';

export type ServiceType = 'auth' | 'database' | 'deploy';

/**
 * Main connection service router
 */
export async function connectToService(
  service: ServiceType, 
  projectPath: string, 
  provider?: string
): Promise<void> {
  console.log(chalk.cyan.bold(`🔗 Connecting to production ${service}...`));
  console.log('');

  // Validate that we're in a volo-app project
  await validateVoloProject(projectPath);

  switch (service) {
    case 'auth':
      await connectAuth(projectPath);
      break;
    case 'database':
      await connectDatabase(projectPath, provider);
      break;
    case 'deploy':
      await connectDeploy(projectPath);
      break;
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

/**
 * Validate that we're operating on a valid volo-app project
 */
async function validateVoloProject(projectPath: string): Promise<void> {
  const packageJsonPath = path.join(projectPath, 'package.json');
  
  if (!existsSync(packageJsonPath)) {
    console.error(chalk.red('❌ No package.json found in the specified path'));
    console.log(chalk.gray(`   Path: ${projectPath}`));
    console.log(chalk.blue('💡 Make sure you\'re in a volo-app project directory'));
    process.exit(1);
  }

  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
    
    // Check if this looks like a volo-app project
    const isVoloApp = 
      packageJson.name === 'volo-app-template' ||
      packageJson.template?.name === 'volo-app' ||
      (packageJson.devDependencies && 'embedded-postgres' in packageJson.devDependencies) ||
      existsSync(path.join(projectPath, 'ui', 'src', 'lib', 'firebase.ts')) ||
      existsSync(path.join(projectPath, 'server', 'src', 'lib', 'db.ts'));

    if (!isVoloApp) {
      console.error(chalk.red('❌ This doesn\'t appear to be a volo-app project'));
      console.log(chalk.gray(`   Path: ${projectPath}`));
      console.log(chalk.blue('💡 Connection commands can only be used with volo-app projects'));
      console.log(chalk.blue('   Create a new project: npx create-volo-app my-project'));
      process.exit(1);
    }

    console.log(chalk.green(`✅ Validated volo-app project: ${packageJson.name || 'unnamed project'}`));
    console.log('');
  } catch (error) {
    console.error(chalk.red('❌ Failed to read package.json'));
    console.log(chalk.gray(`   Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
} 