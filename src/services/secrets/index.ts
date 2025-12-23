/**
 * Platform-aware secret storage
 * Routes to appropriate backend based on OS
 */

import * as macosSecrets from './macos.js';
import * as linuxSecrets from './linux.js';

const platform = process.platform;

// Select the appropriate backend
const backend = platform === 'darwin' ? macosSecrets :
    platform === 'linux' ? linuxSecrets :
        null;

/**
 * Check if secret storage is available on this platform
 */
export async function isKeychainAvailable(): Promise<boolean> {
    if (!backend) {
        return false;
    }
    return backend.isAvailable();
}

/**
 * Get API key from platform secret storage
 */
export async function getApiKey(alias: string): Promise<string | null> {
    if (!backend) {
        throw new Error(`Unsupported platform: ${platform}. Only macOS and Linux are supported.`);
    }
    return backend.getApiKey(alias);
}

/**
 * Save API key to platform secret storage
 */
export async function setApiKey(alias: string, apiKey: string): Promise<boolean> {
    if (!backend) {
        throw new Error(`Unsupported platform: ${platform}. Only macOS and Linux are supported.`);
    }
    return backend.setApiKey(alias, apiKey);
}

/**
 * Delete API key from platform secret storage
 */
export async function deleteApiKey(alias: string): Promise<boolean> {
    if (!backend) {
        throw new Error(`Unsupported platform: ${platform}. Only macOS and Linux are supported.`);
    }
    return backend.deleteApiKey(alias);
}

/**
 * Verify an API key exists
 */
export async function verifyApiKey(alias: string): Promise<boolean> {
    if (!backend) {
        return false;
    }
    return backend.verifyApiKey(alias);
}

/**
 * Get the shell command to retrieve API key (for generated scripts)
 */
export function getRetrievalCommand(alias: string): string {
    if (!backend) {
        throw new Error(`Unsupported platform: ${platform}`);
    }
    return backend.getRetrievalCommand(alias);
}

/**
 * Get the current platform name
 */
export function getPlatform(): 'macos' | 'linux' | 'unsupported' {
    if (platform === 'darwin') return 'macos';
    if (platform === 'linux') return 'linux';
    return 'unsupported';
}

/**
 * Check if using fallback storage (Linux only)
 */
export function isUsingFallback(): boolean {
    if (platform === 'linux' && 'isUsingFallback' in linuxSecrets) {
        return linuxSecrets.isUsingFallback();
    }
    return false;
}
