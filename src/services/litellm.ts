import type { LiteLLMModel, LiteLLMRegistry } from '../types/index.js';

const LITELLM_REGISTRY_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

let cachedRegistry: LiteLLMRegistry | null = null;

/**
 * Fetch the LiteLLM model registry from GitHub
 */
export async function fetchRegistry(): Promise<LiteLLMRegistry> {
    if (cachedRegistry) {
        return cachedRegistry;
    }

    try {
        const response = await fetch(LITELLM_REGISTRY_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch registry: ${response.status}`);
        }

        const data = await response.json() as LiteLLMRegistry;

        // Filter out the sample_spec and non-chat models
        const filtered: LiteLLMRegistry = {};
        for (const [name, model] of Object.entries(data)) {
            if (name === 'sample_spec') continue;
            if (model.mode !== 'chat') continue;
            filtered[name] = model;
        }

        cachedRegistry = filtered;
        return filtered;
    } catch (error) {
        console.error('Failed to fetch LiteLLM registry:', error);
        return {};
    }
}

/**
 * Search models by name or provider
 */
export async function searchModels(query: string, limit: number = 20): Promise<LiteLLMModel[]> {
    const registry = await fetchRegistry();
    const queryLower = query.toLowerCase();

    const results: LiteLLMModel[] = [];

    for (const [name, model] of Object.entries(registry)) {
        if (name.toLowerCase().includes(queryLower) ||
            model.litellm_provider?.toLowerCase().includes(queryLower)) {
            results.push({
                name,
                ...model
            });
        }

        if (results.length >= limit) break;
    }

    return results;
}

/**
 * Get model info by exact name
 */
export async function getModelInfo(name: string): Promise<LiteLLMModel | null> {
    const registry = await fetchRegistry();
    const model = registry[name];

    if (!model) {
        // Try to find a partial match
        const normalized = name.toLowerCase();
        for (const [modelName, modelData] of Object.entries(registry)) {
            if (modelName.toLowerCase() === normalized) {
                return { name: modelName, ...modelData };
            }
        }
        return null;
    }

    return { name, ...model };
}

/**
 * Get list of unique providers
 */
export async function getProviders(): Promise<string[]> {
    const registry = await fetchRegistry();
    const providers = new Set<string>();

    for (const model of Object.values(registry)) {
        if (model.litellm_provider) {
            providers.add(model.litellm_provider);
        }
    }

    return Array.from(providers).sort();
}

/**
 * Get models for a specific provider
 */
export async function getModelsByProvider(provider: string, limit: number = 50): Promise<LiteLLMModel[]> {
    const registry = await fetchRegistry();
    const providerLower = provider.toLowerCase();

    const results: LiteLLMModel[] = [];

    for (const [name, model] of Object.entries(registry)) {
        if (model.litellm_provider?.toLowerCase() === providerLower) {
            results.push({ name, ...model });
        }

        if (results.length >= limit) break;
    }

    return results;
}

/**
 * Get default max output tokens for a model
 */
export function getMaxOutputTokens(model: LiteLLMModel): number | undefined {
    return model.max_output_tokens || model.max_tokens;
}
