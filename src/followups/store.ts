import path from "node:path";
import Database from "better-sqlite3";

const db = new Database(path.join(__dirname, "..", "..", "integrations.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS followup_drafts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  strategy TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft | sent | discarded
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
`);

export interface DraftRow {
  id: string;
  organization_id: string;
  opportunity_id: string;
  strategy: string;
  subject: string;
  body: string;
  status: string;
  created_at: number;
  sent_at: number | null;
}

export function saveDraft(
  organizationId: string,
  opportunityId: string,
  strategy: string,
  subject: string,
  body: string,
  promptVersion: string
): DraftRow {
  const id = `${opportunityId}:${strategy}:${Date.now()}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO followup_drafts
      (id, organization_id, opportunity_id, strategy, subject, body, prompt_version, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
  ).run(id, organizationId, opportunityId, strategy, subject, body, promptVersion, now);
  return {
    id,
    organization_id: organizationId,
    opportunity_id: opportunityId,
    strategy,
    subject,
    body,
    status: "draft",
    created_at: now,
    sent_at: null,
  };
}

export function getDraft(organizationId: string, draftId: string): DraftRow | null {
  const row = db
    .prepare("SELECT * FROM followup_drafts WHERE organization_id = ? AND id = ?")
    .get(organizationId, draftId) as DraftRow | undefined;
  return row ?? null;
}

export function listDraftsForOpportunity(organizationId: string, opportunityId: string): DraftRow[] {
  return db
    .prepare(
      "SELECT * FROM followup_drafts WHERE organization_id = ? AND opportunity_id = ? ORDER BY created_at DESC"
    )
    .all(organizationId, opportunityId) as DraftRow[];
}

export function markDraftSent(organizationId: string, draftId: string) {
  db.prepare("UPDATE followup_drafts SET status = 'sent', sent_at = ? WHERE organization_id = ? AND id = ?").run(
    Date.now(),
    organizationId,
    draftId
  );
}

export function updateDraftText(organizationId: string, draftId: string, subject: string, body: string) {
  db.prepare(
    "UPDATE followup_drafts SET subject = ?, body = ? WHERE organization_id = ? AND id = ? AND status = 'draft'"
  ).run(subject, body, organizationId, draftId);
}
