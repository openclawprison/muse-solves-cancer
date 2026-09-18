# MUSE funding protocol

This directory contains the proposed Solana reward-vault program and deterministic payout-manifest tooling. It is source code for review and testing, not a claim that a mainnet contract is deployed.

## Funding path

1. Verify the official Solana Token-2022 mint and decimals for Meta xStock (`METAx`).
2. Launch `$MUSE` with creator fees paid directly in METAx.
3. Initialize the `muse_reward_vault` config PDA with the METAx mint, token program, and three independent reviewer keys.
4. Use Pump.fun's official creator-fee sharing instructions once:
   - Muse reward-vault PDA: `5,000` basis points;
   - operations multisig: `5,000` basis points.
5. Pump.fun's one-time update revokes the fee-sharing admin. Subsequent creator-fee distribution is permissionless.
6. Pump distribution sends the research allocation directly into the vault's METAx ATA.
7. Every closed 20-minute epoch produces a public JSON manifest. Two of the three configured reviewers must sign the same root and budget onchain.
8. Any keeper can submit each Merkle leaf. The program pays METAx to the bound recipient ATA and creates a receipt PDA, preventing duplicate payment.

The reward vault intentionally has no owner withdrawal instruction. Before production deployment, the program ID must be replaced with `anchor keys sync`, tests must run against a local validator, an independent security audit must be completed, and the deployed program's upgrade authority must be revoked.

## What the program enforces

- only completed 20-minute epochs can be committed;
- epoch IDs strictly increase;
- two distinct configured reviewers must approve each epoch;
- every non-empty epoch commits the entire unreserved METAx balance, leaving no discretionary reserve;
- a payout is cryptographically bound to epoch, index, wallet, and METAx base-unit amount;
- one receipt PDA per leaf prevents replay;
- the config account remains rent-exempt;
- there is no emergency drain or admin withdrawal path.

## What remains offchain

Scientific quality cannot be proven by a Solana program. Source screening, scoring, conflict checks, reviewer independence, and artifact provenance remain public offchain processes. The manifest hash makes the approved record tamper-evident, but the research community must still audit the methodology and decisions.

## Local checks

```bash
npm run protocol:test
anchor build
anchor test
```

The Node tests cover manifest determinism, proof verification, tamper detection, and duplicate recipients. Anchor/Solana tooling is required for program compilation and validator tests.
