'use strict';
// Shared input checks for first-run registration and administrator-managed users.
// The database constraints remain the final arbiter if two writers race.
function normalizeUser({ username, full_name, email } = {}) {
  const name = typeof username === 'string' ? username.trim() : '';
  const fullName = typeof full_name === 'string' ? full_name.trim() : '';
  const mail = typeof email === 'string' ? email.trim() : '';
  if (!/^[A-Za-z0-9._-]{3,40}$/.test(name)) return { code: 'USERNAME_INVALID' };
  if (!fullName) return { code: 'FULL_NAME_REQUIRED' };
  if (fullName.length > 120) return { code: 'FULL_NAME_INVALID' };
  if (mail && (mail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))) return { code: 'EMAIL_INVALID' };
  return { username: name, full_name: fullName, email: mail || null };
}

function userConflict(db, { username, email }, exceptId = null) {
  if (username && db.prepare('SELECT 1 FROM users WHERE lower(trim(username)) = lower(?) AND id <> ? LIMIT 1')
    .get(username, exceptId || '')) return 'USERNAME_TAKEN';
  if (email && db.prepare('SELECT 1 FROM users WHERE lower(trim(email)) = lower(?) AND id <> ? LIMIT 1')
    .get(email, exceptId || '')) return 'EMAIL_TAKEN';
  return null;
}

module.exports = { normalizeUser, userConflict };
