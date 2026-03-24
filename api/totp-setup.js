export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const secret = process.env.TOTP_SECRET;
  if (!secret) return res.status(500).json({ error: 'TOTP_SECRET not configured' });

  const uri = `otpauth://totp/Seidman-AI:Prof.Seidman?secret=${secret}&issuer=Seidman-AI&algorithm=SHA1&digits=6&period=30`;
  return res.status(200).json({ uri, secret });
}
