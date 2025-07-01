import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { tmpdir } from 'os';
import { logger } from './logger.js';

export function validateTemplateUrl(url: string): boolean {
  // Allow local paths
  if (url.startsWith('./') || url.startsWith('../')) {
    return true;
  }

  try {
    const parsedUrl = new URL(url);
    // Whitelist trusted domains
    const trustedDomains = ['github.com', 'gitlab.com', 'bitbucket.org'];
    return trustedDomains.some(domain => parsedUrl.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

/**
 * Extracts owner and repo from a git URL
 */
function parseGitUrl(url: string): { owner: string; repo: string } {
  // Handle different URL formats:
  // https://github.com/owner/repo.git
  // https://github.com/owner/repo
  // git@github.com:owner/repo.git
  
  let cleanUrl = url;
  
  // Remove .git suffix if present
  if (cleanUrl.endsWith('.git')) {
    cleanUrl = cleanUrl.slice(0, -4);
  }
  
  // Handle SSH format
  if (cleanUrl.startsWith('git@')) {
    // git@github.com:owner/repo -> github.com/owner/repo
    cleanUrl = cleanUrl.replace(/^git@([^:]+):/, 'https://$1/');
  }
  
  // Parse the URL
  const parsedUrl = new URL(cleanUrl);
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  
  if (pathParts.length < 2) {
    throw new Error(`Invalid repository URL: ${url}`);
  }
  
  return {
    owner: pathParts[0],
    repo: pathParts[1]
  };
}

/**
 * Downloads and extracts a GitHub repository using tarball
 */
export async function downloadTemplate(
  templateUrl: string, 
  targetDirectory: string,
  branch: string = 'main',
  onProgress?: (progress: number, message?: string) => void
): Promise<void> {
  logger.debug(`Downloading template from ${templateUrl} to ${targetDirectory} (branch: ${branch})`);
  
  // Handle local template paths
  if (templateUrl.startsWith('./') || templateUrl.startsWith('../')) {
    // Since this script runs from the 'dist' directory, we need to resolve
    // the template path relative to the project root.
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(scriptDir, '..', '..');
    const localTemplatePath = path.resolve(projectRoot, templateUrl);

    logger.debug(`Resolved local template path to: ${localTemplatePath}`);

    if (!await fs.pathExists(localTemplatePath)) {
      throw new Error(`Local template not found at resolved path: ${localTemplatePath}`);
    }

    logger.debug(`Found local template at: ${localTemplatePath}`);
    onProgress?.(10, 'Copying local template');
    
    try {
      await fs.copy(localTemplatePath, targetDirectory, {
        filter: (src) => !src.includes('.git'),
      });

      onProgress?.(70, 'Validating template structure');
      const isValidTemplate = await validateTemplate(targetDirectory);
      if (!isValidTemplate) {
        throw new Error(`Invalid template structure. The directory does not appear to be a valid Volo app template.`);
      }

      onProgress?.(85, 'Preparing template files');
      await replaceReadmeForCli(targetDirectory);

      onProgress?.(90, 'Initializing git repository');
      await initializeGitRepo(targetDirectory);

      onProgress?.(100, 'Template ready');
      logger.debug('Local template copied and prepared successfully');
      return; // Exit after handling local template
    } catch (error) {
      throw new Error(`Failed to process local template: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // If not a local path, proceed with remote URL logic
  logger.debug(`'${templateUrl}' is not a local path, treating as a URL.`);

  // Validate template URL for security
  if (!validateTemplateUrl(templateUrl)) {
    throw new Error(`Invalid or untrusted template URL: ${templateUrl}. Only GitHub, GitLab, and Bitbucket repositories are allowed.`);
  }
  
  onProgress?.(10, 'Preparing to download template');
  
  try {
    // Parse the repository URL to extract owner and repo
    const { owner, repo } = parseGitUrl(templateUrl);
    
    // Construct the tarball URL
    const tarballUrl = `https://github.com/${owner}/${repo}/archive/${branch}.tar.gz`;
    
    onProgress?.(20, 'Downloading template archive');
    logger.debug(`Downloading tarball from: ${tarballUrl}`);
    
    const tempFile = path.join(tmpdir(), `volo-template-${Date.now()}.tar.gz`);
    await downloadFile(tarballUrl, tempFile);
    
    await fs.ensureDir(targetDirectory);
    onProgress?.(40, 'Extracting template files');
    await extractTarball(tempFile, targetDirectory);
    await fs.remove(tempFile);
    
    onProgress?.(70, 'Validating template structure');
    const isValidTemplate = await validateTemplate(targetDirectory);
    if (!isValidTemplate) {
      throw new Error(`Invalid template structure. The repository does not appear to be a valid Volo app template.`);
    }
    
    onProgress?.(85, 'Preparing template files');
    await replaceReadmeForCli(targetDirectory);
    
    onProgress?.(90, 'Initializing git repository');
    await initializeGitRepo(targetDirectory);
    
    onProgress?.(100, 'Template ready');
    logger.debug('Template downloaded and extracted successfully');
    
  } catch (error) {
    const isEmpty = await isDirectoryEmpty(targetDirectory);
    if (isEmpty) {
      try {
        await fs.remove(targetDirectory);
        logger.debug('Cleaned up empty directory after failure');
      } catch (cleanupError) {
        logger.debug(`Failed to cleanup directory: ${cleanupError}`);
      }
    }
    
    throw new Error(`Failed to download template: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Downloads a file from a URL to a local path
 */
async function downloadFile(url: string, filePath: string): Promise<void> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }
  
  if (!response.body) {
    throw new Error('Response body is null');
  }
  
  const fileStream = createWriteStream(filePath);
  
  // Convert ReadableStream to Node.js ReadableStream
  const reader = response.body.getReader();
  
  return new Promise((resolve, reject) => {
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
                   if (!fileStream.write(value)) {
           await new Promise<void>(resolve => fileStream.once('drain', resolve));
         }
        }
        fileStream.end();
        resolve();
      } catch (error) {
        fileStream.destroy();
        reject(error);
      }
    };
    
    fileStream.on('error', reject);
    fileStream.on('finish', resolve);
    
    pump().catch(reject);
  });
}

/**
 * Extracts a tarball file to a directory
 */
async function extractTarball(tarballPath: string, targetDirectory: string): Promise<void> {
  const tar = await import('tar');
  
  // Extract with strip=1 to remove the top-level directory
  await tar.extract({
    file: tarballPath,
    cwd: targetDirectory,
    strip: 1,
    filter: (path: string) => {
      // Skip .git directories if they somehow exist in the tarball
      return !path.includes('.git/');
    }
  });
}

/**
 * Checks if a directory is empty
 */
async function isDirectoryEmpty(dirPath: string): Promise<boolean> {
  try {
    const files = await fs.readdir(dirPath);
    return files.length === 0;
  } catch {
    return true; // Directory doesn't exist, so it's "empty"
  }
}

/**
 * Initializes a fresh git repository
 */
async function initializeGitRepo(targetDirectory: string): Promise<void> {
  try {
    // We no longer need execGit since we're not cloning
    // Just use basic git commands if git is available
    const { execa } = await import('execa');
    
    // Check if git is available
    try {
      await execa('git', ['--version'], { cwd: targetDirectory });
    } catch {
      logger.debug('Git not available, skipping git initialization');
      return;
    }
    
    await execa('git', ['init', '--initial-branch=main'], { cwd: targetDirectory });
    await execa('git', ['add', '.'], { cwd: targetDirectory });
    
    // Try to commit, but don't fail if git user is not configured
    try {
      await execa('git', ['commit', '-m', 'Initial commit from create-volo-app'], { 
        cwd: targetDirectory 
      });
      logger.debug('Initialized git repository and created initial commit');
    } catch (commitError) {
      logger.debug('Git user not configured, files staged but not committed');
    }
  } catch (error) {
    logger.debug(`Failed to initialize git repository: ${error}`);
    // Don't throw - git initialization is optional
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

// For backward compatibility, export the old function name as an alias
export const cloneTemplate = downloadTemplate; 