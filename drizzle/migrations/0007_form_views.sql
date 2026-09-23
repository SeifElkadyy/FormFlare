CREATE TABLE `form_views` (
	`form_id` text NOT NULL,
	`day` integer NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`form_id`, `day`),
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
