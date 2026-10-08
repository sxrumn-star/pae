const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { marketplaceRulesEmbed, mmTosEmbed, mmPanelEmbed, boosterRewardsEmbed, inviteRewardsEmbed } = require('./embeds');
const { isConfigured } = require('./tickets');
const { canManageTickets } = require('./interactions');
const { getReputation, giveReputation } = require('./reputation');
const { saveConfig } = require('./config');
const { scheduleCryptoConfirmation } = require('./cryptoEscrow');

function reputationEmbed(user, summary, title = 'Reputation') {
  const average = summary.count ? summary.average.toFixed(2) : 'No ratings yet';
  return new EmbedBuilder()
    .setTitle(title)
    .setColor('#FFD700')
    .setThumbnail(user.displayAvatarURL({ size: 128 }))
    .setDescription(`${user} has **${summary.count} rep${summary.count === 1 ? '' : 's'}**.`)
    .addFields({ name: 'Average rating', value: summary.count ? `⭐ **${average}/5**` : average })
    .setTimestamp();
}

async function handleSlash(interaction, config) {
  const name = interaction.commandName;
  if (name === 'message') {
    const target = interaction.options.getUser('user');
    if (target.bot) return interaction.reply({ content: 'Choose a real member, not a bot.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('You Got Scammed! (Prank)')
      .setColor('#FEE75C')
      .setDescription(`${target}, you got “scammed” by trusting this suspicious message. Gotcha!\n\n**Nothing was taken—this is only a prank.** Do you want to join the prank crew?`)
      .setFooter({ text: 'Harmless prank • No account, money, or items were taken' })
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`prank_join_yes:${target.id}`).setLabel('Yes').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`prank_join_no:${target.id}`).setLabel('No').setStyle(ButtonStyle.Danger)
    );
    return interaction.reply({ content: `${target}`, embeds: [embed], components: [row], allowedMentions: { users: [target.id] } });
  }
  if (name === 'setup-rules') {
    if (!isConfigured(config.channels.rulesChannelId)) return interaction.reply({ content: 'Set rulesChannelId first.', ephemeral: true });
    const ch = await interaction.guild.channels.fetch(config.channels.rulesChannelId);
    await ch.send({ embeds: [marketplaceRulesEmbed(config)] });
    return interaction.reply({ content: `Rules posted in ${ch}.`, ephemeral: true });
  }
  if (name === 'setup-tos') {
    if (!isConfigured(config.channels.mmTosChannelId)) return interaction.reply({ content: 'Set mmTosChannelId first.', ephemeral: true });
    const ch = await interaction.guild.channels.fetch(config.channels.mmTosChannelId);
    await ch.send({ embeds: [mmTosEmbed(config)] });
    return interaction.reply({ content: `TOS posted in ${ch}.`, ephemeral: true });
  }
  if (name === 'setup-mm-panel') {
    if (!isConfigured(config.channels.mmPanelChannelId)) return interaction.reply({ content: 'Set mmPanelChannelId first.', ephemeral: true });
    const ch = await interaction.guild.channels.fetch(config.channels.mmPanelChannelId);
    const { embed, row } = mmPanelEmbed(config);
    await ch.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: `MM panel posted in ${ch}.`, ephemeral: true });
  }
  if (name === 'setup-boosts') {
    if (!isConfigured(config.channels.boosterChannelId)) return interaction.reply({ content: 'Set boosterChannelId first.', ephemeral: true });
    const ch = await interaction.guild.channels.fetch(config.channels.boosterChannelId);
    await ch.send({ embeds: [boosterRewardsEmbed(config)] });
    return interaction.reply({ content: `Boosts posted in ${ch}.`, ephemeral: true });
  }
  if (name === 'claim') {
    if (!canManageTickets(interaction.member, config)) return interaction.reply({ content: 'Only MM / Staff.', ephemeral: true });
    return interaction.reply({ content: `${interaction.user} claimed this ticket.` });
  }
  if (name === 'close') {
    if (!canManageTickets(interaction.member, config)) return interaction.reply({ content: 'Only MM / Staff.', ephemeral: true });
    const reason = interaction.options.getString('reason') || 'No reason';
    await interaction.reply({ content: `Closing in 5s. Reason: ${reason}` });
    setTimeout(() => interaction.channel.delete().catch(() => null), 5000);
    return;
  }
  if (name === 'vouch') {
    const user = interaction.options.getUser('user');
    const message = interaction.options.getString('message');
    const rating = interaction.options.getInteger('rating');
    const embed = new EmbedBuilder().setTitle('New Vouch').setColor('#57F287');
    embed.setThumbnail(user.displayAvatarURL({ size: 128 }));
    embed.setTimestamp();
    let desc = `**From:** ${interaction.user}\n**To:** ${user}\n**Channel:** ${interaction.channel}\n\n${message}`;
    if (rating) desc += `\n\nRating: ${'⭐'.repeat(rating)} (${rating}/5)`;
    embed.setDescription(desc);
    await interaction.reply({ embeds: [embed] });
    return;
  }
  if (name === 'rep') {
    const user = interaction.options.getUser('user');
    const stars = interaction.options.getInteger('stars');
    const message = interaction.options.getString('message');

    if (user.id === interaction.user.id) {
      return interaction.reply({ content: 'You cannot give reputation to yourself.', ephemeral: true });
    }
    if (user.bot) {
      return interaction.reply({ content: 'You cannot give reputation to a bot.', ephemeral: true });
    }

    const summary = giveReputation({
      guildId: interaction.guildId,
      recipientId: user.id,
      giverId: interaction.user.id,
      stars,
      message,
    });
    const embed = reputationEmbed(user, summary, summary.updated ? 'Reputation Updated' : 'New Reputation');
    embed.addFields(
      { name: 'From', value: `${interaction.user}`, inline: true },
      { name: 'Rating', value: `${'⭐'.repeat(stars)} (${stars}/5)`, inline: true },
    );
    if (message) embed.addFields({ name: 'Feedback', value: message });
    embed.setFooter({ text: summary.updated ? 'Your previous rep for this user was updated.' : 'Thanks for leaving a rep!' });

    await interaction.reply({ embeds: [embed] });
    return;
  }
  if (name === 'reps') {
    const user = interaction.options.getUser('user') || interaction.user;
    const summary = getReputation(interaction.guildId, user.id);
    return interaction.reply({ embeds: [reputationEmbed(user, summary)] });
  }
  if (name === 'setup' && interaction.options.getSubcommand() === 'automm') {
    const embed = new EmbedBuilder()
      .setTitle('Automatic Crypto Middleman')
      .setColor('#5865F2')
      .setDescription(
        'Trade crypto safely through a private guided middleman ticket.\n\n' +
        '**How it works**\n' +
        '1. Click the button below and enter the other trader’s Discord user ID.\n' +
        '2. Choose Buyer and Seller, then both users confirm.\n' +
        '3. Buyer enters the amount and Seller confirms it.\n' +
        '4. Buyer receives the escrow payment instructions.\n\n' +
        'Never send funds outside the private ticket instructions.'
      )
      .setFooter({ text: config.branding?.serverName || 'Crypto Middleman' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('crypto_open_ticket').setLabel('Open Auto Middleman').setStyle(ButtonStyle.Success).setEmoji('🔐'),
    );
    await interaction.channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '✅ Auto middleman panel posted in this channel.', ephemeral: true });
  }
  if (name === 'setup' && interaction.options.getSubcommand() === 'invites') {
    await interaction.channel.send({
      content: '@everyone',
      embeds: [inviteRewardsEmbed(config)],
      allowedMentions: { parse: ['everyone'] },
    });
    return interaction.reply({ content: '✅ Invite rewards panel posted in this channel.', ephemeral: true });
  }
  if (name === 'crypto-setup') {
    const asset = interaction.options.getString('asset').trim();
    const network = interaction.options.getString('network').trim();
    const escrowAddresses = [...new Set(interaction.options.getString('address').split(',').map(value => value.trim()).filter(Boolean))];
    if (!escrowAddresses.length) return interaction.reply({ content: 'Enter at least one real escrow receiving address.', ephemeral: true });
    config.crypto = { asset, network, escrowAddress: escrowAddresses[0], escrowAddresses, amountCurrency: 'USD' };
    saveConfig(config);
    return interaction.reply({
      content: `✅ Crypto escrow configured.\nAsset: **${asset}**\nNetwork: **${network}**\nVerified receiving addresses: **${escrowAddresses.length}**`,
      ephemeral: true,
    });
  }
  if (name === 'confirm') {
    if (!canManageTickets(interaction.member, config)) {
      return interaction.reply({ content: 'Only an administrator, MM, or Staff member can confirm payments.', ephemeral: true });
    }
    const ticketReference = interaction.options.getString('ticket');
    await interaction.deferReply({ ephemeral: true });
    try {
      const { channel } = await scheduleCryptoConfirmation(interaction.guild, ticketReference, interaction.user, interaction.client);
      return interaction.editReply({ content: `⏳ Payment confirmation is pending for ${channel}.` });
    } catch (error) {
      return interaction.editReply({ content: `Could not confirm payment: ${error.message}` });
    }
  }
  if (name === 'setup-all') {
    await interaction.deferReply({ ephemeral: true });
    const out = [];
    const jobs = [
      ['rulesChannelId', marketplaceRulesEmbed(config)],
      ['mmTosChannelId', mmTosEmbed(config)],
      ['boosterChannelId', boosterRewardsEmbed(config)],
    ];
    for (const pair of jobs) {
      const key = pair[0];
      const embed = pair[1];
      const id = config.channels[key];
      if (!isConfigured(id)) { out.push(`${key}: skipped`); continue; }
      try {
        const ch = await interaction.guild.channels.fetch(id);
        await ch.send({ embeds: [embed] });
        out.push(`${key}: posted in #${ch.name}`);
      } catch (e) { out.push(`${key}: FAILED ${e.message}`); }
    }
    if (isConfigured(config.channels.mmPanelChannelId)) {
      try {
        const ch = await interaction.guild.channels.fetch(config.channels.mmPanelChannelId);
        const { embed, row } = mmPanelEmbed(config);
        await ch.send({ embeds: [embed], components: [row] });
        out.push(`mmPanelChannelId: posted in #${ch.name}`);
      } catch (e) { out.push(`mmPanelChannelId: FAILED ${e.message}`); }
    } else out.push('mmPanelChannelId: skipped');
    return interaction.editReply({ content: out.join('\n') });
  }
}

module.exports = { handleSlash };
