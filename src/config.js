const fs = require('node:fs');
const path = require('node:path');
const { appRoot } = require('./runtime');

const configPath = path.join(appRoot, 'config.json');

function loadConfig() {
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

function saveConfig(config) {
  const temporaryPath = `${configPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(temporaryPath, configPath);
}

module.exports = { loadConfig, saveConfig, configPath };
