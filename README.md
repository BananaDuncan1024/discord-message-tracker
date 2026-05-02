# 🤖 Discord Message Guardian

> An automated tracking bot built specifically for Discord Server Administrators. When targeted users delete their messages, the bot instantly recovers and reposts them in the original channel.

## ✨ Core Features

- 🔍 **Precise Targeting**: Monitors only the users you specify (limit configurable via `.env`). Saves system resources and respects others' privacy.
- 🔄 **In-Place Recovery**: The moment a monitored user deletes a message, the bot immediately posts the exact original text right back in the same channel.
- 🔐 **Flexible Permissions**: By default, commands are restricted to "Administrators". However, Server Owners can easily grant access to specific roles (like Moderators) via Discord's native *Server Settings -> Integrations* menu!
- 🗄️ **Auto-Memory**: Whether the bot restarts or disconnects, it automatically remembers your monitor list. No need to set it up again manually.
- 🛡️ **Privacy First**: This project is fully designed for "Private Hosting". Your database and message logs exist solely on your own server.

---

## 🎮 How to Use (Commands)

Once the bot is invited to your server, simply type these commands in the chat (Admin only):

| Command | Description |
|------|------|
| `/monitor add <@user>` | ➕ Add a person to the monitor list (Limit is 5 by default). |
| `/monitor remove <@user>` | ➖ Remove a person from the list. |
| `/monitor list` | 📋 View exactly who the bot is currently monitoring. |

---

## 🚀 Host Your Own Private Bot

This open-source code is available for anyone to download. You can easily turn it into **your very own private bot**.

### Step 1: Create Your Exclusive Bot
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a new Application.
2. Navigate to the **Bot** tab, and **turn OFF `Public Bot`** (This ensures only YOU have permission to invite the bot to servers).
3. On the same page, scroll down and **enable** these two Privileged Gateway Intents:
   - `MESSAGE CONTENT INTENT` (Allows the bot to read message content)
   - `SERVER MEMBERS INTENT` (Allows the bot to read the member list)
4. Click `Reset Token` to generate and copy your `Bot Token`. Please keep this key absolutely secret!

### Step 2: Download & Start
We use the blazing-fast [Bun](https://bun.sh/) runtime. Make sure Bun is installed on your machine/server.

```bash
# 1. Install dependencies
bun install

# 2. Prepare the config file
cp .env.example .env
```

Next, open the `.env` file with a text editor and fill in your unique info:
```env
DISCORD_TOKEN=Paste_your_copied_Bot_Token_here
DISCORD_CLIENT_ID=Your_Application_ID(Found_in_General_Information)
```

```bash
# 3. Start the bot!
bun start
```

---

## 🛠️ Advanced Settings (For Tweakers)

If you wish to adjust the bot's internal behavior, you can add/modify the following in your `.env` file:

| Variable | Description | Default |
|------|------|--------|
| `MAX_MONITORED_USERS_PER_GUILD` | Max users that can be monitored per server | `5` |
| `MAX_MESSAGES_PER_USER` | The maximum number of cached messages remembered per user | `500` |
| `DB_PATH` | Storage location for the memory database | `data/monitor.db` |

---

> 💡 **License**
> This project is open-sourced under the [MIT](LICENSE) license. Feel free to download, modify, and host privately. All core architecture is designed with high-standard stability to guard your Discord server 24/7!
