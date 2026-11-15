CREATE TABLE `favorite_weapons` (
	`user_id` integer NOT NULL,
	`weapon_slug` text NOT NULL,
	PRIMARY KEY(`user_id`, `weapon_slug`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
