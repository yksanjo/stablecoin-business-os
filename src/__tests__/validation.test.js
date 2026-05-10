// Schema-level tests for zod validation.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBusinessSchema,
  createInvoiceSchema,
  createPayoutSchema,
  createSubscriptionSchema,
  prepareTransferSchema,
  payInvoiceSchema,
} from '../schemas/index.js';

describe('createBusinessSchema', () => {
  test('accepts minimal valid input', () => {
    const result = createBusinessSchema.safeParse({
      name: 'Acme',
      email: 'a@acme.com',
    });
    assert.equal(result.success, true);
  });

  test('rejects malformed email', () => {
    const result = createBusinessSchema.safeParse({
      name: 'Acme',
      email: 'not-an-email',
    });
    assert.equal(result.success, false);
  });

  test('rejects empty name', () => {
    const result = createBusinessSchema.safeParse({
      name: '',
      email: 'a@acme.com',
    });
    assert.equal(result.success, false);
  });
});

describe('createInvoiceSchema', () => {
  test('rejects zero or negative amount', () => {
    const zero = createInvoiceSchema.safeParse({
      clientName: 'X',
      amountUsdc: 0,
    });
    assert.equal(zero.success, false);

    const neg = createInvoiceSchema.safeParse({
      clientName: 'X',
      amountUsdc: -50,
    });
    assert.equal(neg.success, false);
  });

  test('coerces string amount to number', () => {
    const result = createInvoiceSchema.safeParse({
      clientName: 'X',
      amountUsdc: '100.50',
    });
    assert.equal(result.success, true);
    assert.equal(result.data.amountUsdc, 100.5);
  });

  test('accepts YYYY-MM-DD due dates', () => {
    const result = createInvoiceSchema.safeParse({
      clientName: 'X',
      amountUsdc: 10,
      dueDate: '2026-06-01',
    });
    assert.equal(result.success, true);
  });
});

describe('createPayoutSchema', () => {
  test('rejects a too-short wallet address', () => {
    const result = createPayoutSchema.safeParse({
      recipientName: 'Yoshi',
      recipientWallet: 'short',
      amountUsdc: 100,
    });
    assert.equal(result.success, false);
  });

  test('accepts a 44-char wallet address', () => {
    const result = createPayoutSchema.safeParse({
      recipientName: 'Yoshi',
      recipientWallet: '7EcDhSYGxXyscszYEp35KHN8vvw3sxn1zNV6jWUjHjJg',
      amountUsdc: 100,
    });
    assert.equal(result.success, true);
  });
});

describe('createSubscriptionSchema', () => {
  test('rejects unknown frequency', () => {
    const result = createSubscriptionSchema.safeParse({
      customerName: 'X',
      amountUsdc: 10,
      frequency: 'hourly',
    });
    assert.equal(result.success, false);
  });

  test('accepts monthly frequency', () => {
    const result = createSubscriptionSchema.safeParse({
      customerName: 'X',
      amountUsdc: 10,
      frequency: 'monthly',
    });
    assert.equal(result.success, true);
  });
});

describe('prepareTransferSchema', () => {
  test('rejects when sender and recipient are missing', () => {
    const result = prepareTransferSchema.safeParse({ amountUsdc: 10 });
    assert.equal(result.success, false);
  });
});

describe('payInvoiceSchema', () => {
  test('rejects a too-short tx signature', () => {
    const result = payInvoiceSchema.safeParse({ txSignature: 'abc' });
    assert.equal(result.success, false);
  });

  test('accepts a 88-char signature (Solana base58 length)', () => {
    const result = payInvoiceSchema.safeParse({
      txSignature: 'a'.repeat(88),
    });
    assert.equal(result.success, true);
  });
});
