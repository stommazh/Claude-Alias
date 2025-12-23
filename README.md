# claude-alias

> Manage Claude Code with custom AI API providers using secure credential storage.

[![npm version](https://img.shields.io/npm/v/claude-alias.svg)](https://www.npmjs.com/package/claude-alias)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**claude-alias** creates shell aliases that let you run [Claude Code](https://www.anthropic.com/claude-code) with different AI providers like DeepSeek, OpenRouter, Z.AI, and more. Each alias has its own API key stored securely in your system's credential manager.

## Features

- 🔐 **Secure API key storage** - macOS Keychain or Linux secret-tool/encrypted file
- 🎯 **Multiple provider presets** - DeepSeek, OpenRouter, Z.AI, OpenAI, Anthropic, Groq, and more
- 🤖 **Model configuration** - Set opus/sonnet/haiku/subagent models per alias
- 📋 **LiteLLM integration** - Search 100+ models from the LiteLLM registry
- 🐚 **Shell integration** - Auto-adds aliases to `.zshrc` or `.bashrc`
- 🔧 **MCP support** - Symlinks global settings for MCP servers

## Requirements

- **Node.js** 18+
- **Claude Code** installed (`claude` command available)
- **macOS** or **Linux**

### Linux Only
```bash
# Recommended: Install libsecret-tools for secure storage
sudo apt install libsecret-tools  # Ubuntu/Debian
sudo dnf install libsecret        # Fedora/RHEL
```

## Installation

```bash
# Install globally
npm install -g claude-alias

# Or use directly with npx
npx claude-alias
```

## Quick Start

```bash
# Run interactive mode
claude-alias

# Or use commands directly
claude-alias add      # Add/edit an alias
claude-alias remove   # Remove aliases  
claude-alias list     # List all aliases
```

## Usage

### Adding an Alias

```bash
claude-alias add
```

You'll be guided through:
1. **Alias name** - e.g., `ccd` for DeepSeek, `ccz` for Z.AI
2. **Provider** - Select from presets or enter custom
3. **API key** - Stored securely in Keychain/secret-tool
4. **Base URL** - Auto-filled for preset providers
5. **Model configuration** - Optional opus/sonnet/haiku/subagent models
6. **Max output tokens** - Optional limit

### Example: DeepSeek Setup

```bash
$ claude-alias add
? Enter alias name: ccd
? Select provider: DeepSeek
? Enter API key: ****
? Token type: ANTHROPIC_AUTH_TOKEN
? Opus Model: deepseek-chat
✅ Alias 'ccd' created successfully!

# Now use it
$ source ~/.zshrc
$ ccd
```

### Z.AI Quick Setup

Z.AI comes pre-configured with optimal models:

```bash
$ claude-alias add
? Enter alias name: ccz
? Select provider: Z.AI (GLM Models)
? Enter API key: ****
# Models auto-configured: glm-4.7 (opus/sonnet), glm-4.5-air (haiku)
✅ Alias 'ccz' created!
```

## How It Works

1. **Profile scripts** are created in `~/.local/bin/claude-{alias}`
2. **Shell aliases** are added to your `.zshrc` or `.bashrc`
3. **API keys** are stored in macOS Keychain or Linux secret storage
4. **Each alias** gets its own config directory (`~/.claude-{alias}`)
5. **MCP settings** are symlinked from `~/.claude/settings.json`

## Provider Presets

| Provider | Base URL |
|----------|----------|
| Z.AI | `https://api.z.ai/api/anthropic` |
| DeepSeek | `https://api.deepseek.com` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| OpenAI | `https://api.openai.com/v1` |
| Anthropic | `https://api.anthropic.com` |
| Google AI | `https://generativelanguage.googleapis.com/v1beta` |
| Mistral | `https://api.mistral.ai/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| Together AI | `https://api.together.xyz/v1` |
| Fireworks AI | `https://api.fireworks.ai/inference/v1` |
| Perplexity | `https://api.perplexity.ai` |

## Model Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | Primary model for complex tasks/Plan Mode |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | Default model for normal operation |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | Fast model for background tasks |
| `CLAUDE_CODE_SUBAGENT_MODEL` | Model for subagent operations |

## Troubleshooting

### API key not found
```bash
# Re-add the alias to store the key again
claude-alias add
# Enter the same alias name to reconfigure
```

### MCP servers not showing
```bash
# Symlink is created automatically, but you can force it:
ln -sf ~/.claude/settings.json ~/.claude-{alias}/settings.json
```

### Command not found after adding alias
```bash
# Source your shell profile
source ~/.zshrc  # or ~/.bashrc
# Or open a new terminal
```

## Security

- **macOS**: API keys stored in Keychain (secure enclave)
- **Linux with secret-tool**: Stored in GNOME Keyring/KDE Wallet
- **Linux fallback**: AES-256 encrypted file (`~/.config/claude-alias/secrets.enc`)

## Disclaimer

This project is an **independent, community-developed tool** and is **not affiliated with, endorsed by, or sponsored by Anthropic, PBC**.

- **Claude** and **Claude Code** are trademarks of [Anthropic, PBC](https://www.anthropic.com/).
- This tool is a third-party utility that helps manage environment configurations for Claude Code.
- Use of Claude Code is subject to [Anthropic's Terms of Service](https://www.anthropic.com/legal/terms).
- Provider names mentioned (DeepSeek, OpenRouter, OpenAI, Google, etc.) are trademarks of their respective owners.

This software is provided "as is" without warranty of any kind. The authors are not responsible for any issues arising from the use of this tool with Claude Code or any third-party API providers.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT © 2024

---

*This project is not affiliated with Anthropic. Claude and Claude Code are trademarks of Anthropic, PBC.*
