import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import { logger } from '../../utils/logger.js';
import { validateProjectName } from '../../utils/validation.js';

export async function getProjectName(provided?: string): Promise<string> {
  if (provided && validateProjectName(provided)) {
    return provided;
  }

  if (provided) {
    logger.warning(`"${provided}" is not a valid project name.`);
    logger.info('Project names should be lowercase, contain only letters, numbers, and hyphens.');
  }

  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'What is your project name?',
      default: 'my-volo-app',
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

export async function validateAndPrepareDirectory(name: string): Promise<string> {
  const directory = path.resolve(process.cwd(), name);

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

  return directory;
} 