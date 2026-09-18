CREATE TABLE `epochs` (
	`id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`model` text,
	`submission_count` integer DEFAULT 0 NOT NULL,
	`eligible_count` integer DEFAULT 0 NOT NULL,
	`total_points` integer DEFAULT 0 NOT NULL,
	`error` text,
	`opened_at` integer NOT NULL,
	`locked_at` integer,
	`scored_at` integer
);
--> statement-breakpoint
ALTER TABLE `submissions` ADD `score_reason` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `allocation_ppm` integer;--> statement-breakpoint
ALTER TABLE `submissions` ADD `scored_at` integer;