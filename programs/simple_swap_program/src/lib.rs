use anchor_lang::prelude::*;

declare_id!("13avuvj2qnHq6CwsuYFR7jLrKbbzgGXxscfZCBQR7kJW");

#[program]
pub mod simple_swap_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
