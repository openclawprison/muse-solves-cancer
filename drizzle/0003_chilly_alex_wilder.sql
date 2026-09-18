CREATE TABLE `manuscript_runs` (
	`hour_id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`action` text,
	`error` text,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `manuscript_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`sort_order` integer NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`contributors_json` text DEFAULT '[]' NOT NULL,
	`citations_json` text DEFAULT '[]' NOT NULL,
	`audit_notes` text,
	`drafted_at` integer,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_manuscript_sections_order` ON `manuscript_sections` (`sort_order`);--> statement-breakpoint
ALTER TABLE `submissions` ADD `work_type` text DEFAULT 'evidence-extraction' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `paper_section` text;