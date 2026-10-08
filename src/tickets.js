const { ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ticketWelcomeEmbed } = require('./embeds');

function isConfigured(id) {
  return id && !String(id).startsWith('PASTE');
}

async function createMmTicket(guild, openerUser, details, config) {
  const trader2 = details.trader2Id
    ? await guild.members.fetch(details.trader2Id).catch(() => null)
    : null;
  if (details.trader2Id && !trader2) {
    throw new Error('The second trader ID is not a member of this server.');
  }
  if (trader2?.id === openerUser.id) {
    throw new Error('The second trader must be a different user.');
  }
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: openerUser.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (trader2) {
    overwrites.push({ id: trader2.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  if (isConfigured(config.roles.mmRoleId)) {
    overwrites.push({ id: config.roles.mmRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
  }
  if (isConfigured(config.roles.staffRoleId)) {
    overwrites.push({ id: config.roles.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }
  const safeName = String(openerUser.username).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 20) || 'user';
  const channel = await guild.channels.create({
    name: `mm-${safeName}-${Math.floor(Math.random() * 9000) + 1000}`,
    type: ChannelType.GuildText,
    parent: isConfigured(config.channels.mmTicketCategoryId) ? config.channels.mmTicketCategoryId : null,
    permissionOverwrites: overwrites,
    topic: `MM ticket | opener=${openerUser.id} | trader2=${details.trader2Id || '?'}`,
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Claim').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('🔒')
  );
  const mmPing = isConfigured(config.roles.mmRoleId) ? `<@&${config.roles.mmRoleId}>` : '';
  await channel.send({
    content: `${openerUser} ${trader2 || ''} ${mmPing}`.trim(),
    embeds: [ticketWelcomeEmbed({ opener: `${openerUser}`, details, config })],
    components: [row],
  });
  return channel;
}

module.exports = { createMmTicket, isConfigured };
