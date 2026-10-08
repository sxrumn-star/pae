const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function brand(config) {
  return config?.branding?.serverName || 'ICEMM';
}

function marketplaceRulesEmbed(config) {
  const embed = new EmbedBuilder()
    .setTitle(`:hearts: MARKETPLACE RULES | ${brand(config)}`)
    .setColor('#ff7ab8')
    .setDescription(
      `**Trade fairly. Keep it clean. Stay safe.**\n\n` +
      `:arrow_right: **01 - CHANNELS**\n` +
      `Keep trades in the correct marketplace channel.\n` +
      `VIP trades belong in the VIP marketplace.\n\n` +
      `:arrow_right: **02 - TRADING**\n` +
      `No scamming, stealing, or misleading other members.\n` +
      `Keep all offers clear and genuine.\n` +
      `Do not spam or repeatedly post the same trade.\n\n` +
      `:arrow_right: **03 - CONDUCT**\n` +
      `Treat other members with respect.\n` +
      `No flooding or unnecessary messages.\n` +
      `Keep trading fair and organized.\n\n` +
      `:arrow_right: **04 - ENFORCEMENT**\n` +
      `Rule violations may result in warnings, mutes, trade restrictions, or further action.\n` +
      `Staff may take action when necessary to keep the marketplace safe.\n\n` +
      `:hearts: **Trade fairly. Keep it clean. Stay safe.**`
    )
    .setFooter({ text: `Team ${brand(config)} - Marketplace Rules` })
    .setTimestamp();
  if (config?.branding?.bannerImage) embed.setImage(config.branding.bannerImage);
  return embed;
}

function mmTosEmbed(config) {
  const embed = new EmbedBuilder()
    .setTitle(`MM TOS | ${brand(config)}`)
    .setColor('#5865F2')
    .setDescription(
      `These terms apply to every middleman trade handled through **${brand(config)}**.\n\n` +
      `**01 - MM REQUESTS**\n` +
      `> All MM requests must be made through ticket\n` +
      `> Both traders must agree before requesting an MM\n` +
      `> Provide full trade details when opening the request\n` +
      `> Do not begin until the assigned MM confirms\n\n` +
      `**02 - DURING THE TRADE**\n` +
      `> Follow the assigned MM instructions\n` +
      `> Do not add, remove, or change items without informing the MM\n` +
      `> Both traders must confirm items before final exchange\n` +
      `> Report any changes to the MM before continuing\n\n` +
      `**03 - PAYMENTS & COLLATERAL**\n` +
      `> Any fees or collateral must be agreed upon before the trade starts\n` +
      `> Verify the assigned MM before sending items or payments\n` +
      `> Only the assigned MM should handle held items or payments\n\n` +
      `**04 - MM AUTHORITY**\n` +
      `> An MM may pause or cancel a trade if suspicious or unclear\n` +
      `> Do not pressure or rush the MM\n` +
      `> Cooperate with any verification requested by the MM\n\n` +
      `**05 - TRADE COMPLETION**\n` +
      `> Both traders must confirm completion before request is closed\n` +
      `> Submit trade proof in #mm-proofs (only visible to MMs) when required\n` +
      `> Leave genuine feedback in the ticket using vouch cmd\n\n` +
      `**06 - DISPUTES**\n` +
      `> Stop the trade immediately if an issue occurs\n` +
      `> Do not move or exchange items independently during a dispute\n` +
      `> Contact support and provide all relevant proof and trade details\n\n` +
      `By using **${brand(config)}** middleman service, you agree to follow these terms.`
    )
    .setFooter({ text: `${brand(config)} - Middleman TOS` })
    .setTimestamp();
  return embed;
}
function mmPanelEmbed(config) {
  const embed = new EmbedBuilder()
    .setTitle(`MIDDLEMAN SERVICE | ${brand(config)}`)
    .setColor('#57F287')
    .setDescription(
      `**HOW MM WORKS?**\n` +
      `> We hold the items. **Neither side can walk off with anything.**\n\n` +
      `**BEFORE YOU OPEN A TICKET**\n` +
      `> Both traders have **agreed** on the trade\n` +
      `> You know **exactly** what is being traded and its value\n` +
      `> Do **not** open a troll ticket\n\n` +
      `**HOW IT WORKS**\n` +
      `> **01** - You open a ticket\n` +
      `> **02** - MM joins and holds the items\n` +
      `> **03** - Both sides finish the trade\n` +
      `> **04** - MM releases the items to the correct person\n\n` +
      `**WARNING**\n` +
      `Fake tickets will get you **banned**.\n` +
      `Never trade with staff outside of a ticket.\n\n` +
      `OPEN A TICKET IF YOU NEED MM ASSISTANCE`
    )
    .setFooter({ text: `${brand(config)} - Click below to request a Middleman` })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('open_mm_ticket').setLabel('Request Middleman').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
    new ButtonBuilder().setCustomId('tos_hint').setLabel('Read MM TOS').setStyle(ButtonStyle.Secondary).setEmoji('📜')
  );
  return { embed, row };
}

function boosterRewardsEmbed(config) {
  const embed = new EmbedBuilder()
    .setTitle(`BOOSTER REWARDS`)
    .setColor('#f5a623')
    .setDescription(
      `**1. No MM fee**\n` +
      `**2. Higher priority** on tickets\n` +
      `**3.** Access to **exclusive giveaways**\n` +
      `**4. Free** account listing\n\n` +
      `BOOST THE SERVER TO UNLOCK THESE PERKS`
    )
    .setFooter({ text: `${brand(config)} - Thank you to all boosters` })
    .setTimestamp();
  if (config?.branding?.bannerImage) embed.setImage(config.branding.bannerImage);
  return embed;
}

function inviteRewardsEmbed(config) {
  return new EmbedBuilder()
    .setTitle('・LIFELONG INVITE EVENT')
    .setColor('#FFD700')
    .setDescription(
      `*Our permanent invite event is officially LIVE!*\n\n` +
      `**HOW IT WORKS**\n` +
      `-# Invite your friends using your custom invite link.\n` +
      `-# Invites are tracked automatically through **Invite Tracker**.\n` +
      `-# Only **vouched members** count — no alt accounts.\n` +
      `-# Rewards are **cumulative**, so keep inviting for bigger rewards.\n` +
      `-# New rewards will be added regularly.\n\n` +
      `**REWARDS**\n` +
      `-# **5 Invites** → Grama **OR** Sweet Set\n` +
      `-# **10 Invites** → Cerberus **OR** 2x Harvester\n` +
      `-# **20 Invites** → Duggy Bros **OR** Alienbeam\n` +
      `-# **40 Invites** → Dragon Cannelloni **OR** Crow **OR** Alien Set\n` +
      `-# **80 Invites** → LA Supreme **OR** FR Frost Dragon **OR** Everset\n` +
      `-# **160 Invites** → Griffin **OR** FR Shadow Dragon **OR** Trav Set\n` +
      `-# **300 Invites** → Meowl **OR** Gingerscope **OR** FR Bat Dragon\n\n` +
      `**IMPORTANT**\n` +
      `-# Rewards can be claimed starting in **2 weeks** while we restock the prize inventory.\n` +
      `-# This event is **permanent** and never ends.\n` +
      `-# Only valid invites from real members will count.\n\n` +
      `*Start inviting, stack your rewards, and help us grow!*`
    )
    .setFooter({ text: `${brand(config)} - Lifelong Invite Event` })
    .setTimestamp();
}

function welcomeEmbed({ member, inviter, inviteCode, uses, config }) {
  const guild = member.guild;
  const inviterText = inviter ? `${inviter} (${inviter.tag})` : `Unknown / Vanity / Direct join`;
  const embed = new EmbedBuilder()
    .setTitle(`Welcome to ${guild.name}!`)
    .setColor('#ff7ab8')
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setDescription(
      `Hey ${member}, glad you joined **${guild.name}**!\n\n` +
      `New member: ${member.user.tag} (${member.id})\n` +
      `Invited by: ${inviterText}\n` +
      (inviteCode ? `Invite code: ${inviteCode} - Uses: ${uses}\n` : ``) +
      `\nPlease read the marketplace rules and MM TOS before trading.\n` +
      `Need a Middleman? Open a ticket in the MM channel.\n\n` +
      `You are member #${guild.memberCount}!`
    )
    .setFooter({ text: `${brand(config)} - Stay safe and trade fairly` })
    .setTimestamp();
  if (config?.branding?.welcomeImage) embed.setImage(config.branding.welcomeImage);
  return embed;
}

function ticketWelcomeEmbed({ opener, details, config }) {
  return new EmbedBuilder()
    .setTitle(`Middleman Request | ${brand(config)}`)
    .setColor('#5865F2')
    .setDescription(
      `Hey ${opener}, an MM will be with you shortly!\n\n` +
      `**Trader 1:** ${details.trader1 || opener}\n` +
      `**Trader 2:** ${details.trader2 || 'Not provided'}\n` +
      `**Trade details:**\n\`\`\`${details.trade || 'Not provided'}\`\`\`\n` +
      `**Agreed?** ${details.agreed || 'Not confirmed'}\n\n` +
      `> Both traders must confirm here\n` +
      `> Do NOT trade outside this ticket\n` +
      `> You agree to the MM TOS by using this service`
    )
    .setFooter({ text: 'ICEMM - Please wait for an MM to claim the ticket' })
    .setTimestamp();
}

module.exports = {
  marketplaceRulesEmbed,
  mmTosEmbed,
  mmPanelEmbed,
  boosterRewardsEmbed,
  inviteRewardsEmbed,
  welcomeEmbed,
  ticketWelcomeEmbed,
};
