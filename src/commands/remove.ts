import chalk from 'chalk';
import ora from 'ora';
import { checkbox, confirm } from '@inquirer/prompts';
import * as keychain from '../services/secrets/index.js';
import * as profile from '../services/profile.js';
import * as shell from '../services/shell.js';
import { clearScreen } from '../index.js';

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
 * Run the remove command flow
 */
export async function runRemoveCommand(): Promise<void> {
    // Clear and show header
    clearScreen();
    showHeaderBox();
    console.log(chalk.bold.red('  🗑️  Remove Aliases\n'));

    // Get all Claude aliases from shell
    const allAliases = shell.listAllClaudeAliases();
    const managedAliases = shell.listManagedAliases();

    if (allAliases.length === 0) {
        console.log(chalk.yellow('No Claude aliases found in your shell.'));
        console.log(chalk.dim('Use "Add/Edit" to create a new alias first.'));
        return;
    }

    console.log(chalk.dim(`  Found ${allAliases.length} Claude alias(es):\n`));

    // Multi-select aliases to remove
    const toRemove = await checkbox({
        message: 'Select aliases to remove:',
        choices: allAliases.map(a => {
            const isManaged = managedAliases.some(m => m.name === a.name);
            const scriptName = shell.getScriptNameFromCommand(a.command);
            const tag = isManaged ? chalk.green('[managed]') : chalk.dim('[existing]');
            return {
                name: `${a.name} → ${scriptName} ${tag}`,
                value: a.name
            };
        })
    });

    if (toRemove.length === 0) {
        console.log(chalk.dim('\nNo aliases selected. Cancelled.'));
        return;
    }

    // Check if any non-managed aliases are selected
    const nonManagedSelected = toRemove.filter(name =>
        !managedAliases.some(m => m.name === name)
    );

    if (nonManagedSelected.length > 0) {
        console.log(chalk.yellow('\n⚠️  Note: Some selected aliases are not managed by this tool:'));
        for (const name of nonManagedSelected) {
            console.log(`   • ${chalk.cyan(name)} ${chalk.dim('[existing]')}`);
        }
        console.log(chalk.dim('   These aliases exist in your shell but were created manually.'));
        console.log(chalk.dim('   Removing them will only remove the shell alias, not any associated scripts.\n'));
    }

    // Confirm deletion
    console.log(chalk.yellow('\n⚠️  The following aliases will be removed:'));
    for (const aliasName of toRemove) {
        const alias = allAliases.find(a => a.name === aliasName);
        const isManaged = managedAliases.some(m => m.name === aliasName);
        const tag = isManaged ? chalk.green('[managed]') : chalk.dim('[existing]');
        console.log(`   • ${chalk.cyan(aliasName)} ${tag}`);
    }
    console.log();

    // Only ask about profile dirs for managed aliases
    const managedToRemove = toRemove.filter(name =>
        managedAliases.some(m => m.name === name)
    );

    let removeProfileDirs = false;
    if (managedToRemove.length > 0) {
        removeProfileDirs = await confirm({
            message: 'Also remove profile home directories (~/.claude-{alias})?',
            default: false
        });
    }

    const confirmed = await confirm({
        message: `Remove ${toRemove.length} alias(es)? This cannot be undone.`,
        default: false
    });

    if (!confirmed) {
        console.log(chalk.dim('\nCancelled.'));
        return;
    }

    console.log();

    // Remove each alias
    for (const aliasName of toRemove) {
        const alias = allAliases.find(a => a.name === aliasName);
        const isManaged = managedAliases.some(m => m.name === aliasName);
        const scriptName = alias ? shell.getScriptNameFromCommand(alias.command) : '';

        const spinner = ora(`Removing ${aliasName}...`).start();

        let hasErrors = false;

        // For managed aliases, also clean up Keychain and scripts
        if (isManaged) {
            // Try to find the profile to get the provider name
            const profiles = profile.listProfiles();
            const matchingProfile = profiles.find(p => `claude-${p.alias}` === scriptName);

            if (matchingProfile) {
                // Delete API key from Keychain (only alias needed, provider not required)
                const keySuccess = await keychain.deleteApiKey(matchingProfile.alias);
                if (!keySuccess) {
                    spinner.text = `${aliasName}: Warning - could not remove API key from Keychain`;
                    hasErrors = true;
                }

                // Delete script
                const scriptSuccess = profile.deleteScript(matchingProfile.alias);
                if (!scriptSuccess) {
                    spinner.text = `${aliasName}: Warning - could not remove script`;
                    hasErrors = true;
                }

                // Remove profile directory if requested
                if (removeProfileDirs) {
                    const dirSuccess = profile.deleteProfileHome(matchingProfile.alias);
                    if (!dirSuccess) {
                        spinner.text = `${aliasName}: Warning - could not remove profile directory`;
                        hasErrors = true;
                    }
                }
            }
        }

        // Remove shell alias (for all types)
        const aliasSuccess = shell.removeAlias(aliasName);
        if (!aliasSuccess) {
            spinner.text = `${aliasName}: Failed to remove shell alias`;
            hasErrors = true;
        }

        if (hasErrors) {
            spinner.warn(`${aliasName}: Removed with some warnings`);
        } else {
            spinner.succeed(`${aliasName}: Removed`);
        }
    }

    console.log(chalk.green.bold(`\n✅ Removed ${toRemove.length} alias(es).\n`));
    console.log(chalk.dim('To apply changes, either:'));
    console.log(`   1. Source your shell profile: ${chalk.cyan(`source ${shell.getProfilePath()}`)}`);
    console.log(`   2. Open a new terminal window`);
    console.log();
}

