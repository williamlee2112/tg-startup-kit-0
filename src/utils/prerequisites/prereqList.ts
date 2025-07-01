import type { Prerequisite } from './types.js';

export const corePrerequisites: Prerequisite[] = [
  {
    name: 'Node.js',
    command: 'node',
    version: '--version',
    minVersion: '20.0.0',
    installUrl: 'https://nodejs.org/',
    description: 'JavaScript runtime required for the CLI and development',
    checkVersion: (output) => output.replace('v', '').trim(),
    systemTool: true
  },
  {
    name: 'pnpm',
    command: 'pnpm',
    version: '--version',
    minVersion: '8.0.0',
    installUrl: 'https://pnpm.io/installation',
    description: 'Fast, disk space efficient package manager',
    checkVersion: (output) => output.trim(),
    canInstallLocally: true,
    canInstallGlobally: true,
    npmPackage: 'pnpm'
  },
  {
    name: 'Git',
    command: 'git',
    version: '--version',
    installUrl: 'https://git-scm.com/downloads',
    description: 'Version control system to clone the template',
    checkVersion: (output) => {
      const match = output.match(/git version (\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    },
    systemTool: true
  },
  {
    name: 'Firebase CLI',
    command: 'firebase',
    version: '--version',
    minVersion: '12.0.0',
    installUrl: 'https://firebase.google.com/docs/cli#install_the_firebase_cli',
    description: 'Firebase command line tools for authentication and project setup',
    checkVersion: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    },
    canInstallLocally: true,
    canInstallGlobally: true,
    npmPackage: 'firebase-tools'
  }
];

export const deploymentPrerequisites: Record<string, Prerequisite> = {
  cloudflare: {
    name: 'Wrangler CLI',
    command: 'wrangler',
    version: '--version',
    minVersion: '3.0.0',
    installUrl: 'https://developers.cloudflare.com/workers/wrangler/install-and-update/',
    description: 'Cloudflare Workers CLI for deployment and local development',
    checkVersion: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    },
    canInstallLocally: true,
    canInstallGlobally: true,
    npmPackage: 'wrangler'
  }
};

export const databasePrerequisites: Record<string, Prerequisite> = {
  neon: {
    name: 'Neon CLI',
    command: 'neonctl',
    version: '--version',
    installUrl: 'https://neon.tech/docs/reference/neon-cli',
    description: 'Neon CLI for managing PostgreSQL databases',
    optional: false,
    canInstallLocally: true,
    canInstallGlobally: true,
    npmPackage: 'neonctl',
    checkVersion: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : 'installed';
    }
  },
  supabase: {
    name: 'Supabase CLI',
    command: 'supabase',
    version: '--version',
    installUrl: 'https://supabase.com/docs/guides/cli',
    description: 'Supabase CLI for managing PostgreSQL databases',
    optional: false,
    canInstallLocally: true,
    canInstallGlobally: false,
    npmPackage: 'supabase',
    checkVersion: (output) => {
      const match = output.match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    }
  }
}; 