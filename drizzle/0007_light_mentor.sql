CREATE TABLE `round_schedules` (
	`start_epoch_id` integer PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`superseded_at` integer,
	`created_at` integer NOT NULL
);
