# Deployment runbook

Everything in this runbook can be prepared before the final public addresses are known. The only late-bound protocol inputs are the verified METAx mint and the keeper public key. The deployer keypair remains local and must never be added to the website or repository.

## 1. Toolchain and checks

```bash
npm ci
npm run protocol:test
npm run build
powershell -ExecutionPolicy Bypass -File scripts/solana-preflight.ps1
```

Anchor 0.32.1, Rust 1.89 or newer, Solana CLI 2.3.0, SPL Token CLI, and Node.js 22.13 or newer are required to compile and deploy. On Windows, use WSL for the Anchor/Solana build toolchain.

## 2. Build and deploy the program

```bash
anchor keys sync
anchor build
anchor test
solana config set --url devnet
anchor deploy
```

Fund and exercise several complete 20-minute cycles on devnet before mainnet. For mainnet, change the provider URL deliberately, deploy the reviewed binary, publish its hash, and revoke the program upgrade authority after final verification.

## 3. Initialize after addresses arrive

Set these locally or in the keeper service's secret store:

```text
MUSE_REWARD_MINT=Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu
MUSE_KEEPER_ADDRESS=<keeper public key>
ANCHOR_PROVIDER_URL=<RPC URL>
ANCHOR_WALLET=<absolute local path to signer keypair>
```

Then initialize the config PDA and contract-controlled METAx token account:

```bash
npm run protocol:init
```

The command prints the program id, config PDA, vault token account, mint, token program, and keeper address. Publish and independently verify those public addresses.

## 4. Build and settle each epoch

Export the final positive scores as a JSON array of `{ "wallet": "...", "score": "..." }` entries. The allocator gives the entire unreserved vault balance to all positively scored wallets using deterministic largest remainders.

```bash
npm run protocol:manifest -- <epoch-id> <vault-balance-base-units> <scores.json> <manifest.json>
npm run protocol:settle -- <manifest.json>
```

The settlement command checks the manifest, confirms that its total equals the current unreserved onchain balance, commits the root if necessary, and relays every unpaid leaf. A receipt PDA prevents duplicate payment.

## 5. Website configuration

Add only public addresses and server credentials to hosting secrets:

```text
MUSE_TOKEN_ADDRESS=<MUSE coin mint>
MUSE_TREASURY_ADDRESS=<vault/config public address shown by initialization>
MUSE_REWARD_TOKEN_ACCOUNT=<contract-controlled METAx token account>
MUSE_REWARD_MINT=Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu
MUSE_REWARD_PROGRAM_ID=<deployed program id>
MUSE_KEEPER_ADDRESS=<keeper public key>
MUSE_REWARD_DECIMALS=8
```

Do not add a seed phrase or keypair to the website. The keeper signer belongs only in the separate automation environment.
