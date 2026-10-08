const path = require('node:path');

const appRoot = process.pkg
  ? path.dirname(process.execPath)
  : path.join(__dirname, '..');

module.exports = { appRoot };
