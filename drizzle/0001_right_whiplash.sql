ALTER TABLE `submissions` ADD `epoch_id` integer NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_submissions_epoch` ON `submissions` (`epoch_id`);