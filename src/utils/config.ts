import fs from 'fs-extra';
import path from 'path';
import { logger } from './logger.js';
import { validateUrl } from './validation.js';

interface ProjectConfig {
  name: string;
  directory: string;
  firebase: {
    projectId: string;
    apiKey: string;
    messagingSenderId: string;
    appId: string;
    measurementId: string;
  };
  database: {
    url: string;
    provider: 'neon' | 'supabase' | 'other';
  };
  cloudflare: {
    workerName: string;
  };
}

function validateReplacementValue(key: string, value: string): boolean {
  // Validate based on the type of configuration
  switch (key) {
    case '{{DATABASE_URL}}':
      return validateUrl(value);
    case '{{WORKER_NAME}}':
      return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value) && value.length <= 63;
    case '{{FIREBASE_PROJECT_ID}}':
      return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(value) && value.length >= 6 && value.length <= 30;
    default:
      return true;
  }
}

export async function generateConfigFiles(config: ProjectConfig): Promise<void> {
  const { directory, firebase, database, cloudflare } = config;

  // Define placeholder replacements - simplified for JWKS approach
  const replacements = {
    '{{WORKER_NAME}}': cloudflare.workerName,
    '{{FIREBASE_PROJECT_ID}}': firebase.projectId,
    '{{DATABASE_URL}}': database.url
  };

  // Validate replacement values
  for (const [key, value] of Object.entries(replacements)) {
    if (!validateReplacementValue(key, value)) {
      logger.warning(`Invalid value for ${key}: ${value}`);
      logger.debug(`Validation failed for ${key}, but continuing with generation`);
    }
  }

  // Generate Node.js development configuration files
  await generateNodeEnvFile(directory, replacements);
  
  // Generate UI configuration files (still need this for Firebase config)
  await generateFirebaseConfig(directory, config.firebase);
  
  // Platform-specific templates are kept as templates and only populated during deployment
  logger.debug('Development configuration files generated successfully');
  logger.debug('Platform-specific templates ready for deployment');
}

async function generateNodeEnvFile(directory: string, replacements: Record<string, string>): Promise<void> {
  const templatePath = path.join(directory, 'server', '.env.example');
  const outputPath = path.join(directory, 'server', '.env');
  
  // The .env.example should exist in the template
  if (!await fs.pathExists(templatePath)) {
    logger.error('Template missing required file: server/.env.example');
    throw new Error('Invalid template: server/.env.example not found');
  }
  
  await replaceTemplateFile(templatePath, outputPath, replacements);
  logger.debug('Generated server/.env for Node.js development');
}

async function generateFirebaseConfig(directory: string, firebase: { projectId: string; apiKey: string; messagingSenderId: string; appId: string; measurementId: string }): Promise<void> {
  const templatePath = path.join(directory, 'ui', 'src', 'lib', 'firebase-config.template.json');
  const outputPath = path.join(directory, 'ui', 'src', 'lib', 'firebase-config.json');
  
  // Use the complete Firebase configuration from the setup process
  const firebaseConfig = {
    apiKey: firebase.apiKey,
    authDomain: `${firebase.projectId}.firebaseapp.com`,
    projectId: firebase.projectId,
    storageBucket: `${firebase.projectId}.appspot.com`,
    messagingSenderId: firebase.messagingSenderId,
    appId: firebase.appId,
    measurementId: firebase.measurementId
  };
  
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, JSON.stringify(firebaseConfig, null, 2), 'utf-8');
  logger.debug('Generated ui/src/lib/firebase-config.json with complete Firebase configuration');
}

async function replaceTemplateFile(
  templatePath: string, 
  outputPath: string, 
  replacements: Record<string, string>
): Promise<void> {
  let content = await fs.readFile(templatePath, 'utf-8');
  
  // Replace all placeholders
  for (const [placeholder, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }
  
  // Ensure output directory exists
  await fs.ensureDir(path.dirname(outputPath));
  
  // Write the generated file
  await fs.writeFile(outputPath, content, 'utf-8');
}

export async function validateConfigGeneration(directory: string): Promise<boolean> {
  const requiredFiles = [
    'server/.env',
    'ui/src/lib/firebase-config.json'
  ];
  
  // Check that platform templates exist (but are not populated yet)
  const platformTemplates = [
    'server/platforms/cloudflare/wrangler.toml.template',
    'server/platforms/cloudflare/.dev.vars.template'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(directory, file);
    if (!await fs.pathExists(filePath)) {
      logger.debug(`Config validation failed: missing ${file}`);
      return false;
    }
    
    // Check if file still contains placeholders (indicating replacement failed)
    const content = await fs.readFile(filePath, 'utf-8');
    if (content.includes('{{') && content.includes('}}')) {
      logger.debug(`Config validation failed: ${file} still contains placeholders`);
      return false;
    }
  }
  
  // Validate platform templates exist
  for (const template of platformTemplates) {
    const templatePath = path.join(directory, template);
    if (!await fs.pathExists(templatePath)) {
      logger.debug(`Config validation failed: missing platform template ${template}`);
      return false;
    }
  }
  
  return true;
} 