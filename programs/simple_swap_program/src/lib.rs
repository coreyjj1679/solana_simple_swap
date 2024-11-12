use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_lang::system_program::transfer;
use anchor_spl::token::{self, Token, TokenAccount, Transfer as SplTransfer};
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};
use system_program::Transfer;

declare_id!("13avuvj2qnHq6CwsuYFR7jLrKbbzgGXxscfZCBQR7kJW");
const SOL_USD_HEX: &str = "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
#[program]
pub mod simple_swap_program {
    use super::*;

    // Initialize the vault
    pub fn initialize(ctx: Context<Initialize>, usdc_mint: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.authority = *ctx.accounts.admin.key; // Initialize authority

        let vault_usdc = &mut ctx.accounts.vault_usdc;
        vault_usdc.authority_usdc = *ctx.accounts.admin.key;
        vault_usdc.token_mint = usdc_mint;

        Ok(())
    }

    pub fn deposit_sol(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // only admin is able to deposit
        require!(
            ctx.accounts.signer.key() == ctx.accounts.vault.authority,
            ErrorCode::Unauthorized
        );

        require!(amount > 0, ErrorCode::InvalidAmount);

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

    pub fn withdraw_sol(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        // only admin is able withdraw
        require!(
            ctx.accounts.signer.key() == ctx.accounts.vault.authority,
            ErrorCode::Unauthorized
        );
        require!(amount > 0, ErrorCode::InvalidAmount);

        let vault_balance = **ctx.accounts.vault.to_account_info().try_borrow_lamports()?;
        // ensure vault has enough SOL
        require!(vault_balance >= amount, ErrorCode::InsufficientFunds);

        **ctx
            .accounts
            .vault
            .to_account_info()
            .try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .signer
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;
        Ok(())
    }

    pub fn buy_sol(ctx: Context<Swap>, amount_usdc: u64) -> Result<()> {
        require!(amount_usdc > 0, ErrorCode::InvalidAmount);

        // get SOL price from pyth
        let maximum_age: u64 = 30;
        let feed_id: [u8; 32] = get_feed_id_from_hex(SOL_USD_HEX)?;
        let price_update = &mut ctx.accounts.price_update;
        let price = price_update.get_price_no_older_than(&Clock::get()?, maximum_age, &feed_id)?;

        // ensure the price is correct
        require!(price.price > 0, ErrorCode::InvalidPriceFeed);

        // calculate amount of SOL to pay
        let amount_sol = amount_usdc / price.price as u64;
        let token_program = &ctx.accounts.token_program;

        let vault_balance = **ctx.accounts.vault.to_account_info().try_borrow_lamports()?;
        // ensure vault has enough SOL
        require!(vault_balance >= amount_sol, ErrorCode::InsufficientFunds);

        // receive USDC
        let cpi_accounts = SplTransfer {
            from: ctx.accounts.from_ata.to_account_info().clone(),
            to: ctx.accounts.to_ata.to_account_info().clone(),
            authority: ctx.accounts.signer.to_account_info().clone(),
        };
        let cpi_program = token_program.to_account_info();
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount_usdc)?;

        // send sol
        **ctx
            .accounts
            .vault
            .to_account_info()
            .try_borrow_mut_lamports()? -= amount_sol;
        **ctx
            .accounts
            .signer
            .to_account_info()
            .try_borrow_mut_lamports()? += amount_sol;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32)] // Space for authority
    pub vault: Account<'info, Vault>, // Vault account

    #[account(init, payer = admin, space = 8 + 32 + 32)] // Space for authority
    pub vault_usdc: Account<'info, VaultSPL>, // Vault account
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

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub signer: Signer<'info>, // Signer account for withdrawals
    #[account(mut)]
    pub vault: Account<'info, Vault>, // Mutable vault account
    pub system_program: Program<'info, System>, // Required for SOL transfers
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub signer: Signer<'info>, // Signer account for withdrawals
    #[account(mut)]
    pub vault: Account<'info, Vault>, // Mutable vault account
    #[account(mut)]
    pub from_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub to_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_usdc: Account<'info, VaultSPL>,
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>, // Required for SOL transfers
    pub token_program: Program<'info, Token>,
    pub price_update: Account<'info, PriceUpdateV2>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey, // Admin authority
}
#[account]
pub struct VaultSPL {
    pub authority_usdc: Pubkey, // Admin authority
    pub token_mint: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized access.")]
    Unauthorized,
    #[msg("Invalid amount.")]
    InvalidAmount,
    #[msg("Insufficient funds in vault.")]
    InsufficientFunds,
    #[msg("Invalid price feed from Pyth")]
    InvalidPriceFeed,
}
