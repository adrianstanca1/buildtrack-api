import { initTestDatabase } from './testDb.js';

export default async function globalSetup() {
  await initTestDatabase();
}
