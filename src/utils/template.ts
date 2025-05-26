import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger.js';

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

export async function cloneTemplate(templateUrl: string, targetDirectory: string): Promise<void> {
  logger.debug(`Cloning template from ${templateUrl} to ${targetDirectory}`);
  
  // Validate template URL for security
  if (!validateTemplateUrl(templateUrl)) {
    throw new Error(`Invalid or untrusted template URL: ${templateUrl}. Only GitHub, GitLab, and Bitbucket repositories are allowed.`);
  }
  
  // Ensure parent directory exists
  await fs.ensureDir(path.dirname(targetDirectory));
  
  try {
    // Clone the repository
    await execa('git', ['clone', templateUrl, targetDirectory], {
      stdio: 'pipe'
    });
    
    // Validate template structure after cloning
    const isValidTemplate = await validateTemplate(targetDirectory);
    if (!isValidTemplate) {
      throw new Error(`Invalid template structure. The repository does not appear to be a valid Volo app template.`);
    }
    
    // Remove .git directory to start fresh
    const gitDir = path.join(targetDirectory, '.git');
    if (await fs.pathExists(gitDir)) {
      await fs.remove(gitDir);
      logger.debug('Removed .git directory from template');
    }
    
    // Initialize new git repository
    await execa('git', ['init'], { cwd: targetDirectory, stdio: 'pipe' });
    await execa('git', ['add', '.'], { cwd: targetDirectory, stdio: 'pipe' });
    await execa('git', ['commit', '-m', 'Initial commit from create-volo-app'], { 
      cwd: targetDirectory, 
      stdio: 'pipe' 
    });
    
    logger.debug('Initialized new git repository');
    
  } catch (error) {
    // Clean up on failure
    if (await fs.pathExists(targetDirectory)) {
      await fs.remove(targetDirectory);
    }
    throw new Error(`Failed to clone template: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function validateTemplate(templatePath: string): Promise<boolean> {
  // Check if this looks like a valid volo-app template
  const requiredFiles = [
    'package.json',
    'server/wrangler.toml',
    'server/.dev.vars.example',
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
    
    return true;
  } catch (error) {
    logger.debug(`Template validation failed: ${error}`);
    return false;
  }
} 