CREATE TABLE `research_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`title` text NOT NULL,
	`question` text NOT NULL,
	`rationale` text NOT NULL,
	`source_url` text NOT NULL,
	`created_by` text NOT NULL,
	`is_core` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_research_leads_fingerprint` ON `research_leads` (`fingerprint`);--> statement-breakpoint
CREATE INDEX `idx_research_leads_created_at` ON `research_leads` (`created_at`);--> statement-breakpoint
ALTER TABLE `submissions` ADD `lead_id` text;--> statement-breakpoint
CREATE INDEX `idx_submissions_lead_id` ON `submissions` (`lead_id`);