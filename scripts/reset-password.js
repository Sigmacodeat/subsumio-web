const { scrypt, randomBytes } = require('node:crypto');
const { Pool } = require('pg');

const salt = randomBytes(16);
const password = 'Subsumio2026!';

scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, async (err, key) => {
  if (err) { console.error(err); process.exit(1); }
  const hash = 's2:' + salt.toString('hex') + ':' + key.toString('hex');
  
  const pool = new Pool({ connectionString: process.env.SUBSUMIO_AUTH_DATABASE_URL });
  
  try {
    await pool.query("UPDATE subsumio_users SET password_hash = $1, data = jsonb_set(data, '{passwordHash}', to_jsonb($1::text)) WHERE email = $2", [hash, 'mesic.sigmacode@gmail.com']);
    
    const res2 = await pool.query("SELECT data->>'passwordHash' as pw FROM subsumio_users WHERE email = $1", ['mesic.sigmacode@gmail.com']);
    const stored = res2.rows[0].pw;
    console.log('Hash length:', stored.length);
    console.log('Hash starts with s2:', stored.startsWith('s2:'));
    
    // Verify the password works
    const [scheme, saltHex, hashHex] = stored.split(':');
    if (scheme !== 's2') { console.log('INVALID SCHEME'); process.exit(1); }
    scrypt(password, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 }, (err2, key2) => {
      if (err2) { console.error(err2); process.exit(1); }
      const { timingSafeEqual } = require('node:crypto');
      const expected = Buffer.from(hashHex, 'hex');
      const ok = key2.length === expected.length && timingSafeEqual(key2, expected);
      console.log('Password verify:', ok ? 'SUCCESS' : 'FAILED');
      pool.end();
    });
  } catch(e) {
    console.error('DB Error:', e.message);
    await pool.end();
  }
});
