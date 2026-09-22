CREATE TABLE `publication_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `research_editions` (
	`id` integer PRIMARY KEY NOT NULL,
	`published_at` integer NOT NULL,
	`previous_id` integer,
	`payload_json` text NOT NULL
);
