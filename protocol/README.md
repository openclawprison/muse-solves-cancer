# MUSE funding protocol

This directory contains the proposed Solana reward-vault program and deterministic payout-manifest tooling. It is source code for review and testing, not a claim that a mainnet contract is deployed.

## Funding path

1. Verify the official Solana Token-2022 mint and decimals for Meta xStock (`METAx`).
2. Launch `$MUSE` with creator fees paid directly in METAx.
3. Initialize the `muse_reward_vault` config PDA with the METAx mint, token program, and one dedicated keeper public key.
4. Use Pump.fun's official creator-fee sharing instructions once:
   - Muse reward-vault PDA: `5,000` basis points;
   - operations multisig: `5,000` basis points.
5. Pump.fun's one-time update revokes the fee-sharing admin. Subsequent creator-fee distribution is permissionless.
6. Pump distribution sends the research allocation directly into the vault's METAx ATA.
7. Every closed 20-minute epoch produces a deterministic public JSON manifest. The configured keeper commits its root and exact full-balance budget onchain.
8. Any keeper can submit each Merkle leaf. The program pays METAx to the bound recipient ATA and creates a receipt PDA, preventing duplicate payment.

The reward vault intentionally has no owner withdrawal instruction. Before production deployment, the program ID must be replaced with `anchor keys sync`, tests must run against a local validator, an independent security audit must be completed, and the deployed program's upgrade authority must be revoked.

## What the program enforces

- only completed 20-minute epochs can be committed;
- epoch IDs strictly increase;
- only the configured keeper can commit an epoch root;
- every non-empty epoch commits the entire unreserved METAx balance, leaving no discretionary reserve;
- a payout is cryptographically bound to epoch, index, wallet, and METAx base-unit amount;
- one receipt PDA per leaf prevents replay;
- the config account remains rent-exempt;
- there is no emergency drain or admin withdrawal path.

## What remains offchain

Scientific quality cannot be proven by a Solana program. Source screening, scoring, conflict checks, reviewer independence, and artifact provenance remain public offchain processes. The manifest hash makes the committed record tamper-evident, but the research community must still audit the methodology and decisions. Scientific peer review remains part of the research workflow; it is not an onchain payout-approval gate.

## Local checks

```bash
npm run protocol:test
anchor build
anchor test
```

After the program is built and the public addresses are known:

```bash
MUSE_REWARD_MINT=<METAx mint> MUSE_KEEPER_ADDRESS=<keeper public key> npm run protocol:init
npm run protocol:manifest -- <epoch-id> <vault-balance-base-units> <scores.json> <manifest.json>
npm run protocol:settle -- <manifest.json>
```

For evidence-graph epochs, pass a fifth JSON file so the manifest commits the science calculation as well as the payout root:

```bash
npm run protocol:manifest -- <epoch-id> <vault-balance-base-units> <scores.json> <manifest.json> <provenance.json>
```

The provenance file can contain `scienceProtocol`, `rewardRuleVersion`, `rewardCalculationHash`, `consensusSetHash`, and `validatorSetHash`. These values are normalized and included in the manifest hash; changing any one of them changes the committed manifest without changing the payout Merkle root.

`ANCHOR_PROVIDER_URL` selects the Solana RPC and `ANCHOR_WALLET` points to the local deployer or keeper keypair. Never commit or paste that keypair into the website. The mint and keeper public key are intentionally late-bound launch inputs.

The Node tests cover exact full-balance allocation, deterministic remainders, manifest determinism, proof verification, tamper detection, and duplicate recipients. Anchor/Solana tooling is required for program compilation and validator tests.
