import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const SERVICE_NAME = 'claude-alias';
const CONFIG_DIR = join(homedir(), '.config', 'claude-alias');
const SECRETS_FILE = join(CONFIG_DIR, 'secrets.enc');

// Encryption settings
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Check if secret-tool (libsecret) is available
 */
function hasSecretTool(): boolean {
    try {
        const result = spawnSync('which', ['secret-tool'], { stdio: 'pipe' });
        return result.status === 0;
    } catch {
        return false;
    }
}

/**
 * Get a machine-specific key for encryption (fallback method)
 * This is NOT truly secure - just obfuscation for when no keyring is available
 */
function getEncryptionKey(): Buffer {
    // Use machine ID + user ID as key source
    let machineId = 'default-machine-id';
    try {
        if (existsSync('/etc/machine-id')) {
            machineId = readFileSync('/etc/machine-id', 'utf-8').trim();
        } else if (existsSync('/var/lib/dbus/machine-id')) {
            machineId = readFileSync('/var/lib/dbus/machine-id', 'utf-8').trim();
        }
    } catch {
        // Use fallback
    }

    const salt = `claude-alias-${process.getuid?.() || 'user'}`;
    return scryptSync(machineId, salt, KEY_LENGTH);
}

/**
 * Encrypt data for file storage
 */
function encrypt(data: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(data, 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt data from file storage
 */
function decrypt(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');

    return decrypted;
}

/**
 * Read secrets from encrypted file
 */
function readSecretsFile(): Record<string, string> {
    if (!existsSync(SECRETS_FILE)) {
        return {};
    }

    try {
        const encrypted = readFileSync(SECRETS_FILE, 'utf-8');
        const decrypted = decrypt(encrypted);
        return JSON.parse(decrypted);
    } catch {
        return {};
    }
}

/**
 * Write secrets to encrypted file
 */
function writeSecretsFile(secrets: Record<string, string>): void {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }

    const encrypted = encrypt(JSON.stringify(secrets));
    writeFileSync(SECRETS_FILE, encrypted, { mode: 0o600 });
}

/**
 * Check if Linux secret storage is available
 */
export async function isAvailable(): Promise<boolean> {
    // Linux is available if we can use secret-tool OR file fallback
    return process.platform === 'linux';
}

/**
 * Get API key from Linux secret storage
 */
export async function getApiKey(alias: string): Promise<string | null> {
    // Try secret-tool first
    if (hasSecretTool()) {
        try {
            const result = execSync(
                `secret-tool lookup service "${SERVICE_NAME}" alias "${alias}"`,
                { stdio: 'pipe', encoding: 'utf-8' }
            );
            if (result.trim()) {
                return result.trim();
            }
        } catch {
            // Fall through to file storage
        }
    }

    // Fallback to encrypted file
    const secrets = readSecretsFile();
    return secrets[alias] || null;
}

/**
 * Save API key to Linux secret storage
 */
export async function setApiKey(alias: string, apiKey: string): Promise<boolean> {
    // Try secret-tool first
    if (hasSecretTool()) {
        try {
            // secret-tool reads password from stdin
            const result = spawnSync('secret-tool', [
                'store',
                '--label', `Claude Alias: ${alias}`,
                'service', SERVICE_NAME,
                'alias', alias
            ], {
                input: apiKey,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            if (result.status === 0) {
                return true;
            }
        } catch {
            // Fall through to file storage
        }
    }

    // Fallback to encrypted file
    try {
        const secrets = readSecretsFile();
        secrets[alias] = apiKey;
        writeSecretsFile(secrets);
        console.log('\x1b[33m⚠️  Using encrypted file storage (secret-tool not available)\x1b[0m');
        return true;
    } catch (error) {
        console.error('Failed to save API key:', error);
        return false;
    }
}

/**
 * Delete API key from Linux secret storage
 */
export async function deleteApiKey(alias: string): Promise<boolean> {
    let deleted = false;

    // Try secret-tool
    if (hasSecretTool()) {
        try {
            execSync(
                `secret-tool clear service "${SERVICE_NAME}" alias "${alias}"`,
                { stdio: 'pipe' }
            );
            deleted = true;
        } catch {
            // Ignore errors
        }
    }

    // Also remove from file storage
    try {
        const secrets = readSecretsFile();
        if (secrets[alias]) {
            delete secrets[alias];
            writeSecretsFile(secrets);
            deleted = true;
        }
    } catch {
        // Ignore errors
    }

    return true; // Always return true for delete operations
}

/**
 * Verify an API key exists
 */
export async function verifyApiKey(alias: string): Promise<boolean> {
    const key = await getApiKey(alias);
    return key !== null && key.length > 0;
}

/**
 * Get the command to retrieve API key (for generated scripts)
 */
export function getRetrievalCommand(alias: string): string {
    // Generated script will try secret-tool first, then fall back to a helper
    return `secret-tool lookup service "${SERVICE_NAME}" alias "${alias}" 2>/dev/null || claude-alias-get-key "${alias}" 2>/dev/null`;
}

/**
 * Check if using fallback storage (for warnings)
 */
export function isUsingFallback(): boolean {
    return !hasSecretTool();
}
