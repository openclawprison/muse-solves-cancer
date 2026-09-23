CREATE TABLE `scientific_papers` (
	`edition_id` integer PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`stage` text NOT NULL,
	`response_id` text,
	`input_json` text NOT NULL,
	`draft_json` text,
	`paper_json` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
