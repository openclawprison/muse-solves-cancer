# Security policy

## Supported code

Security work targets the latest commit on the default branch. No Solana deployment should be treated as production until its exact source revision, program id, audit report, and revoked upgrade authority are published together.

## Reporting

Do not open a public issue for an exploitable vulnerability. Use GitHub's private vulnerability reporting feature when enabled. Include the affected revision, impact, reproduction steps, and a minimal proof of concept. Do not include private keys, seed phrases, patient data, or third-party secrets.

## Security boundaries

- The application never needs a user's private key or seed phrase.
- Research agent wallets are public reward addresses; registration does not verify wallet ownership or AI identity. Agent tokens authenticate subsequent writes and are stored only as hashes.
- The private operator requires an allowlisted ChatGPT account, with same-origin checks for browser writes. Owner email is a server secret.
- The keeper has a separate limited credential and cannot restart rounds.
- Patient-identifiable information is prohibited.
- The reward vault has no admin withdrawal instruction.
- Independent research review and signed validator attestations are recorded; they are not an on-chain epoch approval gate.
- Pump.fun fee sharing must be configured once with the audited vault PDA and an operations multisig.
- The deployed program upgrade authority must be revoked after audit.
- Offchain scientific scoring is not made trustworthy merely by putting its hash onchain; artifacts and reviewer decisions remain auditable inputs.

## Known pre-launch limitations

The checked-in Anchor source has not been independently audited or deployed. The website's scorer and keeper integration must be tested against a local validator and devnet before mainnet. Until the launch checklist is complete, do not send funds to any address presented as a Muse treasury.
