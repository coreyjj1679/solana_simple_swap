use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::system_program::transfer;
declare_id!("13avuvj2qnHq6CwsuYFR7jLrKbbzgGXxscfZCBQR7kJW");

#[program]
pub mod simple_swap_program {
    use system_program::Transfer;

    use super::*;

    // init valut to store SOL
    // Initialize the vault
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.admin.key(); // Set the authority to the admin
        Ok(())
    }

    pub fn deposit_sol(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // only admin is able to deposit
        require!(
            ctx.accounts.signer.key() == ctx.accounts.vault.authority,
            ErrorCode::Unauthorized
        );

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            Transfer {
                from: ctx.accounts.signer.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        );

        transfer(cpi_context, amount)?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32)] // Space for authority
    pub vault: Account<'info, Vault>, // Vault account
    #[account(mut)]
    pub admin: Signer<'info>, // Admin account, who pays for initialization
    pub system_program: Program<'info, System>, // Required for SOL transfers
}
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>, // Signer account for deposits
    #[account(mut)]
    pub vault: Account<'info, Vault>, // Mutable vault account
    pub system_program: Program<'info, System>, // Required for SOL transfers
}

#[account]
pub struct Vault {
    pub authority: Pubkey, // Admin authority
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access.")]
    Unauthorized,
}
