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
    case '{{FIREBASE_API_KEY}}':
      return /^[A-Za-z0-9_-]+$/.test(value);
    case '{{DATABASE_URL}}':
      return validateUrl(value);
    case '{{WORKER_NAME}}':
      return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value) && value.length <= 63;
    case '{{FIREBASE_PROJECT_ID}}':
      return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(value) && value.length >= 6 && value.length <= 30;
    case '{{FIREBASE_MESSAGING_SENDER_ID}}':
      return /^\d+$/.test(value);
    case '{{FIREBASE_APP_ID}}':
      return /^1:\d+:web:[a-f0-9]+$/.test(value);
    case '{{FIREBASE_MEASUREMENT_ID}}':
      return /^G-[A-Z0-9]+$/.test(value) || value === 'G-PLACEHOLDER';
    default:
      return true;
  }
}

export async function generateConfigFiles(config: ProjectConfig): Promise<void> {
  const { directory, firebase, database, cloudflare } = config;

  // Define placeholder replacements
  const replacements = {
    '{{WORKER_NAME}}': cloudflare.workerName,
    '{{FIREBASE_PROJECT_ID}}': firebase.projectId,
    '{{FIREBASE_API_KEY}}': firebase.apiKey,
    '{{FIREBASE_MESSAGING_SENDER_ID}}': firebase.messagingSenderId,
    '{{FIREBASE_APP_ID}}': firebase.appId,
    '{{FIREBASE_MEASUREMENT_ID}}': firebase.measurementId,
    '{{DATABASE_URL}}': database.url
  };

  // Validate replacement values
  for (const [key, value] of Object.entries(replacements)) {
    if (!validateReplacementValue(key, value)) {
      logger.warning(`Invalid value for ${key}: ${value}`);
      logger.debug(`Validation failed for ${key}, but continuing with generation`);
    }
  }

  // Generate server configuration files
  await generateDevVars(directory, replacements);
  await generateWranglerConfig(directory, replacements);
  
  // Generate UI configuration files
  await generateFirebaseConfig(directory, replacements);
  
  logger.debug('All configuration files generated successfully');
}

async function generateDevVars(directory: string, replacements: Record<string, string>): Promise<void> {
  const templatePath = path.join(directory, 'server', '.dev.vars.example');
  const outputPath = path.join(directory, 'server', '.dev.vars');
  
  await replaceTemplateFile(templatePath, outputPath, replacements);
  logger.debug('Generated server/.dev.vars');
}

async function generateWranglerConfig(directory: string, replacements: Record<string, string>): Promise<void> {
  const templatePath = path.join(directory, 'server', 'wrangler.toml');
  
  // wrangler.toml is both template and output file
  await replaceTemplateFileInPlace(templatePath, replacements);
  logger.debug('Updated server/wrangler.toml');
}

async function generateFirebaseConfig(directory: string, replacements: Record<string, string>): Promise<void> {
  const templatePath = path.join(directory, 'ui', 'src', 'lib', 'firebase-config.template.json');
  const outputPath = path.join(directory, 'ui', 'src', 'lib', 'firebase-config.json');
  
  await replaceTemplateFile(templatePath, outputPath, replacements);
  logger.debug('Generated ui/src/lib/firebase-config.json');
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

async function replaceTemplateFileInPlace(
  filePath: string, 
  replacements: Record<string, string>
): Promise<void> {
  let content = await fs.readFile(filePath, 'utf-8');
  
  // Replace all placeholders
  for (const [placeholder, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }
  
  // Write back to the same file
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function validateConfigGeneration(directory: string): Promise<boolean> {
  const requiredFiles = [
    'server/.dev.vars',
    'ui/src/lib/firebase-config.json'
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
  
  return true;
} 