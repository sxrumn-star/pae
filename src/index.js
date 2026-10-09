const path = require('node:path');
const { appRoot } = require('./runtime');
require('dotenv').config({ path: path.join(appRoot, '.env') });
const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { loadConfig } = require('./config');
const { deployCommands } = require('./deploy-commands');
const { resumePendingConfirmations, startCryptoWatcher } = require('./cryptoEscrow');
const {
  marketplaceRulesEmbed,
  mmTosEmbed,
  mmPanelEmbed,
  boosterRewardsEmbed,
  welcomeEmbed,
  ticketWelcomeEmbed,
} = require('./embeds');
const { refreshInvites, refreshAllInvites, findUsedInvite } = require('./invites');
const { isTxidFeedRunning, startTxidFeed } = require('./txidFeed');

const config = loadConfig();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    
  ],
  partials: [Partials.GuildMember, Partials.Channel],
});

function isConfigured(id) {
  return id && !String(id).startsWith('PASTE');
}

function canManageTickets(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (isConfigured(config.roles.mmRoleId) && member.roles.cache.has(config.roles.mmRoleId)) return true;
  if (isConfigured(config.roles.staffRoleId) && member.roles.cache.has(config.roles.staffRoleId)) return true;
  return false;
}

async function ensurePersistentTxidFeed() {
  const channelId = config.channels?.txidFeedChannelId;
  if (!isConfigured(channelId)) return;
  if (isTxidFeedRunning(channelId)) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) {
    console.error(`[txid feed] Configured channel ${channelId} could not be accessed; retrying later`);
    return;
  }
  if (startTxidFeed(channel, client)) {
    console.log(`[txid feed] Persistent feed enabled in #${channel.name} (${channelId})`);
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await ensurePersistentTxidFeed();
  setInterval(ensurePersistentTxidFeed, 60_000).unref();
  try {
    await refreshAllInvites(client);
    console.log('Invite cache ready.');
  } catch (e) {
    console.log('Invite cache skipped (needs Manage Guild / Invites intent): ' + e.message);
  }
});

client.on('inviteCreate', async (invite) => {
  await refreshInvites(invite.guild);
});

client.on('inviteDelete', async (invite) => {
  await refreshInvites(invite.guild);
});

client.on('guildMemberAdd', async (member) => {
  try {
    let usedInvite = null;
    try {
      const fresh = await member.guild.invites.fetch();
      usedInvite = findUsedInvite(member.guild, fresh);
      await refreshInvites(member.guild);
    } catch (e) {
      console.log(`[welcome] invite lookup failed: ${e.message}`);
    }

    let inviter = null;
    let code = null;
    let uses = null;
    if (usedInvite) {
      code = usedInvite.code;
      uses = usedInvite.uses;
      if (usedInvite.inviter) inviter = usedInvite.inviter;
      else if (usedInvite.inviterId) {
        try { inviter = await client.users.fetch(usedInvite.inviterId); } catch {}
      }
    }

    if (!isConfigured(config.channels.welcomeChannelId)) {
      console.log(`[welcome] ${member.user.tag} joined; invited by ${inviter ? inviter.tag : 'unknown'} (${code || 'no code'})`);
      return;
    }
    const ch = await member.guild.channels.fetch(config.channels.welcomeChannelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;
    await ch.send({ embeds: [welcomeEmbed({ member, inviter, inviteCode: code, uses, config })] });
  } catch (e) {
    console.error('[welcome] error:', e);
  }
});

// Boost = booster rewards shoutout (works without privileged intents)
client.on('guildMemberUpdate', async (oldM, newM) => {
  try {
    const wasBooster = oldM.premiumSince && true;
    const isBooster = newM.premiumSince && true;
    if (!wasBooster && isBooster && isConfigured(config.channels.boosterChannelId)) {
      const ch = await newM.guild.channels.fetch(config.channels.boosterChannelId).catch(() => null);
      if (ch && ch.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle('New Server Boost!')
          .setColor('#f5a623')
          .setThumbnail(newM.user.displayAvatarURL({ size: 256 }))
          .setDescription(
            `Thank you ${newM} for boosting **${newM.guild.name}**!\n\n` +
            `You unlocked:\n` +
            `**1. No MM fee**\n` +
            `**2. Higher priority** on tickets\n` +
            `**3.** Access to **exclusive giveaways**\n` +
            `**4. Free** account listing`
          )
          .setTimestamp();
        await ch.send({ content: `${newM}`, embeds: [embed] });
      }
    }
  } catch (e) {
    console.error('[boost] error:', e);
  }
});

const { wire } = require('./wire');
const { startKeepAlive } = require('./keepalive');
wire(client, config);

async function start() {
  console.log('Registering slash commands...');
  await deployCommands();
  await client.login(process.env.DISCORD_TOKEN);
  startKeepAlive();
  resumePendingConfirmations(client);
  await startCryptoWatcher(client);
}

start().catch((error) => {
  console.error('Bot failed to start:', error);
  if (process.pkg) {
    console.log('\nPress Enter to close.');
    process.stdin.resume();
    process.stdin.once('data', () => process.exit(1));
  } else {
    process.exit(1);
  }
});
