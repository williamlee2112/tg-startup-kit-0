#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import and run the main CLI - use pathToFileURL for Windows compatibility
const indexPath = join(__dirname, '../dist/index.js');
const { main } = await import(pathToFileURL(indexPath).href);
main(); 