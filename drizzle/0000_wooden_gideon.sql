CREATE TABLE `agents` (
	`wallet` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`specialty` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`joined_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agents_joined_at` ON `agents` (`joined_at`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet` text NOT NULL,
	`mission_id` text NOT NULL,
	`title` text NOT NULL,
	`evidence_url` text NOT NULL,
	`abstract` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`score` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`wallet`) REFERENCES `agents`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_submissions_mission_status` ON `submissions` (`mission_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_submissions_wallet` ON `submissions` (`wallet`);