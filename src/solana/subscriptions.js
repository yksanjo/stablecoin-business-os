// v0.3.0 — Delegated subscription billing for USDC on Solana.
//
// Model: SPL Token Approve + delegated TransferChecked.
//
//   1. Customer calls /api/subscriptions/:id/authorize/prepare to get
//      an unsigned Approve instruction. Customer signs and submits.
//      This grants the business an allowance up to N × subscription
//      amount, drawn from the customer's USDC ATA.
//
//   2. On each billing cycle the business calls
//      /api/subscriptions/:id/charge to get an unsigned
//      TransferChecked instruction, signed by the business's wallet
//      (acting as the delegate). On submission, the customer's
//      allowance is decremented and USDC moves from customer ATA →
//      business ATA.
//
//   3. Customer can revoke at any time via Approve(amount=0) or
//      Revoke().
//
// This module only constructs transactions. Signing and submission
// happen on the caller's side. The biller process the business runs
// to invoke step 2 on a schedule is OUT OF SCOPE for v0.3 — the API
// exposes the building block but the cron is the business's
// responsibility.
//
// Honest limitations (documented in README & SECURITY.md):
//   - This code has been unit-tested but not yet validated against
//     a live Solana RPC. Devnet round-trip required before claims
//     of "working".
//   - The allowance is denominated in raw USDC base units (6
//     decimals); the API converts to/from human USDC.
//   - There is no on-chain enforcement of billing cadence. A
//     compromised or rogue business with delegate authority could
//     drain the entire allowance in one transaction. Customers
//     should authorize only what they're prepared to lose to a
//     billing dispute.

import {
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createApproveInstruction,
  createRevokeInstruction,
  createTransferCheckedInstruction,
  getAccount,
} from '@solana/spl-token';
import { getConnection } from './client.js';

const RPC_URL =
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);
const USDC_DECIMALS = 6;

function toBaseUnits(amountUsdc) {
  // Avoid floating-point drift by string-routing the conversion.
  const [whole, frac = ''] = String(amountUsdc).split('.');
  const fracPadded = (frac + '000000').slice(0, USDC_DECIMALS);
  return BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(fracPadded);
}

function fromBaseUnits(amountRaw) {
  const n = BigInt(amountRaw);
  const whole = n / BigInt(10 ** USDC_DECIMALS);
  const frac = n % BigInt(10 ** USDC_DECIMALS);
  const fracStr = frac.toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

/**
 * Construct an unsigned Approve transaction that grants the business
 * (`delegate`) up to `totalAmountUsdc` from the customer's USDC ATA.
 *
 * Returned tx must be signed and submitted by the customer.
 */
async function resolveBlockhash(injected) {
  if (injected) return injected;
  const { blockhash } = await getConnection().getLatestBlockhash();
  return blockhash;
}

export async function prepareAuthorizationTx({
  customerAddress,
  delegateAddress,
  totalAmountUsdc,
  blockhash,
}) {
  const customer = new PublicKey(customerAddress);
  const delegate = new PublicKey(delegateAddress);
  const customerAta = await getAssociatedTokenAddress(USDC_MINT, customer);

  const ix = createApproveInstruction(
    customerAta,
    delegate,
    customer,
    toBaseUnits(totalAmountUsdc)
  );

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = await resolveBlockhash(blockhash);
  tx.feePayer = customer;
  return tx;
}

/**
 * Construct an unsigned Revoke transaction that clears any delegate
 * authority on the customer's USDC ATA.
 */
export async function prepareRevokeTx({ customerAddress, blockhash }) {
  const customer = new PublicKey(customerAddress);
  const customerAta = await getAssociatedTokenAddress(USDC_MINT, customer);

  const ix = createRevokeInstruction(customerAta, customer);

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = await resolveBlockhash(blockhash);
  tx.feePayer = customer;
  return tx;
}

/**
 * Construct an unsigned TransferChecked transaction drawing
 * `amountUsdc` from the customer's USDC ATA into the business's USDC
 * ATA, signed by `delegate` (the business's wallet).
 *
 * Returned tx must be signed and submitted by the delegate (business).
 * Fails on-chain if the delegate does not have sufficient allowance.
 */
export async function prepareChargeTx({
  customerAddress,
  delegateAddress,
  businessTreasuryAddress,
  amountUsdc,
  blockhash,
}) {
  const customer = new PublicKey(customerAddress);
  const delegate = new PublicKey(delegateAddress);
  const treasury = new PublicKey(businessTreasuryAddress);

  const customerAta = await getAssociatedTokenAddress(USDC_MINT, customer);
  const treasuryAta = await getAssociatedTokenAddress(USDC_MINT, treasury);

  const ix = createTransferCheckedInstruction(
    customerAta,
    USDC_MINT,
    treasuryAta,
    delegate,
    toBaseUnits(amountUsdc),
    USDC_DECIMALS
  );

  const tx = new Transaction().add(ix);
  tx.recentBlockhash = await resolveBlockhash(blockhash);
  tx.feePayer = delegate;
  return tx;
}

/**
 * Read the on-chain state of the customer's USDC ATA and return the
 * current delegate + remaining delegated amount. Use this to verify
 * an authorization landed and to surface remaining-allowance to the
 * business UI.
 */
export async function getAuthorizationState({ customerAddress }) {
  const conn = getConnection();
  const customer = new PublicKey(customerAddress);
  const customerAta = await getAssociatedTokenAddress(USDC_MINT, customer);

  try {
    const account = await getAccount(conn, customerAta);
    const delegate = account.delegate ? account.delegate.toBase58() : null;
    return {
      tokenAccount: customerAta.toBase58(),
      delegate,
      delegatedAmountUsdc: delegate
        ? fromBaseUnits(account.delegatedAmount)
        : '0',
      balanceUsdc: fromBaseUnits(account.amount),
    };
  } catch (e) {
    return {
      tokenAccount: customerAta.toBase58(),
      delegate: null,
      delegatedAmountUsdc: '0',
      balanceUsdc: '0',
      note: 'Customer USDC ATA does not exist yet',
    };
  }
}

// Exported for tests.
export const __test__ = { toBaseUnits, fromBaseUnits, USDC_MINT };
