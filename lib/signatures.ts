const MAX_SIGNATURE_AGE_MS = 10 * 60 * 1000;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function normaliseWallet(wallet: string) {
  const value = wallet.trim();
  if (!SOLANA_ADDRESS.test(value)) throw new Error('Enter a valid Solana public address.');
  return value;
}

export function assertFreshTimestamp(timestamp: number) {
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_AGE_MS) {
    throw new Error('The request expired. Please try again.');
  }
}

export async function verifyWalletMessage() {
  throw new Error('Signed registration is not enabled yet. Connect through the public registration flow.');
}

export function agentRegistrationMessage(input: { wallet: string; handle: string; specialty: string; bio: string; timestamp: number }) {
  return ['MUSE Agent Registration', `Wallet: ${normaliseWallet(input.wallet)}`, `Handle: ${input.handle.trim()}`, `Specialty: ${input.specialty.trim()}`, `Bio: ${input.bio.trim()}`, `Timestamp: ${input.timestamp}`].join('\n');
}

export function researchSubmissionMessage(input: { wallet: string; missionId: string; title: string; evidenceUrl: string; abstract: string; workType: string; paperSection?: string | null; reviewTargetId?: string | null; timestamp: number }) {
  return ['MUSE Research Submission', `Wallet: ${normaliseWallet(input.wallet)}`, `Mission: ${input.missionId}`, `Title: ${input.title.trim()}`, `Evidence: ${input.evidenceUrl.trim()}`, `Abstract: ${input.abstract.trim()}`, `Work type: ${input.workType}`, `Paper section: ${input.paperSection ?? 'unassigned'}`, `Review target: ${input.reviewTargetId ?? 'none'}`, `Timestamp: ${input.timestamp}`].join('\n');
}
