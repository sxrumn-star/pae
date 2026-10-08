const fs = require('node:fs');
const path = require('node:path');
const { appRoot } = require('./runtime');

const dataDir = path.join(appRoot, 'data');
const dataPath = path.join(dataDir, 'reputation.json');

function emptyStore() {
  return { version: 1, guilds: {} };
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[reputation] Could not read data:', error);
    return emptyStore();
  }
}

function saveStore(store) {
  fs.mkdirSync(dataDir, { recursive: true });
  const temporaryPath = `${dataPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temporaryPath, dataPath);
}

function getUserRatings(store, guildId, userId) {
  return store.guilds?.[guildId]?.[userId] || {};
}

function summarizeRatings(ratings) {
  const entries = Object.values(ratings);
  const count = entries.length;
  const starTotal = entries.reduce((sum, entry) => sum + entry.stars, 0);
  return {
    count,
    average: count ? starTotal / count : 0,
  };
}

function getReputation(guildId, userId) {
  const store = loadStore();
  return summarizeRatings(getUserRatings(store, guildId, userId));
}

function giveReputation({ guildId, recipientId, giverId, stars, message }) {
  const store = loadStore();
  store.guilds[guildId] ||= {};
  store.guilds[guildId][recipientId] ||= {};

  const ratings = store.guilds[guildId][recipientId];
  const updated = Boolean(ratings[giverId]);
  ratings[giverId] = {
    stars,
    message: message || '',
    updatedAt: new Date().toISOString(),
  };
  saveStore(store);

  return { updated, ...summarizeRatings(ratings) };
}

module.exports = { dataPath, getReputation, giveReputation, summarizeRatings };
