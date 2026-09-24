/**
 * Drizzle schema — Section 11 of FORMFLARE_PLAN.md.
 *
 * Conventions:
 * - `id` columns are ULIDs (text, lexicographically sortable by creation time).
 * - `forms.public_id` is a short URL-safe string used in the public endpoint.
 * - Timestamps are integer milliseconds since the epoch (`Date.now()`).
 * - Booleans are integers with Drizzle's `{ mode: "boolean" }`.
 * - JSON-shaped config is stored as text in `*_json` columns; parse at the edges.
 */
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Instance-wide key/value config: session_secret, setup_completed, signup_enabled, notify_from. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    /** Format: pbkdf2$<iterations>$<saltB64>$<hashB64>. Iterations are fixed at 100_000. */
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["owner", "admin", "viewer"] })
      .notNull()
      .default("owner"),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the session token — never the token itself. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId),
    // Daily maintenance sweeps expired rows.
    index("sessions_expires_idx").on(t.expiresAt),
  ],
);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const forms = sqliteTable(
  "forms",
  {
    id: text("id").primaryKey(),
    /** Short, URL-safe, unguessable id used in POST /f/:publicId. */
    publicId: text("public_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    mode: text("mode", { enum: ["standard", "waitlist"] })
      .notNull()
      .default("standard"),
    /** [{ name, type, required, maxLength }] — drives the generated zod schema. */
    fieldsJson: text("fields_json").notNull().default("[]"),
    allowedOriginsJson: text("allowed_origins_json").notNull().default("[]"),
    redirectUrl: text("redirect_url"),
    honeypotField: text("honeypot_field").notNull().default("_gotcha"),
    turnstileSiteKey: text("turnstile_site_key"),
    /** Encrypted at rest (AES-GCM, key derived from session_secret). See Section 19. */
    turnstileSecret: text("turnstile_secret"),
    notifyEmailsJson: text("notify_emails_json").notNull().default("[]"),
    autoReplyEnabled: integer("auto_reply_enabled", { mode: "boolean" }).notNull().default(false),
    autoReplySubject: text("auto_reply_subject"),
    autoReplyBody: text("auto_reply_body"),
    fileMaxBytes: integer("file_max_bytes")
      .notNull()
      .default(5 * 1024 * 1024),
    fileTypesJson: text("file_types_json")
      .notNull()
      .default('["application/pdf","image/png","image/jpeg"]'),
    /** Monotonic counter; also the source of waitlist positions. */
    submissionCount: integer("submission_count").notNull().default(0),
    /**
     * Optional public slug for `/p/:slug`. Null means the hosted page is only reachable
     * via the public id. SQLite unique indexes allow multiple NULLs.
     */
    slug: text("slug"),
    /** Waitlist only: store the row, email a confirm link, assign a position on click. */
    doubleOptIn: integer("double_opt_in", { mode: "boolean" }).notNull().default(false),
    /**
     * Places subtracted from waitlist position per confirmed referral when computing
     * display rank. 0 records referrals but does not move anyone. The stored
     * `waitlist_position` is never rewritten — colliding updates would break uniqueness.
     */
    referralBoost: integer("referral_boost").notNull().default(0),
    /** Newline-separated phrases and `@domain`s. A match is stored as spam. */
    spamWords: text("spam_words"),
    hostedDescription: text("hosted_description"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("forms_public_id_uq").on(t.publicId),
    uniqueIndex("forms_slug_uq").on(t.slug),
    index("forms_project_idx").on(t.projectId),
  ],
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    dataJson: text("data_json").notNull(),
    /** Normalised (trimmed, lowercased) when the form has an email field. Drives waitlist dedupe. */
    email: text("email"),
    status: text("status", { enum: ["new", "read", "archived", "spam"] })
      .notNull()
      .default("new"),
    waitlistPosition: integer("waitlist_position"),
    /**
     * Double opt-in: null until the confirm link is used. Backfilled to `created_at`
     * for rows that predate the column, so existing signups stay confirmed.
     */
    optedInAt: integer("opted_in_at"),
    /** Short public code for waitlist referral links (`?ref=`). */
    referralCode: text("referral_code"),
    /** Submission that referred this one, if `_ref` was valid. No FK: the referrer may be deleted. */
    referredById: text("referred_by_id"),
    /** Confirmed referrals credited to this signup. */
    referralCount: integer("referral_count").notNull().default(0),
    /** SHA-256(ip + session_secret). Raw IPs are never stored. */
    ipHash: text("ip_hash"),
    country: text("country"),
    userAgent: text("user_agent"),
    referrer: text("referrer"),
    spamReason: text("spam_reason"),
    /** The owner's private note. Never sent anywhere. */
    note: text("note"),
    /**
     * Set once fan-out has created every delivery row for this submission.
     *
     * Null means the `submission.created` job never completed — the Worker was evicted
     * mid-fan-out, or the enqueue itself was lost. The recovery sweep re-enqueues those,
     * which is safe because fan-out is idempotent.
     */
    fannedOutAt: integer("fanned_out_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("submissions_form_created_idx").on(t.formId, t.createdAt),
    index("submissions_status_idx").on(t.status),
    // Drives the recovery sweep: find submissions that never finished fanning out.
    index("submissions_fanned_out_idx").on(t.fannedOutAt, t.createdAt),
    uniqueIndex("submissions_referral_code_uq").on(t.referralCode),
    index("submissions_referred_by_idx").on(t.referredById),
    index("submissions_opted_in_idx").on(t.formId, t.optedInAt),
    // Waitlist dedupe is a partial unique index on (form_id, email); SQLite cannot
    // express the WHERE clause through Drizzle, so it is added in a raw SQL migration.
  ],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    fieldName: text("field_name").notNull(),
    r2Key: text("r2_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("files_submission_idx").on(t.submissionId)],
);

export const webhooks = sqliteTable(
  "webhooks",
  {
    id: text("id").primaryKey(),
    /** null = fires for every form. */
    formId: text("form_id").references(() => forms.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** HMAC signing key, encrypted at rest. See Section 19. Dummy value for Slack/Discord presets. */
    secret: text("secret").notNull(),
    /** "generic" (signed JSON), "slack", or "discord". */
    preset: text("preset", { enum: ["generic", "slack", "discord"] })
      .notNull()
      .default("generic"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("webhooks_form_idx").on(t.formId)],
);

export const webhookDeliveries = sqliteTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["pending", "success", "failed"] }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    // Queues are at-least-once, so the same submission.created job can run twice.
    // This makes the delivery row the idempotency key: the second attempt to create
    // it fails instead of producing a duplicate webhook call.
    uniqueIndex("webhook_deliveries_unique").on(t.webhookId, t.submissionId),
    index("webhook_deliveries_webhook_idx").on(t.webhookId),
    index("webhook_deliveries_status_idx").on(t.status),
    // Daily maintenance prunes old rows.
    index("webhook_deliveries_updated_idx").on(t.updatedAt),
  ],
);

/**
 * One row per email we intend to send, created before the job is enqueued.
 *
 * Same idempotency mechanism as webhook deliveries: queues deliver at least once, so
 * without a durable record a retried job would email the owner twice. The unique index
 * on (submission_id, kind, recipient) means the row itself is the lock.
 */
export const emailDeliveries = sqliteTable(
  "email_deliveries",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    /** "owner_alert", "auto_reply", or "opt_in". */
    kind: text("kind", { enum: ["owner_alert", "auto_reply", "opt_in"] }).notNull(),
    recipient: text("recipient").notNull(),
    status: text("status", {
      enum: ["pending", "sent", "failed", "skipped_unavailable", "skipped_rate_limited"],
    }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("email_deliveries_unique").on(t.submissionId, t.kind, t.recipient),
    index("email_deliveries_status_idx").on(t.status),
    index("email_deliveries_updated_idx").on(t.updatedAt),
    // Auto-reply throttling looks up recent sends to one address.
    index("email_deliveries_recipient_idx").on(t.recipient, t.createdAt),
  ],
);

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** First 8 chars, shown in the UI so a key can be identified after creation. */
    prefix: text("prefix").notNull(),
    /** SHA-256 of the full key. The key itself is shown once and never stored. */
    keyHash: text("key_hash").notNull(),
    lastUsedAt: integer("last_used_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("api_keys_hash_uq").on(t.keyHash), index("api_keys_prefix_idx").on(t.prefix)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    /** Null for pre-auth events such as a failed login against an unknown address. */
    userId: text("user_id"),
    /** "form.create", "submission.export", "login.failed", ... */
    action: text("action").notNull(),
    metadataJson: text("metadata_json"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_user_idx").on(t.userId)],
);

/**
 * Hosted-page and widget views, one row per form per UTC day. No cookies, no visitor
 * ids: a counter is all the conversion rate needs. Views of a snippet on the owner's own
 * site are invisible to us, so this only covers `/p/:slug` and the widget.
 */
export const formViews = sqliteTable(
  "form_views",
  {
    formId: text("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    /** Days since the epoch, UTC (`Math.floor(ms / 86_400_000)`). */
    day: integer("day").notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.formId, t.day] })],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Form = typeof forms.$inferSelect;
export type NewForm = typeof forms.$inferInsert;
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type FileRecord = typeof files.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type EmailDelivery = typeof emailDeliveries.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
