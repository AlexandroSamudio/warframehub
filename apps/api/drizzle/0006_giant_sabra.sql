CREATE TABLE `part_stock` (
	`user_id` integer NOT NULL,
	`part_key` text NOT NULL,
	`name` text NOT NULL,
	`blueprints` integer DEFAULT 0 NOT NULL,
	`crafted` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `part_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `undo_log` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`action_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Parts become shared entities (SPEC §13.4): what active goals had ticked as owned is now
-- finished-part stock, added up per part. Built goals already used theirs up.
INSERT INTO `part_stock` (`user_id`, `part_key`, `name`, `blueprints`, `crafted`)
SELECT g.`user_id`, gp.`component_key`, g.`name` || ' ' || json_extract(p.value, '$.name'), 0, SUM(gp.`owned`)
FROM `goal_parts` gp
JOIN `goals` g ON g.`id` = gp.`goal_id`
JOIN json_each(g.`recipe_json`, '$.parts') p ON json_extract(p.value, '$.key') = gp.`component_key`
WHERE g.`status` = 'active' AND gp.`owned` > 0
GROUP BY g.`user_id`, gp.`component_key`;
