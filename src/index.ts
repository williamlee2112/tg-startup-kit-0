#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createApp } from './commands/create.js';
import { checkPrerequisites } from './utils/prerequisites/checkPrereqs.js';
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
    .option('-b, --branch <branch>', 'Git branch to clone from template repository', 'main')
    .option('--db <provider>', 'Database provider (neon, supabase, other)')
    .option('--fast', 'Fast mode: use smart defaults and minimal prompts')
    .option('--skip-prereqs', 'Skip prerequisite checks (advanced users only)')
    .option('--install-deps', 'Automatically install missing dependencies without prompting')
    .option('--verbose', 'Enable verbose logging')
    .option('--local', 'Local development mode (default): no external auth required')
    .option('--full', 'Full production setup: authenticate with all services')
    .action(async (projectName: string | undefined, options) => {
      try {
        logger.setVerbose(options.verbose);

        console.log(chalk.cyan.bold('🚀 Welcome to create-volo-app!'));
        console.log('');

        // Determine flow mode: default to local unless --full is specified
        const isLocalMode = !options.full;
        
        if (isLocalMode) {
          console.log(chalk.green.bold('🏠 Local Development Mode'));
          console.log(chalk.white('Creating a local-first development environment with:'));
          console.log(chalk.white('  • Embedded PostgreSQL database'));
          console.log(chalk.white('  • Firebase Auth emulator'));
          console.log(chalk.white('  • Local development servers'));
          console.log(chalk.white('  • No external authentication required'));
          console.log('');
          console.log(chalk.gray('💡 Use --full flag for production setup with external services'));
        } else {
          console.log(chalk.blue.bold('🌍 Full Production Setup Mode'));
          console.log(chalk.white('Setting up production-ready app with external services'));
        }
        console.log('');

        // Check prerequisites unless skipped (only for full mode)
        let databasePreference: string | undefined;
        if (!options.skipPrereqs && !isLocalMode) {
          const prereqResult = await checkPrerequisites({
            autoInstall: options.installDeps,
            databasePreference: options.db,
            fastMode: options.fast
          });
          databasePreference = prereqResult.databasePreference;
        }

        // Create the app
        await createApp(projectName, { 
          ...options, 
          databasePreference: options.db || databasePreference,
          local: isLocalMode
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