#!/usr/bin/env node

/**
 * Simple verification script to check if all required tools are installed
 * Users can run this after installing dependencies manually
 */

const { spawn } = require('child_process');
const chalk = require('chalk');

const coreTools = [
  { name: 'Node.js', command: 'node', args: ['--version'], minVersion: '20.0.0' },
  { name: 'Git', command: 'git', args: ['--version'] },
  { name: 'pnpm', command: 'pnpm', args: ['--version'], optional: true },
  { name: 'Firebase CLI', command: 'firebase', args: ['--version'], optional: true },
  { name: 'Wrangler CLI', command: 'wrangler', args: ['--version'], optional: true }
];

const databaseTools = [
  { name: 'Neon CLI', command: 'neonctl', args: ['--version'], optional: true, description: 'Required if using Neon database' },
  { name: 'Supabase CLI', command: 'supabase', args: ['--version'], optional: true, description: 'Required if using Supabase database' }
];

const allTools = [...coreTools, ...databaseTools];

function checkTool(tool) {
  return new Promise((resolve) => {
    const process = spawn(tool.command, tool.args, { stdio: 'pipe' });
    let output = '';
    
    process.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        const version = output.trim().split('\n')[0];
        resolve({ success: true, version });
      } else {
        resolve({ success: false, error: 'Command failed' });
      }
    });
    
    process.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}

async function verifySetup() {
  console.log(chalk.cyan.bold('🔍 Verifying Development Environment Setup'));
  console.log('');
  
  const results = [];
  
  for (const tool of allTools) {
    process.stdout.write(`Checking ${tool.name}... `);
    const result = await checkTool(tool);
    
    if (result.success) {
      console.log(chalk.green(`✓ ${result.version}`));
      results.push({ tool, status: 'ok', version: result.version });
    } else {
      if (tool.optional) {
        const description = tool.description ? ` (${tool.description})` : ' (optional)';
        console.log(chalk.yellow(`⚠️  Not found${description}`));
        results.push({ tool, status: 'optional-missing' });
      } else {
        console.log(chalk.red('❌ Not found'));
        results.push({ tool, status: 'missing', error: result.error });
      }
    }
  }
  
  console.log('');
  
  const missing = results.filter(r => r.status === 'missing');
  const optionalMissing = results.filter(r => r.status === 'optional-missing');
  
  if (missing.length === 0) {
    console.log(chalk.green.bold('✅ All required tools are installed!'));
    
    if (optionalMissing.length > 0) {
      console.log('');
      console.log(chalk.yellow('Optional tools (install based on your needs):'));
      optionalMissing.forEach(r => {
        const description = r.tool.description ? ` - ${r.tool.description}` : '';
        console.log(chalk.yellow(`  • ${r.tool.name}${description}`));
      });
    }
    
    console.log('');
    console.log(chalk.white('You can now run: npx create-volo-app'));
    console.log(chalk.gray('The CLI will install missing tools automatically based on your database choice.'));
  } else {
    console.log(chalk.red.bold('❌ Missing required tools:'));
    missing.forEach(r => {
      console.log(chalk.red(`  • ${r.tool.name}`));
    });
    console.log('');
    console.log(chalk.white('Please install the missing tools and run this script again.'));
    process.exit(1);
  }
}

verifySetup().catch(error => {
  console.error(chalk.red('Error during verification:'), error);
  process.exit(1);
}); 