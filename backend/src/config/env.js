import dotenv from 'dotenv';
dotenv.config();

function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

const isProd = process.env.NODE_ENV === 'production';

if (!process.env.JWT_SECRET && isProd) {
  console.warn('[env] WARNING: JWT_SECRET not set — using insecure default. Set it in your Render env vars.');
}

export const env = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  JWT_SECRET: process.env.JWT_SECRET || (isProd ? 'temporary-dev-secret-replace-immediately' : 'dev-secret-change-me'),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  FRONTEND_ORIGINS: parseOrigins(process.env.FRONTEND_URL || 'http://localhost:3000'),
  PLATFORM_COMMISSION_PCT: parseInt(process.env.PLATFORM_COMMISSION_PCT || '30', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  IS_PROD: isProd,
};
