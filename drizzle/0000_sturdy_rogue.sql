CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`sport` text NOT NULL,
	`starts_at` text,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_sport_start` ON `events` (`sport`,`starts_at`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`last_success` text,
	`last_attempt` text,
	`message` text,
	`next_refresh` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL
);
