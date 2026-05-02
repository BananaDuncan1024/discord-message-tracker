# Discord Message Monitor System

> 🤖 A Discord bot used to monitor specific users' message activities, automatically recovering and notifying when messages are deleted.

## Features

| Feature | Description |
|------|------|
| 🔍 **Message Monitoring** | Monitors specified users' messages across all channels in the server. |
| 🔄 **Message Recovery** | Detects deleted messages and automatically sends a recovery notification in the original channel. |
| 💾 **Smart Caching** | Retains messages for 7 days with LRU eviction strategy. |
| 🔐 **Access Control** | Slash commands are restricted to server Administrators only. |
| 📊 **Memory Monitoring** | Automatically tracks memory usage and performs aggressive cleanup when thresholds are exceeded. |
| 📝 **Comprehensive Logging** | Winston log rotation (10MB limit, keeps last 5 files). |
| 🔁 **Auto Retry** | Exponential backoff retries for Discord API errors. |
| 🗄️ **Persistent Storage** | SQLite ensures monitoring settings are preserved across bot restarts. |

## Tech Stack

- **Runtime**: Bun v1.0+
- **Discord Library**: Discord.js v14
- **Database**: SQLite (using Bun's built-in `bun:sqlite`)
- **Logging**: Winston
- **Language**: TypeScript
- **Testing**: Bun's built-in test runner

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Set Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in at least:

```env
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
```

### 3. Configure in Discord Developer Portal

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Under the **Bot** tab, enable the following **Privileged Gateway Intents**:
   - `MESSAGE CONTENT INTENT`
   - `SERVER MEMBERS INTENT`
3. Copy the Bot Token and add it to your `.env` file.

### 4. Start the Bot

```bash
# Development mode (recommended)
bun dev

# Production mode
bun start
```

## Discord Slash Commands

> ⚠️ All commands require **Administrator** permissions.

| Command | Description |
|------|------|
| `/monitor add <@user>` | Add a user to monitor. (Cannot monitor the bot itself) |
| `/monitor remove <@user>` | Stop monitoring a specific user. |
| `/monitor list` | List all currently monitored users. |

## Environment Variables

| Variable | Description | Default |
|------|------|--------|
| `DISCORD_TOKEN` | Discord Bot Token (Required) | — |
| `DISCORD_CLIENT_ID` | Discord Application ID (Required) | — |
| `DB_PATH` | SQLite database path | `data/monitor.db` |
| `MAX_MESSAGES_PER_USER` | Max cached messages per user | `500` |
| `MAX_TOTAL_MEMORY_MB` | Max memory usage threshold (MB) | `700` |
| `LOG_LEVEL` | Log level (debug/info/warn/error) | `info` |

## Project Structure

```
.
├── src/
│   ├── services/
│   │   ├── logger.service.ts       # Winston logging service
│   │   ├── storage.service.ts      # SQLite persistence service
│   │   ├── cache.service.ts        # Message cache service (w/ LRU)
│   │   ├── memory-monitor.service.ts # Memory monitoring service
│   │   ├── monitor.service.ts      # Core logic (monitoring, caching, recovery)
│   │   └── index.ts
│   ├── handlers/
│   │   ├── command.handler.ts      # Slash command handler
│   │   ├── event.handler.ts        # Discord event handler
│   │   └── index.ts
│   ├── utils/
│   │   └── error-handler.ts        # Discord API error handling (w/ retry)
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   ├── bot.ts                      # DiscordBot assembly class
│   └── index.ts                    # Application entry point
├── tests/
│   ├── storage.service.test.ts     # StorageService tests
│   ├── cache.service.test.ts       # CacheService tests
│   ├── command.handler.test.ts     # CommandHandler tests
│   ├── event.handler.test.ts       # EventHandler tests
│   ├── monitor.service.test.ts     # MonitorService tests
│   ├── integration.test.ts         # End-to-End integration tests
│   ├── error-handler.test.ts       # ErrorHandler tests
│   └── logger.service.test.ts      # LoggerService tests
├── data/                           # SQLite Database (auto-created)
├── logs/                           # Log files (auto-created)
├── .env.example                    # Environment variables template
└── tsconfig.json
```

## License

[MIT](LICENSE)
