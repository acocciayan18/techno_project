import 'dotenv/config';
import { ROLE } from '../src/lib/constants.js';
import { findByUsername, createUser } from '../src/services/users.js';

const username = (process.env.SEED_ADMIN_USERNAME || 'admin').toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD || 'admin12345';
const name = process.env.SEED_ADMIN_NAME || 'System Admin';

const existing = await findByUsername(username);
if (existing) {
  console.log(`Admin already exists: ${username}`);
} else {
  const user = await createUser({ username, password, name, role: ROLE.ADMIN });
  console.log(`Created admin: ${username} (uid ${user.uid})`);
}
process.exit(0);
