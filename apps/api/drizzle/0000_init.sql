CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`section_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`slots_json` text,
	`verify` integer DEFAULT false NOT NULL,
	`link_url` text,
	`sort_order` integer NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`origin` text NOT NULL,
	`seed_id` text,
	`edited` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_user_seed` ON `items` (`user_id`,`seed_id`);--> statement-breakpoint
CREATE INDEX `items_section` ON `items` (`section_id`);--> statement-breakpoint
CREATE TABLE `manual_counters` (
	`user_id` integer NOT NULL,
	`section_id` integer NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `section_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`period` text NOT NULL,
	`sort_order` integer NOT NULL,
	`origin` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`edited` integer DEFAULT false NOT NULL,
	`seed_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sections_user_slug` ON `sections` (`user_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `sections_user_seed` ON `sections` (`user_id`,`seed_id`);--> statement-breakpoint
CREATE TABLE `seed_meta` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`seed_version` integer NOT NULL,
	`applied_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` integer NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ticks` (
	`user_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`slot` integer NOT NULL,
	`period_key` text NOT NULL,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`, `slot`, `period_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `worldstate_cache` (
	`source` text NOT NULL,
	`endpoint` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`payload_json` text NOT NULL,
	`last_error` text,
	PRIMARY KEY(`source`, `endpoint`)
);
