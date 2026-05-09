import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'buildtrack-dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'buildtrack-dev-refresh-secret';

export interface TestUser {
  id: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

export function generateTestToken(user: TestUser): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export function generateTestRefreshToken(user: TestUser): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

export const testUsers = {
  regular: {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@example.com',
    role: 'user',
    firstName: 'Test',
    lastName: 'User',
  } as TestUser,
  admin: {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'admin@example.com',
    role: 'admin',
    firstName: 'Admin',
    lastName: 'User',
  } as TestUser,
  superAdmin: {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'super@example.com',
    role: 'super_admin',
    firstName: 'Super',
    lastName: 'Admin',
  } as TestUser,
};

export function getAuthHeader(user: TestUser = testUsers.regular): string {
  const token = generateTestToken(user);
  return `Bearer ${token}`;
}
