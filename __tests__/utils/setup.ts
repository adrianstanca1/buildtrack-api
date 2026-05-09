import { cleanTestDatabase } from './testDb.js';

beforeEach(async () => {
  await cleanTestDatabase();
});

afterAll(async () => {
  const { closeTestDatabase } = await import('./testDb.js');
  await closeTestDatabase();
});
