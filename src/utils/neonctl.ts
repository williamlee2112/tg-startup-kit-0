import { execa } from 'execa';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Find the neonctl binary path
 * This avoids nested npx calls when create-volo-app is run via npx
 */
function findNeonctlPath(): string {
  // Start from the current file and traverse up to find node_modules
  let currentDir = __dirname;
  
  while (currentDir !== path.parse(currentDir).root) {
    const nodeModulesPath = path.join(currentDir, 'node_modules');
    const neonctlBinPath = path.join(nodeModulesPath, '.bin', 'neonctl');
    
    // Check for different possible binary names based on OS
    const possiblePaths = [
      neonctlBinPath,
      `${neonctlBinPath}.cmd`, // Windows
      `${neonctlBinPath}.ps1`, // PowerShell
    ];
    
    for (const binPath of possiblePaths) {
      if (fs.existsSync(binPath)) {
        return binPath;
      }
    }
    
    currentDir = path.dirname(currentDir);
  }
  
  // Fallback: try to use the neonctl from the package's direct node_modules
  const packageRoot = path.resolve(__dirname, '..', '..');
  const fallbackPath = path.join(packageRoot, 'node_modules', '.bin', 'neonctl');
  
  if (fs.existsSync(fallbackPath)) {
    return fallbackPath;
  }
  
  if (fs.existsSync(`${fallbackPath}.cmd`)) {
    return `${fallbackPath}.cmd`;
  }
  
  // Last resort: use npx (this may cause the nested npx issue)
  return 'npx';
}

/**
 * Execute neonctl command with the given arguments
 * @param args Command arguments to pass to neonctl
 * @param options Execution options
 */
export async function execNeonctl(args: string[], options: { stdio?: 'pipe' | 'inherit' } = {}) {
  const neonctlPath = findNeonctlPath();
  
  if (neonctlPath === 'npx') {
    // Fallback to npx if we can't find the direct binary
    return await execa('npx', ['neonctl', ...args], options);
  } else {
    // Use the direct binary path
    return await execa(neonctlPath, args, options);
  }
} 