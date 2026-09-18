# Mainnet launch checklist

No item in this list is optional for a production claim.

- [ ] Complete legal review of token launch, fee language, charitable/research representations, sanctions, tax, and contributor payments in every relevant jurisdiction.
- [ ] Select three independent reviewer public keys; one founder controls no more than one.
- [ ] Select a two-of-three or stronger operations multisig.
- [ ] Verify METAx eligibility, official Solana Token-2022 mint, decimals, liquidity, and jurisdiction restrictions directly with the issuer.
- [ ] Replace the placeholder program id with `anchor keys sync`.
- [ ] Compile the Anchor program with pinned toolchains and publish the reproducible build instructions.
- [ ] Add local-validator integration tests for initialization, epoch creation, valid payout, invalid proof, duplicate receipt, insufficient reserve, unauthorized reviewer, open epoch, and rent preservation.
- [ ] Deploy to devnet and run multiple funded 20-minute cycles end to end.
- [ ] Obtain an independent Solana security audit and resolve findings.
- [ ] Launch the Pump.fun coin from the intended creator address.
- [ ] Initialize the audited Muse vault PDA.
- [ ] Configure Pump.fun creator-fee sharing once: 5,000 bps METAx reward-vault PDA and 5,000 bps operations multisig.
- [ ] Verify the Pump sharing-config account and its revoked admin onchain.
- [ ] Publish token mint, program id, vault PDA, sharing-config PDA, reviewer keys, operations multisig, source revision, audit, and binary hash.
- [ ] Revoke the Solana program upgrade authority and verify it onchain.
- [ ] Verify end-to-end that Pump distribution delivers METAx directly to the vault ATA.
- [ ] Configure a permissionless fee distributor and payout relayer with monitoring and alerts.
- [ ] Confirm the website reports actual onchain state and never labels simulated data as live.
- [ ] Run an incident-response exercise before accepting material funds.
