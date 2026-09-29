/**
 * Seed the initial workspace + super-admin. Idempotent: safe to re-run.
 * Usage: node scripts/seed.js  (requires a valid .env)
 */
import { connectDb, disconnectDb } from '../src/config/db.js';
import { Workspace } from '../src/models/Workspace.js';
import { User } from '../src/models/User.js';
import { Membership } from '../src/models/Membership.js';
import { hashPassword } from '../src/services/auth.service.js';
import { logger } from '../src/config/logger.js';

const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'kartik@klyro.codes';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMeNow!2026';

async function main() {
  await connectDb();
  let ws = await Workspace.findOne({ slug: 'klyro' });
  if (!ws) ws = await Workspace.create({ name: 'Klyro', slug: 'klyro' });

  let user = await User.findOne({ email: EMAIL });
  if (!user) {
    user = await User.create({
      name: 'Kartik',
      email: EMAIL,
      passwordHash: await hashPassword(PASSWORD),
      emailVerifiedAt: new Date(),
    });
  }
  await Membership.findOneAndUpdate(
    { workspaceId: ws._id, userId: user._id },
    { $setOnInsert: { workspaceId: ws._id, userId: user._id, role: 'super_admin' } },
    { upsert: true },
  );
  logger.info(`Seeded workspace=${ws.slug} admin=${EMAIL}`);
  await disconnectDb();
}

main().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
