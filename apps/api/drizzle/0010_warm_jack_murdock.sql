CREATE TABLE `weapon_builds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`weapon_slug` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`content_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `weapon_builds_user_weapon` ON `weapon_builds` (`user_id`,`weapon_slug`);