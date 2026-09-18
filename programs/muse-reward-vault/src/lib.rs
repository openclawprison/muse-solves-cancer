use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked},
};

// Placeholder only. Run anchor keys sync before any deployment.
declare_id!("11111111111111111111111111111111");

const CONFIG_SEED: &[u8] = b"config";
const EPOCH_SEED: &[u8] = b"epoch";
const RECEIPT_SEED: &[u8] = b"receipt";
const LEAF_DOMAIN: &[u8] = b"MUSE_PAYOUT_V1";
const CADENCE_SECONDS: i64 = 20 * 60;
const MAX_PROOF_DEPTH: usize = 32;

#[program]
pub mod muse_reward_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, reviewers: [Pubkey; 3]) -> Result<()> {
        require!(reviewers.iter().all(|key| *key != Pubkey::default()), MuseError::InvalidReviewer);
        require!(reviewers[0] != reviewers[1] && reviewers[0] != reviewers[2] && reviewers[1] != reviewers[2], MuseError::DuplicateReviewer);
        let config = &mut ctx.accounts.config;
        config.version = 1;
        config.bump = ctx.bumps.config;
        config.cadence_seconds = CADENCE_SECONDS;
        config.reviewers = reviewers;
        config.reward_mint = ctx.accounts.reward_mint.key();
        config.reward_token_program = ctx.accounts.reward_token_program.key();
        config.reward_decimals = ctx.accounts.reward_mint.decimals;
        config.latest_epoch = (Clock::get()?.unix_timestamp / CADENCE_SECONDS).saturating_sub(1) as u64;
        config.reserved_reward_units = 0;
        config.total_committed_units = 0;
        config.total_paid_units = 0;
        Ok(())
    }

    pub fn create_epoch(ctx: Context<CreateEpoch>, epoch_id: u64, root: [u8; 32], manifest_hash: [u8; 32], total_reward_units: u64, leaf_count: u32) -> Result<()> {
        require!(ctx.accounts.reviewer_a.key() != ctx.accounts.reviewer_b.key(), MuseError::DuplicateReviewer);
        require!(is_reviewer(&ctx.accounts.config, &ctx.accounts.reviewer_a.key()), MuseError::UnauthorizedReviewer);
        require!(is_reviewer(&ctx.accounts.config, &ctx.accounts.reviewer_b.key()), MuseError::UnauthorizedReviewer);
        require!(total_reward_units > 0 && leaf_count > 0, MuseError::EmptyEpoch);
        let current_epoch = (Clock::get()?.unix_timestamp / ctx.accounts.config.cadence_seconds) as u64;
        require!(epoch_id < current_epoch, MuseError::EpochStillOpen);
        require!(epoch_id > ctx.accounts.config.latest_epoch, MuseError::EpochOutOfOrder);
        let spendable = ctx.accounts.reward_vault.amount.saturating_sub(ctx.accounts.config.reserved_reward_units);
        require!(total_reward_units == spendable, MuseError::MustCommitAllUnreservedFunds);

        let epoch = &mut ctx.accounts.epoch;
        epoch.config = ctx.accounts.config.key();
        epoch.id = epoch_id;
        epoch.bump = ctx.bumps.epoch;
        epoch.root = root;
        epoch.manifest_hash = manifest_hash;
        epoch.total_reward_units = total_reward_units;
        epoch.paid_reward_units = 0;
        epoch.leaf_count = leaf_count;
        epoch.claimed_count = 0;
        epoch.created_at = Clock::get()?.unix_timestamp;
        epoch.reviewer_a = ctx.accounts.reviewer_a.key();
        epoch.reviewer_b = ctx.accounts.reviewer_b.key();

        let config = &mut ctx.accounts.config;
        config.latest_epoch = epoch_id;
        config.reserved_reward_units = config.reserved_reward_units.checked_add(total_reward_units).ok_or(MuseError::MathOverflow)?;
        config.total_committed_units = config.total_committed_units.checked_add(total_reward_units).ok_or(MuseError::MathOverflow)?;
        Ok(())
    }

    pub fn pay_leaf(ctx: Context<PayLeaf>, index: u32, amount_reward_units: u64, proof: Vec<[u8; 32]>) -> Result<()> {
        require!(index < ctx.accounts.epoch.leaf_count, MuseError::InvalidLeafIndex);
        require!(amount_reward_units > 0, MuseError::InvalidAmount);
        require!(proof.len() <= MAX_PROOF_DEPTH, MuseError::ProofTooDeep);
        let leaf = payout_leaf(ctx.accounts.epoch.id, index, &ctx.accounts.recipient.key(), amount_reward_units);
        require!(verify_sorted_proof(leaf, &proof, ctx.accounts.epoch.root), MuseError::InvalidProof);

        let signer_seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[ctx.accounts.config.bump]]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.reward_token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.reward_vault.to_account_info(),
                    mint: ctx.accounts.reward_mint.to_account_info(),
                    to: ctx.accounts.recipient_reward_account.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                signer_seeds,
            ),
            amount_reward_units,
            ctx.accounts.config.reward_decimals,
        )?;

        let epoch = &mut ctx.accounts.epoch;
        epoch.paid_reward_units = epoch.paid_reward_units.checked_add(amount_reward_units).ok_or(MuseError::MathOverflow)?;
        epoch.claimed_count = epoch.claimed_count.checked_add(1).ok_or(MuseError::MathOverflow)?;
        require!(epoch.paid_reward_units <= epoch.total_reward_units, MuseError::EpochBudgetExceeded);
        let config = &mut ctx.accounts.config;
        config.reserved_reward_units = config.reserved_reward_units.checked_sub(amount_reward_units).ok_or(MuseError::MathOverflow)?;
        config.total_paid_units = config.total_paid_units.checked_add(amount_reward_units).ok_or(MuseError::MathOverflow)?;
        let receipt = &mut ctx.accounts.receipt;
        receipt.epoch = epoch.key();
        receipt.index = index;
        receipt.recipient = ctx.accounts.recipient.key();
        receipt.amount_reward_units = amount_reward_units;
        receipt.paid_at = Clock::get()?.unix_timestamp;
        receipt.bump = ctx.bumps.receipt;
        Ok(())
    }
}

fn is_reviewer(config: &Config, key: &Pubkey) -> bool { config.reviewers.iter().any(|reviewer| reviewer == key) }

fn payout_leaf(epoch_id: u64, index: u32, recipient: &Pubkey, amount: u64) -> [u8; 32] {
    hashv(&[LEAF_DOMAIN, &epoch_id.to_le_bytes(), &index.to_le_bytes(), recipient.as_ref(), &amount.to_le_bytes()]).to_bytes()
}

fn verify_sorted_proof(mut node: [u8; 32], proof: &[[u8; 32]], root: [u8; 32]) -> bool {
    for sibling in proof { node = if node <= *sibling { hashv(&[&node, sibling]).to_bytes() } else { hashv(&[sibling, &node]).to_bytes() }; }
    node == root
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = payer, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    pub reward_mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = payer, associated_token::mint = reward_mint, associated_token::authority = config, associated_token::token_program = reward_token_program)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub reward_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct CreateEpoch<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(constraint = reward_mint.key() == config.reward_mint @ MuseError::WrongRewardMint)]
    pub reward_mint: InterfaceAccount<'info, Mint>,
    #[account(associated_token::mint = reward_mint, associated_token::authority = config, associated_token::token_program = reward_token_program)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(init, payer = reviewer_a, space = 8 + Epoch::INIT_SPACE, seeds = [EPOCH_SEED, &epoch_id.to_le_bytes()], bump)]
    pub epoch: Account<'info, Epoch>,
    #[account(mut)]
    pub reviewer_a: Signer<'info>,
    pub reviewer_b: Signer<'info>,
    #[account(address = config.reward_token_program)]
    pub reward_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(index: u32)]
pub struct PayLeaf<'info> {
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, constraint = epoch.config == config.key() @ MuseError::WrongConfig, seeds = [EPOCH_SEED, &epoch.id.to_le_bytes()], bump = epoch.bump)]
    pub epoch: Account<'info, Epoch>,
    #[account(init, payer = payer, space = 8 + Receipt::INIT_SPACE, seeds = [RECEIPT_SEED, epoch.key().as_ref(), &index.to_le_bytes()], bump)]
    pub receipt: Account<'info, Receipt>,
    #[account(constraint = reward_mint.key() == config.reward_mint @ MuseError::WrongRewardMint)]
    pub reward_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = reward_mint, associated_token::authority = config, associated_token::token_program = reward_token_program)]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: The Merkle leaf binds this public key.
    pub recipient: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = payer, associated_token::mint = reward_mint, associated_token::authority = recipient, associated_token::token_program = reward_token_program)]
    pub recipient_reward_account: InterfaceAccount<'info, TokenAccount>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(address = config.reward_token_program)]
    pub reward_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub version: u8,
    pub bump: u8,
    pub cadence_seconds: i64,
    pub reviewers: [Pubkey; 3],
    pub reward_mint: Pubkey,
    pub reward_token_program: Pubkey,
    pub reward_decimals: u8,
    pub latest_epoch: u64,
    pub reserved_reward_units: u64,
    pub total_committed_units: u64,
    pub total_paid_units: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Epoch {
    pub config: Pubkey,
    pub id: u64,
    pub bump: u8,
    pub root: [u8; 32],
    pub manifest_hash: [u8; 32],
    pub total_reward_units: u64,
    pub paid_reward_units: u64,
    pub leaf_count: u32,
    pub claimed_count: u32,
    pub created_at: i64,
    pub reviewer_a: Pubkey,
    pub reviewer_b: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub epoch: Pubkey,
    pub index: u32,
    pub recipient: Pubkey,
    pub amount_reward_units: u64,
    pub paid_at: i64,
    pub bump: u8,
}

#[error_code]
pub enum MuseError {
    #[msg("Reviewer keys must be non-zero.")] InvalidReviewer,
    #[msg("Reviewer keys or signatures must be distinct.")] DuplicateReviewer,
    #[msg("Signer is not a configured reviewer.")] UnauthorizedReviewer,
    #[msg("Epoch must contain a positive payout.")] EmptyEpoch,
    #[msg("Epoch is still open.")] EpochStillOpen,
    #[msg("Epoch ids must increase.")] EpochOutOfOrder,
    #[msg("Each epoch must commit the entire unreserved METAx balance.")] MustCommitAllUnreservedFunds,
    #[msg("Invalid Merkle proof.")] InvalidProof,
    #[msg("Merkle proof is too deep.")] ProofTooDeep,
    #[msg("Invalid payout index.")] InvalidLeafIndex,
    #[msg("Payout must be positive.")] InvalidAmount,
    #[msg("Payout exceeds epoch budget.")] EpochBudgetExceeded,
    #[msg("Epoch belongs to another config.")] WrongConfig,
    #[msg("Wrong reward mint.")] WrongRewardMint,
    #[msg("Arithmetic overflow or underflow.")] MathOverflow,
}
