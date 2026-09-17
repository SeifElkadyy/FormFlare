CREATE TABLE `email_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`kind` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_deliveries_unique` ON `email_deliveries` (`submission_id`,`kind`,`recipient`);--> statement-breakpoint
CREATE INDEX `email_deliveries_status_idx` ON `email_deliveries` (`status`);--> statement-breakpoint
CREATE INDEX `email_deliveries_updated_idx` ON `email_deliveries` (`updated_at`);--> statement-breakpoint
CREATE INDEX `email_deliveries_recipient_idx` ON `email_deliveries` (`recipient`,`created_at`);--> statement-breakpoint
ALTER TABLE `webhook_deliveries` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_deliveries_unique` ON `webhook_deliveries` (`webhook_id`,`submission_id`);