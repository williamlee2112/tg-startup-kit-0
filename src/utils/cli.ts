import { execa } from 'execa';
import which from 'which';
import { logger } from './logger.js';

interface CliOptions {
  stdio?: 'pipe' | 'inherit';
  timeout?: number;
  cwd?: string;
}

/**
 * Configures Git user identity if not already set
 */
async function ensureGitIdentity(cwd?: string): Promise<void> {
  const options = { stdio: 'pipe' as const, cwd };
  
  try {
    // Check if user.name is set
    await execa('git', ['config', 'user.name'], options);
  } catch {
    // Set default user.name
    await execa('git', ['config', 'user.name', 'Volo App Creator'], options);
    logger.debug('Set default git user.name');
  }
  
  try {
    // Check if user.email is set
    await execa('git', ['config', 'user.email'], options);
  } catch {
    // Set default user.email
    await execa('git', ['config', 'user.email', 'creator@volo-app.local'], options);
    logger.debug('Set default git user.email');
  }
}

/**
 * Executes a CLI command, trying global installation first, then local via npx
 */
export async function execCli(
  command: string,
  args: string[],
  options: CliOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const defaultOptions = {
    stdio: 'pipe' as const,
    timeout: 30000,
    ...options
  };

  // First try global installation
  try {
    await which(command);
    logger.debug(`Using global ${command}`);
    return await execa(command, args, defaultOptions);
  } catch (globalError) {
    logger.debug(`Global ${command} not found, trying local installation`);
    
    // Try local installation via npx
    try {
      return await execa('npx', [command, ...args], defaultOptions);
    } catch (localError) {
      logger.debug(`Local ${command} via npx also failed`);
      
      // Enhanced error handling to capture stderr
      let errorMessage = `Failed to execute ${command}`;
      if (localError instanceof Error) {
        errorMessage += `: ${localError.message}`;
        
        // If it's an execa error, it might have stdout/stderr
        if ('stderr' in localError && localError.stderr) {
          errorMessage += `\nStderr: ${localError.stderr}`;
        }
        if ('stdout' in localError && localError.stdout) {
          errorMessage += `\nStdout: ${localError.stdout}`;
        }
      }
      
      const enhancedError = new Error(errorMessage);
      // Preserve original error properties
      if (localError instanceof Error && 'stderr' in localError) {
        (enhancedError as any).stderr = localError.stderr;
      }
      if (localError instanceof Error && 'stdout' in localError) {
        (enhancedError as any).stdout = localError.stdout;
      }
      
      throw enhancedError;
    }
  }
}

/**
 * Executes Firebase CLI command
 */
export async function execFirebase(
  args: string[],
  options: CliOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  return execCli('firebase', args, options);
}

/**
 * Executes Wrangler CLI command
 */
export async function execWrangler(
  args: string[],
  options: CliOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  return execCli('wrangler', args, options);
}

/**
 * Executes Git command - Git is a system tool, not an npm package
 */
export async function execGit(
  args: string[],
  options: CliOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const defaultOptions = {
    stdio: 'pipe' as const,
    timeout: 30000,
    ...options
  };

  try {
    // Git should always be available globally - it's a system tool
    await which('git');
    logger.debug(`Using global git`);
    
    // For commit commands, ensure git identity is configured
    if (args[0] === 'commit') {
      await ensureGitIdentity(defaultOptions.cwd);
    }
    
    return await execa('git', args, defaultOptions);
  } catch (error) {
    logger.debug(`Git command failed: ${error}`);
    
    // Enhanced error message for identity issues
    if (error instanceof Error && error.message.includes('Author identity unknown')) {
      throw new Error('Git identity not configured. This should have been set automatically. Please check git configuration.');
    }
    
    // Git is a system tool, not an npm package, so don't try npx
    let errorMessage = 'Git is not installed or not available in PATH';
    if (error instanceof Error) {
      errorMessage += `: ${error.message}`;
    }
    
    throw new Error(errorMessage);
  }
}

/**
 * Executes Supabase CLI command
 */
export async function execSupabase(
  args: string[],
  options: CliOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  return execCli('supabase', args, options);
}

/**
 * Executes pnpm command with fallback to npx
 */
export async function execPnpm(
  args: string[],
  options: CliOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  const defaultOptions = {
    stdio: 'pipe' as const,
    timeout: 30000,
    ...options
  };

  // First try global installation
  try {
    await which('pnpm');
    logger.debug(`Using global pnpm`);
    return await execa('pnpm', args, defaultOptions);
  } catch (globalError) {
    logger.debug(`Global pnpm not found, trying local installation via npx`);
    
    // Try local installation via npx
    try {
      return await execa('npx', ['pnpm', ...args], defaultOptions);
    } catch (localError) {
      logger.debug(`Local pnpm via npx also failed`);
      
      // Enhanced error handling to capture stderr
      let errorMessage = `Failed to execute pnpm`;
      if (localError instanceof Error) {
        errorMessage += `: ${localError.message}`;
        
        // If it's an execa error, it might have stdout/stderr
        if ('stderr' in localError && localError.stderr) {
          errorMessage += `\nStderr: ${localError.stderr}`;
        }
        if ('stdout' in localError && localError.stdout) {
          errorMessage += `\nStdout: ${localError.stdout}`;
        }
      }
      
      const enhancedError = new Error(errorMessage);
      // Preserve original error properties
      if (localError instanceof Error && 'stderr' in localError) {
        (enhancedError as any).stderr = localError.stderr;
      }
      if (localError instanceof Error && 'stdout' in localError) {
        (enhancedError as any).stdout = localError.stdout;
      }
      
      throw enhancedError;
    }
  }
}

/**
 * Executes pnpm command in detached mode (for dev servers)
 * This spawns a completely separate process that continues running after the CLI exits
 */
export async function execPnpmDetached(
  args: string[],
  options: CliOptions = {}
): Promise<void> {
  const { spawn } = await import('child_process');
  
  // Determine which pnpm command to use
  let command = 'pnpm';
  let commandArgs = args;
  
  try {
    await which('pnpm');
    logger.debug(`Using global pnpm for detached execution`);
  } catch {
    logger.debug(`Global pnpm not found, using npx for detached execution`);
    command = 'npx';
    commandArgs = ['pnpm', ...args];
  }

  return new Promise((resolve, reject) => {
    // Spawn process that continues in the same terminal
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      detached: false,  // Don't detach - stay in same terminal
      stdio: 'inherit', // Inherit stdio to stay in same terminal
      shell: true
    });

    // Handle immediate startup errors
    child.on('error', (error) => {
      reject(new Error(`Failed to start process: ${error.message}`));
    });

    // Give the process a moment to start up, then resolve
    setTimeout(() => {
      if (!child.killed) {
        logger.debug(`Process started successfully with PID: ${child.pid}`);
        resolve();
        
        // Exit the CLI process after a short delay to let the dev server fully start
        setTimeout(() => {
          process.exit(0);
        }, 2000);
      } else {
        reject(new Error('Process failed to start'));
      }
    }, 1000);
  });
} 