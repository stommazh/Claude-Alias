import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { ShellType, ManagedAlias } from '../types/index.js';

const ALIAS_START_MARKER = '# >>> claude-alias managed aliases >>>';
const ALIAS_END_MARKER = '# <<< claude-alias managed aliases <<<';

/**
 * Detect the current shell type
 */
export function detectShell(): ShellType {
    const shell = process.env.SHELL || '';
    if (shell.includes('zsh')) return 'zsh';
    return 'bash';
}

/**
 * Get the shell profile path
 */
export function getProfilePath(shell?: ShellType): string {
    const home = homedir();
    const shellType = shell || detectShell();

    if (shellType === 'zsh') {
        return join(home, '.zshrc');
    }
    return join(home, '.bashrc');
}

/**
 * Read the shell profile content
 */
function readProfile(shell?: ShellType): string {
    const path = getProfilePath(shell);
    if (!existsSync(path)) return '';
    return readFileSync(path, 'utf-8');
}

/**
 * Write content to shell profile
 */
function writeProfile(content: string, shell?: ShellType): void {
    const path = getProfilePath(shell);
    writeFileSync(path, content, 'utf-8');
}

/**
 * Extract the managed aliases block from profile
 */
function extractManagedBlock(content: string): { before: string; managed: string; after: string } {
    const startIdx = content.indexOf(ALIAS_START_MARKER);
    const endIdx = content.indexOf(ALIAS_END_MARKER);

    if (startIdx === -1 || endIdx === -1) {
        return { before: content, managed: '', after: '' };
    }

    const before = content.substring(0, startIdx);
    const managed = content.substring(startIdx + ALIAS_START_MARKER.length, endIdx).trim();
    const after = content.substring(endIdx + ALIAS_END_MARKER.length);

    return { before, managed, after };
}

/**
 * Parse managed aliases from the managed block
 */
function parseManagedAliases(managed: string): ManagedAlias[] {
    const aliases: ManagedAlias[] = [];
    const lines = managed.split('\n').filter(line => line.trim());

    for (const line of lines) {
        // Match: alias name='command'
        const match = line.match(/^alias\s+(\w+)='(.+)'$/);
        if (match) {
            const [, name, command] = match;
            // Extract script path from command (e.g., "claude-xxx --dangerously-skip-permissions")
            const scriptMatch = command.match(/^([\w-]+)/);
            const scriptPath = scriptMatch ? join(homedir(), '.local', 'bin', scriptMatch[1]) : '';

            aliases.push({ name, command, scriptPath });
        }
    }

    return aliases;
}

/**
 * List all managed aliases from shell profile
 */
export function listManagedAliases(shell?: ShellType): ManagedAlias[] {
    const content = readProfile(shell);
    const { managed } = extractManagedBlock(content);
    return parseManagedAliases(managed);
}

/**
 * Add or update an alias in the shell profile
 */
export function addAlias(name: string, scriptPath: string, shell?: ShellType): boolean {
    try {
        const content = readProfile(shell);
        const { before, managed, after } = extractManagedBlock(content);

        // Parse existing aliases
        const aliases = parseManagedAliases(managed);

        // Get just the script name from the path
        const scriptName = scriptPath.split('/').pop() || scriptPath;

        // Create new alias command
        const newCommand = `${scriptName} --dangerously-skip-permissions`;

        // Update or add the alias
        const existingIdx = aliases.findIndex(a => a.name === name);
        if (existingIdx !== -1) {
            aliases[existingIdx] = { name, command: newCommand, scriptPath };
        } else {
            aliases.push({ name, command: newCommand, scriptPath });
        }

        // Build new managed block
        const newManaged = aliases
            .map(a => `alias ${a.name}='${a.command}'`)
            .join('\n');

        // Reconstruct the profile
        const trimmedBefore = before.trimEnd();
        const trimmedAfter = after.trimStart();

        const newContent = [
            trimmedBefore,
            '',
            ALIAS_START_MARKER,
            newManaged,
            ALIAS_END_MARKER,
            trimmedAfter
        ].join('\n');

        writeProfile(newContent, shell);
        return true;
    } catch (error) {
        console.error('Failed to add alias:', error);
        return false;
    }
}

/**
 * Remove an alias from the shell profile (both managed and non-managed)
 */
export function removeAlias(name: string, shell?: ShellType): boolean {
    try {
        let content = readProfile(shell);

        // First, try to remove from managed block
        const { before, managed, after } = extractManagedBlock(content);
        const managedAliases = parseManagedAliases(managed);
        const filteredManaged = managedAliases.filter(a => a.name !== name);

        if (filteredManaged.length < managedAliases.length) {
            // Alias was in managed block, rebuild it
            if (filteredManaged.length === 0) {
                content = (before.trimEnd() + '\n' + after.trimStart()).trim() + '\n';
            } else {
                const newManaged = filteredManaged
                    .map(a => `alias ${a.name}='${a.command}'`)
                    .join('\n');
                content = [
                    before.trimEnd(),
                    '',
                    ALIAS_START_MARKER,
                    newManaged,
                    ALIAS_END_MARKER,
                    after.trimStart()
                ].join('\n');
            }
            writeProfile(content, shell);
            return true;
        }

        // If not in managed block, search for the alias anywhere in the file
        // Match patterns like: alias name='...' or alias name="..."
        const aliasRegex = new RegExp(`^\\s*alias\\s+${name}\\s*=\\s*['"][^'"]*['"]\\s*$`, 'gm');

        if (aliasRegex.test(content)) {
            // Remove the alias line(s)
            const newContent = content.replace(aliasRegex, '').replace(/\n{3,}/g, '\n\n');
            writeProfile(newContent, shell);
            return true;
        }

        // Alias not found anywhere, but that's okay
        return true;
    } catch (error) {
        console.error('Failed to remove alias:', error);
        return false;
    }
}

/**
 * Check if an alias name already exists (either managed or other)
 */
export function aliasExists(name: string, shell?: ShellType): boolean {
    const content = readProfile(shell);

    // Check in managed block
    const managed = listManagedAliases(shell);
    if (managed.some(a => a.name === name)) return true;

    // Check for any alias definition outside managed block
    const aliasRegex = new RegExp(`^alias\\s+${name}=`, 'm');
    return aliasRegex.test(content);
}

/**
 * List ALL Claude-related aliases from shell profile (including non-managed ones)
 * These are aliases that point to claude* commands
 */
export function listAllClaudeAliases(shell?: ShellType): ManagedAlias[] {
    const content = readProfile(shell);
    const aliases: ManagedAlias[] = [];

    // Match all alias definitions: alias name='...' or alias name="..."
    const aliasRegex = /^alias\s+(\w+)=['"]([^'"]+)['"]/gm;
    let match;

    while ((match = aliasRegex.exec(content)) !== null) {
        const [, name, command] = match;

        // Check if this alias points to a claude-related command
        // Match: claude, claude-*, claude --flags, claude-xxx --flags
        if (/^claude(\s|$|-\w)/.test(command)) {
            // Extract the script/command name (first word)
            const cmdMatch = command.match(/^([\w-]+)/);
            const cmdName = cmdMatch ? cmdMatch[1] : command;
            const scriptPath = cmdName.startsWith('claude')
                ? join(homedir(), '.local', 'bin', cmdName)
                : '';

            aliases.push({ name, command, scriptPath });
        }
    }

    return aliases;
}

/**
 * Get the script name from a command string
 */
export function getScriptNameFromCommand(command: string): string {
    const match = command.match(/^([\w-]+)/);
    return match ? match[1] : '';
}

