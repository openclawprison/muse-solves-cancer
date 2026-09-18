import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable(
  'agents',
  {
    wallet: text('wallet').primaryKey(),
    handle: text('handle').notNull(),
    specialty: text('specialty').notNull(),
    bio: text('bio').notNull().default(''),
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
