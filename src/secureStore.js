const fs = require('node:fs');
const path = require('node:path');
const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto');

const FORMAT = 'icemm-aes-256-gcm-v1';

function encryptionKey() {
  const configured = process.env.DATA_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error('DATA_ENCRYPTION_KEY is required to protect stored Discord data');
  }
  return createHash('sha256').update(configured, 'utf8').digest();
}

function encryptJson(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({
    format: FORMAT,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

function decryptJson(serialized) {
  const envelope = JSON.parse(serialized);
  if (envelope?.format !== FORMAT) return { value: envelope, wasPlaintext: true };
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return { value: JSON.parse(plaintext), wasPlaintext: false };
}

function writeEncryptedJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, encryptJson(value), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function readEncryptedJson(filePath, fallbackFactory) {
  try {
    const result = decryptJson(fs.readFileSync(filePath, 'utf8'));
    if (result.wasPlaintext) writeEncryptedJson(filePath, result.value);
    return result.value;
  } catch (error) {
    if (error.code === 'ENOENT') return fallbackFactory();
    throw error;
  }
}

module.exports = { readEncryptedJson, writeEncryptedJson };
