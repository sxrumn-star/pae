const { marketplaceRulesEmbed, mmTosEmbed, mmPanelEmbed, boosterRewardsEmbed } = require('./embeds');
const { createMmTicket } = require('./tickets');
const { handleButtons } = require('./interactions');
const { handleSlash } = require('./slash');
const { handleCryptoModal } = require('./cryptoEscrow');

function wire(client, config) {
  client.on('interactionCreate', async (interaction) => {
    try {
      console.log(`[interaction] ${interaction.type} ${interaction.isChatInputCommand() ? interaction.commandName : interaction.customId} by ${interaction.user?.tag}`);
      if (interaction.isButton()) return handleButtons(interaction, config);
      if (interaction.isModalSubmit() && interaction.customId.startsWith('crypto_')) return handleCryptoModal(interaction, config);
      if (interaction.isModalSubmit() && interaction.customId === 'mm_request_modal') {
        const trader2 = interaction.fields.getTextInputValue('trader2');
        const trade = interaction.fields.getTextInputValue('trade');
        const agreed = interaction.fields.getTextInputValue('agreed');
        const m = trader2.trim().match(/^(?:<@!?)?(\d{15,25})>?$/);
        if (!m) return interaction.reply({ content: 'Enter a valid Discord user ID or mention for the second trader.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const details = { trader1: `${interaction.user}`, trader2: `<@${m[1]}>`, trader2Id: m[1], trade, agreed };
        const channel = await createMmTicket(interaction.guild, interaction.user, details, config);
        return interaction.editReply({ content: `Ticket created: ${channel}.` });
      }
      if (!interaction.isChatInputCommand()) return;
      await handleSlash(interaction, config);
    } catch (e) {
      console.error('[interaction] error:', e);
      try {
        if (interaction.deferred) await interaction.editReply({ content: 'Failed: ' + e.message }).catch(() => null);
        else if (!interaction.replied) await interaction.reply({ content: 'Failed: ' + e.message, ephemeral: true }).catch(() => null);
      } catch {}
    }
  });
  client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    const c = msg.content.trim().toLowerCase();
    if (c === '!rules') return msg.channel.send({ embeds: [marketplaceRulesEmbed(config)] });
    if (c === '!tos' || c === '!mmtos') return msg.channel.send({ embeds: [mmTosEmbed(config)] });
    if (c === '!boosts' || c === '!boost') return msg.channel.send({ embeds: [boosterRewardsEmbed(config)] });
    if (c === '!mm' || c === '!panel') {
      const { embed, row } = mmPanelEmbed(config);
      return msg.channel.send({ embeds: [embed], components: [row] });
    }
  });
}

module.exports = { wire };
