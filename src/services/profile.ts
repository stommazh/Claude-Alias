import { mkdirSync, writeFileSync, existsSync, unlinkSync, readdirSync, readFileSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ClaudeAliasConfig, ProfileScript } from '../types/index.js';

const LOCAL_BIN_DIR = join(homedir(), '.local', 'bin');
const PROFILE_PREFIX = 'claude-';

/**
 * Ensure the local bin directory exists
 */
function ensureLocalBinDir(): void {
    if (!existsSync(LOCAL_BIN_DIR)) {
        mkdirSync(LOCAL_BIN_DIR, { recursive: true });
    }
}

/**
 * Get the path to a profile script
 */
export function getScriptPath(alias: string): string {
    return join(LOCAL_BIN_DIR, `${PROFILE_PREFIX}${alias}`);
}

/**
 * Get the profile home directory path
 */
export function getProfileHomeDir(alias: string): string {
    return join(homedir(), `.claude-${alias}`);
}

/**
 * Generate the shell script content for a profile
 */
export function generateScript(config: ClaudeAliasConfig): string {
    const apiKeyVar = config.useAuthToken ? 'ANTHROPIC_AUTH_TOKEN' : 'ANTHROPIC_API_KEY';
    // Keychain service uses only alias (not provider) since alias is unique
    const keychainService = `claude-alias-${config.alias}`;

    let envVars = `
# Set environment variables
export ANTHROPIC_BASE_URL="${config.baseUrl}"
export ${apiKeyVar}="$API_KEY"`;

    // New model configuration (recommended)
    if (config.opusModel) {
        envVars += `
export ANTHROPIC_DEFAULT_OPUS_MODEL="${config.opusModel}"`;
    }

    if (config.sonnetModel) {
        envVars += `
export ANTHROPIC_DEFAULT_SONNET_MODEL="${config.sonnetModel}"`;
    }

    if (config.haikuModel) {
        envVars += `
export ANTHROPIC_DEFAULT_HAIKU_MODEL="${config.haikuModel}"`;
    }

    if (config.subagentModel) {
        envVars += `
export CLAUDE_CODE_SUBAGENT_MODEL="${config.subagentModel}"`;
    }

    // Legacy model fields (for backward compatibility)
    if (config.model) {
        envVars += `
export ANTHROPIC_MODEL="${config.model}"`;
    }

    if (config.smallFastModel) {
        envVars += `
export ANTHROPIC_SMALL_FAST_MODEL="${config.smallFastModel}"`;
    }

    if (config.maxOutputTokens) {
        envVars += `
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=${config.maxOutputTokens}`;
    }

    // Add custom environment variables
    if (config.customEnv) {
        for (const [key, value] of Object.entries(config.customEnv)) {
            envVars += `
export ${key}="${value}"`;
        }
    }

    const script = `#!/bin/bash
# ${PROFILE_PREFIX}${config.alias} - Claude Code with ${config.provider}
# Managed by claude-alias
# Created: ${config.createdAt}
# Updated: ${config.updatedAt}

# Platform-aware API key retrieval
get_api_key() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS: Use Keychain
        security find-generic-password -s "${keychainService}" -a "${config.alias}" -w 2>/dev/null
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux: Try secret-tool first, then encrypted file
        local key=""
        if command -v secret-tool &>/dev/null; then
            key=$(secret-tool lookup service "claude-alias" alias "${config.alias}" 2>/dev/null)
        fi
        if [ -z "$key" ] && [ -f "$HOME/.config/claude-alias/secrets.enc" ]; then
            # Fallback: Use claude-alias tool to decrypt
            key=$(claude-alias get-key "${config.alias}" 2>/dev/null)
        fi
        echo "$key"
    else
        echo ""
    fi
}

API_KEY=$(get_api_key)
if [ -z "$API_KEY" ]; then
    echo "❌ Error: API key not found for '${config.alias}'"
    echo "   Run 'npx claude-alias' to reconfigure this alias"
    exit 1
fi
${envVars}

# Use custom config directory (separate history/cache per alias)
export CLAUDE_HOME="$HOME/.claude-${config.alias}"

# Create config directory if needed
mkdir -p "$CLAUDE_HOME"

# Symlink global settings.json if it exists (for MCP servers, permissions, etc.)
if [ -f "$HOME/.claude/settings.json" ] && [ ! -e "$CLAUDE_HOME/settings.json" ]; then
    ln -s "$HOME/.claude/settings.json" "$CLAUDE_HOME/settings.json" 2>/dev/null || true
fi

# Check if claude exists
if ! command -v claude &> /dev/null; then
    echo "❌ Error: 'claude' command not found!"
    echo "   Please ensure Claude Code is installed and in your PATH"
    exit 1
fi

# Launch Claude Code
claude "$@"
`;

    return script;
}

/**
 * Write a profile script to disk
 */
export function writeScript(config: ClaudeAliasConfig): string {
    ensureLocalBinDir();

    const scriptPath = getScriptPath(config.alias);
    const content = generateScript(config);

    writeFileSync(scriptPath, content, { mode: 0o755 });

    return scriptPath;
}

/**
 * Delete a profile script
 */
export function deleteScript(alias: string): boolean {
    const scriptPath = getScriptPath(alias);

    try {
        if (existsSync(scriptPath)) {
            unlinkSync(scriptPath);
        }
        return true;
    } catch (error) {
        console.error('Failed to delete script:', error);
        return false;
    }
}

/**
 * Delete the profile home directory
 */
export function deleteProfileHome(alias: string): boolean {
    const homeDir = getProfileHomeDir(alias);

    try {
        if (existsSync(homeDir)) {
            rmSync(homeDir, { recursive: true, force: true });
        }
        return true;
    } catch (error) {
        console.error('Failed to delete profile home:', error);
        return false;
    }
}

/**
 * List all existing profile scripts
 */
export function listProfiles(): ProfileScript[] {
    ensureLocalBinDir();

    const profiles: ProfileScript[] = [];

    try {
        const files = readdirSync(LOCAL_BIN_DIR);

        for (const file of files) {
            if (!file.startsWith(PROFILE_PREFIX)) continue;

            const alias = file.substring(PROFILE_PREFIX.length);
            const path = join(LOCAL_BIN_DIR, file);

            try {
                const content = readFileSync(path, 'utf-8');

                // Parse provider from script content
                const providerMatch = content.match(/# .+ - Claude Code with (.+)$/m);
                const provider = providerMatch ? providerMatch[1] : 'unknown';

                profiles.push({ path, alias, provider, content });
            } catch {
                // Skip files that can't be read
            }
        }
    } catch {
        // Return empty if directory can't be read
    }

    return profiles;
}

/**
 * Check if a profile script exists
 */
export function profileExists(alias: string): boolean {
    return existsSync(getScriptPath(alias));
}

/**
 * Parse config from existing script content
 */
export function parseScriptConfig(content: string): Partial<ClaudeAliasConfig> {
    const config: Partial<ClaudeAliasConfig> = {};

    // Parse base URL
    const baseUrlMatch = content.match(/export ANTHROPIC_BASE_URL="([^"]+)"/);
    if (baseUrlMatch) config.baseUrl = baseUrlMatch[1];

    // Parse new model configuration
    const opusMatch = content.match(/export ANTHROPIC_DEFAULT_OPUS_MODEL="([^"]+)"/);
    if (opusMatch) config.opusModel = opusMatch[1];

    const sonnetMatch = content.match(/export ANTHROPIC_DEFAULT_SONNET_MODEL="([^"]+)"/);
    if (sonnetMatch) config.sonnetModel = sonnetMatch[1];

    const haikuMatch = content.match(/export ANTHROPIC_DEFAULT_HAIKU_MODEL="([^"]+)"/);
    if (haikuMatch) config.haikuModel = haikuMatch[1];

    const subagentMatch = content.match(/export CLAUDE_CODE_SUBAGENT_MODEL="([^"]+)"/);
    if (subagentMatch) config.subagentModel = subagentMatch[1];

    // Parse legacy model fields
    const modelMatch = content.match(/export ANTHROPIC_MODEL="([^"]+)"/);
    if (modelMatch) config.model = modelMatch[1];

    const smallModelMatch = content.match(/export ANTHROPIC_SMALL_FAST_MODEL="([^"]+)"/);
    if (smallModelMatch) config.smallFastModel = smallModelMatch[1];

    // Parse max output tokens
    const maxTokensMatch = content.match(/export CLAUDE_CODE_MAX_OUTPUT_TOKENS=(\d+)/);
    if (maxTokensMatch) config.maxOutputTokens = parseInt(maxTokensMatch[1], 10);

    // Detect auth token vs api key
    config.useAuthToken = content.includes('ANTHROPIC_AUTH_TOKEN');

    // Parse dates
    const createdMatch = content.match(/# Created: (.+)$/m);
    if (createdMatch) config.createdAt = createdMatch[1];

    const updatedMatch = content.match(/# Updated: (.+)$/m);
    if (updatedMatch) config.updatedAt = updatedMatch[1];

    return config;
}
