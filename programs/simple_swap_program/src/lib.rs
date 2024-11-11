use anchor_lang::prelude::*;
use solana_program::system_instruction;

declare_id!("13avuvj2qnHq6CwsuYFR7jLrKbbzgGXxscfZCBQR7kJW");

#[program]
pub mod simple_swap_program {
    use super::*;

    // init valut to store SOL
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        // will be the deployer in this sceranio
        vault.authority = ctx.accounts.admin.key();
        vault.balance = 0; // init bal

        Ok(())
    }

    pub fn deposit_sol(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let admin = &ctx.accounts.admin;

        let transfer_instruction = system_instruction::transfer(
            admin.key,
            ctx.accounts.vault.to_account_info().key,
            amount,
        );

        anchor_lang::solana_program::program::invoke_signed(
            &transfer_instruction,
            &[
                admin.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[],
        )?;

        let vault = &mut ctx.accounts.vault;
        vault.balance += amount;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 8)]
    pub vault: Account<'info, Vault>, // Vault account
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub admin: Signer<'info>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey, // admin
    pub balance: u64,
}
