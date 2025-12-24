// Claude Alias Configuration Types

export interface ClaudeAliasConfig {
    alias: string;
    provider: string;
    baseUrl: string;
    // Model configuration - maps to Claude Code environment variables
    opusModel?: string;     // ANTHROPIC_DEFAULT_OPUS_MODEL
    sonnetModel?: string;   // ANTHROPIC_DEFAULT_SONNET_MODEL  
    haikuModel?: string;    // ANTHROPIC_DEFAULT_HAIKU_MODEL
    subagentModel?: string; // CLAUDE_CODE_SUBAGENT_MODEL
    // Legacy fields (deprecated, kept for backward compatibility)
    model?: string;         // Legacy: ANTHROPIC_MODEL
    smallFastModel?: string; // Legacy: ANTHROPIC_SMALL_FAST_MODEL (deprecated)
    maxOutputTokens?: number;
    useAuthToken?: boolean; // Use ANTHROPIC_AUTH_TOKEN instead of ANTHROPIC_API_KEY
    skipPermissions?: boolean; // Add --dangerously-skip-permissions flag
    customEnv?: Record<string, string>;
    createdAt: string;
    updatedAt: string;
}

export interface LiteLLMModel {
    name: string;
    litellm_provider: string;
    max_output_tokens?: number;
    max_input_tokens?: number;
    max_tokens?: number;
    mode: string;
    supports_function_calling?: boolean;
    supports_vision?: boolean;
    input_cost_per_token?: number;
    output_cost_per_token?: number;
}

export interface LiteLLMRegistry {
    [modelName: string]: Omit<LiteLLMModel, 'name'>;
}

export interface KeychainEntry {
    service: string;
    account: string;
}

export interface ProfileScript {
    path: string;
    alias: string;
    provider: string;
    content: string;
}

export type ShellType = 'zsh' | 'bash';

export interface ManagedAlias {
    name: string;
    command: string;
    scriptPath: string;
}
