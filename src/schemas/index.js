// Request body schemas (zod). One schema per endpoint that takes a body.
// Each schema is used by the validate() middleware.

import { z } from 'zod';

const email = z.string().email('Invalid email');
const usdcAmount = z.number().positive('Amount must be > 0').finite();
const solanaAddress = z
  .string()
  .min(32, 'Solana address too short')
  .max(44, 'Solana address too long');
const isoDate = z.string().datetime({ offset: true }).or(
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date (YYYY-MM-DD)')
);

export const createBusinessSchema = z.object({
  name: z.string().min(1).max(120),
  email: email,
  walletAddress: solanaAddress.optional(),
});

export const createInvoiceSchema = z.object({
  clientName: z.string().min(1).max(120),
  clientEmail: email.optional(),
  description: z.string().max(1024).optional(),
  amountUsdc: z.coerce.number().pipe(usdcAmount),
  dueDate: isoDate.optional(),
});

export const payInvoiceSchema = z.object({
  txSignature: z.string().min(64, 'tx signature looks too short').max(128),
});

export const createPayoutSchema = z.object({
  recipientName: z.string().min(1).max(120),
  recipientWallet: solanaAddress,
  amountUsdc: z.coerce.number().pipe(usdcAmount),
  description: z.string().max(1024).optional(),
});

export const processPayoutSchema = z.object({
  txSignature: z.string().min(64).max(128).optional(),
});

export const createSubscriptionSchema = z.object({
  customerName: z.string().min(1).max(120),
  customerWallet: solanaAddress.optional(),
  amountUsdc: z.coerce.number().pipe(usdcAmount),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
});

export const prepareTransferSchema = z.object({
  sender: solanaAddress,
  recipient: solanaAddress,
  amountUsdc: z.coerce.number().pipe(usdcAmount),
});

export const verifyTransactionSchema = z.object({
  txSignature: z.string().min(64).max(128),
});

export const categorizeSchema = z.object({
  description: z.string().min(1).max(1024),
});
