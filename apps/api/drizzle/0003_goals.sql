CREATE TABLE `goal_parts` (
	`goal_id` integer NOT NULL,
	`component_key` text NOT NULL,
	`owned` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`goal_id`, `component_key`),
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`unique_name` text NOT NULL,
	`name` text NOT NULL,
	`recipe_json` text NOT NULL,
	`recipe_fetched_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`sort_order` integer NOT NULL,
	`created_at` integer NOT NULL,
	`built_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `goals_user_status` ON `goals` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `resource_stock` (
	`user_id` integer NOT NULL,
	`resource_key` text NOT NULL,
	`name` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `resource_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
