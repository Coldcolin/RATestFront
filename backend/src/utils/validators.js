const { z } = require('zod');
const { AppError } = require('./errors');
const { SECTORS, DOCUMENT_TYPES, ROLES, PROFILE_STATUSES } = require('./taxonomy');
const COMMON_PASSWORDS = require('./commonPasswords');

const text = (min, max) => z.string().trim().min(min).max(max);
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Invalid phone number');
const email = z.string().trim().toLowerCase().email().max(254);
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const thisYear = new Date().getFullYear();

const password = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128)
  .refine((pw) => !COMMON_PASSWORDS.has(pw.toLowerCase()), 'Password is too common');

const schemas = {
  register: z.object({ email, password }).strict().refine(
    ({ email: e, password: pw }) => {
      const local = e.split('@')[0];
      return local.length < 4 || !pw.toLowerCase().includes(local);
    },
    { message: 'Password must not contain your email name', path: ['password'] },
  ),
  login: z.object({ email, password: z.string().min(1).max(128) }).strict(),

  // Onboarding steps. .strict() rejects unknown keys (no mass-assignment of status, userId, etc.).
  steps: {
    1: z
      .object({
        fullName: text(2, 120),
        contactEmail: email,
        phone,
        currentTitle: text(2, 120),
        currentCompany: text(2, 120),
        yearsExperience: z.number().int().min(0).max(60),
        summary: text(20, 2000),
      })
      .strict(),
    2: z
      .object({
        experience: z
          .array(
            z
              .object({
                organisation: text(2, 120),
                title: text(2, 120),
                startDate: yearMonth,
                endDate: yearMonth.nullable().optional(),
                isBoard: z.boolean(),
                description: z.string().trim().max(1000).optional(),
              })
              .strict()
              .refine((r) => !r.endDate || r.endDate >= r.startDate, { message: 'End date is before start date', path: ['endDate'] }),
          )
          .min(1, 'Add at least one role')
          .max(30),
      })
      .strict(),
    3: z
      .object({
        sectors: z.array(z.enum(SECTORS)).min(1, 'Select at least one sector').max(SECTORS.length),
        specialisms: z.string().trim().max(500).optional(),
      })
      .strict(),
    4: z
      .object({
        qualifications: z
          .array(
            z
              .object({
                kind: z.enum(['degree', 'certification']),
                institution: text(2, 160),
                title: text(2, 160),
                year: z.number().int().min(1950).max(thisYear),
              })
              .strict(),
          )
          .min(1, 'Add at least one qualification')
          .max(20),
      })
      .strict(),
    5: z
      .object({
        referees: z
          .array(
            z
              .object({
                name: text(2, 120),
                relationship: text(2, 120),
                organisation: text(2, 120),
                email,
                phone,
              })
              .strict(),
          )
          .min(2, 'Provide at least two referees')
          .max(5),
      })
      .strict(),
    6: z.object({}).strict(),
    7: z.object({ consents: z.object({ vetting: z.boolean(), sharing: z.boolean() }).strict() }).strict(),
  },
  stepEnvelope: z
    .object({ data: z.record(z.string(), z.unknown()), clientSavedAt: z.string().datetime().optional() })
    .strict(),

  deleteRequest: z.object({ password: z.string().min(1).max(128) }).strict(),
  documentUpload: z.object({ type: z.enum(DOCUMENT_TYPES) }).strict(),
  statusChange: z.object({ status: z.enum(PROFILE_STATUSES), note: z.string().trim().max(2000).optional() }).strict(),
  queueQuery: z.object({
    status: z.enum(PROFILE_STATUSES).optional(),
    sort: z.enum(['asc', 'desc']).default('desc'),
  }),
  roleChange: z.object({ role: z.enum(ROLES) }).strict(),
  activeChange: z.object({ isActive: z.boolean() }).strict(),
  auditQuery: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    action: z.string().max(64).optional(),
  }),
  pushSubscription: z.object({
    endpoint: z.string().url().startsWith('https://').max(1000),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }).strict(),
  }),
};

function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  return result.data;
}

module.exports = { schemas, parse };
