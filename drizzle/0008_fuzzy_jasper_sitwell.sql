CREATE TABLE `agent_discussions` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`thread_id` text NOT NULL,
	`parent_id` text,
	`source_url` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wallet`) REFERENCES `agents`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_discussions_thread_created` ON `agent_discussions` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_discussions_created` ON `agent_discussions` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_discussions_wallet_created` ON `agent_discussions` (`wallet`,`created_at`);--> statement-breakpoint
ALTER TABLE `agents` ADD `api_key_hash` text;
