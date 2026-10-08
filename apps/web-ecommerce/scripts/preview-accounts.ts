import DatabaseProvider from '../src/core/server/database/Database.Provider';
import UserModel from '../src/core/server/database/internal/models/User.Model';
import bcrypt from 'bcryptjs';

// Optional browser verification accounts in a disposable database. Never rewrites an existing account.
async function main() {
  if (!process.env.DB_NAME?.endsWith('_test')) throw new Error('Preview accounts require an explicitly named *_test database.');
  process.env.DROP_TABLES = 'false';
  process.env.SEED_DATA = 'false';
  await DatabaseProvider.initialize();
  for (const role of ['ADMIN','CUSTOMER'] as const) {
    const email = process.env[`E2E_${role}_EMAIL`], password = process.env[`E2E_${role}_PASSWORD`];
    if (!email || !password || password.length < 12 || !email.endsWith('.example')) throw new Error('Supply a .example verification email and a password of at least 12 characters.');
    const existing = await UserModel.findOne({ where: { email } });
    if (existing) throw new Error('Verification account already exists; no account was changed.');
    await UserModel.create({ email, passwordHash: await bcrypt.hash(password,12), firstName:'Preview', lastName:role === 'ADMIN' ? 'Administrator' : 'Collector', role:role === 'ADMIN' ? 'ADMIN' : 'USER', isActive:true });
  }
  await DatabaseProvider.getInstance().close();
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
