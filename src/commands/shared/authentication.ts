import chalk from 'chalk';
import ora from 'ora';
import { logger } from '../../utils/logger.js';
import { execFirebase, execPnpm } from '../../utils/cli.js';
import { execNeonctl } from '../../utils/neonctl.js';
import { AuthStatus } from '../shared/types.js';
import { askToProceedWithAuthentication } from '../shared/prompts.js';

export async function checkAuthenticationStatus(databaseProvider?: string): Promise<AuthStatus> {
  const status: AuthStatus = {
    firebase: false,
    neon: false,
    supabase: false,
    cloudflare: false
  };

  // Check Firebase auth
  try {
    const { stdout } = await execFirebase(['login:list'], { stdio: 'pipe' });
    status.firebase = stdout.includes('@');
  } catch {
    status.firebase = false;
  }

  // Check Neon auth (only if using Neon)
  if (databaseProvider === 'neon') {
    try {
      const { stdout } = await execNeonctl(['me'], { stdio: 'pipe' });
      status.neon = stdout.includes('@');
    } catch {
      status.neon = false;
    }
  } else {
    status.neon = true; // Not needed for other providers
  }

  // Check Supabase auth (only if using Supabase)
  if (databaseProvider === 'supabase') {
    try {
      const { execSupabase } = await import('../../utils/cli.js');
      const { stdout } = await execSupabase(['projects', 'list'], { stdio: 'pipe' });
      status.supabase = stdout.includes('ID') || stdout.includes('Name');
    } catch {
      status.supabase = false;
    }
  } else {
    status.supabase = true; // Not needed for other providers
  }

  // Check Cloudflare auth
  try {
    const { execa } = await import('execa');
    const { stdout } = await execa('wrangler', ['whoami'], { stdio: 'pipe' });
    status.cloudflare = stdout.includes('@') || stdout.includes('You are logged in');
  } catch {
    status.cloudflare = false;
  }

  return status;
}

export async function handleBatchAuthentication(authStatus: AuthStatus, databaseProvider?: string): Promise<void> {
  const needsAuth: string[] = [];
  
  if (!authStatus.firebase) needsAuth.push('Firebase');
  if (!authStatus.neon && databaseProvider === 'neon') needsAuth.push('Neon');
  if (!authStatus.supabase && databaseProvider === 'supabase') needsAuth.push('Supabase');
  if (!authStatus.cloudflare) needsAuth.push('Cloudflare');

  if (needsAuth.length === 0) {
    logger.success('All services are already authenticated! ✨');
    return;
  }

  const proceed = await askToProceedWithAuthentication(needsAuth);

  if (!proceed) {
    throw new Error('Authentication is required to continue');
  }

  // Authenticate services sequentially (browser-based auth can't be truly parallel)
  for (const service of needsAuth) {
    const spinner = ora(`Authenticating with ${service}...`).start();
    
    try {
      switch (service) {
        case 'Firebase':
          spinner.stop();
          logger.newLine();
          console.log(chalk.yellow(`🔥 ${service} Authentication`));
          console.log(chalk.white('The Firebase CLI may ask about data collection - you can respond as you prefer.'));
          console.log(chalk.white('After that, a browser tab will open for you to sign in with your Google account.'));
          logger.newLine();
          
          await execFirebase(['login'], { stdio: 'inherit', timeout: 300000 }); // 5 minute timeout for browser auth
          
          console.log(chalk.green(`✅ ${service} authentication completed`));
          break;
        case 'Neon':
          spinner.stop();
          logger.newLine();
          console.log(chalk.yellow(`💾 ${service} Database Authentication`));
          console.log(chalk.white('A browser tab will open for you to sign in to your Neon account.'));
          logger.newLine();
          
          await execNeonctl(['auth'], { stdio: 'inherit', timeout: 300000 });
          
          console.log(chalk.green(`✅ ${service} authentication completed`));
          break;
        case 'Supabase':
          spinner.stop();
          logger.newLine();
          console.log(chalk.yellow(`🗄️ ${service} Database Authentication`));
          console.log(chalk.white('A browser tab will open for you to sign in to your Supabase account.'));
          logger.newLine();
          
          const { execSupabase } = await import('../../utils/cli.js');
          await execSupabase(['login'], { stdio: 'inherit', timeout: 300000 });
          
          console.log(chalk.green(`✅ ${service} authentication completed`));
          break;
        case 'Cloudflare':
          spinner.stop();
          logger.newLine();
          console.log(chalk.yellow(`☁️ ${service} Authentication`));
          console.log(chalk.white('A browser tab will open for you to sign in to your Cloudflare account.'));
          logger.newLine();
          
          const { execa } = await import('execa');
          await execa('wrangler', ['login'], { stdio: 'inherit', timeout: 300000 });
          
          console.log(chalk.green(`✅ ${service} authentication completed`));
          break;
      }
    } catch (error) {
      console.log(chalk.red(`❌ ${service} authentication failed`));
      throw new Error(`Failed to authenticate with ${service}`);
    }
  }

  logger.newLine();
  logger.success('All authentications completed! 🎉');
} 