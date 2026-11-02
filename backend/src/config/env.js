require('dotenv').config({ quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const jwtSecret = required('JWT_SECRET');
if (isProd && jwtSecret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');

const ipHashSalt = process.env.IP_HASH_SALT || jwtSecret;

module.exports = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT) || 4000,
  mongoUri: required('MONGODB_URI'),
  jwtSecret,
  jwtTtlMinutes: Number(process.env.JWT_TTL_MINUTES) || 30,
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((o) => o.trim()).filter(Boolean),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  ipHashSalt,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || 'mailto:security@example.com',
  },
  consentVersion: '2024-01-NDPA-v1',
};
