import chalk from 'chalk';
import ora, { Ora } from 'ora';

export interface ProgressStep {
  name: string;
  weight: number;
}

// Simple spinner utility
export function createSpinner(message: string, verbose: boolean = false): Ora | null {
  if (verbose) {
    console.log(chalk.gray(`  ${message}...`));
    return null;
  }
  return ora(message).start();
}

export function updateSpinner(spinner: Ora | null, message: string, verbose: boolean = false): void {
  if (verbose) {
    console.log(chalk.gray(`  ${message}...`));
  } else if (spinner) {
    spinner.text = message;
  }
}

export function succeedSpinner(spinner: Ora | null, message?: string, verbose: boolean = false): void {
  if (verbose) {
    if (message) {
      console.log(chalk.green(`  ✓ ${message}`));
    }
  } else if (spinner) {
    spinner.succeed(message);
  }
}

export function failSpinner(spinner: Ora | null, message?: string, verbose: boolean = false): void {
  if (verbose) {
    if (message) {
      console.log(chalk.red(`  ✗ ${message}`));
    }
  } else if (spinner) {
    spinner.fail(message);
  }
}

export function stopSpinner(spinner: Ora | null): void {
  if (spinner) {
    spinner.stop();
  }
}

// Simple progress simulation for long-running operations
export async function withProgress<T>(
  message: string,
  operation: () => Promise<T>,
  verbose: boolean = false
): Promise<T> {
  const spinner = createSpinner(message, verbose);
  
  try {
    const result = await operation();
    succeedSpinner(spinner, undefined, verbose);
    return result;
  } catch (error) {
    failSpinner(spinner, undefined, verbose);
    throw error;
  }
} 