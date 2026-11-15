CREATE TABLE `favorite_warframes` (
	`user_id` integer NOT NULL,
	`warframe_slug` text NOT NULL,
	PRIMARY KEY(`user_id`, `warframe_slug`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
