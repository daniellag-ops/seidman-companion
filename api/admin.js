// Consolidated admin API
// Actions (POST): verify-login
// Actions (GET):  totp-setup

import crypto from 'crypto';

function base32Decode(str) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  str = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const output = [];
  for (const char of str) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function verifyTOTP(secret, code) {
  const time = Math.floor(Date.now() / 30000);
  for (const delta of [-1, 0, 1]) {
    const key = base32Decode(secret);
    const buf = Buffer.alloc(8);
    buf.writeBigInt64BE(BigInt(time + delta));
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const otp = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000)
      .toString().padStart(6, '0');
    if (otp === code) return true;
  }
  return false;
}

async function handleVerifyLogin(req, res) {
  const { adminKey, totpCode } = req.body;
  if (adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Invalid password' });
  if (!process.env.TOTP_SECRET) return res.status(500).json({ error: 'TOTP not configured' });
  if (!totpCode || !verifyTOTP(process.env.TOTP_SECRET, totpCode.replace(/\s/g, ''))) {
    return res.status(403).json({ error: 'Invalid verification code' });
  }
  return res.status(200).json({ ok: true });
}

async function handleTotpSetup(req, res) {
  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) return res.status(403).json({ error: 'Unauthorized' });
  const secret = process.env.TOTP_SECRET;
  if (!secret) return res.status(500).json({ error: 'TOTP_SECRET not configured' });
  const uri = `otpauth://totp/Seidman-AI:Prof.Seidman?secret=${secret}&issuer=Seidman-AI&algorithm=SHA1&digits=6&period=30`;
  return res.status(200).json({ uri, secret });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET' && req.query.action === 'totp-setup') return await handleTotpSetup(req, res);
    if (req.method === 'POST') return await handleVerifyLogin(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
