import inquirer from 'inquirer';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { setupFirebase, FirebaseProjectIdConflictError, FirebaseTermsOfServiceError, FirebaseFirstTimeSetupError } from '../../services/firebase.js';
import { setupDatabase } from '../../services/database.js';
import { ProjectConfig } from '../shared/types.js';
import { askToRetrySetup } from '../shared/prompts.js';

export async function setupFirebaseWithRetry(maxRetries = 2, fastMode = false, projectName?: string): Promise<ProjectConfig['firebase']> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await setupFirebase(fastMode, projectName);
    } catch (error) {
      // Handle Firebase first-time setup requirement
      if (error instanceof FirebaseFirstTimeSetupError) {
        logger.error('Firebase first-time setup required - please create your first project manually');
        throw error;
      }
      
      // Handle Firebase Terms of Service errors specially
      if (error instanceof FirebaseTermsOfServiceError) {
        logger.warning(`Firebase setup failed (attempt ${attempt}/${maxRetries}) - Terms of Service required`);
        
        if (attempt === maxRetries) {
          logger.error('Firebase setup failed after multiple attempts - Terms of Service not accepted');
          throw error;
        }

        const { retry } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'retry',
            message: 'Have you accepted the Google Cloud Terms of Service and want to retry?',
            default: false
          }
        ]);

        if (!retry) {
          logger.info('Please accept the Terms of Service and run the create command again when ready.');
          throw error;
        }

        logger.info('Retrying Firebase setup...');
        continue;
      }
      
      // Handle Firebase project ID conflicts specially
      if (error instanceof FirebaseProjectIdConflictError) {
        logger.warning(`Firebase setup failed (attempt ${attempt}/${maxRetries}) - Project ID already exists`);
        
        if (attempt === maxRetries) {
          logger.error('Firebase setup failed after multiple attempts - try a different project name');
          throw error;
        }

        const retry = await askToRetrySetup('Firebase');
        if (!retry) {
          throw error;
        }

        logger.info('Retrying Firebase setup...');
        continue;
      }
      
      // Handle other Firebase errors
      logger.warning(`Firebase setup failed (attempt ${attempt}/${maxRetries})`);
      
      if (attempt === maxRetries) {
        logger.error('Firebase setup failed after multiple attempts');
        logger.newLine();
        console.log(chalk.yellow.bold('⚡ Manual Firebase setup required:'));
        console.log(chalk.cyan('   Visit https://console.firebase.google.com and create a project manually'));
        logger.newLine();
        throw error;
      }

      const retry = await askToRetrySetup('Firebase');
      if (!retry) {
        throw error;
      }

      logger.info('Retrying Firebase setup...');
    }
  }
  
  throw new Error('Firebase setup failed');
}

export async function setupDatabaseWithRetry(databasePreference?: string, maxRetries = 2, fastMode = false, projectName?: string): Promise<ProjectConfig['database']> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      switch (databasePreference) {
        case 'neon':
          return await setupDatabase(databasePreference, fastMode, projectName);
        case 'supabase':
          const { setupSupabaseDatabase } = await import('../../services/supabase.js');
          return await setupSupabaseDatabase(fastMode, projectName);
        case 'other':
          const { setupOtherDatabase } = await import('../../services/database.js');
          return await setupOtherDatabase();
        default:
          return await setupDatabase(databasePreference, fastMode, projectName); // fallback
      }
    } catch (error) {
      logger.warning(`Database setup failed (attempt ${attempt}/${maxRetries})`);
      
      if (attempt === maxRetries) {
        logger.error('Database setup failed after multiple attempts');
        logger.newLine();
        console.log(chalk.yellow.bold('⚡ Manual database setup required:'));
        console.log(chalk.cyan('   1. Create a PostgreSQL database (Neon, Supabase, or other)'));
        console.log(chalk.cyan('   2. Update DATABASE_URL in server/.dev.vars'));
        console.log(chalk.cyan('   3. Run: cd server && pnpm run db:push'));
        logger.newLine();
        throw error;
      }

      const retry = await askToRetrySetup('database');
      if (!retry) {
        throw error;
      }

      logger.info('Retrying database setup...');
    }
  }
  
  throw new Error('Database setup failed');
} 