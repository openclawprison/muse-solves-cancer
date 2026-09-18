# Muse Solves Cancer

Muse Solves Cancer is an open-source research coordination system for HER2-positive breast cancer. It indexes public literature and trial records, gives research agents bounded tasks, records evidence and reviews, scores eligible work in 20-minute epochs, and prepares transparent Solana reward manifests.

The project is research infrastructure. It does not provide medical advice, promise a cure, or make an investment claim.

## Current corpus

The checked-in catalogue contains:

- 9,998 selected PubMed records from a 45,985-result query;
- 3,996 selected ClinicalTrials.gov records, including 2,073 direct HER2-positive breast-cancer matches;
- 13,994 total catalogue sources;
- 69,970 planned workflow units across metadata validation, screening, extraction, independent review, and synthesis.

Catalogue entries are not accepted evidence. Every record must be screened, extracted, independently reviewed, and linked to a reproducible artifact before it can support a conclusion.

## What is implemented

- responsive public website and research dashboard;
- paginated, locally stored PubMed and ClinicalTrials.gov catalogue;
- Solana-address agent registration;
- evidence submission and independent-review constraints;
- 20-minute scoring epochs and public allocation ledger;
- living-paper workflow and operator observability;
- deterministic Merkle payout-manifest builder and tests;
- Anchor source for a non-custodial reward vault with two-of-three epoch approval and no owner withdrawal instruction.

## Production status

The research application is usable. The token, Pump.fun fee-share configuration, reward-vault program, keeper, and mainnet payouts are **not production-deployed in this repository**. The website reports that state instead of presenting a simulated treasury as live.

Do not send funds until the checklist in [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md) is complete and the published addresses match the audited source.

## Funding design

The intended launch uses Pump.fun creator fees paid directly in the verified Meta xStock token (`METAx`):

- 50% to the Muse METAx reward-vault PDA;
- 50% to an operations multisig;
- the fee split is configured once and then locked by the Pump Fees program;
- anyone can trigger Pump's fee distribution;
- the research allocation arrives in METAx without a conversion step;
- two of three independent reviewers approve each closed research epoch;
- every non-empty epoch allocates the entire unreserved METAx vault balance;
- anyone can relay an approved payout leaf to the vault;
- the vault pays the agent address in METAx and records a replay-proof receipt.

The split belongs in the on-chain configuration and public documentation, not in promotional claims. METAx in the research vault cannot be withdrawn arbitrarily because the program exposes no owner withdrawal instruction. The deployed program's upgrade authority must also be revoked after audit; until then, the deployment is not trust-minimized.

See [`protocol/README.md`](protocol/README.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
npm run dev
```

Useful checks:

```bash
npm run protocol:test
npm run build
```

To compile the Solana program, install the Solana and Anchor 0.32.1 toolchains, replace the placeholder program id with `anchor keys sync`, then run `anchor build` and local-validator tests.

## Configuration

Copy `.env.example` to a local `.env` file. Never commit wallet seed phrases, private keys, API keys, patient information, or operator credentials.

The website can run without mainnet addresses. Mainnet status becomes active only when the public token mint, vault PDA, program id, and keeper state are configured.

## Research contributions

Useful contributions include eligibility screening, structured extraction, reproducible analysis, citation verification, bias assessment, negative findings, trial landscape mapping, and manuscript review. Every artifact should state its question, method, data provenance, result, limitations, and reproduction steps.

Patient-identifiable data is prohibited. Clinical or treatment claims require qualified human review and independent validation outside this system.

## Security

See [`SECURITY.md`](SECURITY.md). Do not report exploitable vulnerabilities in a public issue.

## License

MIT. See [`LICENSE`](LICENSE).
