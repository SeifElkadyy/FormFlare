ALTER TABLE `submissions` ADD `fanned_out_at` integer;--> statement-breakpoint
CREATE INDEX `submissions_fanned_out_idx` ON `submissions` (`fanned_out_at`,`created_at`);