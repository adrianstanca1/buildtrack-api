import { beforeAll, beforeEach, afterAll } from '@jest/globals';
import { cleanTestDatabase, initTestDatabase } from './testDb';

beforeAll(async () => {
  await initTestDatabase();
});

beforeEach(async () => {
  await cleanTestDatabase();
});

afterAll(async () => {
  const { closeTestDatabase } = await import('./testDb');
  await closeTestDatabase();
});
