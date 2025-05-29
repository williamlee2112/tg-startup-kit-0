import { execa } from 'execa';
import which from 'which';
import semver from 'semver';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '../logger.js';
import type { 
  Prerequisite, 
  PrerequisiteOptions, 
  PrerequisiteResult, 
  CheckPrerequisitesResult 
} from './types.js';
import { corePrerequisites, databasePrerequisites } from './prereqList.js';
import { checkNetworkConnectivity } from './networkCheck.js';
import { installCliTool, checkLocalCliTool } from './installCLIs.js';
import { checkDatabaseChoice, displayManualInstallInstructions } from './userInstructions.js';

async function checkPrerequisite(prereq: Prerequisite): Promise<PrerequisiteResult> {
  try {
    // Handle bundled dependencies that don't need CLI checks
    if (prereq.command === 'skip' && prereq.version === 'skip') {
      return { status: 'ok', currentVersion: 'bundled' };
    }
    
    // First, check if command exists globally
    if (prereq.command === 'skip') {
      return { status: 'ok', currentVersion: 'available via npx' };
    }

    // Try to find global installation
    let globalFound = false;
    let globalVersion: string | null = null;
    
    try {
      const commandPath = await which(prereq.command);
      logger.debug(`Found ${prereq.name} globally at: ${commandPath}`);
      globalFound = true;
    } catch (error) {
      logger.debug(`${prereq.name} not found globally: ${error}`);
      globalFound = false;
    }

    // If found, try to check version
    if (globalFound && prereq.version) {
      try {
        const { stdout } = await execa(prereq.command, [prereq.version]);
        globalVersion = prereq.checkVersion ? prereq.checkVersion(stdout) : stdout.trim();

        if (globalVersion) {
          logger.debug(`Global ${prereq.name} version: ${globalVersion}`);

          if (prereq.minVersion && !semver.gte(globalVersion, prereq.minVersion)) {
            // Global version is outdated, check if we can use/install local version
            if (prereq.canInstallLocally) {
              const localResult = await checkLocalCliTool(prereq);
              if (localResult.status === 'ok') {
                return { status: 'installed_locally', currentVersion: localResult.currentVersion };
              }
              // Will offer to install locally below
            } else {
              return { status: 'outdated', currentVersion: globalVersion };
            }
          } else {
            return { status: 'ok', currentVersion: globalVersion };
          }
        }
      } catch (error) {
        logger.debug(`${prereq.name} found but failed to run: ${error}`);
        // CLI exists but can't run (dependency issues, etc.)
        // Try local installation if available
        if (prereq.canInstallLocally) {
          const localResult = await checkLocalCliTool(prereq);
          if (localResult.status === 'ok') {
            return { status: 'installed_locally', currentVersion: localResult.currentVersion };
          }
        }
        // If we can't use local, treat as missing since the global one doesn't work
        return { status: 'missing' };
      }
    } else if (globalFound && !prereq.version) {
      return { status: 'ok' };
    }

    // If global not found or outdated, check for local installation
    if (prereq.canInstallLocally) {
      const localResult = await checkLocalCliTool(prereq);
      if (localResult.status === 'ok') {
        return { status: 'installed_locally', currentVersion: localResult.currentVersion };
      }
    }

    // Neither global nor local found
    return { status: 'missing' };
    
  } catch (error) {
    logger.debug(`${prereq.name} check failed: ${error}`);
    return { status: 'missing' };
  }
}

export async function checkPrerequisites(options: PrerequisiteOptions = {}): Promise<CheckPrerequisitesResult> {
  const hasNetwork = await checkNetworkConnectivity();
  if (!hasNetwork) {
    logger.warning('No internet connection detected. Some features may not work properly.');
    logger.info('Please ensure you have a stable internet connection and try again.');
    
    const { continueOffline } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueOffline',
        message: 'Continue anyway? (You can set up services manually later)',
        default: false
      }
    ]);

    if (!continueOffline) {
      process.exit(1);
    }
  }

  // Check database preference for CLI validation
  let databaseChoice: string | null;
  
  if (options.databasePreference) {
    // Use provided database preference
    databaseChoice = options.databasePreference;
    logger.info(`Using database provider: ${databaseChoice}`);
  } else if (options.fastMode) {
    // Default to Neon in fast mode
    databaseChoice = 'neon';
    logger.info('Fast mode: Using Neon as database provider');
  } else {
    // Ask user for preference
    databaseChoice = await checkDatabaseChoice();
  }
  
  // Build prerequisites list
  const prerequisites = [...corePrerequisites];
  if (databaseChoice && databasePrerequisites[databaseChoice]) {
    prerequisites.push(databasePrerequisites[databaseChoice]);
    logger.info(`Database choice "${databaseChoice}" requires: ${databasePrerequisites[databaseChoice].name}`);
  } else if (databaseChoice) {
    logger.info(`Database choice "${databaseChoice}" - no additional CLI tools required`);
  } else {
    logger.info('No database provider selected - skipping database CLI checks');
  }

  let recheckNeeded = true;
  
  while (recheckNeeded) {
    recheckNeeded = false;
    
    logger.newLine();
    logger.info('Checking required tools...');
    logger.newLine();

    const missing: Prerequisite[] = [];
    const outdated: { prereq: Prerequisite; currentVersion: string }[] = [];

    for (const prereq of prerequisites) {
      const result = await checkPrerequisite(prereq);
      
      switch (result.status) {
        case 'ok':
          logger.success(`${prereq.name} ${result.currentVersion || ''} ✓`);
          break;
        case 'missing':
          if (prereq.optional) {
            logger.warning(`${prereq.name} not found (optional - can be installed later)`);
          } else {
            missing.push(prereq);
          }
          break;
        case 'outdated':
          outdated.push({ prereq, currentVersion: result.currentVersion! });
          break;
        case 'installed_locally':
          logger.success(`${prereq.name} ${result.currentVersion || ''} ✓ (installed locally)`);
          break;
      }
    }

    // Handle missing prerequisites
    if (missing.length > 0) {
      logger.newLine();
      
      // Separate missing tools into categories
      const canInstallViaNpm = missing.filter(p => p.canInstallLocally || p.canInstallGlobally);
      const systemTools = missing.filter(p => p.systemTool && !p.npmPackage);
      
      if (canInstallViaNpm.length > 0) {
        logger.info('Missing CLI tools that can be installed automatically:');
        logger.newLine();
        
        for (const prereq of canInstallViaNpm) {
          console.log(chalk.yellow(`⚠️  ${prereq.name}`));
          console.log(chalk.gray(`   ${prereq.description}`));
          console.log('');
        }
        
        let installChoice = 'none';
        
        if (options.autoInstall) {
          installChoice = 'global';
        } else {
          const choices = [];
          
          // Check if any tools support global installation
          const canInstallGlobally = canInstallViaNpm.some(p => p.canInstallGlobally);
          if (canInstallGlobally) {
            choices.push({
              name: 'Install globally (recommended - available system-wide)',
              value: 'global'
            });
          }
          
          // Check if any tools support local installation
          const canInstallLocally = canInstallViaNpm.some(p => p.canInstallLocally);
          if (canInstallLocally) {
            choices.push({
              name: 'Install locally (you\'ll need to do this again for each app)',
              value: 'local'
            });
          }
          
          choices.push({
            name: 'Don\'t install automatically (exit CLI)',
            value: 'none'
          });
          
          const response = await inquirer.prompt([
            {
              type: 'list',
              name: 'installChoice',
              message: 'How would you like to install the missing CLI tools?',
              choices
            }
          ]);
          installChoice = response.installChoice;
        }
        
        if (installChoice === 'none') {
          logger.info('Installation cancelled. Please install the missing tools manually and run create-volo-app again.');
          process.exit(1);
        }
        
        const isGlobal = installChoice === 'global';
        
        logger.newLine();
        logger.info(`Installing CLI tools ${isGlobal ? 'globally' : 'locally'}...`);
        logger.newLine();
        
        const failedInstalls: Prerequisite[] = [];
        
        for (const prereq of canInstallViaNpm) {
          let success = false;
          
          // Try preferred installation method first
          if ((isGlobal && prereq.canInstallGlobally) || (!isGlobal && prereq.canInstallLocally)) {
            success = await installCliTool(prereq, isGlobal);
          }
          
          // If preferred method isn't supported or failed, try the alternative
          if (!success) {
            if (isGlobal && prereq.canInstallLocally) {
              logger.info(`${prereq.name} doesn't support global installation, trying local installation...`);
              success = await installCliTool(prereq, false); // Try local
            } else if (!isGlobal && prereq.canInstallGlobally) {
              logger.info(`${prereq.name} doesn't support local installation, trying global installation...`);
              success = await installCliTool(prereq, true); // Try global
            }
          }
          
          if (!success) {
            failedInstalls.push(prereq);
          }
        }
        
        if (failedInstalls.length === 0) {
          logger.newLine();
          logger.success(`All CLI tools installed ${isGlobal ? 'globally' : 'locally'}! ✨`);
        } else {
          logger.newLine();
          logger.warning(`Some tools couldn't be installed automatically:`);
          for (const prereq of failedInstalls) {
            console.log(chalk.yellow(`  • ${prereq.name}`));
          }
          systemTools.push(...failedInstalls);
        }
      }
      
      if (systemTools.length > 0) {
        const shouldContinue = await displayManualInstallInstructions(systemTools);
        if (!shouldContinue) {
          recheckNeeded = true;
          continue;
        }
      }
    }

    // Handle outdated prerequisites
    if (outdated.length > 0) {
      logger.newLine();
      console.log(chalk.yellow.bold('⚠️  Outdated Tools Detected'));
      logger.newLine();

      for (const { prereq, currentVersion } of outdated) {
        console.log(chalk.yellow(`⚠️  ${prereq.name} ${currentVersion} (minimum: ${prereq.minVersion})`));
        console.log(chalk.gray(`   ${prereq.description}`));
        console.log(chalk.blue(`   Update from: ${prereq.installUrl}`));
        console.log('');
      }

      const { shouldContinue } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldContinue',
          message: 'Would you like to continue with outdated tools? (May cause issues)',
          default: false
        }
      ]);

      if (!shouldContinue) {
        logger.info('Please update the outdated tools and run create-volo-app again.');
        process.exit(1);
      }
    }
  }

  logger.newLine();
  logger.success('Prerequisites check completed!');
  logger.newLine();

  return { databasePreference: databaseChoice || undefined, databaseConfig: undefined };
} 