import chalk from 'chalk';
import { select, confirm } from '@inquirer/prompts';
import { runAddCommand } from './commands/add.js';
import { runRemoveCommand } from './commands/remove.js';
import * as profile from './services/profile.js';
import * as shell from './services/shell.js';

const VERSION = '1.0.0';

// Track if we're in a critical operation
let inCriticalOperation = false;

/**
 * Graceful exit with message
 */
function gracefulExit(message?: string, code: number = 0): never {
    if (message) {
        console.log(message);
    }
    console.log(chalk.dim('\nGoodbye! 👋\n'));
    process.exit(code);
}

/**
 * Clear the terminal screen
 */
export function clearScreen(): void {
    process.stdout.write('\x1B[2J\x1B[0f');
}

/**
 * Wait for user to press Enter to continue
 */
async function waitForEnter(): Promise<void> {
    const { input } = await import('@inquirer/prompts');
    await input({
        message: chalk.dim('Press Enter to continue...'),
    });
}

/**
 * Setup signal handlers for graceful exit
 */
function setupSignalHandlers(): void {
    // Handle Ctrl+C
    process.on('SIGINT', async () => {
        console.log(); // New line after ^C

        if (inCriticalOperation) {
            console.log(chalk.yellow('\n⚠️  Operation in progress. Please wait...'));
            return;
        }

        try {
            const shouldExit = await confirm({
                message: 'Are you sure you want to exit?',
                default: false
            });

            if (shouldExit) {
                gracefulExit();
            } else {
                console.log(chalk.dim('Continuing...\n'));
            }
        } catch {
            // If confirm prompt itself is interrupted, just exit
            gracefulExit();
        }
    });

    // Handle terminal close
    process.on('SIGTERM', () => {
        gracefulExit(chalk.dim('\nReceived termination signal.'));
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
        console.error(chalk.red('\n❌ An unexpected error occurred:'));
        console.error(chalk.dim(error.message));
        process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
        console.error(chalk.red('\n❌ An unexpected error occurred:'));
        console.error(chalk.dim(String(reason)));
        process.exit(1);
    });
}

/**
 * Show the main menu header
 */
function showHeader(): void {
    console.log(chalk.bold.cyan(`
╭─────────────────────────────────────────────╮
│                 * ▐▛███▜▌ *                 │
│                * ▝▜█████▛▘ *                │
│                 *  ▘▘ ▝▝  *                 │
│                                             │
│        Claude Code Alias Manager        │
│                                             │
│   Manage Claude Code with custom AI APIs    │
│   Secure API key storage in macOS Keychain  │
╰─────────────────────────────────────────────╯
`));
}

/**
 * Show current status summary - shows ALL Claude aliases from shell
 */
function showStatus(): void {
    const allAliases = shell.listAllClaudeAliases();
    const managedAliases = shell.listManagedAliases();

    if (allAliases.length > 0) {
        console.log(chalk.dim('  Current Claude aliases in your shell:'));
        for (const a of allAliases) {
            const isManaged = managedAliases.some(m => m.name === a.name);
            const scriptName = shell.getScriptNameFromCommand(a.command);
            const tag = isManaged ? chalk.green('[managed]') : chalk.dim('[existing]');
            console.log(`    ${chalk.cyan(a.name)} → ${scriptName} ${tag}`);
        }
        console.log();
    } else {
        console.log(chalk.dim('  No Claude aliases found in your shell.\n'));
    }
}

/**
 * Show detailed list of aliases
 */
function showDetailedList(): void {
    const allAliases = shell.listAllClaudeAliases();
    const managedAliases = shell.listManagedAliases();
    const profiles = profile.listProfiles();

    if (allAliases.length === 0 && profiles.length === 0) {
        console.log(chalk.yellow('No Claude aliases or profiles found.'));
        console.log(chalk.dim('Run "claude-alias add" to create one.'));
        return;
    }

    // Show shell aliases
    if (allAliases.length > 0) {
        console.log(chalk.bold('📋 Shell Aliases (from .zshrc/.bashrc):\n'));
        for (const a of allAliases) {
            const isManaged = managedAliases.some(m => m.name === a.name);
            const tag = isManaged ? chalk.green('[managed]') : chalk.dim('[existing]');
            console.log(`  ${chalk.cyan.bold(a.name)} ${tag}`);
            console.log(`    Command: ${chalk.dim(a.command)}`);
            console.log();
        }
    }

    // Show profile scripts that don't have aliases
    const profilesWithoutAliases = profiles.filter(p => {
        const scriptName = `claude-${p.alias}`;
        return !allAliases.some(a => a.command.startsWith(scriptName));
    });

    if (profilesWithoutAliases.length > 0) {
        console.log(chalk.bold('📁 Profile Scripts (without shell aliases):\n'));
        for (const p of profilesWithoutAliases) {
            console.log(`  ${chalk.yellow.bold(p.alias)}`);
            console.log(`    Provider: ${p.provider}`);
            console.log(`    Script:   ${chalk.dim(p.path)}`);
            console.log(chalk.dim(`    (No alias pointing to this script)`));
            console.log();
        }
    }
}

/**
 * Run a command with error handling
 */
async function runWithErrorHandling(fn: () => Promise<void>, operationName: string): Promise<void> {
    inCriticalOperation = true;
    try {
        await fn();
    } catch (error: unknown) {
        // Check if it's a user cancellation (ExitPromptError from inquirer)
        if (error && typeof error === 'object' && 'name' in error) {
            const errorName = (error as { name: string }).name;
            if (errorName === 'ExitPromptError') {
                console.log(chalk.yellow(`\n⚠️  ${operationName} cancelled.`));
                return;
            }
        }

        // Handle other errors
        console.error(chalk.red(`\n❌ Error during ${operationName.toLowerCase()}:`));
        if (error instanceof Error) {
            console.error(chalk.dim(error.message));
        }
    } finally {
        inCriticalOperation = false;
    }
}

/**
 * Main CLI entry point
 */
export async function run(): Promise<void> {
    // Setup signal handlers first
    setupSignalHandlers();

    // Parse simple CLI arguments
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        showHeader();
        console.log(chalk.bold('Usage:'));
        console.log('  claude-alias              Interactive mode');
        console.log('  claude-alias add          Add or edit an alias');
        console.log('  claude-alias remove       Remove aliases');
        console.log('  claude-alias list         List all aliases');
        console.log('  claude-alias --help       Show this help');
        console.log('  claude-alias --version    Show version');
        console.log();
        return;
    }

    if (args.includes('--version') || args.includes('-v')) {
        console.log(VERSION);
        return;
    }

    // Handle direct commands
    if (args[0] === 'add') {
        await runWithErrorHandling(runAddCommand, 'Add/Edit');
        return;
    }

    if (args[0] === 'remove') {
        await runWithErrorHandling(runRemoveCommand, 'Remove');
        return;
    }

    if (args[0] === 'list') {
        showHeader();
        showDetailedList();
        return;
    }

    // Hidden command for Linux encrypted file fallback
    if (args[0] === 'get-key' && args[1]) {
        const { getApiKey } = await import('./services/secrets/index.js');
        const key = await getApiKey(args[1]);
        if (key) {
            process.stdout.write(key);
        }
        return;
    }

    // Interactive mode - loop until user explicitly exits
    clearScreen();
    showHeader();
    showStatus();

    let shouldContinue = true;

    while (shouldContinue) {
        try {
            const choice = await select({
                message: 'What would you like to do?',
                choices: [
                    { name: '➕ Add/Edit alias', value: 'add' },
                    { name: '🗑️  Remove aliases', value: 'remove' },
                    { name: '📋 List all aliases', value: 'list' },
                    { name: '❌ Exit', value: 'exit' }
                ]
            });

            switch (choice) {
                case 'add':
                    // Command handles its own clearing and header
                    await runWithErrorHandling(runAddCommand, 'Add/Edit');
                    // Wait for user to read results, then return to menu
                    await waitForEnter();
                    clearScreen();
                    showHeader();
                    showStatus();
                    break;
                case 'remove':
                    // Command handles its own clearing and header
                    await runWithErrorHandling(runRemoveCommand, 'Remove');
                    // Wait for user to read results, then return to menu
                    await waitForEnter();
                    clearScreen();
                    showHeader();
                    showStatus();
                    break;
                case 'list':
                    clearScreen();
                    showHeader();
                    showDetailedList();
                    // Wait for user to read list, then return to menu
                    await waitForEnter();
                    clearScreen();
                    showHeader();
                    showStatus();
                    break;
                case 'exit':
                    shouldContinue = false;
                    break;
            }
        } catch (error: unknown) {
            // Check if it's a user cancellation
            if (error && typeof error === 'object' && 'name' in error) {
                const errorName = (error as { name: string }).name;
                if (errorName === 'ExitPromptError') {
                    // User pressed Ctrl+C during menu selection
                    console.log(chalk.yellow('\n⚠️  Selection cancelled.'));

                    try {
                        const shouldExit = await confirm({
                            message: 'Do you want to exit?',
                            default: true
                        });

                        if (shouldExit) {
                            shouldContinue = false;
                        } else {
                            // Clear and re-render
                            clearScreen();
                            showHeader();
                            showStatus();
                        }
                    } catch {
                        // Double Ctrl+C - just exit
                        shouldContinue = false;
                    }
                    continue;
                }
            }

            // For other errors, show message and then re-render
            console.error(chalk.red('\n❌ An error occurred:'));
            if (error instanceof Error) {
                console.error(chalk.dim(error.message));
            }
            // Wait a moment for user to see error, then re-render
            await new Promise(resolve => setTimeout(resolve, 2000));
            clearScreen();
            showHeader();
            showStatus();
        }
    }

    gracefulExit();
}


