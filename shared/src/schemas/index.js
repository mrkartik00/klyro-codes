// Zod schemas shared by React Hook Form (client) and Express validation (server).
import { z } from 'zod';
import { CURRENCIES } from '../enums.js';

export const emailSchema = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());

export const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.enum(CURRENCIES),
});

export const enquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  company: z.string().trim().max(150).optional(),
  message: z.string().trim().min(10).max(5000),
  budgetRange: z.string().max(50).optional(),
  // Honeypot: humans leave it empty. Accept any value here so bots get the same
  // 200 as humans; the route drops filled submissions silently.
  website_url: z.string().max(2000).optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: z.string().min(12).max(200),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
