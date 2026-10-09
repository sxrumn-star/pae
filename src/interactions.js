const { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { marketplaceRulesEmbed, mmTosEmbed, mmPanelEmbed } = require('./embeds');
const { createMmTicket, isConfigured } = require('./tickets');
const { handleCryptoButton } = require('./cryptoEscrow');

function canManageTickets(member, config) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (isConfigured(config.roles.mmRoleId) && member.roles.cache.has(config.roles.mmRoleId)) return true;
  if (isConfigured(config.roles.staffRoleId) && member.roles.cache.has(config.roles.staffRoleId)) return true;
  return false;
}

async function handleButtons(interaction, config) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  if (interaction.customId.startsWith('choice_')) {
    const match = interaction.customId.match(/^choice_(yes|no):(\d{15,25})$/);
    if (!match) return interaction.reply({ content: 'This button is invalid.', ephemeral: true });
    const answer = match[1];
    const targetId = match[2];
    if (interaction.user.id !== targetId) {
      return interaction.reply({ content: 'Only the mentioned member can use these buttons.', ephemeral: true });
    }
    try { await interaction.deferUpdate().catch(() => null); } catch {}
    try { await interaction.message.delete().catch(() => null); } catch {}
    if (answer === 'yes') {
      try {
        const dm = new EmbedBuilder()
          .setTitle('Welcome aboard.')
          .setColor('#57F287')
          .setDescription('You clicked **YES**.\n\nMessage the owner to start working.')
          .setTimestamp();
        const u = await interaction.client.users.fetch(targetId).catch(() => null);
        if (u) await u.send({ embeds: [dm] }).catch(() => null);
      } catch {}
    } else {
      try {
        const m = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (m && m.bannable) await m.ban({ reason: 'Declined the offer' }).catch(() => null);
      } catch {}
    }
    return;
  }
  if (interaction.customId.startsWith('crypto_')) return handleCryptoButton(interaction, config);
  if (interaction.customId === 'open_mm_ticket') {
    const modal = new ModalBuilder().setCustomId('mm_request_modal').setTitle('Request a Middleman');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trader2').setLabel('Other trader user ID or mention').setPlaceholder('Example: 123456789012345678').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(15).setMaxLength(25)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade').setLabel('What is being traded? both sides').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('agreed').setLabel('Both agreed? yes/no').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20))
    );
    return interaction.showModal(modal);
  }
  if (interaction.customId === 'tos_hint') {
    return interaction.reply({ embeds: [mmTosEmbed(config)], ephemeral: true });
  }
  if (interaction.customId === 'ticket_claim') {
    if (!canManageTickets(interaction.member, config)) return interaction.reply({ content: 'Only MM / Staff can claim.', ephemeral: true });
    return interaction.reply({ content: `✅ ${interaction.user} claimed this ticket. Do not trade until they confirm.` });
  }
  if (interaction.customId === 'ticket_close') {
    const isOpener = interaction.channel.topic && interaction.channel.topic.includes(`opener=${interaction.user.id}`);
    if (!canManageTickets(interaction.member, config) && !isOpener) return interaction.reply({ content: 'Only opener or MM / Staff can close.', ephemeral: true });
    await interaction.reply({ content: `Closing in 5 seconds (by ${interaction.user})...` });
    setTimeout(() => interaction.channel.delete().catch(() => null), 5000);
  }
}

module.exports = { canManageTickets, handleButtons };
