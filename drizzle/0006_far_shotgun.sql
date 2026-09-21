CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`challenger_wallet` text NOT NULL,
	`reason` text NOT NULL,
	`evidence_url` text NOT NULL,
	`challenge_hash` text NOT NULL,
	`epoch_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`challenger_wallet`) REFERENCES `agents`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_challenge_claim_wallet` ON `challenges` (`claim_id`,`challenger_wallet`);--> statement-breakpoint
CREATE INDEX `idx_challenge_epoch` ON `challenges` (`epoch_id`);--> statement-breakpoint
CREATE TABLE `claim_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`source_claim_id` text NOT NULL,
	`target_claim_id` text NOT NULL,
	`relation` text NOT NULL,
	`rationale` text NOT NULL,
	`creator_wallet` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_wallet`) REFERENCES `agents`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_claim_edges_unique` ON `claim_edges` (`source_claim_id`,`target_claim_id`,`relation`);--> statement-breakpoint
CREATE INDEX `idx_claim_edges_target` ON `claim_edges` (`target_claim_id`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`evidence_hash` text NOT NULL,
	`extractor_wallet` text NOT NULL,
	`submission_id` text,
	`claim_type` text NOT NULL,
	`claim_text` text NOT NULL,
	`structured_json` text DEFAULT '{}' NOT NULL,
	`extraction_hash` text NOT NULL,
	`epoch_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`evidence_hash`) REFERENCES `evidence_sources`(`hash`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`extractor_wallet`) REFERENCES `agents`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_claims_evidence` ON `claims` (`evidence_hash`);--> statement-breakpoint
CREATE INDEX `idx_claims_epoch` ON `claims` (`epoch_id`);--> statement-breakpoint
CREATE INDEX `idx_claims_extractor` ON `claims` (`extractor_wallet`);--> statement-breakpoint
CREATE TABLE `consensus_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`algorithm_version` text NOT NULL,
	`verdict` text NOT NULL,
	`confidence_bps` integer NOT NULL,
	`support_count` integer NOT NULL,
	`refute_count` integer NOT NULL,
	`inconclusive_count` integer NOT NULL,
	`calculation_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_consensus_calculation` ON `consensus_snapshots` (`claim_id`,`calculation_hash`);--> statement-breakpoint
CREATE INDEX `idx_consensus_claim_created` ON `consensus_snapshots` (`claim_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `evidence_sources` (
	`hash` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`external_id` text NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text NOT NULL,
	`content_hash` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`ingested_by_wallet` text NOT NULL,
	`ingested_at` integer NOT NULL,
	FOREIGN KEY (`ingested_by_wallet`) REFERENCES `agents`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_evidence_source_identity` ON `evidence_sources` (`source_type`,`external_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `idx_evidence_ingested_at` ON `evidence_sources` (`ingested_at`);--> statement-breakpoint
CREATE TABLE `reward_events` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`epoch_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`object_id` text NOT NULL,
	`points` integer NOT NULL,
	`rule_version` text NOT NULL,
	`calculation_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wallet`) REFERENCES `agents`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reward_event_unique` ON `reward_events` (`wallet`,`event_type`,`object_id`,`rule_version`);--> statement-breakpoint
CREATE INDEX `idx_reward_events_epoch` ON `reward_events` (`epoch_id`);--> statement-breakpoint
CREATE INDEX `idx_reward_events_wallet` ON `reward_events` (`wallet`);--> statement-breakpoint
CREATE TABLE `validator_attestations` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`consensus_hash` text NOT NULL,
	`validator_wallet` text NOT NULL,
	`verdict` text NOT NULL,
	`signature` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`validator_wallet`) REFERENCES `agents`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_attestation_claim_wallet_hash` ON `validator_attestations` (`claim_id`,`validator_wallet`,`consensus_hash`);--> statement-breakpoint
CREATE INDEX `idx_attestation_consensus` ON `validator_attestations` (`consensus_hash`);--> statement-breakpoint
CREATE TABLE `verification_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`verifier_wallet` text NOT NULL,
	`specialization` text NOT NULL,
	`method` text NOT NULL,
	`tool_name` text NOT NULL,
	`result` text NOT NULL,
	`confidence_bps` integer NOT NULL,
	`input_hash` text NOT NULL,
	`output_hash` text NOT NULL,
	`artifact_url` text NOT NULL,
	`metrics_json` text DEFAULT '{}' NOT NULL,
	`epoch_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verifier_wallet`) REFERENCES `agents`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_verification_claim_wallet` ON `verification_runs` (`claim_id`,`verifier_wallet`);--> statement-breakpoint
CREATE INDEX `idx_verification_epoch` ON `verification_runs` (`epoch_id`);--> statement-breakpoint
CREATE INDEX `idx_verification_claim` ON `verification_runs` (`claim_id`);
--> statement-breakpoint
CREATE TRIGGER `evidence_sources_no_update` BEFORE UPDATE ON `evidence_sources`
BEGIN SELECT RAISE(ABORT, 'evidence_sources is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `evidence_sources_no_delete` BEFORE DELETE ON `evidence_sources`
BEGIN SELECT RAISE(ABORT, 'evidence_sources is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `claims_no_update` BEFORE UPDATE ON `claims`
BEGIN SELECT RAISE(ABORT, 'claims is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `claims_no_delete` BEFORE DELETE ON `claims`
BEGIN SELECT RAISE(ABORT, 'claims is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `claim_edges_no_update` BEFORE UPDATE ON `claim_edges`
BEGIN SELECT RAISE(ABORT, 'claim_edges is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `claim_edges_no_delete` BEFORE DELETE ON `claim_edges`
BEGIN SELECT RAISE(ABORT, 'claim_edges is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `verification_runs_no_update` BEFORE UPDATE ON `verification_runs`
BEGIN SELECT RAISE(ABORT, 'verification_runs is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `verification_runs_no_delete` BEFORE DELETE ON `verification_runs`
BEGIN SELECT RAISE(ABORT, 'verification_runs is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `consensus_snapshots_no_update` BEFORE UPDATE ON `consensus_snapshots`
BEGIN SELECT RAISE(ABORT, 'consensus_snapshots is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `consensus_snapshots_no_delete` BEFORE DELETE ON `consensus_snapshots`
BEGIN SELECT RAISE(ABORT, 'consensus_snapshots is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `challenges_no_update` BEFORE UPDATE ON `challenges`
BEGIN SELECT RAISE(ABORT, 'challenges is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `challenges_no_delete` BEFORE DELETE ON `challenges`
BEGIN SELECT RAISE(ABORT, 'challenges is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `validator_attestations_no_update` BEFORE UPDATE ON `validator_attestations`
BEGIN SELECT RAISE(ABORT, 'validator_attestations is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `validator_attestations_no_delete` BEFORE DELETE ON `validator_attestations`
BEGIN SELECT RAISE(ABORT, 'validator_attestations is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `reward_events_no_update` BEFORE UPDATE ON `reward_events`
BEGIN SELECT RAISE(ABORT, 'reward_events is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `reward_events_no_delete` BEFORE DELETE ON `reward_events`
BEGIN SELECT RAISE(ABORT, 'reward_events is append-only'); END;
--> statement-breakpoint
PRAGMA optimize;
