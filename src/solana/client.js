// Solana client for Stablecoin Business OS
// Handles USDC transactions, balance checks, and wallet management

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
);

let connection = null;

export function getConnection() {
  if (!connection) {
    connection = new Connection(RPC_URL, 'confirmed');
  }
  return connection;
}

/**
 * Get USDC balance for a wallet address
 */
export async function getUsdcBalance(walletAddress) {
  try {
    const conn = getConnection();
    const walletPubkey = new PublicKey(walletAddress);
    const ata = await getAssociatedTokenAddress(USDC_MINT, walletPubkey);

    try {
      const account = await getAccount(conn, ata);
      return Number(account.amount) / 1_000_000; // USDC has 6 decimals
    } catch (e) {
      // Token account doesn't exist yet — balance is 0
      return 0;
    }
  } catch (error) {
    console.error('Error fetching USDC balance:', error.message);
    throw new Error(`Failed to fetch USDC balance: ${error.message}`);
  }
}

/**
 * Get SOL balance for a wallet address
 */
export async function getSolBalance(walletAddress) {
  try {
    const conn = getConnection();
    const walletPubkey = new PublicKey(walletAddress);
    const balance = await conn.getBalance(walletPubkey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Error fetching SOL balance:', error.message);
    throw new Error(`Failed to fetch SOL balance: ${error.message}`);
  }
}

/**
 * Create a USDC transfer transaction (unsigned)
 * Returns the transaction that needs to be signed by the sender
 */
export async function createUsdcTransfer(senderAddress, recipientAddress, amountUsdc) {
  const conn = getConnection();
  const sender = new PublicKey(senderAddress);
  const recipient = new PublicKey(recipientAddress);

  // Get associated token accounts
  const senderAta = await getAssociatedTokenAddress(USDC_MINT, sender);
  const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipient);

  // Check sender has enough balance
  const senderAccount = await getAccount(conn, senderAta);
  const amountRaw = BigInt(Math.floor(amountUsdc * 1_000_000)); // Convert to 6 decimals

  if (senderAccount.amount < amountRaw) {
    throw new Error(
      `Insufficient USDC balance. Have: ${Number(senderAccount.amount) / 1_000_000}, Need: ${amountUsdc}`
    );
  }

  // Create transfer instruction
  const transferInstruction = createTransferInstruction(
    senderAta,
    recipientAta,
    sender,
    amountRaw,
    [],
    TOKEN_PROGRAM_ID
  );

  // Get recent blockhash
  const { blockhash } = await conn.getLatestBlockhash();

  const transaction = new Transaction().add(transferInstruction);
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = sender;

  return transaction;
}

/**
 * Verify a transaction signature exists and is confirmed
 */
export async function verifyTransaction(txSignature) {
  try {
    const conn = getConnection();
    const result = await conn.getSignatureStatus(txSignature);
    
    if (!result || !result.value) {
      return { confirmed: false, error: 'Transaction not found' };
    }

    const status = result.value;
    return {
      confirmed: status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized',
      slot: status.slot,
      confirmations: status.confirmations,
      status: status.confirmationStatus,
      error: status.err ? status.err.toString() : null,
    };
  } catch (error) {
    console.error('Error verifying transaction:', error.message);
    return { confirmed: false, error: error.message };
  }
}

/**
 * Get recent transactions for a wallet (via Solscan API)
 */
export async function getRecentTransactions(walletAddress, limit = 10) {
  try {
    const response = await fetch(
      `https://api.solscan.io/account/transactions?account=${walletAddress}&limit=${limit}`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      throw new Error(`Solscan API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching recent transactions:', error.message);
    // Fallback: try public RPC
    try {
      const conn = getConnection();
      const pubkey = new PublicKey(walletAddress);
      const signatures = await conn.getSignaturesForAddress(pubkey, { limit });
      return signatures.map(sig => ({
        signature: sig.signature,
        slot: sig.slot,
        blockTime: sig.blockTime,
        status: sig.confirmationStatus,
      }));
    } catch (fallbackError) {
      throw new Error(`Failed to fetch transactions: ${fallbackError.message}`);
    }
  }
}

/**
 * Get USDC price in USD (it's a stablecoin, but useful for verification)
 */
export async function getUsdcPrice() {
  try {
    const response = await fetch(
      'https://api.jup.ag/price/v2?ids=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    );
    const data = await response.json();
    return data.data?.['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']?.price || 1;
  } catch {
    return 1; // USDC is always ~$1
  }
}

/**
 * Validate a Solana wallet address
 */
export function isValidWalletAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}
