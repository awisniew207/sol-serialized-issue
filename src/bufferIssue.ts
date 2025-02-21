import * as ethers from "ethers";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LIT_RPC, LIT_NETWORK, LIT_ABILITY } from "@lit-protocol/constants";
import { EthWalletProvider } from "@lit-protocol/lit-auth-client";
import { LitActionResource } from "@lit-protocol/auth-helpers";
import {
  api,
  EthereumLitTransaction,
  SerializedTransaction,
  SignTransactionWithEncryptedKeyParams,
} from "@lit-protocol/wrapped-keys";
import {
  Transaction,
  VersionedTransaction,
  PublicKey,
  Connection,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
  MessageV0 as VersionedMessage,
} from "@solana/web3.js";

const { signTransactionWithEncryptedKey, exportPrivateKey } = api;

import { getEnv } from "./utils";

const ETHEREUM_PRIVATE_KEY = getEnv("ETHEREUM_PRIVATE_KEY");

export interface SolanaWalletInfo {
  publicKey: string;
  wrappedKeyId: string;
}

/**
 * Signs a transaction using a wrapped key.
 *
 * By default, this function uses a manual signing process:
 *   1. It exports the decrypted private key via exportPrivateKey.
 *   2. It deserializes the provided serialized transaction.
 *   3. It creates a Solana Keypair from the decrypted key and signs the transaction.
 *
 * If you set `useEncryptedSigning` to true, then it will instead attempt to use
 * the native signTransactionWithEncryptedKey functionality.
 *
 * @param pkpPublicKey - The PKP public key.
 * @param evmOrSolana - The network identifier ("evm" | "solana").
 * @param wrappedKeyId - The wrapped key ID.
 * @param unsignedTransaction - The unsigned transaction to sign.
 * @param broadcastTransaction - Whether to broadcast the transaction.
 * @param useEncryptedSigning - Optional flag to use the native signing function.
 * @returns A base64-encoded signed transaction.
 */
export const signTransactionWithWrappedKey = async (
  pkpPublicKey: string,
  evmOrSolana: "evm" | "solana",
  wrappedKeyId: string,
  unsignedTransaction: EthereumLitTransaction | SerializedTransaction,
  broadcastTransaction: boolean,
): Promise<string> => {
  let litNodeClient: LitNodeClient;

  try {
    const ethersSigner = new ethers.Wallet(
      ETHEREUM_PRIVATE_KEY,
      new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
    );

    litNodeClient = new LitNodeClient({
      litNetwork: LIT_NETWORK.DatilDev,
      debug: false,
    });
    await litNodeClient.connect();

    const pkpSessionSigs = await litNodeClient.getPkpSessionSigs({
      pkpPublicKey,
      authMethods: [
        await EthWalletProvider.authenticate({
          signer: ethersSigner,
          litNodeClient,
          expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
        }),
      ],
      resourceAbilityRequests: [
        {
          resource: new LitActionResource("*"),
          ability: LIT_ABILITY.LitActionExecution,
        },
      ],
      expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
    });

    if (evmOrSolana !== "solana" || !("serializedTransaction" in unsignedTransaction)) {
      throw new Error("Invalid transaction type or missing serialized transaction");
    }
    
    try {
      // Deserialize as VersionedTransaction as per Jupiter's API docs
      console.log("Successfully deserialized as versioned transaction");

      // For encrypted signing, deserialize first
      const transactionBuffer = Buffer.from(unsignedTransaction.serializedTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(transactionBuffer);
      const message = transaction.message;
      
      const serializedTransaction: SerializedTransaction = {
        serializedTransaction: Buffer.from(message.serialize()).toString('base64'),
        chain: unsignedTransaction.chain
      };
      
      const signedTransaction = await signTransactionWithEncryptedKey({
        pkpSessionSigs,
        network: "solana",
        id: wrappedKeyId,
        unsignedTransaction: serializedTransaction,
        broadcast: broadcastTransaction,
        litNodeClient,
      } as SignTransactionWithEncryptedKeyParams);
      console.log("✅ Signed transaction via signTransactionWithEncryptedKey");
      return signedTransaction;
    } catch (innerError) {
      console.error("Failed to sign transaction:", innerError);
      throw innerError;
    }
  } catch (error) {
    console.error("Outer error:", error);
    throw error;
  } finally {
    litNodeClient!.disconnect();
    console.log("🔄 Disconnected from Lit network");
  }
};
