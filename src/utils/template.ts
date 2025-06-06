import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger.js';
import { execGit } from './cli.js';

export function validateTemplateUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Whitelist trusted domains
    const trustedDomains = ['github.com', 'gitlab.com', 'bitbucket.org'];
    return trustedDomains.some(domain => parsedUrl.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

export async function cloneTemplate(
  templateUrl: string, 
  targetDirectory: string,
  branch?: string,
  onProgress?: (progress: number, message?: string) => void
): Promise<void> {
  logger.debug(`Cloning template from ${templateUrl} to ${targetDirectory}${branch ? ` (branch: ${branch})` : ''}`);
  
  // Validate template URL for security
  if (!validateTemplateUrl(templateUrl)) {
    throw new Error(`Invalid or untrusted template URL: ${templateUrl}. Only GitHub, GitLab, and Bitbucket repositories are allowed.`);
  }
  
  onProgress?.(10, 'Preparing to clone template');
  
  // Ensure parent directory exists
  await fs.ensureDir(path.dirname(targetDirectory));
  
  try {
    onProgress?.(20, 'Cloning repository');
    
    // Clone the repository with optional branch specification
    const cloneArgs = ['clone'];
    if (branch) {
      cloneArgs.push('-b', branch);
    }
    cloneArgs.push(templateUrl, targetDirectory);
    
    await execGit(cloneArgs, {
      stdio: 'pipe'
    });
    
    onProgress?.(50, 'Validating template structure');
    
    // Validate template structure after cloning
    const isValidTemplate = await validateTemplate(targetDirectory);
    if (!isValidTemplate) {
      throw new Error(`Invalid template structure. The repository does not appear to be a valid Volo app template.`);
    }
    
    onProgress?.(70, 'Preparing template files');
    
    // Replace README.md with README.template.md for CLI users
    await replaceReadmeForCli(targetDirectory);
    
    onProgress?.(80, 'Cleaning up git history');
    
    // Remove .git directory to start fresh
    const gitDir = path.join(targetDirectory, '.git');
    if (await fs.pathExists(gitDir)) {
      await fs.remove(gitDir);
      logger.debug('Removed .git directory from template');
    }
    
    onProgress?.(90, 'Initializing new repository');
    
    // Initialize new git repository
    await execGit(['init'], { cwd: targetDirectory, stdio: 'pipe' });
    await execGit(['add', '.'], { cwd: targetDirectory, stdio: 'pipe' });
    await execGit(['commit', '-m', 'Initial commit from create-volo-app'], { 
      cwd: targetDirectory, 
      stdio: 'pipe' 
    });
    
    onProgress?.(100, 'Template ready');
    
    logger.debug('Initialized new git repository');
    
  } catch (error) {
    // Clean up on failure
    if (await fs.pathExists(targetDirectory)) {
      await fs.remove(targetDirectory);
    }
    throw new Error(`Failed to clone template: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function replaceReadmeForCli(templatePath: string): Promise<void> {
  const readmePath = path.join(templatePath, 'README.md');
  const templateReadmePath = path.join(templatePath, 'README.template.md');
  
  // Check if template README exists
  if (await fs.pathExists(templateReadmePath)) {
    // Replace the main README with the template version
    await fs.move(templateReadmePath, readmePath, { overwrite: true });
    logger.debug('Replaced README.md with template version for CLI users');
  } else {
    logger.debug('No README.template.md found, keeping original README.md');
  }
}

export async function validateTemplate(templatePath: string): Promise<boolean> {
  // Check if this looks like a valid volo-app template
  const requiredFiles = [
    'package.json',
    'server/src/api.ts',
    'server/src/server.ts',
    'server/src/lib/env.ts',
    'server/.env.example',
    'server/platforms/cloudflare/wrangler.toml.template',
    'ui/src/lib/firebase-config.template.json',
    'scripts/post-setup.js'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(templatePath, file);
    if (!await fs.pathExists(filePath)) {
      logger.debug(`Template validation failed: missing ${file}`);
      return false;
    }
  }
  
  // Check if package.json has template configuration
  try {
    const packageJsonPath = path.join(templatePath, 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);
    
    if (!packageJson.template || !packageJson.template.placeholders) {
      logger.debug('Template validation failed: missing template.placeholders in package.json');
      return false;
    }
    
    // Check if server package.json has the required scripts
    const serverPackageJsonPath = path.join(templatePath, 'server', 'package.json');
    if (await fs.pathExists(serverPackageJsonPath)) {
      const serverPackageJson = await fs.readJson(serverPackageJsonPath);
      const requiredScripts = ['dev', 'deploy', 'deploy:cf'];
      
      for (const script of requiredScripts) {
        if (!serverPackageJson.scripts || !serverPackageJson.scripts[script]) {
          logger.debug(`Template validation failed: missing script "${script}" in server/package.json`);
          return false;
        }
      }
    }
    
    return true;
  } catch (error) {
    logger.debug(`Template validation failed: ${error}`);
    return false;
  }
} 