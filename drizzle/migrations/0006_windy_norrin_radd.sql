ALTER TABLE `forms` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `forms` ADD `double_opt_in` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `forms` ADD `referral_boost` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `forms` ADD `hosted_description` text;--> statement-breakpoint
CREATE UNIQUE INDEX `forms_slug_uq` ON `forms` (`slug`);--> statement-breakpoint
ALTER TABLE `submissions` ADD `opted_in_at` integer;--> statement-breakpoint
ALTER TABLE `submissions` ADD `referral_code` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `referred_by_id` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `referral_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_referral_code_uq` ON `submissions` (`referral_code`);--> statement-breakpoint
CREATE INDEX `submissions_referred_by_idx` ON `submissions` (`referred_by_id`);--> statement-breakpoint
CREATE INDEX `submissions_opted_in_idx` ON `submissions` (`form_id`,`opted_in_at`);--> statement-breakpoint
ALTER TABLE `webhooks` ADD `preset` text DEFAULT 'generic' NOT NULL;--> statement-breakpoint
-- Existing signups predate double opt-in; treat them as already confirmed.
UPDATE `submissions` SET `opted_in_at` = `created_at` WHERE `opted_in_at` IS NULL;