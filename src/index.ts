#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createApp } from './commands/create.js';
import { checkPrerequisites } from './utils/prerequisites.js';
import { logger } from './utils/logger.js';

const program = new Command();

// Default template URL
const DEFAULT_TEMPLATE = 'https://github.com/VoloBuilds/volo-app.git';

export async function main() {
  program
    .name('create-volo-app')
    .description('CLI tool to create a new Volo app with Firebase Auth, Neon DB, and Cloudflare deployment')
    .version('1.0.0')
    .argument('[project-name]', 'Name of the project to create')
    .option('-t, --template <url>', 'Custom template repository URL', DEFAULT_TEMPLATE)
    .option('--skip-prereqs', 'Skip prerequisite checks (advanced users only)')
    .option('--verbose', 'Enable verbose logging')
    .action(async (projectName: string | undefined, options) => {
      try {
        logger.setVerbose(options.verbose);

        console.log(chalk.cyan.bold('🚀 Welcome to create-volo-app!'));
        console.log('');

        // Check prerequisites unless skipped
        let databasePreference: string | undefined;
        if (!options.skipPrereqs) {
          const prereqResult = await checkPrerequisites();
          databasePreference = prereqResult.databasePreference;
        }

        // Create the app
        await createApp(projectName, { 
          ...options, 
          databasePreference 
        });

      } catch (error) {
        console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  await program.parseAsync();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} 