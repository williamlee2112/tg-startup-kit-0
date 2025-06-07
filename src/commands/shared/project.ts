import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../utils/logger.js';
import { validateProjectName } from '../../utils/validation.js';

export async function getProjectName(provided?: string): Promise<string> {
  // Handle current directory case
  if (provided === '.') {
    const currentDirName = path.basename(process.cwd());
    if (validateProjectName(currentDirName)) {
      return currentDirName;
    } else {
      logger.warning(`Current directory name "${currentDirName}" is not a valid project name.`);
      logger.info('Project names should be lowercase, contain only letters, numbers, and hyphens.');
      // Fall through to prompt for a new name
    }
  } else if (provided && validateProjectName(provided)) {
    return provided;
  }

  if (provided && provided !== '.') {
    logger.warning(`"${provided}" is not a valid project name.`);
    logger.info('Project names should be lowercase, contain only letters, numbers, and hyphens.');
  }

  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'What is your project name?',
      default: provided === '.' ? path.basename(process.cwd()) : 'my-volo-app',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Project name is required';
        }
        if (!validateProjectName(input)) {
          return 'Project name should be lowercase, contain only letters, numbers, and hyphens';
        }
        return true;
      }
    }
  ]);

  return name;
}

export async function validateAndPrepareDirectory(name: string, isCurrentDirectory: boolean = false): Promise<string> {
  const directory = isCurrentDirectory ? process.cwd() : path.resolve(process.cwd(), name);

  if (isCurrentDirectory) {
    // Check if current directory is empty or only contains common files that can be overwritten
    const files = await fs.readdir(directory);
    const significantFiles = files.filter(file => 
      !file.startsWith('.') && 
      file !== 'README.md' && 
      file !== 'package.json' && 
      file !== 'node_modules'
    );

    if (significantFiles.length > 0) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `Current directory is not empty. Do you want to continue and potentially overwrite existing files?`,
          default: false
        }
      ]);

      if (!overwrite) {
        logger.info('Operation cancelled.');
        throw new Error('Directory is not empty');
      }
    }
  } else {
    if (await fs.pathExists(directory)) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `Directory "${name}" already exists. Do you want to overwrite it?`,
          default: false
        }
      ]);

      if (!overwrite) {
        logger.info('Operation cancelled.');
        throw new Error('Directory already exists');
      }

      await fs.remove(directory);
    }
  }

  return directory;
} 