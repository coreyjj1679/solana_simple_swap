import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleSwapProgram } from "../target/types/simple_swap_program";
import { assert, expect } from "chai";

describe("simple_swap_program", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .SimpleSwapProgram as Program<SimpleSwapProgram>;

  let admin: anchor.web3.Keypair;
  let vault: anchor.web3.Keypair;
  let provider: anchor.Provider;

  beforeEach(async () => {
    admin = anchor.web3.Keypair.generate();
    vault = anchor.web3.Keypair.generate();
    // get SOL for the gas

    provider = anchor.getProvider();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        admin.publicKey,
        anchor.web3.LAMPORTS_PER_SOL * 5
      ),
      "confirmed"
    );

    await program.methods
      .initialize()
      .accounts({
        vault: vault.publicKey,
        admin: admin.publicKey,
      })
      .signers([admin, vault])
      .rpc();
  });
  it("[initialize] shd deploy and set vault auth correctly", async () => {
    const vaultData = await program.account.vault.fetch(vault.publicKey);
    assert.equal(vaultData.authority.toString(), admin.publicKey.toString());
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

  it("[deposit] shd not allow non-admin signer to deposit", async () => {
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
});
