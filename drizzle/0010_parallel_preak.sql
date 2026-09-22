CREATE TABLE `scoring_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`epoch_id` integer NOT NULL,
	`batch_index` integer NOT NULL,
	`input_hash` text NOT NULL,
	`model` text NOT NULL,
	`response_id` text,
	`scores_json` text,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_scoring_batches_epoch` ON `scoring_batches` (`epoch_id`);
