export function createServiceError(service: string, error: Error, manualSteps: string[]): Error {
  const message = `${service} setup failed: ${error.message}\n\nManual setup steps:\n${manualSteps.map(step => `  ${step}`).join('\n')}`;
  return new Error(message);
}

export function createValidationError(field: string, value: string, requirements: string[]): Error {
  const message = `Invalid ${field}: "${value}"\n\nRequirements:\n${requirements.map(req => `  • ${req}`).join('\n')}`;
  return new Error(message);
}

export function createNetworkError(operation: string, endpoint?: string): Error {
  const endpointInfo = endpoint ? ` (${endpoint})` : '';
  const message = `Network error during ${operation}${endpointInfo}. Please check your internet connection and try again.`;
  return new Error(message);
}

export function createFileSystemError(operation: string, path: string, originalError: Error): Error {
  const message = `File system error during ${operation} at "${path}": ${originalError.message}`;
  return new Error(message);
}

export function createCLIError(tool: string, command: string, originalError: Error): Error {
  const message = `${tool} CLI error running "${command}": ${originalError.message}\n\nPlease ensure ${tool} is properly installed and authenticated.`;
  return new Error(message);
} 