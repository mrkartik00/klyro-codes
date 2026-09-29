import { beforeAll, afterAll } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// One replica set + one Mongoose connection shared by every integration test
// file in this (single-fork) run. Individual files clear the collections they
// use in their own beforeEach.
let replset;

beforeAll(async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { directConnection: true });
});

afterAll(async () => {
  await mongoose.disconnect();
  await replset?.stop();
});
