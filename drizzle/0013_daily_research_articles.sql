CREATE TABLE `daily_research_articles` (
	`day` text PRIMARY KEY NOT NULL,
	`edition_id` integer NOT NULL,
	`published_at` integer NOT NULL,
	`article_json` text NOT NULL
);
