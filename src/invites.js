const { Collection } = require('discord.js');

// inviteCode -> { uses, inviterId }
const inviteCache = new Map();

async function refreshInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    inviteCache.set(guild.id, new Map(invites.map(i => [i.code, { uses: i.uses ?? 0, inviterId: i.inviter?.id || null }])));
  } catch (e) {
    console.log(`[invites] cannot fetch for ${guild.name}: ${e.message}`);
  }
}

async function refreshAllInvites(client) {
  for (const [, guild] of client.guilds.cache) {
    await refreshInvites(guild);
  }
}

function findUsedInvite(guild, freshInvites) {
  const cached = inviteCache.get(guild.id) || new Map();
  for (const [, inv] of freshInvites) {
    const old = cached.get(inv.code);
    const oldUses = old ? old.uses : 0;
    if ((inv.uses ?? 0) > oldUses) {
      return inv;
    }
  }
  // fallback: brand-new invite not in cache
  for (const [, inv] of freshInvites) {
    if (!cached.has(inv.code)) return inv;
  }
  return null;
}

module.exports = { inviteCache, refreshInvites, refreshAllInvites, findUsedInvite };
