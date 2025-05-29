import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs-extra';
import os from 'os';
import { logger } from './logger.js';

const execAsync = promisify(exec);

// Get the directory of this package (create-volo-app)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '../../'); // Go up from dist/utils to package root

interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Get a working directory that has a package.json file
 * This prevents neonctl from hanging when no package.json is present
 */
async function getWorkingDirectoryWithPackageJson(): Promise<string> {
  // First, try to use the create-volo-app package root
  const packageJsonPath = join(packageRoot, 'package.json');
  if (await fs.pathExists(packageJsonPath)) {
    logger.debug(`Using package root as working directory: ${packageRoot}`);
    return packageRoot;
  }
  
  // Fallback: create a temporary directory with minimal package.json
  const tempDir = join(os.tmpdir(), 'create-volo-app-neonctl');
  await fs.ensureDir(tempDir);
  
  const tempPackageJson = join(tempDir, 'package.json');
  if (!(await fs.pathExists(tempPackageJson))) {
    await fs.writeJson(tempPackageJson, {
      name: 'temp-neonctl-context',
      version: '1.0.0',
      private: true
    });
    logger.debug(`Created temporary package.json at: ${tempDir}`);
  }
  
  return tempDir;
}

/**
 * Execute neonctl command with the given arguments
 * Assumes neonctl is already installed (handled by prerequisites check)
 * @param args Command arguments to pass to neonctl
 * @param options Execution options
 */
export async function execNeonctl(args: string[], options: { stdio?: 'pipe' | 'inherit'; timeout?: number } = {}): Promise<ExecResult> {
  const timeout = options.timeout || 30000; // 30 second default timeout
  
  // Get a working directory with package.json to prevent hanging
  const workingDir = await getWorkingDirectoryWithPackageJson();
  
  logger.debug(`Executing neonctl with args: ${args.join(' ')} from directory: ${workingDir}`);
  
  return new Promise((resolve, reject) => {
    // Use spawn with neonctl command (could be global or local via npx)
    const child = spawn('neonctl', args, {
      stdio: options.stdio === 'pipe' ? ['pipe', 'pipe', 'pipe'] : 'inherit',
      shell: true,
      cwd: workingDir,
      env: {
        ...process.env,
      }
    });
    
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      reject(new Error(`neonctl command timed out after ${timeout / 1000} seconds`));
    }, timeout);
    
    // Collect output if stdio is 'pipe'
    if (options.stdio === 'pipe') {
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
    }
    
    child.on('close', (code) => {
      clearTimeout(timeoutId);
      
      if (timedOut) {
        return; // Already rejected
      }
      
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`neonctl command failed with exit code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', (error) => {
      clearTimeout(timeoutId);
      
      if (!timedOut) {
        reject(error);
      }
    });
  });
} 