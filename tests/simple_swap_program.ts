import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SimpleSwapProgram } from "../target/types/simple_swap_program";

describe("simple_swap_program", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace
    .SimpleSwapProgram as Program<SimpleSwapProgram>;

  let admin: anchor.web3.Keypair;
  let vault: anchor.web3.Keypair;

  before(async () => {
    admin = anchor.web3.Keypair.generate();
    vault = anchor.web3.Keypair.generate();

    // get SOL for the gas
    const provider = anchor.getProvider();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        admin.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
  });
  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.methods
      .initialize()
      .accounts({
        vault: vault.publicKey,
        admin: admin.publicKey,
      })
      .signers([admin, vault])
      .rpc();
    console.log("Your transaction signature", tx);
  });
});
