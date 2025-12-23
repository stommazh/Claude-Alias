import chalk from 'chalk';
import ora from 'ora';
import { input, password, select, confirm, search } from '@inquirer/prompts';
import * as keychain from '../services/secrets/index.js';
import * as litellm from '../services/litellm.js';
import * as profile from '../services/profile.js';
import * as shell from '../services/shell.js';
import { clearScreen } from '../index.js';
import type { ClaudeAliasConfig } from '../types/index.js';

// Preset providers with default base URLs
const PROVIDER_PRESETS = [
    { name: 'Custom Provider...', value: '__custom__', baseUrl: '' },
    { name: 'Z.AI (GLM Models)', value: 'zai', baseUrl: 'https://api.z.ai/api/anthropic' },
    { name: 'DeepSeek', value: 'deepseek', baseUrl: 'https://api.deepseek.com' },
    { name: 'OpenRouter', value: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' },
    { name: 'OpenAI', value: 'openai', baseUrl: 'https://api.openai.com/v1' },
    { name: 'Anthropic', value: 'anthropic', baseUrl: 'https://api.anthropic.com' },
    { name: 'Google AI', value: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
    { name: 'Mistral', value: 'mistral', baseUrl: 'https://api.mistral.ai/v1' },
    { name: 'Groq', value: 'groq', baseUrl: 'https://api.groq.com/openai/v1' },
    { name: 'Together AI', value: 'together', baseUrl: 'https://api.together.xyz/v1' },
    { name: 'Fireworks AI', value: 'fireworks', baseUrl: 'https://api.fireworks.ai/inference/v1' },
    { name: 'Perplexity', value: 'perplexity', baseUrl: 'https://api.perplexity.ai' }
];

// Z.AI default model configuration
const ZAI_DEFAULTS = {
    baseUrl: 'https://api.z.ai/api/anthropic',
    opusModel: 'glm-4.7',
    sonnetModel: 'glm-4.7',
    haikuModel: 'glm-4.5-air',
    subagentModel: 'glm-4.7',
    maxOutputTokens: 128000
};

/**
 * Detect the user's likely preferred auth method based on their environment
 * Returns true if AUTH_TOKEN is preferred, false if API_KEY
 */
function detectDefaultAuthMethod(): boolean {
    // If ANTHROPIC_API_KEY is set in environment, user likely prefers API key method
    if (process.env.ANTHROPIC_API_KEY) {
        return false;
    }
    // If ANTHROPIC_AUTH_TOKEN is set, user prefers auth token
    if (process.env.ANTHROPIC_AUTH_TOKEN) {
        return true;
    }
    // Default to AUTH_TOKEN for third-party providers (most common case)
    return true;
}

/**
 * Show the header box
 */
function showHeaderBox(): void {
    console.log(chalk.bold.cyan(`
╭─────────────────────────────────────────────╮
│                 * ▐▛███▜▌ *                 │
│                * ▝▜█████▛▘ *                │
│                 *  ▘▘ ▝▝  *                 │
│                                             │
│       Claude Code Alias Manager v1.0.0      │
│                                             │
│   Manage Claude Code with custom AI APIs    │
│   Secure API key storage in macOS Keychain  │
╰─────────────────────────────────────────────╯
`));
}

/**
 * Format existing aliases for display (using actual shell alias names)
 */
function formatExistingAliases(): void {
    const allAliases = shell.listAllClaudeAliases();

    if (allAliases.length === 0) {
        console.log(chalk.dim('  No existing Claude aliases\n'));
        return;
    }

    console.log(chalk.dim('  Existing aliases:'));
    for (const alias of allAliases) {
        const scriptName = shell.getScriptNameFromCommand(alias.command);
        console.log(chalk.dim(`    ${chalk.cyan(alias.name)} → ${scriptName}`));
    }
    console.log();
}

/**
 * Run the add/edit command flow
 */
export async function runAddCommand(): Promise<void> {
    // Clear and show header
    clearScreen();
    showHeaderBox();
    console.log(chalk.bold.blue('  🔧 Add/Edit Alias\n'));

    // Show existing aliases
    formatExistingAliases();

    // Check Keychain availability first
    const keychainAvailable = await keychain.isKeychainAvailable();
    if (!keychainAvailable) {
        console.log(chalk.red('❌ Error: macOS Keychain is not available on this system.'));
        console.log(chalk.yellow('   This tool requires macOS Keychain for secure API key storage.'));
        return;
    }

    // Get alias name
    const aliasName = await input({
        message: 'Enter alias name (e.g., "ccd" for DeepSeek):',
        validate: (value) => {
            if (!value.trim()) return 'Alias name is required';
            if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) {
                return 'Alias must start with a letter and contain only letters, numbers, underscores, or hyphens';
            }
            return true;
        }
    });

    // Check if editing existing
    const allAliases = shell.listAllClaudeAliases();
    const existingAlias = allAliases.find(a => a.name === aliasName);
    const existingProfiles = profile.listProfiles();
    const existingProfile = existingProfiles.find(p => p.alias === aliasName);
    const isEdit = !!existingAlias || !!existingProfile;

    if (isEdit) {
        console.log(chalk.yellow(`\n📝 Editing existing alias: ${aliasName}`));

        const editChoice = await select({
            message: 'How would you like to edit?',
            choices: [
                { name: 'Step-by-step configuration', value: 'interactive' },
                { name: 'Open script in editor ($EDITOR)', value: 'editor' },
                { name: 'Cancel', value: 'cancel' }
            ]
        });

        if (editChoice === 'cancel') {
            console.log(chalk.dim('Cancelled.'));
            return;
        }

        if (editChoice === 'editor') {
            const editor = process.env.EDITOR || 'vim';
            const scriptPath = profile.getScriptPath(aliasName);
            console.log(chalk.cyan(`\nOpening ${scriptPath} in ${editor}...`));
            console.log(chalk.dim('Save and close the editor when done.'));

            const { execSync } = await import('child_process');
            try {
                execSync(`${editor} "${scriptPath}"`, { stdio: 'inherit' });
                console.log(chalk.green('\n✓ Script updated. Remember to source your shell profile.'));
            } catch {
                console.log(chalk.red('\n❌ Failed to open editor.'));
            }
            return;
        }

        console.log(chalk.dim('Loading existing configuration...'));
    } else {
        console.log(chalk.green(`\n✨ Creating new alias: ${aliasName}\n`));
    }

    // Get provider with search/select from presets
    const providerChoice = await search<string>({
        message: 'Select or search for a provider:',
        source: async (term) => {
            const filtered = PROVIDER_PRESETS.filter(p =>
                !term ||
                p.name.toLowerCase().includes(term.toLowerCase()) ||
                p.value.toLowerCase().includes(term.toLowerCase())
            );
            return filtered.map(p => ({
                name: p.value === '__custom__' ? chalk.dim(p.name) : `${p.name} ${chalk.dim(`(${p.baseUrl})`)}`,
                value: p.value
            }));
        }
    });

    let providerName: string;
    let defaultBaseUrl: string;

    if (providerChoice === '__custom__') {
        providerName = await input({
            message: 'Enter custom provider name:',
            validate: (value) => value.trim() ? true : 'Provider name is required'
        });
        defaultBaseUrl = '';
    } else {
        providerName = providerChoice;
        defaultBaseUrl = PROVIDER_PRESETS.find(p => p.value === providerChoice)?.baseUrl || '';
    }

    // Get API key
    console.log(chalk.dim('\n🔐 API Key (will be stored securely in macOS Keychain)'));
    const existingKeyValid = isEdit && await keychain.verifyApiKey(aliasName);

    let apiKey: string;
    if (existingKeyValid) {
        const keepKey = await confirm({
            message: 'Keep existing API key?',
            default: true
        });

        if (keepKey) {
            apiKey = (await keychain.getApiKey(aliasName))!;
        } else {
            const rawKey = await password({
                message: 'Enter new API key:',
                validate: (value) => value.trim() ? true : 'API key is required'
            });
            // Sanitize: remove newlines, carriage returns, and trim whitespace
            apiKey = rawKey.replace(/[\r\n\t]/g, '').trim();
        }
    } else {
        const rawKey = await password({
            message: 'Enter API key:',
            validate: (value) => value.trim() ? true : 'API key is required'
        });
        // Sanitize: remove newlines, carriage returns, and trim whitespace
        apiKey = rawKey.replace(/[\r\n\t]/g, '').trim();
    }

    // Validate API key looks reasonable
    if (apiKey.length < 10) {
        console.log(chalk.yellow('\n⚠️  Warning: API key seems very short. Make sure you pasted it correctly.'));
    }

    // Save API key to Keychain first
    const spinner = ora('Saving API key to Keychain...').start();
    const keySuccess = await keychain.setApiKey(aliasName, apiKey);

    if (!keySuccess) {
        spinner.fail('Failed to save API key to Keychain');
        console.log(chalk.red('❌ Cannot proceed without secure API key storage.'));
        return;
    }
    spinner.succeed('API key saved to Keychain');

    // Get base URL
    const baseUrl = await input({
        message: 'API Base URL:',
        default: defaultBaseUrl || (isEdit && existingProfile ? profile.parseScriptConfig(existingProfile.content).baseUrl : undefined),
        validate: (value) => {
            if (!value.trim()) return 'Base URL is required';
            try {
                new URL(value);
                return true;
            } catch {
                return 'Invalid URL format';
            }
        }
    });

    // Token type selection - detect user's preference from existing config or environment
    const existingUseAuthToken = isEdit && existingProfile
        ? profile.parseScriptConfig(existingProfile.content).useAuthToken
        : detectDefaultAuthMethod();

    const tokenType = await select({
        message: 'Token type for authentication:',
        choices: [
            { name: 'ANTHROPIC_AUTH_TOKEN (recommended for third-party providers)', value: 'auth' },
            { name: 'ANTHROPIC_API_KEY (for direct Anthropic API)', value: 'api' }
        ],
        default: existingUseAuthToken ? 'auth' : 'api'
    });

    const useAuthToken = tokenType === 'auth';

    // Get existing config for defaults
    const existingConfig = isEdit && existingProfile ? profile.parseScriptConfig(existingProfile.content) : {};

    // Model values to be configured
    let modelValues: Record<string, string> = {
        opusModel: existingConfig.opusModel || existingConfig.model || '',
        sonnetModel: existingConfig.sonnetModel || '',
        haikuModel: existingConfig.haikuModel || existingConfig.smallFastModel || '',
        subagentModel: existingConfig.subagentModel || ''
    };
    let maxOutputTokens: number | undefined = existingConfig.maxOutputTokens;

    // Special handling for Z.AI provider - simplified menu-based config
    if (providerName === 'zai') {
        console.log(chalk.bold.blue('\n🤖 Z.AI Model Configuration\n'));
        console.log(chalk.dim('  Pre-configured with Z.AI GLM models. Select any row to customize.\n'));

        // Set Z.AI defaults
        modelValues = {
            opusModel: existingConfig.opusModel || ZAI_DEFAULTS.opusModel,
            sonnetModel: existingConfig.sonnetModel || ZAI_DEFAULTS.sonnetModel,
            haikuModel: existingConfig.haikuModel || ZAI_DEFAULTS.haikuModel,
            subagentModel: existingConfig.subagentModel || ZAI_DEFAULTS.subagentModel
        };
        maxOutputTokens = existingConfig.maxOutputTokens || ZAI_DEFAULTS.maxOutputTokens;

        // Menu loop for Z.AI
        let configuring = true;
        while (configuring) {
            const choice = await select({
                message: 'Configure models (select to edit):',
                choices: [
                    { name: `✅ Finish and apply configuration`, value: 'finish' },
                    { name: `   Opus Model: ${chalk.cyan(modelValues.opusModel)} ${chalk.dim('(complex tasks, Plan Mode)')}`, value: 'opus' },
                    { name: `   Sonnet Model: ${chalk.cyan(modelValues.sonnetModel)} ${chalk.dim('(normal operation)')}`, value: 'sonnet' },
                    { name: `   Haiku Model: ${chalk.cyan(modelValues.haikuModel)} ${chalk.dim('(background tasks)')}`, value: 'haiku' },
                    { name: `   Subagent Model: ${chalk.cyan(modelValues.subagentModel)} ${chalk.dim('(subagent operations)')}`, value: 'subagent' },
                    { name: `   Max Output Tokens: ${chalk.cyan(maxOutputTokens?.toString() || 'default')}`, value: 'tokens' }
                ]
            });

            if (choice === 'finish') {
                configuring = false;
            } else if (choice === 'opus') {
                const value = await input({ message: 'Opus Model:', default: modelValues.opusModel });
                modelValues.opusModel = value?.trim() || '';
            } else if (choice === 'sonnet') {
                const value = await input({ message: 'Sonnet Model:', default: modelValues.sonnetModel });
                modelValues.sonnetModel = value?.trim() || '';
            } else if (choice === 'haiku') {
                const value = await input({ message: 'Haiku Model:', default: modelValues.haikuModel });
                modelValues.haikuModel = value?.trim() || '';
            } else if (choice === 'subagent') {
                const value = await input({ message: 'Subagent Model:', default: modelValues.subagentModel });
                modelValues.subagentModel = value?.trim() || '';
            } else if (choice === 'tokens') {
                const value = await input({ message: 'Max Output Tokens:', default: maxOutputTokens?.toString() || '' });
                maxOutputTokens = value ? parseInt(value, 10) : undefined;
                if (isNaN(maxOutputTokens as number)) maxOutputTokens = undefined;
            }
        }
    } else {
        // Standard model configuration for other providers
        console.log(chalk.bold.blue('\n🤖 Model Configuration\n'));
        console.log(chalk.dim('  Configure which models from your provider map to Claude Code\'s model tiers.'));
        console.log(chalk.dim('  Leave blank to use Claude\'s default models.\n'));

        // Model configuration definitions
        const modelConfigs = [
            {
                key: 'opusModel',
                name: 'Opus Model',
                envVar: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
                description: 'Primary model for complex tasks and Plan Mode',
                current: modelValues.opusModel
            },
            {
                key: 'sonnetModel',
                name: 'Sonnet Model',
                envVar: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
                description: 'Default model for normal operation',
                current: modelValues.sonnetModel
            },
            {
                key: 'haikuModel',
                name: 'Haiku Model',
                envVar: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
                description: 'Fast model for background tasks',
                current: modelValues.haikuModel
            },
            {
                key: 'subagentModel',
                name: 'Subagent Model',
                envVar: 'CLAUDE_CODE_SUBAGENT_MODEL',
                description: 'Model for subagent operations',
                current: modelValues.subagentModel
            }
        ];

        for (const modelConfig of modelConfigs) {
            const displayCurrent = modelConfig.current ? chalk.cyan(modelConfig.current) : chalk.dim('(not set)');

            const action = await select({
                message: `${modelConfig.name} - ${chalk.dim(modelConfig.description)}`,
                choices: [
                    {
                        name: modelConfig.current
                            ? `Keep current: ${displayCurrent}`
                            : 'Leave blank (use Claude default)',
                        value: 'keep'
                    },
                    { name: 'Search LiteLLM registry', value: 'search' },
                    { name: 'Enter model name manually', value: 'manual' },
                    ...(modelConfig.current ? [{ name: 'Clear (use Claude default)', value: 'clear' }] : [])
                ]
            });

            if (action === 'keep') {
                modelValues[modelConfig.key] = modelConfig.current;
            } else if (action === 'clear') {
                modelValues[modelConfig.key] = '';
            } else if (action === 'search') {
                const loadingSpinner = ora('Loading LiteLLM registry...').start();
                await litellm.fetchRegistry();
                loadingSpinner.succeed('Registry loaded');

                const searchResult = await search<string>({
                    message: `Search model for ${modelConfig.name}:`,
                    source: async (term) => {
                        if (!term) {
                            const popular = await litellm.searchModels('claude', 10);
                            return popular.map(m => ({
                                name: `${m.name} (${m.litellm_provider})`,
                                value: m.name
                            }));
                        }
                        const results = await litellm.searchModels(term, 15);
                        return results.map(m => ({
                            name: `${m.name} (${m.litellm_provider})`,
                            value: m.name
                        }));
                    }
                });
                modelValues[modelConfig.key] = searchResult;
                console.log(chalk.dim(`  → ${modelConfig.envVar}="${searchResult}"`));
            } else if (action === 'manual') {
                const manualValue = await input({
                    message: `Enter model name for ${modelConfig.name}:`,
                    default: modelConfig.current || undefined
                });
                modelValues[modelConfig.key] = manualValue?.trim() || '';
                if (manualValue?.trim()) {
                    console.log(chalk.dim(`  → ${modelConfig.envVar}="${manualValue.trim()}"`));
                }
            }
        }

        // Check if no models are configured
        const hasAnyModel = Object.values(modelValues).some(v => v && v.trim());

        if (!hasAnyModel) {
            console.log(chalk.yellow('\n⚠️  No models configured. Claude Code will use default Claude models.'));
            const confirmNoModels = await confirm({
                message: 'Continue without model configuration?',
                default: true
            });

            if (!confirmNoModels) {
                console.log(chalk.dim('Cancelled.'));
                return;
            }
        }

        // Get max output tokens for non-Z.AI providers
        console.log(chalk.dim('\n📊 Output Configuration'));

        const maxTokensInput = await input({
            message: 'Max output tokens (leave empty for default):',
            default: existingConfig.maxOutputTokens?.toString() || undefined
        });

        if (maxTokensInput) {
            maxOutputTokens = parseInt(maxTokensInput, 10);
            if (isNaN(maxOutputTokens)) maxOutputTokens = undefined;
        }
    }

    // Create config
    const now = new Date().toISOString();
    const config: ClaudeAliasConfig = {
        alias: aliasName,
        provider: providerName,
        baseUrl: baseUrl.trim(),
        opusModel: modelValues.opusModel?.trim() || undefined,
        sonnetModel: modelValues.sonnetModel?.trim() || undefined,
        haikuModel: modelValues.haikuModel?.trim() || undefined,
        subagentModel: modelValues.subagentModel?.trim() || undefined,
        maxOutputTokens,
        useAuthToken,
        createdAt: existingConfig.createdAt || now,
        updatedAt: now
    };

    // Write script
    const writeSpinner = ora('Creating profile script...').start();
    try {
        const scriptPath = profile.writeScript(config);
        writeSpinner.succeed(`Script created: ${scriptPath}`);
    } catch (error) {
        writeSpinner.fail('Failed to create script');
        console.error(error);
        return;
    }

    // Add shell alias
    const aliasSpinner = ora('Adding shell alias...').start();
    const scriptPath = profile.getScriptPath(aliasName);
    const aliasSuccess = shell.addAlias(aliasName, scriptPath);

    if (aliasSuccess) {
        aliasSpinner.succeed(`Shell alias added: ${aliasName}`);
    } else {
        aliasSpinner.fail('Failed to add shell alias');
    }

    // Success message
    console.log(chalk.green.bold(`\n✅ Alias '${aliasName}' ${isEdit ? 'updated' : 'created'} successfully!\n`));
    console.log(chalk.dim('To use the new alias, either:'));
    console.log(`   1. Source your shell profile: ${chalk.cyan(`source ${shell.getProfilePath()}`)}`);
    console.log(`   2. Open a new terminal window`);
    console.log();
    console.log(chalk.bold('Usage:'));
    console.log(`   ${chalk.cyan(aliasName)}`);
    console.log();
}

