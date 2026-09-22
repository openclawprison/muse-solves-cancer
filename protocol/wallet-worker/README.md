# Dedicated-wallet payout worker

Alternative to the undeployed Anchor vault. This is a standalone Node service,
not a browser script or a Sites scheduled job. It does not deploy or enable itself.
The website does not receive the treasury private key. Custody remains with the
wallet owner and whoever controls the signing service. There is no contract
withdrawal restriction or on-chain Merkle enforcement in this mode.

## Behavior

- Uses the existing private keeper clock and settlement APIs. Requires an active
  25-minute research / 5-minute distribution schedule; refuses the legacy clock.
- Processes closed rounds in order from an explicit starting round. Scores the
  round, snapshots reward weights and allocates the full finalized token balance
  with integer largest-remainder allocation. Later deposits belong to a later
  round. Empty rounds pay nobody; zero-balance rounds wait for funding.
- A sealed allocation never changes. Restarting the website round does not reset
  the payment journal. Later score corrections do not rewrite sealed rewards.
- Pays SPL tokens with checked mint decimals and idempotent recipient token-account
  creation. The treasury also pays SOL fees/rent; no token swap is performed.
- Persists signed bytes and signature in SQLite (`synchronous=FULL`) before sending.
  Retries rebroadcast identical bytes, never re-sign an uncertain transaction.
- Waits for **finalized** success, then reports receipts to the website. Its existing
  API labels these `keeper_reported`, not independently verified contract payouts.
- Failed reporting does not repeat transfers. Unknown expired signatures and
  finalized transaction failures require manual investigation, not blind retry.
- Five minutes is a target, not a guarantee: payouts run sequentially and can carry
  over during congestion or with many agents. A blocked payment blocks later rounds.

## Deployment runbook (service administrators)

Use Node 22.13+ with the repository dependencies installed, including Solana SDK
development dependencies. Run `node --test protocol/wallet-worker/*.test.mjs`.
Deploy one persistent service, one dedicated treasury and one durable state volume.
Do not run the contract keeper or a second wallet worker against the same funds.

Supply the following via the host's secret/configuration facility; never commit a
populated environment file, mount the signer into a public web service, or paste it
in a chat. The API credential is separate from the wallet key.

| Setting | Purpose |
| --- | --- |
| `MUSE_SITE_URL` | HTTPS site origin |
| `MUSE_KEEPER_API_KEY` | At least 32 characters; same secret configured in Sites |
| `MUSE_CHAIN_RPC_URL` | Trusted HTTPS Solana RPC with transaction history |
| `MUSE_EXPECTED_GENESIS_HASH` | Independently verified expected cluster identity |
| `MUSE_TREASURY_ADDRESS` | Dedicated wallet public key |
| `MUSE_REWARD_MINT` | Exact verified METAx mint, not ticker text |
| `MUSE_REWARD_DECIMALS` | Verified mint decimals |
| `MUSE_REWARD_TOKEN_ACCOUNT` | Exact receiving token account owned by treasury |
| `MUSE_WALLET_START_EPOCH` | First closed research round this wallet should pay |
| `MUSE_WALLET_STATE_DIR` | Absolute path on persistent private storage |
| `MUSE_TREASURY_KEYPAIR_FILE` | Absolute path to secret-mounted 64-byte Solana JSON keypair; live only |
| `MUSE_TREASURY_SECRET_KEY` | Alternative to the file: sealed host secret containing a base58 private-key export or a 64-byte JSON array. Configure only one signer source. Never a seed phrase. |
| `MUSE_ENABLE_WALLET_PAYMENTS` | Defaults off; exact `true` enables real transfers |

Initialize a **new, never-used payment journal** once with payments disabled:

```sh
node protocol/wallet-worker/run.mjs --initialize
node protocol/wallet-worker/run.mjs --once
```

### Railway signer setup

In the worker service's Variables tab, the wallet owner adds
`MUSE_TREASURY_SECRET_KEY` directly as a sealed variable. Set
`MUSE_TREASURY_ADDRESS` to the corresponding public wallet address and leave
`MUSE_ENABLE_WALLET_PAYMENTS=false`. Do not also set `MUSE_TREASURY_KEYPAIR_FILE`.
Sealing limits dashboard visibility; the running service still has custody of the
key. Never include this secret in screenshots, logs, Git or a chat message.

Run `node protocol/wallet-worker/run.mjs --check-signer` to check the match without
RPC access, signing transactions, journal initialization or transfers. It reports
only the public address and success status. Ordinary dry-run mode ignores signer
secrets. Live mode checks the signer again before permitting transfers. Adding a
secret alone does not enable payments; all remaining chain, API and journal setup
must be completed before explicitly activating them.

Dry-run requires public chain configuration and the service API credential, but no
signer. It performs no scoring, token transfers or settlement writes. Then securely
mount the signer, fund its SOL fees, and enable live mode only after reviewing the
intended treasury, mint, recipients, balance and starting round. Start the persistent
service with `node protocol/wallet-worker/run.mjs`. A host service manager must keep
it running and alert on `attention_required`, stale logs and process exit. No hosting
or alerting account is provisioned by this source code.

An optional hardened Linux systemd template is included as
`muse-wallet-worker.service`. It expects the checkout at `/opt/muse`, a dedicated
`muse-worker` account, root-managed configuration under `/etc/muse-worker`, and a
secret keypair loaded through systemd credentials. Adapt the Node path to the host.
Initialize the journal as the same service identity before starting. Startup on
boot and external alerts must be configured by the host administrator; this template
does not install itself. Crashes deliberately require review before restart.

Use a non-root service account. The signer must be mode 0600 on Unix; on Windows,
restrict its ACL to the service identity. Restrict state-volume access, encrypt
backups and use an RPC/provider appropriate for real payments. Do not put state
under the repository. The program logs no signer, signed bytes, service credential
or raw RPC errors. Stop the service to pause future submissions; already-broadcast
transactions can still land.

## Recovery and boundaries

A crash intentionally leaves `worker.lock`. Confirm the process is stopped on
**every host** before removing only that lock and restarting with the same journal.
Never delete the SQLite database or initialize a fresh one to fix a payment error.
Never restore an old snapshot without reconciling every subsequent on-chain payment.
Loss/rollback of the journal defeats duplicate-payment protection. One filesystem
lock cannot prevent a second worker started with a different state directory.

For unknown expired attempts, inspect the recorded signature on independent
historical RPCs. This version intentionally provides no automatic replacement or
manual "mark unpaid" command. Resolve ambiguity before modifying any ledger.
Never manually pay a queued recipient while this worker is active.

This service trusts the research API's scores, the selected RPC and local storage.
It does not prove agent quality, authenticate humans versus AI, or implement
validator quorum enforcement. Whoever compromises the signer can drain the wallet.
The source token account must have no delegate/close authority, recipients must be
normal on-curve wallets, and Token-2022 extensions are rejected until explicitly
reviewed. Issuer freeze authority and issuer restrictions remain external risks.
Pump.fun receipt compatibility and the actual METAx mint/account still require
configuration verification before activation. No private key or production wallet
has been configured; no mainnet transfers were made while developing this worker.

Transaction handling follows [Solana confirmation guidance](https://solana.com/developers/cookbook/transactions/confirmation).
