# ICEMM Discord Bot

Bot for marketplace server:
1. Marketplace rules embed
2. Welcomer with inviter tracking
3. MM TOS embed
4. Request-a-MM ticket panel
5. Booster rewards embed + boost thank-you
6. Persistent reputation and star ratings

## 1. Create the bot

1. Go to https://discord.com/developers/applications -> New Application -> `ICEMM`
2. Bot tab -> Reset Token -> copy token
3. General Information -> copy Application ID (CLIENT_ID)
4. Enable intents in Bot tab:
   - SERVER MEMBERS INTENT (required for welcomer/boost)
   - MESSAGE CONTENT INTENT (for !commands)
   - PRESENCE INTENT (optional, for boost detection)
5. Invite URL:
   - OAuth2 -> URL Generator
   - Scopes: `bot`, `applications.commands`
   - Permissions: Administrator (easiest) or: Manage Channels, Manage Roles, View Channels, Send Messages, Embed Links, Read Message History, Manage Messages, Create Invite, Mention Everyone
6. Open invite URL, add to your server.

Right-click server name -> Copy Server ID (GUILD_ID).

## 2. Configure

```powershell
cd "C:\Users\sxrum\AppData\Local\Cline\icemm-bot"
copy .env.example .env
notepad .env
notepad config.json
```

Fill `.env`:
```
DISCORD_TOKEN=xxx
CLIENT_ID=xxx
GUILD_ID=xxx
```

Fill `config.json` IDs (Developer Mode ON in Discord: Settings -> Advanced -> Developer Mode, then right-click channel/role -> Copy ID):
- welcomeChannelId: where join messages go
- rulesChannelId: marketplace rules
- mmTosChannelId: MM TOS
- mmPanelChannelId: MM request panel with button
- mmTicketCategoryId: category where tickets are created
- mmTicketLogChannelId: log of opened tickets
- mmProofsChannelId: informational only (mentioned in TOS)
- supportChannelId: informational only (mentioned in TOS)
- ticketChannelId: informational only
- boosterChannelId: booster perks + boost thanks
- vouchLogChannelId: vouch log
- mmRoleId: Middleman role
- staffRoleId: Staff role

## 3. Run

### Windows EXE (easiest)

Keep `ICEMM-Bot.exe`, `.env`, and `config.json` in the same folder, then double-click `ICEMM-Bot.exe`. It registers the slash commands automatically each time it starts, so no npm command is needed. Do not close its console window while you want the bot online.

### Node.js

```powershell
cd "C:\Users\sxrum\AppData\Local\Cline\icemm-bot"
npm install
npm run deploy-commands
npm start
```

Keep it running 24/7: host on Railway / Render / Replit / VPS, or leave PC on.

## 4. Post the panels

In Discord (as admin), run:
- `/setup-all` -> posts rules + TOS + boosts + MM panel to configured channels
- Or individually: `/setup-rules`, `/setup-tos`, `/setup-mm-panel`, `/setup-boosts`

Fallback prefix commands (anyone can trigger display, admin should use once then delete or restrict):
- `!rules`, `!tos`, `!mm`, `!boosts`

## 5. How each feature works

### Rules
`/setup-rules` posts pink embed with 01 Channels, 02 Trading, 03 Conduct, 04 Enforcement.

### Welcomer + inviter
- Bot caches invites on startup.
- On `guildMemberAdd`, compares invite uses to find which invite was used, posts embed in welcome channel with new member + inviter + code + uses + member count.
- Needs Manage Server / Create Invite + View Audit? Actually needs `Manage Guild` to fetch invites. Give bot Administrator.
- Vanity URL / unknown joins show `Unknown / Vanity / Direct join`.

### MM TOS
`/setup-tos` posts 6-section TOS.

### Request MM
- `/setup-mm-panel` posts green panel with `Request Middleman` button.
- Click -> modal asks: other trader, trade details, agreed yes/no.
- Submit -> private ticket channel `mm-username-1234` visible only to opener + MM role + Staff, with Claim/Close buttons + log message.
- MM uses `/claim`, `/close reason:xxx` or buttons.
- Vouch: `/vouch user:@MM message:fast+safe rating:5` -> posts in ticket + vouch log channel.

### Reputation
- `/rep user:@User stars:5 message:Fast and trusted` gives a user one reputation with a 1-5 star rating.
- `/reps` shows your own total reps and average star rating; `/reps user:@User` checks somebody else.
- A member cannot rep themselves or a bot. Each giver has one rep per recipient; using `/rep` again updates that rating instead of increasing the count.
- Reputation is saved in `data/reputation.json`, so it remains after bot restarts. Keep this file on persistent storage when hosting the bot.

### Crypto middleman
- An administrator first runs `/crypto-setup asset:USDT network:TRC20 address:ADDRESS_1,ADDRESS_2` using one or more real receiving addresses. Each ticket randomly selects one address from this verified pool.
- An administrator runs `/setup automm` in the desired channel to post the automatic middleman panel.
- A user clicks **Open Auto Middleman**, enters the other trader's Discord user ID, and the bot creates a private guided ticket for both traders and MM/Staff.
- Both users choose Buyer/Seller and confirm the roles. The buyer enters the amount and the seller confirms it.
- Only then does the bot show the configured escrow address. The buyer submits a transaction hash and MM/Staff verifies it on-chain before clicking **Confirm Funds Received**.
- The bot never stores private keys and never releases cryptocurrency automatically. Staff must handle release from the escrow wallet after the trade is completed.
- Trade amounts display in USD. Cancelling before payment submission deletes the ticket after 5 seconds; cancellation is blocked after a transaction hash is submitted.
- The bot checks the Litecoin blockchain every 30 seconds. There is no “I sent crypto” button; a new incoming transaction is posted automatically in the correct ticket.
- `/confirm ticket:3106` can be used by an administrator from any server channel as a manual override. It finds `crypto-mm-3106`, marks the escrow payment confirmed, and tells the seller to release the item/service to the buyer. Buyer and Seller roles must already be selected.
- After the buyer proposes a USD amount, the seller can accept it or click **Update Amount**. If changed, both buyer and seller must click **Accept New Amount** before the wallet instructions appear.
- After `/confirm`, the ticket shows a staff-only **Release Money** button. It marks the trade as released and posts a completion receipt in Discord; it does not broadcast a real Litecoin transaction.
- `/confirm` first posts **Payment Confirmation Pending**, waits a random 1–3 minutes, and then automatically posts **Payment confirmed** with the Release Money button. Pending timers resume after a bot restart.
- **Release Money** locks the buyer from chatting, asks the seller for a checksum-valid Litecoin payout address, and asks the seller to confirm it. Confirmation posts **Payment Sent** and deletes the ticket after 10 seconds. This records Discord status only; it does not broadcast a Litecoin transaction.

### Booster rewards
- `/setup-boosts` posts gold perks embed.
- On new boost (`guildMemberUpdate` premiumSince set), bot thanks booster in booster channel and lists perks.

## Troubleshooting
- No welcome message: check welcomeChannelId, bot has View/Send perms, Server Members intent ON, then restart bot (invite cache).
- Buttons do nothing: bot offline or not latest code; interactions must be answered within 3s — modal open counts.
- Tickets not private: check category perms.
- Slash commands missing: run `npm run deploy-commands` after changing GUILD_ID, wait 1 min, kick/re-add bot or refresh Discord (Ctrl+R).
