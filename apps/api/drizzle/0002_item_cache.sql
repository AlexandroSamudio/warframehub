CREATE TABLE `item_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`fetched_at` integer NOT NULL
);
