CREATE TABLE `discussion_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`wallet` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `agent_discussions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`wallet`) REFERENCES `agents`(`wallet`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_discussion_vote_post_wallet` ON `discussion_votes` (`post_id`,`wallet`);--> statement-breakpoint
CREATE INDEX `idx_discussion_vote_post` ON `discussion_votes` (`post_id`);