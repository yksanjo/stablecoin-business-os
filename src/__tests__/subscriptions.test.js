// v0.3.0 — Unit tests for delegated subscription billing.
//
// These cover transaction construction (offline) and the conversion
// helpers. End-to-end Solana RPC behavior must be validated on
// devnet — these tests cannot guarantee on-chain correctness.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  prepareAuthorizationTx,
  prepareRevokeTx,
  prepareChargeTx,
  __test__,
} from '../solana/subscriptions.js';

// Offline-only tests: callers inject a fake blockhash to bypass RPC.
const FAKE_BLOCKHASH = 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi';

const ALICE = '4Nd1mPi1cYxa9X9TksDLcZZxr5Ts1QrZWFKpQ8h9w9qC';
const BOB = '8s7zRBmJ8q8Mz4kQk7xxgPgZ8r3kqx7e2sZL5Pg9Lkjm';
const CAROL = 'CjGsxC1XGCAfHCk9SCWiyXxXyJ3qE2VbBJgC5LCwR9pn';

describe('toBaseUnits / fromBaseUnits', () => {
  test('round-trips whole USDC amounts', () => {
    const { toBaseUnits, fromBaseUnits } = __test__;
    assert.equal(toBaseUnits(100), 100_000_000n);
    assert.equal(fromBaseUnits(100_000_000n), '100');
  });

  test('handles fractional USDC', () => {
    const { toBaseUnits, fromBaseUnits } = __test__;
    assert.equal(toBaseUnits('1.25'), 1_250_000n);
    assert.equal(fromBaseUnits(1_250_000n), '1.25');
  });

  test('preserves 6-decimal precision', () => {
    const { toBaseUnits } = __test__;
    assert.equal(toBaseUnits('0.000001'), 1n);
    assert.equal(toBaseUnits('0.000123'), 123n);
  });

  test('zero is zero', () => {
    const { toBaseUnits, fromBaseUnits } = __test__;
    assert.equal(toBaseUnits(0), 0n);
    assert.equal(fromBaseUnits(0n), '0');
  });
});

describe('prepareAuthorizationTx', () => {
  test('produces a single-instruction Approve tx, fee-payer is customer', async () => {
    const tx = await prepareAuthorizationTx({
      customerAddress: ALICE,
      delegateAddress: BOB,
      totalAmountUsdc: 1200,
      blockhash: FAKE_BLOCKHASH,
    });
    assert.equal(tx.instructions.length, 1);
    const ix = tx.instructions[0];
    // The Approve instruction is on the SPL Token program.
    assert.ok(ix.programId.equals(TOKEN_PROGRAM_ID));
    // Fee payer is the customer.
    assert.equal(tx.feePayer.toBase58(), ALICE);
    // Blockhash is set so the customer can sign immediately.
    assert.ok(tx.recentBlockhash);
  });
});

describe('prepareRevokeTx', () => {
  test('produces a Revoke tx with customer as fee-payer', async () => {
    const tx = await prepareRevokeTx({
      customerAddress: ALICE,
      blockhash: FAKE_BLOCKHASH,
    });
    assert.equal(tx.instructions.length, 1);
    assert.ok(tx.instructions[0].programId.equals(TOKEN_PROGRAM_ID));
    assert.equal(tx.feePayer.toBase58(), ALICE);
  });
});

describe('prepareChargeTx', () => {
  test('produces a TransferChecked tx with delegate as fee-payer', async () => {
    const tx = await prepareChargeTx({
      customerAddress: ALICE,
      delegateAddress: BOB,
      businessTreasuryAddress: CAROL,
      amountUsdc: 100,
      blockhash: FAKE_BLOCKHASH,
    });
    assert.equal(tx.instructions.length, 1);
    assert.ok(tx.instructions[0].programId.equals(TOKEN_PROGRAM_ID));
    // Critically: the *delegate* (business) pays the network fee, not
    // the customer. This is what makes pull billing actually pull.
    assert.equal(tx.feePayer.toBase58(), BOB);
  });

  test('rejects invalid Solana addresses', async () => {
    await assert.rejects(
      prepareChargeTx({
        customerAddress: 'not-a-key',
        delegateAddress: BOB,
        businessTreasuryAddress: CAROL,
        amountUsdc: 10,
        blockhash: FAKE_BLOCKHASH,
      })
    );
  });
});
