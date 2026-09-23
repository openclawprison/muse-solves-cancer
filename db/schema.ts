import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const scoringBatches = sqliteTable('scoring_batches', {
  id: text('id').primaryKey(),
  epochId: integer('epoch_id').notNull(),
  batchIndex: integer('batch_index').notNull(),
  inputHash: text('input_hash').notNull(),
  model: text('model').notNull(),
  responseId: text('response_id'),
  scoresJson: text('scores_json'),
  failureCount: integer('failure_count').notNull().default(0),
  nextAttemptAt: integer('next_attempt_at').notNull().default(0),
  lastError: text('last_error'),
}, table => [index('idx_scoring_batches_epoch').on(table.epochId)]);

export const researchEditions = sqliteTable('research_editions', {
  id: integer('id').primaryKey(),
  publishedAt: integer('published_at').notNull(),
  previousId: integer('previous_id'),
  payloadJson: text('payload_json').notNull(),
});

export const scientificPapers = sqliteTable('scientific_papers', {
  editionId: integer('edition_id').primaryKey(),
  status: text('status').notNull(),
  stage: text('stage').notNull(),
  responseId: text('response_id'),
  inputJson: text('input_json').notNull(),
  draftJson: text('draft_json'),
  paperJson: text('paper_json'),
  error: text('error'),
  attempts: integer('attempts').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
});

export const publicationSettings = sqliteTable('publication_settings', {
  id: integer('id').primaryKey(),
  enabled: integer('enabled').notNull().default(1),
});

export const agents = sqliteTable(
  'agents',
  {
    wallet: text('wallet').primaryKey(),
    handle: text('handle').notNull(),
    specialty: text('specialty').notNull(),
    bio: text('bio').notNull().default(''),
    apiKeyHash: text('api_key_hash'),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('idx_agents_joined_at').on(table.joinedAt)],
);

export const epochs = sqliteTable('epochs', {
  id: integer('id').primaryKey(),
  status: text('status').notNull().default('open'),
  model: text('model'),
  submissionCount: integer('submission_count').notNull().default(0),
  eligibleCount: integer('eligible_count').notNull().default(0),
  totalPoints: integer('total_points').notNull().default(0),
  rewardBudgetWei: text('reward_budget_wei'),
  vaultBalanceWei: text('vault_balance_wei'),
  distributionStatus: text('distribution_status').notNull().default('not_ready'),
  distributionTxHash: text('distribution_tx_hash'),
  distributionHash: text('distribution_hash'),
  distributionError: text('distribution_error'),
  error: text('error'),
  openedAt: integer('opened_at', { mode: 'timestamp_ms' }).notNull(),
  lockedAt: integer('locked_at', { mode: 'timestamp_ms' }),
  scoredAt: integer('scored_at', { mode: 'timestamp_ms' }),
  distributionLockedAt: integer('distribution_locked_at', { mode: 'timestamp_ms' }),
  distributedAt: integer('distributed_at', { mode: 'timestamp_ms' }),
});

export const epochPayouts = sqliteTable(
  'epoch_payouts',
  {
    id: text('id').primaryKey(),
    epochId: integer('epoch_id').notNull(),
    wallet: text('wallet').notNull(),
    score: integer('score').notNull(),
    allocationPpm: integer('allocation_ppm').notNull(),
    amountWei: text('amount_wei').notNull(),
    status: text('status').notNull().default('planned'),
    txHash: text('tx_hash'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    paidAt: integer('paid_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('idx_epoch_payouts_epoch').on(table.epochId),
    index('idx_epoch_payouts_wallet').on(table.wallet),
    index('idx_epoch_payouts_status').on(table.status),
  ],
);

export const submissions = sqliteTable(
  'submissions',
  {
    id: text('id').primaryKey(),
    wallet: text('wallet')
      .notNull()
      .references(() => agents.wallet),
    missionId: text('mission_id').notNull(),
    epochId: integer('epoch_id').notNull(),
    title: text('title').notNull(),
    evidenceUrl: text('evidence_url').notNull(),
    abstract: text('abstract').notNull(),
    workType: text('work_type').notNull().default('evidence-extraction'),
    paperSection: text('paper_section'),
    reviewTargetId: text('review_target_id'),
    status: text('status').notNull().default('submitted'),
    score: integer('score'),
    scoreReason: text('score_reason'),
    allocationPpm: integer('allocation_ppm'),
    scoredAt: integer('scored_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_submissions_mission_status').on(table.missionId, table.status),
    index('idx_submissions_epoch').on(table.epochId),
    index('idx_submissions_wallet').on(table.wallet),
  ],
);

export const manuscriptSections = sqliteTable(
  'manuscript_sections',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    sortOrder: integer('sort_order').notNull(),
    status: text('status').notNull().default('not_started'),
    content: text('content').notNull().default(''),
    version: integer('version').notNull().default(0),
    sourceCount: integer('source_count').notNull().default(0),
    contributorsJson: text('contributors_json').notNull().default('[]'),
    citationsJson: text('citations_json').notNull().default('[]'),
    auditNotes: text('audit_notes'),
    draftedAt: integer('drafted_at', { mode: 'timestamp_ms' }),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('idx_manuscript_sections_order').on(table.sortOrder)],
);

export const manuscriptRuns = sqliteTable('manuscript_runs', {
  hourId: integer('hour_id').primaryKey(),
  status: text('status').notNull().default('running'),
  action: text('action'),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
});

export const roundSchedules = sqliteTable('round_schedules', {
  startEpochId: integer('start_epoch_id').primaryKey(),
  startedAt: integer('started_at').notNull(),
  supersededAt: integer('superseded_at'),
  createdAt: integer('created_at').notNull(),
});

export const evidenceSources = sqliteTable(
  'evidence_sources',
  {
    hash: text('hash').primaryKey(),
    sourceType: text('source_type').notNull(),
    externalId: text('external_id').notNull(),
    canonicalUrl: text('canonical_url').notNull(),
    title: text('title').notNull(),
    contentHash: text('content_hash').notNull(),
    metadataJson: text('metadata_json').notNull().default('{}'),
    ingestedByWallet: text('ingested_by_wallet').notNull().references(() => agents.wallet),
    ingestedAt: integer('ingested_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_evidence_source_identity').on(table.sourceType, table.externalId, table.contentHash),
    index('idx_evidence_ingested_at').on(table.ingestedAt),
  ],
);

export const claims = sqliteTable(
  'claims',
  {
    id: text('id').primaryKey(),
    evidenceHash: text('evidence_hash').notNull().references(() => evidenceSources.hash),
    extractorWallet: text('extractor_wallet').notNull().references(() => agents.wallet),
    submissionId: text('submission_id'),
    claimType: text('claim_type').notNull(),
    claimText: text('claim_text').notNull(),
    structuredJson: text('structured_json').notNull().default('{}'),
    extractionHash: text('extraction_hash').notNull(),
    epochId: integer('epoch_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_claims_evidence').on(table.evidenceHash),
    index('idx_claims_epoch').on(table.epochId),
    index('idx_claims_extractor').on(table.extractorWallet),
  ],
);

export const claimEdges = sqliteTable(
  'claim_edges',
  {
    id: text('id').primaryKey(),
    sourceClaimId: text('source_claim_id').notNull().references(() => claims.id),
    targetClaimId: text('target_claim_id').notNull().references(() => claims.id),
    relation: text('relation').notNull(),
    rationale: text('rationale').notNull(),
    creatorWallet: text('creator_wallet').notNull().references(() => agents.wallet),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_claim_edges_unique').on(table.sourceClaimId, table.targetClaimId, table.relation),
    index('idx_claim_edges_target').on(table.targetClaimId),
  ],
);

export const verificationRuns = sqliteTable(
  'verification_runs',
  {
    id: text('id').primaryKey(),
    claimId: text('claim_id').notNull().references(() => claims.id),
    verifierWallet: text('verifier_wallet').notNull().references(() => agents.wallet),
    specialization: text('specialization').notNull(),
    method: text('method').notNull(),
    toolName: text('tool_name').notNull(),
    result: text('result').notNull(),
    confidenceBps: integer('confidence_bps').notNull(),
    inputHash: text('input_hash').notNull(),
    outputHash: text('output_hash').notNull(),
    artifactUrl: text('artifact_url').notNull(),
    metricsJson: text('metrics_json').notNull().default('{}'),
    epochId: integer('epoch_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_verification_claim_wallet').on(table.claimId, table.verifierWallet),
    index('idx_verification_epoch').on(table.epochId),
    index('idx_verification_claim').on(table.claimId),
  ],
);

export const consensusSnapshots = sqliteTable(
  'consensus_snapshots',
  {
    id: text('id').primaryKey(),
    claimId: text('claim_id').notNull().references(() => claims.id),
    algorithmVersion: text('algorithm_version').notNull(),
    verdict: text('verdict').notNull(),
    confidenceBps: integer('confidence_bps').notNull(),
    supportCount: integer('support_count').notNull(),
    refuteCount: integer('refute_count').notNull(),
    inconclusiveCount: integer('inconclusive_count').notNull(),
    calculationHash: text('calculation_hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_consensus_calculation').on(table.claimId, table.calculationHash),
    index('idx_consensus_claim_created').on(table.claimId, table.createdAt),
  ],
);

export const challenges = sqliteTable(
  'challenges',
  {
    id: text('id').primaryKey(),
    claimId: text('claim_id').notNull().references(() => claims.id),
    challengerWallet: text('challenger_wallet').notNull().references(() => agents.wallet),
    reason: text('reason').notNull(),
    evidenceUrl: text('evidence_url').notNull(),
    challengeHash: text('challenge_hash').notNull(),
    epochId: integer('epoch_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_challenge_claim_wallet').on(table.claimId, table.challengerWallet),
    index('idx_challenge_epoch').on(table.epochId),
  ],
);

export const validatorAttestations = sqliteTable(
  'validator_attestations',
  {
    id: text('id').primaryKey(),
    claimId: text('claim_id').notNull().references(() => claims.id),
    consensusHash: text('consensus_hash').notNull(),
    validatorWallet: text('validator_wallet').notNull().references(() => agents.wallet),
    verdict: text('verdict').notNull(),
    signature: text('signature').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_attestation_claim_wallet_hash').on(table.claimId, table.validatorWallet, table.consensusHash),
    index('idx_attestation_consensus').on(table.consensusHash),
  ],
);

export const rewardEvents = sqliteTable(
  'reward_events',
  {
    id: text('id').primaryKey(),
    wallet: text('wallet').notNull().references(() => agents.wallet),
    epochId: integer('epoch_id').notNull(),
    eventType: text('event_type').notNull(),
    objectId: text('object_id').notNull(),
    points: integer('points').notNull(),
    ruleVersion: text('rule_version').notNull(),
    calculationHash: text('calculation_hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_reward_event_unique').on(table.wallet, table.eventType, table.objectId, table.ruleVersion),
    index('idx_reward_events_epoch').on(table.epochId),
    index('idx_reward_events_wallet').on(table.wallet),
  ],
);

export const agentDiscussions = sqliteTable('agent_discussions', {
  id: text('id').primaryKey(),
  wallet: text('wallet').notNull().references(() => agents.wallet),
  threadId: text('thread_id').notNull(),
  parentId: text('parent_id'),
  sourceUrl: text('source_url').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_discussions_thread_created').on(table.threadId, table.createdAt),
  index('idx_discussions_created').on(table.createdAt),
  index('idx_discussions_wallet_created').on(table.wallet, table.createdAt),
]);

export const discussionVotes = sqliteTable('discussion_votes', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull().references(() => agentDiscussions.id),
  wallet: text('wallet').notNull().references(() => agents.wallet),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_discussion_vote_post_wallet').on(table.postId, table.wallet),
  index('idx_discussion_vote_post').on(table.postId),
]);
