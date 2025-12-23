import { execSync } from 'child_process';

const KEYCHAIN_SERVICE_PREFIX = 'claude-alias';

/**
 * Get the keychain service name for an alias
 * Since alias is unique, we use it as the only identifier
 */
function getServiceName(alias: string): string {
    return `${KEYCHAIN_SERVICE_PREFIX}-${alias}`;
}

/**
 * Check if macOS Keychain is available
 */
export async function isKeychainAvailable(): Promise<boolean> {
    try {
        execSync('which security', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Get API key from macOS Keychain
 * @param alias - The unique alias name
 */
export async function getApiKey(alias: string): Promise<string | null> {
    const service = getServiceName(alias);

    try {
        const result = execSync(
            `security find-generic-password -s "${service}" -a "${alias}" -w`,
            { stdio: 'pipe', encoding: 'utf-8' }
        );
        return result.trim();
    } catch {
        return null;
    }
}

/**
 * Save API key to macOS Keychain
 * @param alias - The unique alias name
 * @param apiKey - The API key to store
 */
export async function setApiKey(alias: string, apiKey: string): Promise<boolean> {
    const service = getServiceName(alias);

    try {
        // First try to delete any existing entry
        try {
            execSync(
                `security delete-generic-password -s "${service}" -a "${alias}"`,
                { stdio: 'pipe' }
            );
        } catch {
            // Ignore if doesn't exist
        }

        // Add the new entry
        execSync(
            `security add-generic-password -s "${service}" -a "${alias}" -w "${apiKey}"`,
            { stdio: 'pipe' }
        );
        return true;
    } catch (error) {
        console.error('Failed to save API key to Keychain:', error);
        return false;
    }
}

/**
 * Delete API key from macOS Keychain
 * @param alias - The unique alias name
 */
export async function deleteApiKey(alias: string): Promise<boolean> {
    const service = getServiceName(alias);

    try {
        execSync(
            `security delete-generic-password -s "${service}" -a "${alias}"`,
            { stdio: 'pipe' }
        );
        return true;
    } catch {
        // If it doesn't exist, consider it a success
        return true;
    }
}

/**
 * Verify an API key exists in Keychain
 * @param alias - The unique alias name
 */
export async function verifyApiKey(alias: string): Promise<boolean> {
    const key = await getApiKey(alias);
    return key !== null && key.length > 0;
}

