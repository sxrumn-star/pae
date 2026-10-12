const path = require('node:path');
const { appRoot } = require('./runtime');
const { readEncryptedJson, writeEncryptedJson } = require('./secureStore');

const dataPath = path.join(appRoot, 'data', 'rename-jobs.json');
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const activeGuilds = new Set();
const realisticNames = [
  'Adam', 'Alex', 'Amelia', 'Ava', 'Benjamin', 'Blake', 'Caleb', 'Cameron', 'Charlotte', 'Chloe',
  'Daniel', 'David', 'Dylan', 'Eleanor', 'Elijah', 'Ella', 'Emily', 'Emma', 'Ethan', 'Evelyn',
  'Gabriel', 'Grace', 'Hannah', 'Harper', 'Henry', 'Isabella', 'Jack', 'Jacob', 'James', 'Jasmine',
  'Jayden', 'Joseph', 'Layla', 'Leo', 'Liam', 'Lily', 'Logan', 'Lucas', 'Mason', 'Mia',
  'Nathan', 'Noah', 'Nora', 'Oliver', 'Olivia', 'Owen', 'Ryan', 'Samuel', 'Scarlett', 'Sophia',
  'Theodore', 'Thomas', 'Victoria', 'William', 'Willow', 'Zoe', 'Aaron', 'Alice', 'Isaac', 'Sophie',
];

function loadJobs() {
  const jobs = readEncryptedJson(dataPath, () => ({}));
  const cutoff = Date.now() - MAX_AGE_MS;
  let changed = false;
  for (const [guildId, job] of Object.entries(jobs)) {
    if (!job?.updatedAt || job.updatedAt < cutoff || job.remaining <= 0) {
      delete jobs[guildId];
      changed = true;
    }
  }
  if (changed) writeEncryptedJson(dataPath, jobs);
  return jobs;
}

function scheduleRenameJob({ guildId, channelId, requestedById, roleId, remaining, processedIds = [] }) {
  const jobs = loadJobs();
  if (remaining <= 0) {
    delete jobs[guildId];
  } else {
    jobs[guildId] = {
      channelId,
      requestedById,
      roleId,
      remaining,
      processedIds: [...new Set(processedIds)],
      nextNameIndex: processedIds.length,
      updatedAt: Date.now(),
    };
  }
  writeEncryptedJson(dataPath, jobs);
}

function cancelRenameJob(guildId) {
  const jobs = loadJobs();
  const existed = Boolean(jobs[guildId]);
  if (existed) {
    delete jobs[guildId];
    writeEncryptedJson(dataPath, jobs);
  }
  return existed;
}

async function processRenameCandidate(member, channel) {
  if (!member?.guild || member.user.bot || activeGuilds.has(member.guild.id)) return false;
  const jobs = loadJobs();
  const job = jobs[member.guild.id];
  if (!job || job.remaining <= 0) return false;
  if (
    member.id === member.guild.ownerId ||
    job.processedIds.includes(member.id) ||
    !member.roles.cache.has(job.roleId) ||
    !member.manageable
  ) return false;

  activeGuilds.add(member.guild.id);
  try {
    job.processedIds.push(member.id);
    const nameIndex = job.nextNameIndex++;
    const baseName = realisticNames[nameIndex % realisticNames.length];
    const nickname = nameIndex < realisticNames.length
      ? baseName
      : `${baseName} ${Math.floor(nameIndex / realisticNames.length) + 1}`;
    try {
      await member.setNickname(nickname, `Pending random rename requested by user ${job.requestedById}`);
      job.remaining -= 1;
    } catch {
      // Do not repeatedly retry members the bot cannot rename.
    }
    job.updatedAt = Date.now();
    if (job.remaining <= 0) {
      delete jobs[member.guild.id];
      const destination = await member.guild.channels.fetch(job.channelId).catch(() => channel);
      await destination?.send({ content: `✅ Pending rename job completed. All requested manageable **Member** users were renamed.`, allowedMentions: { parse: [] } }).catch(() => null);
    } else {
      jobs[member.guild.id] = job;
    }
    writeEncryptedJson(dataPath, jobs);
    return true;
  } finally {
    activeGuilds.delete(member.guild.id);
  }
}

function deleteUserRenameData(userId) {
  const jobs = loadJobs();
  let removed = 0;
  for (const [guildId, job] of Object.entries(jobs)) {
    if (job.requestedById === userId) {
      delete jobs[guildId];
      removed += 1;
      continue;
    }
    job.processedIds = job.processedIds.filter(id => id !== userId);
  }
  writeEncryptedJson(dataPath, jobs);
  return removed;
}

module.exports = { cancelRenameJob, deleteUserRenameData, processRenameCandidate, scheduleRenameJob };
