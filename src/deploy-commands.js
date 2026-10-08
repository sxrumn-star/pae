const path = require('node:path');
const { appRoot } = require('./runtime');
require('dotenv').config({ path: path.join(appRoot, '.env') });
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
  new SlashCommandBuilder().setName('setup-rules').setDescription('Post marketplace rules embed').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('setup-tos').setDescription('Post middleman TOS embed').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('setup-mm-panel').setDescription('Post middleman request panel with button').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('setup-boosts').setDescription('Post booster rewards embed').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('setup-all').setDescription('Post all 4 panels to their configured channels').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close this MM ticket (MM/Staff only)')
    .addStringOption(o => o.setName('reason').setDescription('Close reason').setRequired(false)),
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim this MM ticket (MM/Staff only)'),
  new SlashCommandBuilder()
    .setName('vouch')
    .setDescription('Leave feedback for a trade')
    .addUserOption(o => o.setName('user').setDescription('Who are you vouching? (usually the MM)').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Your feedback').setRequired(true))
    .addIntegerOption(o => o.setName('rating').setDescription('Rating 1-5').setMinValue(1).setMaxValue(5).setRequired(false)),
  new SlashCommandBuilder()
    .setName('rep')
    .setDescription('Give someone reputation and a star rating')
    .addUserOption(o => o.setName('user').setDescription('Who do you want to rep?').setRequired(true))
    .addIntegerOption(o => o.setName('stars').setDescription('Star rating (1-5)').setMinValue(1).setMaxValue(5).setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Optional feedback').setMaxLength(500).setRequired(false)),
  new SlashCommandBuilder()
    .setName('reps')
    .setDescription('See how many reps someone has')
    .addUserOption(o => o.setName('user').setDescription('User to check (defaults to you)').setRequired(false)),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Post a setup panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand => subcommand
      .setName('automm')
      .setDescription('Post the automatic crypto middleman panel')),
  new SlashCommandBuilder()
    .setName('crypto-setup')
    .setDescription('Configure the crypto escrow payment details (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('asset').setDescription('Coin/token, e.g. USDT').setRequired(true).setMaxLength(20))
    .addStringOption(o => o.setName('network').setDescription('Exact network, e.g. TRC20').setRequired(true).setMaxLength(40))
    .addStringOption(o => o.setName('address').setDescription('One or more real escrow addresses, separated by commas').setRequired(true).setMaxLength(1000)),
  new SlashCommandBuilder()
    .setName('confirm')
    .setDescription('Confirm escrow payment for an AutoMM ticket (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => o.setName('ticket').setDescription('Ticket number, channel ID, or channel mention').setRequired(true).setMaxLength(100)),
].map(c => c.toJSON());

async function deployCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  if (!token || !clientId || !guildId) {
    console.error('Missing DISCORD_TOKEN / CLIENT_ID / GUILD_ID in .env');
    throw new Error('Missing DISCORD_TOKEN / CLIENT_ID / GUILD_ID in .env');
  }
  const rest = new REST({ version: '10' }).setToken(token);
  console.log('Deploying guild commands...');
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log('Done. Commands registered.');
}

if (require.main === module) {
  deployCommands().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { commands, deployCommands };
