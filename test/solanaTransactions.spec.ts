import { expect } from "chai";
import * as ethers from "ethers";
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import { LIT_RPC, LIT_NETWORK, LIT_ABILITY } from "@lit-protocol/constants";
import { EthWalletProvider } from "@lit-protocol/lit-auth-client";
import { LitActionResource } from "@lit-protocol/auth-helpers";
import { GeneratePrivateKeyResult, SerializedTransaction } from "@lit-protocol/wrapped-keys";
import fetch from "node-fetch";

import { getEnv, mintPkp } from "../src/utils";
import { generateWrappedKey } from "../src/generateWrappedKey";
import { signTransactionWithWrappedKey as signWithBuffer } from "../src/bufferIssue";
import { signTransactionWithWrappedKey as signWithDeserialize } from "../src/deserializeIssue";

const ETHEREUM_PRIVATE_KEY = getEnv("ETHEREUM_PRIVATE_KEY");

interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot: number;
  timeTaken: number;
}

describe("Signing a Jupiter swap transaction", () => {
  let mintedPkp;
  let generatedSolanaPublicKey: PublicKey;
  let generateWrappedKeyResponse: GeneratePrivateKeyResult;
  let litNodeClient: LitNodeClient;
  let pkpSessionSigs;
  let jupiterTransaction: string;

  before(async function () {
    this.timeout(120_000);
    const ethersSigner = new ethers.Wallet(
      ETHEREUM_PRIVATE_KEY,
      new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
    );

    // Connect to Lit network
    litNodeClient = new LitNodeClient({
      litNetwork: LIT_NETWORK.DatilDev,
      debug: false,
    });
    await litNodeClient.connect();

    // Mint PKP if needed
    mintedPkp = await mintPkp(ethersSigner);

    // Generate wrapped key
    generateWrappedKeyResponse = (await generateWrappedKey(
      mintedPkp!.publicKey,
      "solana",
      "This is a Dev Guide code example testing Solana key"
    )) as GeneratePrivateKeyResult;

    if (!generateWrappedKeyResponse) {
      throw new Error("Failed to generate wrapped key");
    }

    generatedSolanaPublicKey = new PublicKey(
      generateWrappedKeyResponse.generatedPublicKey
    );

    // Get real session signatures
    pkpSessionSigs = await litNodeClient.getPkpSessionSigs({
      pkpPublicKey: mintedPkp!.publicKey,
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

    // Get Jupiter transaction once for both tests
    const quoteResponse = await (
      await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112\
&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\
&amount=${LAMPORTS_PER_SOL.toString()}\
&slippageBps=50`
      )
    ).json() as { error?: string } & JupiterQuoteResponse;

    if (quoteResponse.error) {
      throw new Error(`Failed to get quote: ${quoteResponse.error}`);
    }

    const response = await (
      await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: generatedSolanaPublicKey.toString(),
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: 'auto'
        }),
      })
    ).json() as { swapTransaction: string, error?: string };

    if (response.error) {
      throw new Error(`Failed to get swap transaction: ${response.error}`);
    }

    if (!response.swapTransaction) {
      throw new Error('Failed to get swap transaction from Jupiter');
    }

    jupiterTransaction = response.swapTransaction;
  });

  after(async function() {
    if (litNodeClient) {
      await litNodeClient.disconnect();
    }
  });

  it("should sign using buffer approach", async () => {
    const litTransaction: SerializedTransaction = {
      serializedTransaction: jupiterTransaction,
      chain: "mainnet-beta"
    };

    const signedTransaction = await signWithBuffer(
      mintedPkp!.publicKey,
      "solana",
      generateWrappedKeyResponse.id,
      litTransaction,
      true  // Enable broadcasting
    );

    expect(signedTransaction).to.match(RegExp("^[A-Za-z0-9+/]+={0,2}$"));

    const signedTransactionBuf = Buffer.from(signedTransaction as string, 'base64');
    const deserializedSignedTransaction = VersionedTransaction.deserialize(signedTransactionBuf);
    expect(deserializedSignedTransaction).to.exist;
  }).timeout(120_000);

  it("should sign using deserialize approach", async () => {
    const litTransaction: SerializedTransaction = {
      serializedTransaction: jupiterTransaction,
      chain: "mainnet-beta"
    };

    const signedTransaction = await signWithDeserialize(
      mintedPkp!.publicKey,
      "solana",
      generateWrappedKeyResponse.id,
      litTransaction,
      true  // Enable broadcasting
    );

    expect(signedTransaction).to.match(RegExp("^[A-Za-z0-9+/]+={0,2}$"));

    const signedTransactionBuf = Buffer.from(signedTransaction as string, 'base64');
    const deserializedSignedTransaction = VersionedTransaction.deserialize(signedTransactionBuf);
    expect(deserializedSignedTransaction).to.exist;
  }).timeout(120_000);
});