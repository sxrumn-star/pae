const fs = require('node:fs');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { appRoot } = require('./runtime');
const { isConfigured } = require('./tickets');

const dataDir = path.join(appRoot, 'data');
const dataPath = path.join(dataDir, 'crypto-sessions.json');
const pendingConfirmationTimers = new Map();

function readSessions() {
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[crypto] Could not read sessions:', error);
    return {};
  }
}

function writeSessions(sessions) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporaryPath = `${dataPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(sessions, null, 2), 'utf8');
  fs.renameSync(temporaryPath, dataPath);
}

function getSession(channelId) {
  return readSessions()[channelId] || null;
}

function updateSession(channelId, update) {
  const sessions = readSessions();
  const current = sessions[channelId];
  if (!current) return null;
  sessions[channelId] = typeof update === 'function' ? update(current) : { ...current, ...update };
  sessions[channelId].updatedAt = new Date().toISOString();
  writeSessions(sessions);
  return sessions[channelId];
}

function isParticipant(session, userId) {
  return session.openerId === userId || session.counterpartyId === userId;
}

function participantRole(session, userId) {
  return session.roles[userId] || null;
}

function userForRole(session, role) {
  return Object.keys(session.roles).find(id => session.roles[id] === role) || null;
}

function canManage(member, config) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return (isConfigured(config.roles.mmRoleId) && member.roles.cache.has(config.roles.mmRoleId)) ||
    (isConfigured(config.roles.staffRoleId) && member.roles.cache.has(config.roles.staffRoleId));
}

function releaseMoneyButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crypto_release_money').setLabel('Release Money').setStyle(ButtonStyle.Success).setEmoji('💸'),
    new ButtonBuilder().setCustomId('crypto_request_funded_cancel').setLabel('Request Mutual Cancel').setStyle(ButtonStyle.Danger).setEmoji('🤝'),
  );
}

function mutualCancelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crypto_confirm_funded_cancel').setLabel('Confirm Cancellation').setStyle(ButtonStyle.Danger).setEmoji('✅'),
  );
}

function payoutAddressButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crypto_enter_payout_address').setLabel('Enter Litecoin Address').setStyle(ButtonStyle.Primary).setEmoji('📝'),
  );
}

function payoutConfirmationButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crypto_payout_yes').setLabel('Yes, This Is Correct').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId('crypto_payout_change').setLabel('Change Address').setStyle(ButtonStyle.Secondary).setEmoji('✏️'),
  );
}

function bech32Polymod(values) {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < 5; index += 1) {
      if ((top >>> index) & 1) checksum ^= generators[index];
    }
  }
  return checksum >>> 0;
}

function isValidLitecoinAddress(address) {
  if (typeof address !== 'string' || address.length < 14 || address.length > 90) return false;
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) return false;
  const normalized = address.toLowerCase();
  const separator = normalized.lastIndexOf('1');
  if (separator !== 3 || normalized.slice(0, separator) !== 'ltc' || normalized.length - separator - 1 < 6) return false;
  const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const data = [];
  for (const character of normalized.slice(separator + 1)) {
    const value = charset.indexOf(character);
    if (value === -1) return false;
    data.push(value);
  }
  const hrp = normalized.slice(0, separator);
  const expanded = [...hrp].map(character => character.charCodeAt(0) >>> 5)
    .concat([0], [...hrp].map(character => character.charCodeAt(0) & 31), data);
  const checksum = bech32Polymod(expanded);
  return checksum === 1 || checksum === 0x2bc830a3;
}

async function findCryptoTicket(guild, reference) {
  const value = String(reference).trim();
  const mentionMatch = value.match(/^<#(\d{15,25})>$/);
  if (mentionMatch) return guild.channels.fetch(mentionMatch[1]).catch(() => null);
  if (/^\d{15,25}$/.test(value)) return guild.channels.fetch(value).catch(() => null);
  const ticketNumber = value.replace(/^crypto-mm-/i, '');
  if (!/^\d{4}$/.test(ticketNumber)) return null;
  const channels = await guild.channels.fetch();
  return channels.find(channel => channel && channel.name === `crypto-mm-${ticketNumber}`) || null;
}

async function confirmCryptoPayment(guild, ticketReference, confirmedBy) {
  const channel = await findCryptoTicket(guild, ticketReference);
  if (!channel) throw new Error(`Crypto ticket ${ticketReference} was not found.`);
  const session = getSession(channel.id);
  if (!session) throw new Error(`No AutoMM session data was found for ${channel}.`);
  if (session.phase === 'funded') throw new Error(`${channel} was already confirmed as funded.`);
  if (session.phase === 'released') throw new Error(`${channel} was already marked as released.`);
  if (session.phase === 'cancelled') throw new Error(`${channel} was cancelled.`);
  const existingBuyerId = userForRole(session, 'buyer');
  const existingSellerId = userForRole(session, 'seller');
  if (!existingBuyerId || !existingSellerId) throw new Error(`${channel} does not have confirmed Buyer and Seller roles yet.`);
  const next = updateSession(channel.id, { phase: 'funded', receivedBy: confirmedBy.id });
  const buyerId = userForRole(next, 'buyer');
  const sellerId = userForRole(next, 'seller');
  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle('Payment Confirmed — Release the Item')
      .setColor('#57F287')
      .setDescription(
        '✅ **Payment confirmed.**\n\n' +
        `<@${sellerId}>, release the agreed item/service to the buyer <@${buyerId}> now.\n\n` +
        'After the buyer receives the item, MM/Staff can click **Release Money** below.'
      )
      .setFooter({ text: 'The button records the release in Discord; it does not send a blockchain transaction.' })
      .setTimestamp()],
    components: [releaseMoneyButtons()],
  });
  return { channel, session: next };
}

function armPendingConfirmation(client, channelId, dueAt) {
  if (pendingConfirmationTimers.has(channelId)) clearTimeout(pendingConfirmationTimers.get(channelId));
  const delay = Math.max(1000, Number(dueAt) - Date.now());
  const timer = setTimeout(async () => {
    pendingConfirmationTimers.delete(channelId);
    const session = getSession(channelId);
    if (!session || session.phase !== 'confirmation_pending') return;
    try {
      const guild = await client.guilds.fetch(session.guildId);
      await confirmCryptoPayment(guild, channelId, client.user);
    } catch (error) {
      console.error(`[crypto confirm] ${channelId}:`, error.message);
      updateSession(channelId, { confirmationError: error.message });
    }
  }, delay);
  timer.unref?.();
  pendingConfirmationTimers.set(channelId, timer);
}

async function scheduleCryptoConfirmation(guild, ticketReference, requestedBy, client) {
  const channel = await findCryptoTicket(guild, ticketReference);
  if (!channel) throw new Error(`Crypto ticket ${ticketReference} was not found.`);
  const session = getSession(channel.id);
  if (!session) throw new Error(`No AutoMM session data was found for ${channel}.`);
  if (session.phase === 'confirmation_pending') throw new Error(`${channel} already has a pending confirmation.`);
  if (session.phase === 'funded') throw new Error(`${channel} was already confirmed as funded.`);
  if (session.phase === 'released') throw new Error(`${channel} was already marked as released.`);
  if (session.phase === 'cancelled') throw new Error(`${channel} was cancelled.`);
  const buyerId = userForRole(session, 'buyer');
  const sellerId = userForRole(session, 'seller');
  if (!buyerId || !sellerId) throw new Error(`${channel} does not have confirmed Buyer and Seller roles yet.`);

  const delayMs = randomInt(60000, 180001);
  const confirmationDueAt = Date.now() + delayMs;
  updateSession(channel.id, {
    phase: 'confirmation_pending',
    confirmationDueAt,
    confirmationRequestedBy: requestedBy.id,
    confirmationError: null,
  });
  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle('⏳ Payment Confirmation Pending')
      .setColor('#FEE75C')
      .setDescription('The payment confirmation is being processed.')
      .addFields(
        { name: 'Buyer', value: `<@${buyerId}>`, inline: true },
        { name: 'Seller', value: `<@${sellerId}>`, inline: true },
        { name: 'Trade value', value: `**$${session.amount || '—'} USD**`, inline: true },
      )
      .setFooter({ text: 'No action is needed while confirmation is pending.' })
      .setTimestamp()],
  });
  armPendingConfirmation(client, channel.id, confirmationDueAt);
  return { channel, delayMs, confirmationDueAt };
}

function resumePendingConfirmations(client) {
  const sessions = readSessions();
  let resumed = 0;
  for (const session of Object.values(sessions)) {
    if (session.phase !== 'confirmation_pending' || !session.confirmationDueAt) continue;
    armPendingConfirmation(client, session.channelId, session.confirmationDueAt);
    resumed += 1;
  }
  if (resumed) console.log(`[crypto confirm] resumed ${resumed} pending confirmation(s).`);
  return resumed;
}

function incomingTransactions(payload) {
  const refs = [...(payload.txrefs || []), ...(payload.unconfirmed_txrefs || [])];
  const byHash = new Map();
  for (const ref of refs) {
    if (ref.tx_input_n !== -1 || !ref.tx_hash) continue;
    const current = byHash.get(ref.tx_hash) || { hash: ref.tx_hash, value: 0, confirmations: 0 };
    current.value += Number(ref.value || 0);
    current.confirmations = Math.max(current.confirmations, Number(ref.confirmations || 0));
    byHash.set(ref.tx_hash, current);
  }
  return [...byHash.values()];
}

async function fetchLitecoinTransactions(address) {
  const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${encodeURIComponent(address)}?limit=50`;
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Litecoin API returned HTTP ${response.status}`);
  return incomingTransactions(await response.json());
}

async function startCryptoWatcher(client) {
  let checking = false;
  const check = async () => {
    if (checking) return;
    checking = true;
    try {
      const sessions = readSessions();
      const waiting = Object.values(sessions).filter(session => session.phase === 'awaiting_payment' && session.depositAddress);
      for (const session of waiting) {
        try {
          const transactions = await fetchLitecoinTransactions(session.depositAddress);
          const seen = new Set(session.seenTxHashes || []);
          const detected = transactions.find(transaction => !seen.has(transaction.hash));
          if (!detected) continue;
          const next = updateSession(session.channelId, {
            phase: 'payment_detected',
            detectedTxHash: detected.hash,
            detectedLtc: detected.value / 100000000,
            detectedConfirmations: detected.confirmations,
          });
          const channel = await client.channels.fetch(session.channelId).catch(() => null);
          if (!channel || !channel.isTextBased()) continue;
          const buyerId = userForRole(next, 'buyer');
          await channel.send({
            content: `<@${buyerId}>`,
            embeds: [new EmbedBuilder()
              .setTitle('Incoming Litecoin Payment Detected')
              .setColor('#FEE75C')
              .setDescription(
                `The bot detected **${(detected.value / 100000000).toFixed(8)} LTC** sent to the ticket wallet.\n\n` +
                `**Transaction**\n\`${detected.hash}\`\n` +
                `**Confirmations:** ${detected.confirmations}\n\n` +
                'MM/Staff should verify the amount and transaction on-chain, then use `/confirm` from any channel.'
              )
              .setTimestamp()],
          });
        } catch (error) {
          console.error(`[crypto watcher] ${session.channelId}:`, error.message);
        }
      }
    } finally {
      checking = false;
    }
  };
  await check();
  const timer = setInterval(check, 30000);
  timer.unref?.();
  console.log('[crypto watcher] checking Litecoin payments every 30 seconds.');
  return timer;
}

function roleButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crypto_role_buyer').setLabel('I am the Buyer').setStyle(ButtonStyle.Primary).setEmoji('🛒'),
    new ButtonBuilder().setCustomId('crypto_role_seller').setLabel('I am the Seller').setStyle(ButtonStyle.Secondary).setEmoji('💼'),
    new ButtonBuilder().setCustomId('crypto_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
  );
}

function agreementButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crypto_agree_roles').setLabel('Agree to Roles').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId('crypto_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
  );
}

function initialAmountButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crypto_confirm_amount').setLabel('Accept Amount').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId('crypto_update_amount').setLabel('Update Amount').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('crypto_cancel').setLabel('Cancel Trade').setStyle(ButtonStyle.Danger),
  );
}

function updatedAmountButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('crypto_accept_updated_amount').setLabel('Accept New Amount').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId('crypto_update_amount').setLabel('Update Again').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId('crypto_cancel').setLabel('Cancel Trade').setStyle(ButtonStyle.Danger),
  );
}

async function preparePayment(channelId, config) {
  const session = getSession(channelId);
  const crypto = config.crypto || {};
  const addresses = Array.isArray(crypto.escrowAddresses) && crypto.escrowAddresses.length
    ? crypto.escrowAddresses.filter(isConfigured)
    : (isConfigured(crypto.escrowAddress) ? [crypto.escrowAddress] : []);
  if (!isConfigured(crypto.asset) || !isConfigured(crypto.network) || !addresses.length) {
    throw new Error('No real escrow wallet is configured. Ask an admin to add a verified receiving address.');
  }
  const allSessions = Object.values(readSessions());
  const reservedAddresses = new Set(allSessions
    .filter(item => item.channelId !== channelId && item.phase === 'awaiting_payment')
    .map(item => item.depositAddress));
  const availableAddresses = addresses.filter(address => !reservedAddresses.has(address));
  if (!availableAddresses.length) {
    throw new Error('All escrow addresses are assigned to another pending payment. Finish that ticket or add another real address.');
  }
  const depositAddress = availableAddresses[randomInt(availableAddresses.length)];
  const baseline = await fetchLitecoinTransactions(depositAddress);
  const next = updateSession(channelId, {
    phase: 'awaiting_payment',
    depositAddress,
    seenTxHashes: baseline.map(transaction => transaction.hash),
    watchStartedAt: new Date().toISOString(),
  });
  const buyerId = userForRole(next, 'buyer');
  return {
    content: `<@${buyerId}>`,
    embeds: [new EmbedBuilder()
      .setTitle('🔐 Step 4 of 4 — Send Litecoin')
      .setColor('#FEE75C')
      .setDescription('Send the payment exactly as shown below. The bot is already watching the wallet—no payment button is needed.')
      .addFields(
        { name: 'Trade value', value: `**$${next.amount} USD worth of ${crypto.asset}**`, inline: true },
        { name: 'Network', value: `**${crypto.network}**`, inline: true },
        { name: 'Escrow address', value: `\`${next.depositAddress}\`` },
      )
      .setFooter({ text: 'Only use the Litecoin network. A wrong network or address can permanently lose funds.' })
      .setTimestamp()],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('crypto_cancel').setLabel('Cancel Before Payment').setStyle(ButtonStyle.Danger),
    )],
  };
}

async function createCryptoTicket(guild, opener, counterparty, config) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: opener.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: counterparty.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  if (isConfigured(config.roles.mmRoleId)) {
    overwrites.push({ id: config.roles.mmRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
  }
  if (isConfigured(config.roles.staffRoleId)) {
    overwrites.push({ id: config.roles.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  }

  const channel = await guild.channels.create({
    name: `crypto-mm-${Math.floor(Math.random() * 9000) + 1000}`,
    type: ChannelType.GuildText,
    parent: isConfigured(config.channels.mmTicketCategoryId) ? config.channels.mmTicketCategoryId : null,
    permissionOverwrites: overwrites,
    topic: `Crypto MM | opener=${opener.id} | counterparty=${counterparty.id}`,
  });

  const sessions = readSessions();
  sessions[channel.id] = {
    guildId: guild.id,
    channelId: channel.id,
    openerId: opener.id,
    counterpartyId: counterparty.id,
    roles: {},
    confirmations: [],
    phase: 'selecting_roles',
    createdAt: new Date().toISOString(),
  };
  writeSessions(sessions);

  const embed = new EmbedBuilder()
    .setTitle('🔐 Auto Middleman • Step 1 of 4')
    .setColor('#5865F2')
    .setDescription(
      'Welcome to your private crypto middleman ticket. Start by choosing who is buying and who is selling.'
    )
    .addFields(
      { name: 'Trader One', value: `${opener}`, inline: true },
      { name: 'Trader Two', value: `${counterparty}`, inline: true },
      { name: 'Buyer', value: 'Sends Litecoin to the escrow wallet after the price is accepted.' },
      { name: 'Seller', value: 'Releases the item/service after staff confirms payment.' },
    )
    .setFooter({ text: 'Do not send any funds until Step 4 shows the payment address.' });
  await channel.send({ content: `${opener} ${counterparty}`, embeds: [embed], components: [roleButtons()] });
  return channel;
}

async function handleCryptoButton(interaction, config) {
  if (interaction.customId === 'crypto_open_ticket') {
    const modal = new ModalBuilder().setCustomId('crypto_start_modal').setTitle('Open Crypto Middleman');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('counterparty')
        .setLabel('Other trader Discord user ID')
        .setPlaceholder('Example: 123456789012345678')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(15)
        .setMaxLength(25),
    ));
    return interaction.showModal(modal);
  }

  const session = getSession(interaction.channelId);
  if (!session) return interaction.reply({ content: 'This crypto session was not found.', ephemeral: true });

  if (interaction.customId === 'crypto_cancel') {
    if (!isParticipant(session, interaction.user.id) && !canManage(interaction.member, config)) {
      return interaction.reply({ content: 'Only a trader or staff member can cancel this session.', ephemeral: true });
    }
    if (['payment_detected', 'awaiting_staff_confirmation', 'confirmation_pending', 'funded', 'mutual_cancel_pending', 'awaiting_payout_address', 'confirming_payout_address', 'released'].includes(session.phase)) {
      return interaction.reply({ content: 'This ticket cannot be cancelled normally after payment was submitted. After payment is confirmed, the buyer can use **Request Mutual Cancel**, and both traders must approve it.', ephemeral: true });
    }
    updateSession(interaction.channelId, { phase: 'cancelled', cancelledBy: interaction.user.id });
    await interaction.reply({ content: `❌ Session cancelled by ${interaction.user}. This ticket will be deleted in 5 seconds.` });
    setTimeout(() => interaction.channel.delete().catch(() => null), 5000);
    return;
  }

  if (!isParticipant(session, interaction.user.id) && !['crypto_staff_received', 'crypto_release_money'].includes(interaction.customId)) {
    return interaction.reply({ content: 'Only the two traders can use this button.', ephemeral: true });
  }

  if (interaction.customId === 'crypto_role_buyer' || interaction.customId === 'crypto_role_seller') {
    if (session.phase !== 'selecting_roles') return interaction.reply({ content: 'Role selection is already finished.', ephemeral: true });
    const role = interaction.customId.endsWith('buyer') ? 'buyer' : 'seller';
    const otherId = session.openerId === interaction.user.id ? session.counterpartyId : session.openerId;
    if (session.roles[otherId] === role) return interaction.reply({ content: `The other trader already selected ${role}. Choose the other role.`, ephemeral: true });
    const next = updateSession(interaction.channelId, current => {
      current.roles[interaction.user.id] = role;
      return current;
    });
    await interaction.reply({ content: `${role === 'buyer' ? '🛒' : '💼'} ${interaction.user} selected **${role.toUpperCase()}**.` });
    if (Object.keys(next.roles).length === 2) {
      const buyerId = userForRole(next, 'buyer');
      const sellerId = userForRole(next, 'seller');
      updateSession(interaction.channelId, { phase: 'confirming_roles', confirmations: [] });
      await interaction.channel.send({
        embeds: [new EmbedBuilder()
          .setTitle('🤝 Step 2 of 4 — Confirm Roles')
          .setColor('#FEE75C')
          .setDescription('Review the roles carefully. Both traders must accept before the price can be entered.')
          .addFields(
            { name: '🛒 Buyer', value: `<@${buyerId}>`, inline: true },
            { name: '💼 Seller', value: `<@${sellerId}>`, inline: true },
          )
          .setFooter({ text: 'If these roles are wrong, cancel and open a new ticket.' })],
        components: [agreementButtons()],
      });
    }
    return;
  }

  if (interaction.customId === 'crypto_agree_roles') {
    if (session.phase !== 'confirming_roles') return interaction.reply({ content: 'The session is not waiting for role confirmation.', ephemeral: true });
    if (session.confirmations.includes(interaction.user.id)) return interaction.reply({ content: 'You already agreed.', ephemeral: true });
    const next = updateSession(interaction.channelId, current => {
      current.confirmations.push(interaction.user.id);
      return current;
    });
    await interaction.reply({ content: `✅ ${interaction.user} accepted the Buyer/Seller roles (**${next.confirmations.length}/2**).` });
    if (next.confirmations.length === 2) {
      const buyerId = userForRole(next, 'buyer');
      updateSession(interaction.channelId, { phase: 'awaiting_amount' });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('crypto_enter_amount').setLabel('Enter Purchase Amount').setStyle(ButtonStyle.Primary).setEmoji('💰'),
        new ButtonBuilder().setCustomId('crypto_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
      );
      await interaction.channel.send({
        content: `<@${buyerId}>`,
        embeds: [new EmbedBuilder()
          .setTitle('💵 Step 3 of 4 — Set the Trade Amount')
          .setColor('#5865F2')
          .setDescription('Buyer, enter the agreed USD price. The seller can accept it or propose a different amount.')],
        components: [row],
      });
    }
    return;
  }

  if (interaction.customId === 'crypto_enter_amount') {
    if (session.phase !== 'awaiting_amount') return interaction.reply({ content: 'The session is not waiting for an amount.', ephemeral: true });
    if (participantRole(session, interaction.user.id) !== 'buyer') return interaction.reply({ content: 'Only the buyer can enter the amount.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('crypto_amount_modal').setTitle('Enter Crypto Amount');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('amount').setLabel('Trade amount in USD').setPlaceholder('Example: 50').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40),
    ));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'crypto_confirm_amount') {
    if (session.phase !== 'confirming_amount') return interaction.reply({ content: 'The session is not waiting for amount confirmation.', ephemeral: true });
    if (participantRole(session, interaction.user.id) !== 'seller') return interaction.reply({ content: 'Only the seller can confirm the amount.', ephemeral: true });
    await interaction.deferReply();
    try {
      const payload = await preparePayment(interaction.channelId, config);
      return interaction.editReply(payload);
    } catch (error) {
      return interaction.editReply({ content: `Could not start payment: ${error.message}` });
    }
  }

  if (interaction.customId === 'crypto_update_amount') {
    if (!['confirming_amount', 'confirming_updated_amount'].includes(session.phase)) {
      return interaction.reply({ content: 'The price can no longer be changed at this stage.', ephemeral: true });
    }
    if (participantRole(session, interaction.user.id) !== 'seller') {
      return interaction.reply({ content: 'Only the seller can propose a new amount.', ephemeral: true });
    }
    const modal = new ModalBuilder().setCustomId('crypto_update_amount_modal').setTitle('Update Trade Amount');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('New trade amount in USD')
        .setPlaceholder(`Current amount: $${session.amount} USD`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(40),
    ));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'crypto_accept_updated_amount') {
    if (session.phase !== 'confirming_updated_amount') {
      return interaction.reply({ content: 'There is no updated amount waiting for approval.', ephemeral: true });
    }
    if (session.amountConfirmations?.includes(interaction.user.id)) {
      return interaction.reply({ content: 'You already accepted this amount.', ephemeral: true });
    }
    const next = updateSession(interaction.channelId, current => {
      current.amountConfirmations ||= [];
      current.amountConfirmations.push(interaction.user.id);
      return current;
    });
    if (next.amountConfirmations.length < 2) {
      return interaction.reply({ content: `✅ ${interaction.user} accepted **$${next.amount} USD** (**1/2**). Waiting for the other trader.` });
    }
    await interaction.deferReply();
    try {
      const payload = await preparePayment(interaction.channelId, config);
      await interaction.editReply({ content: `✅ Both traders accepted the new amount: **$${next.amount} USD**.` });
      return interaction.channel.send(payload);
    } catch (error) {
      updateSession(interaction.channelId, { amountConfirmations: [] });
      return interaction.editReply({ content: `Both traders accepted, but payment could not start: ${error.message}` });
    }
  }

  if (interaction.customId === 'crypto_payment_sent') {
    return interaction.reply({ content: 'Automatic Litecoin detection is enabled. You do not need to submit a transaction hash.', ephemeral: true });
  }

  if (interaction.customId === 'crypto_staff_received') {
    if (!canManage(interaction.member, config)) return interaction.reply({ content: 'Only MM / Staff can confirm escrow receipt.', ephemeral: true });
    if (session.phase !== 'awaiting_staff_confirmation') return interaction.reply({ content: 'No submitted payment is waiting for staff confirmation.', ephemeral: true });
    const next = updateSession(interaction.channelId, { phase: 'funded', receivedBy: interaction.user.id });
    const sellerId = userForRole(next, 'seller');
    const buyerId = userForRole(next, 'buyer');
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('Payment Confirmed — Release the Item')
        .setColor('#57F287')
        .setDescription(`✅ **Payment confirmed.**\n\n<@${sellerId}>, release the agreed item/service to the buyer <@${buyerId}> now.\n\nAfter the buyer receives the item, MM/Staff can click **Release Money** below.`)
        .setFooter({ text: 'The button records the release in Discord; it does not send a blockchain transaction.' })],
      components: [releaseMoneyButtons()],
    });
  }

  if (interaction.customId === 'crypto_request_funded_cancel') {
    if (session.phase !== 'funded') {
      return interaction.reply({ content: 'A mutual cancellation can only be requested after payment is confirmed and before payout starts.', ephemeral: true });
    }
    if (participantRole(session, interaction.user.id) !== 'buyer') {
      return interaction.reply({ content: 'Only the buyer—the person who sent the payment—can request a cancellation after payment is confirmed.', ephemeral: true });
    }
    const buyerId = userForRole(session, 'buyer');
    const sellerId = userForRole(session, 'seller');
    updateSession(interaction.channelId, {
      phase: 'mutual_cancel_pending',
      cancelRequestedBy: interaction.user.id,
      cancellationConfirmations: [interaction.user.id],
    });
    return interaction.reply({
      content: `<@${buyerId}> <@${sellerId}>`,
      embeds: [new EmbedBuilder()
        .setTitle('🤝 Mutual Cancellation Requested')
        .setColor('#FEE75C')
        .setDescription(
          `<@${buyerId}> requested to cancel this trade after payment confirmation.\n\n` +
          `**Buyer:** ✅ Confirmed\n**Seller:** ⏳ Waiting\n\n` +
          `The ticket will only be cancelled when both traders confirm.`
        )
        .setFooter({ text: 'Release Money is paused while this cancellation request is pending.' })],
      components: [mutualCancelButtons()],
    });
  }

  if (interaction.customId === 'crypto_confirm_funded_cancel') {
    if (session.phase !== 'mutual_cancel_pending') {
      return interaction.reply({ content: 'There is no mutual cancellation request waiting for approval.', ephemeral: true });
    }
    if (session.cancellationConfirmations?.includes(interaction.user.id)) {
      return interaction.reply({ content: 'You already confirmed this cancellation.', ephemeral: true });
    }
    const next = updateSession(interaction.channelId, current => {
      current.cancellationConfirmations ||= [];
      current.cancellationConfirmations.push(interaction.user.id);
      return current;
    });
    if (next.cancellationConfirmations.length < 2) {
      return interaction.reply({ content: `✅ ${interaction.user} confirmed the cancellation (**1/2**). Waiting for the other trader.` });
    }
    updateSession(interaction.channelId, {
      phase: 'cancelled',
      cancelledByMutualAgreement: true,
      cancelledAt: new Date().toISOString(),
    });
    await interaction.reply({
      content: '❌ **Trade cancelled by mutual agreement.** Both traders confirmed. This ticket will be deleted in 10 seconds.',
      components: [],
    });
    const closeTimer = setTimeout(() => interaction.channel.delete().catch(() => null), 10000);
    closeTimer.unref?.();
    return;
  }

  if (interaction.customId === 'crypto_release_money') {
    if (!canManage(interaction.member, config)) {
      return interaction.reply({ content: 'Only an administrator, MM, or Staff member can release the payment.', ephemeral: true });
    }
    if (session.phase === 'released') {
      return interaction.reply({ content: 'This payment was already marked as released.', ephemeral: true });
    }
    if (session.phase !== 'funded') {
      return interaction.reply({ content: 'Payment must be confirmed before it can be marked as released.', ephemeral: true });
    }
    const buyerId = userForRole(session, 'buyer');
    const sellerId = userForRole(session, 'seller');
    try {
      await interaction.channel.permissionOverwrites.edit(buyerId, { SendMessages: false });
    } catch (error) {
      return interaction.reply({ content: `Could not lock the buyer from this ticket: ${error.message}`, ephemeral: true });
    }
    updateSession(interaction.channelId, {
      phase: 'awaiting_payout_address',
      releaseRequestedBy: interaction.user.id,
      buyerLockedAt: new Date().toISOString(),
    });
    return interaction.reply({
      content: `<@${sellerId}>`,
      embeds: [new EmbedBuilder()
        .setTitle('💸 Enter Your Litecoin Payout Address')
        .setColor('#5865F2')
        .setDescription(
          `Payment release is ready for **$${session.amount} USD**.\n\n` +
          'Seller, click below and enter the Litecoin address where you want the payment recorded as sent.'
        )
        .setFooter({ text: 'The buyer is now locked from sending messages in this ticket.' })],
      components: [payoutAddressButton()],
    });
  }

  if (interaction.customId === 'crypto_enter_payout_address' || interaction.customId === 'crypto_payout_change') {
    if (!['awaiting_payout_address', 'confirming_payout_address'].includes(session.phase)) {
      return interaction.reply({ content: 'This ticket is not waiting for a payout address.', ephemeral: true });
    }
    if (participantRole(session, interaction.user.id) !== 'seller') {
      return interaction.reply({ content: 'Only the seller can enter the payout address.', ephemeral: true });
    }
    const modal = new ModalBuilder().setCustomId('crypto_payout_address_modal').setTitle('Seller Litecoin Address');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('payoutAddress')
        .setLabel('Your Litecoin payout address')
        .setPlaceholder('ltc1...')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(14)
        .setMaxLength(90),
    ));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'crypto_payout_yes') {
    if (session.phase !== 'confirming_payout_address') {
      return interaction.reply({ content: 'No payout address is waiting for confirmation.', ephemeral: true });
    }
    if (participantRole(session, interaction.user.id) !== 'seller') {
      return interaction.reply({ content: 'Only the seller can confirm the payout address.', ephemeral: true });
    }
    const next = updateSession(interaction.channelId, {
      phase: 'released',
      payoutConfirmedBy: interaction.user.id,
      releasedAt: new Date().toISOString(),
      closeDueAt: Date.now() + 10000,
    });
    const sellerId = userForRole(next, 'seller');
    const buyerId = userForRole(next, 'buyer');
    await interaction.reply({
      content: `<@${sellerId}> <@${buyerId}>`,
      embeds: [new EmbedBuilder()
        .setTitle('✅ Payment Sent')
        .setColor('#57F287')
        .setDescription(
          `Payment has been marked as sent to <@${sellerId}>.\n\n` +
          `**Amount:** $${next.amount} USD\n` +
          `**Litecoin address:** \`${next.payoutAddress}\`\n\n` +
          '🔒 This ticket will close in **10 seconds**.'
        )
        .setFooter({ text: 'Discord status only — no Litecoin transaction was broadcast by this bot.' })
        .setTimestamp()],
    });
    const closeTimer = setTimeout(() => interaction.channel.delete().catch(() => null), 10000);
    closeTimer.unref?.();
    return;
  }
}

async function handleCryptoModal(interaction, config) {
  if (interaction.customId === 'crypto_start_modal') {
    const rawId = interaction.fields.getTextInputValue('counterparty').trim();
    const match = rawId.match(/^(?:<@!?)?(\d{15,25})>?$/);
    if (!match) return interaction.reply({ content: 'Enter a valid Discord user ID.', ephemeral: true });
    const counterpartyMember = await interaction.guild.members.fetch(match[1]).catch(() => null);
    if (!counterpartyMember) return interaction.reply({ content: 'That user is not in this Discord server.', ephemeral: true });
    const counterparty = counterpartyMember.user;
    if (counterparty.id === interaction.user.id) return interaction.reply({ content: 'Enter the other trader’s ID, not your own.', ephemeral: true });
    if (counterparty.bot) return interaction.reply({ content: 'A bot cannot be the other trader.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const channel = await createCryptoTicket(interaction.guild, interaction.user, counterparty, config);
    return interaction.editReply({ content: `Crypto middleman ticket created: ${channel}` });
  }

  const session = getSession(interaction.channelId);
  if (!session || !isParticipant(session, interaction.user.id)) return interaction.reply({ content: 'This crypto session was not found.', ephemeral: true });

  if (interaction.customId === 'crypto_amount_modal') {
    if (session.phase !== 'awaiting_amount' || participantRole(session, interaction.user.id) !== 'buyer') {
      return interaction.reply({ content: 'Only the buyer can submit the amount at this stage.', ephemeral: true });
    }
    const rawAmount = interaction.fields.getTextInputValue('amount').trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(rawAmount) || Number(rawAmount) <= 0) {
      return interaction.reply({ content: 'Enter a valid positive amount using numbers only.', ephemeral: true });
    }
    const next = updateSession(interaction.channelId, { phase: 'confirming_amount', amount: rawAmount, amountConfirmations: [] });
    const sellerId = userForRole(next, 'seller');
    return interaction.reply({
      content: `<@${sellerId}>`,
      embeds: [new EmbedBuilder()
        .setTitle('💵 Price Proposed by Buyer')
        .setColor('#FEE75C')
        .setDescription(`The buyer proposed **$${rawAmount} USD** for this trade.`)
        .addFields({ name: 'Seller action required', value: 'Accept this amount or click **Update Amount** to propose a new price.' })
        .setFooter({ text: 'Payment instructions are hidden until the price is agreed.' })],
      components: [initialAmountButtons()],
    });
  }

  if (interaction.customId === 'crypto_update_amount_modal') {
    if (!['confirming_amount', 'confirming_updated_amount'].includes(session.phase) || participantRole(session, interaction.user.id) !== 'seller') {
      return interaction.reply({ content: 'Only the seller can update the amount at this stage.', ephemeral: true });
    }
    const rawAmount = interaction.fields.getTextInputValue('amount').trim();
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(rawAmount) || Number(rawAmount) <= 0) {
      return interaction.reply({ content: 'Enter a valid positive USD amount using numbers only.', ephemeral: true });
    }
    if (rawAmount === session.amount) {
      return interaction.reply({ content: 'The new amount must be different from the current amount.', ephemeral: true });
    }
    const previousAmount = session.amount;
    const next = updateSession(interaction.channelId, {
      phase: 'confirming_updated_amount',
      previousAmount,
      amount: rawAmount,
      amountConfirmations: [],
      amountUpdatedBy: interaction.user.id,
    });
    const buyerId = userForRole(next, 'buyer');
    const sellerId = userForRole(next, 'seller');
    return interaction.reply({
      content: `<@${buyerId}> <@${sellerId}>`,
      embeds: [new EmbedBuilder()
        .setTitle('🔄 Seller Proposed a New Price')
        .setColor('#FEE75C')
        .setDescription('The price changed. Both traders must accept the new amount before payment can begin.')
        .addFields(
          { name: 'Previous amount', value: `$${previousAmount} USD`, inline: true },
          { name: 'New amount', value: `**$${rawAmount} USD**`, inline: true },
          { name: 'Approvals', value: 'Buyer: ⏳ Waiting\nSeller: ⏳ Waiting' },
        )
        .setFooter({ text: 'Either trader may cancel before payment. Only the seller can update the price again.' })],
      components: [updatedAmountButtons()],
    });
  }

  if (interaction.customId === 'crypto_payout_address_modal') {
    if (!['awaiting_payout_address', 'confirming_payout_address'].includes(session.phase) || participantRole(session, interaction.user.id) !== 'seller') {
      return interaction.reply({ content: 'Only the seller can enter a payout address at this stage.', ephemeral: true });
    }
    const payoutAddress = interaction.fields.getTextInputValue('payoutAddress').trim();
    if (!isValidLitecoinAddress(payoutAddress)) {
      return interaction.reply({ content: 'That is not a valid Litecoin Bech32 address. Check it carefully and try again.', ephemeral: true });
    }
    const next = updateSession(interaction.channelId, {
      phase: 'confirming_payout_address',
      payoutAddress: payoutAddress.toLowerCase(),
    });
    const sellerId = userForRole(next, 'seller');
    return interaction.reply({
      content: `<@${sellerId}>`,
      embeds: [new EmbedBuilder()
        .setTitle('⚠️ Confirm Your Litecoin Address')
        .setColor('#FEE75C')
        .setDescription(
          `Are you sure this is the correct payout address?\n\n` +
          `\`${next.payoutAddress}\`\n\n` +
          'Check every character before continuing.'
        )
        .setFooter({ text: 'After confirmation, the payment is marked sent and the ticket closes in 10 seconds.' })],
      components: [payoutConfirmationButtons()],
    });
  }

}

module.exports = { confirmCryptoPayment, createCryptoTicket, fetchLitecoinTransactions, getSession, handleCryptoButton, handleCryptoModal, incomingTransactions, isValidLitecoinAddress, resumePendingConfirmations, scheduleCryptoConfirmation, startCryptoWatcher };
