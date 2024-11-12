import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleSwapProgram } from "../target/types/simple_swap_program";
import { assert, expect } from "chai";
import {
  createAssociatedTokenAccount,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

export async function createAndMint(
  provider: anchor.Provider,
  payer: anchor.web3.Keypair,
  owner: anchor.web3.PublicKey,
  mint_dest: anchor.web3.Keypair,
  amount: number
) {
  const mint = await createMint(
    provider.connection,
    payer,
    payer.publicKey,
    null,
    9
  );

  const tokenAccount = await createAssociatedTokenAccount(
    provider.connection,
    payer,
    mint,
    mint_dest.publicKey
  );

  await mintTo(
    provider.connection,
    payer,
    mint,
    tokenAccount,
    owner,
    amount, // because decimals for the mint are set to 9
    [payer]
  );

  return mint;
}

describe("simple_swap_program", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .SimpleSwapProgram as Program<SimpleSwapProgram>;

  let admin: anchor.web3.Keypair;
  let vault: anchor.web3.Keypair;
  let vaultUSDC: anchor.web3.Keypair;

  let usdcMint: anchor.web3.PublicKey;

  let provider: anchor.Provider;

  beforeEach(async () => {
    provider = anchor.getProvider();
    admin = anchor.web3.Keypair.generate();
    vault = anchor.web3.Keypair.generate();
    vaultUSDC = anchor.web3.Keypair.generate();

    // get SOL
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        admin.publicKey,
        anchor.web3.LAMPORTS_PER_SOL * 5
      ),
      "confirmed"
    );

    usdcMint = await createAndMint(
      provider,
      admin,
      admin.publicKey,
      vaultUSDC,
      100_000_000
    );

    await program.methods
      .initialize(usdcMint)
      .accounts({
        vault: vault.publicKey,
        vaultUsdc: vaultUSDC.publicKey,
        admin: admin.publicKey,
      })
      .signers([admin, vault, vaultUSDC])
      .rpc();
  });

  it("[initialize] shd deploy and set vault auth correctly", async () => {
    const vaultData = await program.account.vault.fetch(vault.publicKey);
    const valutUsdcData = await program.account.vaultSpl.fetch(
      vaultUSDC.publicKey
    );

    assert.equal(vaultData.authority.toString(), admin.publicKey.toString());
    assert.equal(
      valutUsdcData.authorityUsdc.toString(),
      admin.publicKey.toString()
    );
  });

  it("[deposit] shd be able to deposit from admin", async () => {
    const depositAmount = new anchor.BN(10_000);
    const vaultBalBefore = await provider.connection.getBalance(
      vault.publicKey
    );
    await program.methods
      .depositSol(depositAmount)
      .accounts({
        vault: vault.publicKey,
        signer: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const vaultBalAfter = await provider.connection.getBalance(vault.publicKey);
    const valutChanges = Math.abs(vaultBalAfter - vaultBalBefore);

    // ensure correct amount of SOL is deposited to the vault
    assert.equal(
      valutChanges,
      depositAmount.toNumber(),
      "Vault balance does not match."
    );
  });

  it("[deposit] shd fail from non-admin signer", async () => {
    try {
      const random_dude = anchor.web3.Keypair.generate();
      await program.methods
        .depositSol(new anchor.BN(100))
        .accounts({
          vault: vault.publicKey,
          signer: random_dude.publicKey,
        })
        .signers([random_dude])
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6000);
    }
  });

  it("[deposit] shd fail invalid deposit amount", async () => {
    try {
      await program.methods
        .depositSol(new anchor.BN(0))
        .accounts({
          vault: vault.publicKey,
          signer: admin.publicKey,
        })
        .signers([admin])
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6001);
    }
  });

  it("[withdraw] simple withdraw", async () => {
    const depositAmount = new anchor.BN(10_000);
    const vaultBalBefore = await provider.connection.getBalance(
      vault.publicKey
    );

    await program.methods
      .depositSol(depositAmount)
      .accounts({
        vault: vault.publicKey,
        signer: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    await program.methods
      .withdrawSol(depositAmount)
      .accounts({
        vault: vault.publicKey,
        signer: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const vaultBalAfter = await provider.connection.getBalance(vault.publicKey);
    assert.equal(
      vaultBalAfter - vaultBalBefore,
      0,
      "Vault balance does not match."
    );
  });

  it("[withdraw] shd fail when amount exceed balance", async () => {
    try {
      // deposit 10K
      const depositAmount = new anchor.BN(10_000);
      await program.methods
        .depositSol(depositAmount)
        .accounts({
          vault: vault.publicKey,
          signer: admin.publicKey,
        })
        .signers([admin])
        .rpc();

      const vaultBalBefore = await provider.connection.getBalance(
        vault.publicKey
      );
      const invalidAmount = new anchor.BN(vaultBalBefore + 1);
      // withdraw with a slightly higher amount
      await program.methods
        .withdrawSol(invalidAmount)
        .accounts({
          vault: vault.publicKey,
          signer: admin.publicKey,
        })
        .signers([admin])
        .rpc();
    } catch (err) {
      expect((err as anchor.AnchorError).error.errorCode.number).to.equal(6002);
    }
  });

  it.skip("[swap] simple swap", async () => {
    const depositAmount = new anchor.BN(100_000_000);
    const buySize = new anchor.BN(500_000); // in USDC
    const FIXED_RATE = new anchor.BN(1_000); // update this when integrated to pyth
    const solAmount = buySize.div(FIXED_RATE);
    await program.methods
      .depositSol(depositAmount)
      .accounts({
        vault: vault.publicKey,
        signer: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const toATA = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin,
      usdcMint,
      admin.publicKey
    );

    // mints 1mil USDC to the signer
    await mintTo(
      provider.connection,
      admin,
      usdcMint,
      toATA.address,
      admin,
      1_000_000
    );

    const fromAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      admin,
      usdcMint,
      admin.publicKey
    );

    const buyerSolBalBefore = await provider.connection.getBalance(
      admin.publicKey
    );
    await program.methods
      .buySol(new anchor.BN(buySize))
      .accounts({
        vault: vault.publicKey,
        vaultUsdc: vaultUSDC.publicKey,
        signer: admin.publicKey,
        owner: admin.publicKey,
        fromAta: fromAta.address,
        toAta: toATA.address,
      })
      .signers([admin])
      .rpc();

    const buyerSolBalAfter = await provider.connection.getBalance(
      admin.publicKey
    );

    assert.equal(
      buyerSolBalAfter - buyerSolBalBefore,
      solAmount.toNumber(),
      "Recevied SOL amount does not match."
    );
  });
});
