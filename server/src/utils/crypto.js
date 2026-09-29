import crypto from 'node:crypto';
import { env } from '../config/env.js';

const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex'); // 32 bytes
const IV_LEN = 12;

/**
 * Encrypt a UTF-8 string with AES-256-GCM.
 * Output: base64 of iv(12) | authTag(16) | ciphertext. Self-describing, so
 * decrypt needs only the key.
 */
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(payload) {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + 16);
  const ct = buf.subarray(IV_LEN + 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
