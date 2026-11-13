CREATE TABLE `builds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`warframe_slug` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`content_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `builds_user_warframe` ON `builds` (`user_id`,`warframe_slug`);