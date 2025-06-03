import { CreateOptions } from './shared/types.js';
import { createAppLocal } from './local/createLocal.js';
import { createAppFull } from './production/createFull.js';

export async function createApp(projectName: string | undefined, options: CreateOptions): Promise<void> {
  // Route to appropriate flow based on local flag
  if (options.local) {
    return createAppLocal(projectName, options);
  } else {
    return createAppFull(projectName, options);
  }
} 