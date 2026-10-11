const path = require('node:path');
const { appRoot } = require('./runtime');
const { readEncryptedJson, writeEncryptedJson } = require('./secureStore');

const dataDir = path.join(appRoot, 'data');
const dataPath = path.join(dataDir, 'reputation.json');

function emptyStore() {
  return { version: 1, guilds: {} };
}

function loadStore() {
  try {
    const store = readEncryptedJson(dataPath, emptyStore);
    if (pruneExpiredRatings(store)) saveStore(store);
    return store;
  } catch (error) {
    if (error.code === 'ENOENT') return emptyStore();
    throw new Error(`Could not decrypt reputation data: ${error.message}`, { cause: error });
  }
}

function saveStore(store) {
  writeEncryptedJson(dataPath, store);
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function pruneExpiredRatings(store, now = Date.now()) {
  let changed = false;
  for (const [guildId, users] of Object.entries(store.guilds || {})) {
    for (const [recipientId, ratings] of Object.entries(users || {})) {
      for (const [giverId, rating] of Object.entries(ratings || {})) {
        const timestamp = Date.parse(rating.updatedAt || '');
        if (!timestamp || now - timestamp >= RETENTION_MS) {
          delete ratings[giverId];
          changed = true;
        }
      }
      if (!Object.keys(ratings).length) delete users[recipientId];
    }
    if (!Object.keys(users).length) delete store.guilds[guildId];
  }
  return changed;
}

function deleteUserReputation(userId) {
  const store = loadStore();
  let deleted = 0;
  for (const users of Object.values(store.guilds || {})) {
    if (users[userId]) {
      deleted += Object.keys(users[userId]).length;
      delete users[userId];
    }
    for (const ratings of Object.values(users)) {
      if (ratings[userId]) {
        delete ratings[userId];
        deleted += 1;
      }
    }
  }
  saveStore(store);
  return deleted;
}

function cleanupExpiredReputation() {
  const store = loadStore();
  return Object.keys(store.guilds || {}).length;
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

module.exports = { cleanupExpiredReputation, dataPath, deleteUserReputation, getReputation, giveReputation, summarizeRatings };
