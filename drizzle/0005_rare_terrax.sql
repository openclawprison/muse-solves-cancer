CREATE TABLE `epoch_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`epoch_id` integer NOT NULL,
	`wallet` text NOT NULL,
	`score` integer NOT NULL,
	`allocation_ppm` integer NOT NULL,
	`amount_wei` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`tx_hash` text,
	`created_at` integer NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_epoch_payouts_epoch` ON `epoch_payouts` (`epoch_id`);--> statement-breakpoint
CREATE INDEX `idx_epoch_payouts_wallet` ON `epoch_payouts` (`wallet`);--> statement-breakpoint
CREATE INDEX `idx_epoch_payouts_status` ON `epoch_payouts` (`status`);--> statement-breakpoint
ALTER TABLE `epochs` ADD `reward_budget_wei` text;--> statement-breakpoint
ALTER TABLE `epochs` ADD `vault_balance_wei` text;--> statement-breakpoint
ALTER TABLE `epochs` ADD `distribution_status` text DEFAULT 'not_ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `epochs` ADD `distribution_tx_hash` text;--> statement-breakpoint
ALTER TABLE `epochs` ADD `distribution_hash` text;--> statement-breakpoint
ALTER TABLE `epochs` ADD `distribution_error` text;--> statement-breakpoint
ALTER TABLE `epochs` ADD `distribution_locked_at` integer;--> statement-breakpoint
ALTER TABLE `epochs` ADD `distributed_at` integer;