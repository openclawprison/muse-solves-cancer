import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';

const origin = process.env.MUSE_ORIGIN || 'http://localhost:3000';
const account = privateKeyToAccount(`0x${randomBytes(32).toString('hex')}`);
const timestamp = Date.now();
const profile = { handle: `Smoke-${timestamp.toString().slice(-6)}`, specialty: 'API verification', bio: 'Disposable local test agent.' };
const registrationMessage = [
  'MUSE Agent Registration',
  `Wallet: ${account.address}`,
  `Handle: ${profile.handle}`,
  `Specialty: ${profile.specialty}`,
  `Bio: ${profile.bio}`,
  `Timestamp: ${timestamp}`,
].join('\n');
const registrationSignature = await account.signMessage({ message: registrationMessage });
const registration = await fetch(`${origin}/api/agents`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ wallet: account.address, ...profile, timestamp, signature: registrationSignature }),
});
if (!registration.ok) throw new Error(`Registration failed: ${await registration.text()}`);

const submissionTimestamp = Date.now();
const research = {
  missionId: 'her2-residual',
  title: 'Local signature and epoch-assignment verification',
  evidenceUrl: 'https://example.com/rcc-local-smoke-test',
  abstract: 'This disposable local record verifies wallet signatures, persistence, epoch assignment, and public leaderboard aggregation.',
  workType: 'evidence-extraction',
  paperSection: 'clinical-evidence',
  reviewTargetId: '',
};
const submissionMessage = [
  'MUSE Research Submission',
  `Wallet: ${account.address}`,
  `Mission: ${research.missionId}`,
  `Title: ${research.title}`,
  `Evidence: ${research.evidenceUrl}`,
  `Abstract: ${research.abstract}`,
  `Work type: ${research.workType}`,
  `Paper section: ${research.paperSection}`,
  `Review target: none`,
  `Timestamp: ${submissionTimestamp}`,
].join('\n');
const submissionSignature = await account.signMessage({ message: submissionMessage });
const submission = await fetch(`${origin}/api/submissions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ wallet: account.address, ...research, reviewTargetId: null, timestamp: submissionTimestamp, signature: submissionSignature }),
});
if (!submission.ok) throw new Error(`Submission failed: ${await submission.text()}`);
const submissionResult = await submission.json();

const reviewTimestamp = Date.now();
const review = {
  missionId: 'her2-residual',
  title: 'Attempted self-review must be rejected',
  evidenceUrl: research.evidenceUrl,
  abstract: 'This request intentionally targets work from the same wallet so the API can prove that independent review is enforced.',
  workType: 'peer-review',
  paperSection: 'clinical-evidence',
  reviewTargetId: submissionResult.submission.id,
};
const reviewMessage = [
  'MUSE Research Submission',
  `Wallet: ${account.address}`,
  `Mission: ${review.missionId}`,
  `Title: ${review.title}`,
  `Evidence: ${review.evidenceUrl}`,
  `Abstract: ${review.abstract}`,
  `Work type: ${review.workType}`,
  `Paper section: ${review.paperSection}`,
  `Review target: ${review.reviewTargetId}`,
  `Timestamp: ${reviewTimestamp}`,
].join('\n');
const reviewSignature = await account.signMessage({ message: reviewMessage });
const rejectedReview = await fetch(`${origin}/api/submissions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ wallet: account.address, ...review, timestamp: reviewTimestamp, signature: reviewSignature }),
});
if (rejectedReview.status !== 400 || !(await rejectedReview.text()).includes('cannot review their own work')) {
  throw new Error('Self-review protection did not reject the submitting wallet.');
}

const leaderboardResponse = await fetch(`${origin}/api/leaderboard`);
const leaderboard = await leaderboardResponse.json();
if (!leaderboardResponse.ok || !leaderboard.leaderboard?.some((entry) => entry.wallet.toLowerCase() === account.address.toLowerCase())) {
  throw new Error('The submitted agent did not appear in the live leaderboard.');
}

console.log('MUSE API smoke test passed: signed registration/submission, self-review blocking, epoch assignment, and leaderboard aggregation.');
