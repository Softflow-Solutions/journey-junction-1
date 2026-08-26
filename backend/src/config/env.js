import dotenv from 'dotenv';
dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  PLATFORM_COMMISSION_PCT: parseInt(process.env.PLATFORM_COMMISSION_PCT || '30', 10),
};
