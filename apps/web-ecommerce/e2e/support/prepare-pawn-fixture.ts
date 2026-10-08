import DatabaseProvider from '../../src/core/server/database/Database.Provider';
import CommercePolicyService from '../../src/core/server/services/CommercePolicyService';
import UserModel from '../../src/core/server/database/internal/models/User.Model';

// This explicit fixture never chooses an owner's rule in a retained or preview database.
async function main() {
  if (process.env.DB_NAME !== 'model_universe_browser_test' || process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '55433') throw new Error('Pawn browser fixture requires the dedicated local browser test database.');
  process.env.DROP_TABLES = 'false';
  process.env.SEED_DATA = 'false';
  await DatabaseProvider.initialize();
  const actor = await UserModel.findOne({ where: { email: 'admin@model-universe.example', role: 'ADMIN', isActive: true } });
  if (!actor) throw new Error('Disposable browser administrator missing.');
  const service = new CommercePolicyService();
  const current = (await service.list()).find(policy => policy.name === 'pawn');
  if (current) throw new Error('Fixture policy already exists; no existing policy was changed.');
  await service.approve('pawn', { dailyRateBasisPoints: 3, dayCount: 'completed_days', rounding: 'ceil', graceDays: 2, interestStopEvent: 'verified_repayment' }, 0, actor.id, 'Browser test fixture only: not an owner decision, live contract, or production authorization.');
  await DatabaseProvider.getInstance().close();
  console.log('Pawn browser fixture policy created in the dedicated test copy.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
