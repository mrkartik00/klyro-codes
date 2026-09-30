// Bring MongoDB indexes in line with the Mongoose models (drops stale ones,
// e.g. old sparse uniques replaced by partial ones). Safe to re-run.
//   cd server && node --env-file=.env scripts/sync-indexes.mjs
import mongoose from 'mongoose';
import { readdirSync } from 'node:fs';

await mongoose.connect(process.env.MONGODB_URI);
for (const f of readdirSync(new URL('../src/models/', import.meta.url)).filter((f) => f.endsWith('.js'))) {
  await import(`../src/models/${f}`);
}
for (const name of mongoose.modelNames()) {
  try {
    const dropped = await mongoose.model(name).syncIndexes();
    if (dropped.length) console.log(`${name}: dropped ${dropped.join(', ')}`);
  } catch (err) {
    console.log(`${name}: FAILED ${err.message}`);
  }
}
console.log('indexes synced');
await mongoose.disconnect();
