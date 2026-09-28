import path from "node:path";
import Database from "better-sqlite3";
import { OpportunityOutput } from "../ai/schema";
import { Candidate } from "./filters";

const db = new Database(path.join(__dirname, "..", "..", "integrations.db"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  type TEXT NOT NULL,
  company_or_person TEXT NOT NULL,
  estimated_value REAL,
  confidence REAL NOT NULL,
  reasons TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  next_step TEXT NOT NULL,
  missing_info TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  raw_evidence TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  detected_at INTEGER NOT NULL,
  UNIQUE(organization_id, source, source_id)
);

CREATE TABLE IF NOT EXISTS opportunity_rejections (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  raw_model_output TEXT,
  rejected_at INTEGER NOT NULL
);
`);

export function saveOpportunity(
  organizationId: string,
  candidate: Candidate,
  opp: OpportunityOutput,
  promptVersion: string
) {
  const id = `${organizationId}:${candidate.source}:${candidate.sourceId}`;
  db.prepare(
    `INSERT INTO opportunities
      (id, organization_id, type, company_or_person, estimated_value, confidence, reasons,
       recommended_action, next_step, missing_info, source, source_id, evidence_text, raw_evidence,
       prompt_version, status, detected_at)
     VALUES (@id, @organizationId, @type, @companyOrPerson, @estimatedValue, @confidence, @reasons,
       @recommendedAction, @nextStep, @missingInfo, @source, @sourceId, @evidenceText, @rawEvidence,
       @promptVersion, 'new', @now)
     ON CONFLICT(organization_id, source, source_id) DO UPDATE SET
       confidence = excluded.confidence,
       reasons = excluded.reasons,
       recommended_action = excluded.recommended_action,
       next_step = excluded.next_step,
       missing_info = excluded.missing_info,
       evidence_text = excluded.evidence_text,
       raw_evidence = excluded.raw_evidence,
       detected_at = excluded.detected_at`
  ).run({
    id,
    organizationId,
    type: opp.type,
    companyOrPerson: opp.companyOrPerson,
    estimatedValue: opp.estimatedValue,
    confidence: opp.confidence,
    reasons: JSON.stringify(opp.reasons),
    recommendedAction: opp.recommendedAction,
    nextStep: opp.nextStep,
    missingInfo: JSON.stringify(opp.missingInfo),
    source: candidate.source,
    sourceId: candidate.sourceId,
    evidenceText: candidate.evidenceText,
    rawEvidence: JSON.stringify(candidate.rawEvidence),
    promptVersion,
    now: Date.now(),
  });
  return id;
}

export function saveRejection(
  organizationId: string,
  candidate: Candidate,
  reason: string,
  rawModelOutput?: string
) {
  db.prepare(
    `INSERT INTO opportunity_rejections
      (id, organization_id, source, source_id, reason, raw_model_output, rejected_at)
     VALUES (@id, @organizationId, @source, @sourceId, @reason, @rawModelOutput, @now)`
  ).run({
    id: `${organizationId}:${candidate.source}:${candidate.sourceId}:${Date.now()}`,
    organizationId,
    source: candidate.source,
    sourceId: candidate.sourceId,
    reason,
    rawModelOutput: rawModelOutput ?? null,
    now: Date.now(),
  });
}

export function getOpportunity(organizationId: string, id: string) {
  return db
    .prepare("SELECT * FROM opportunities WHERE organization_id = ? AND id = ?")
    .get(organizationId, id) as
    | {
        id: string;
        type: string;
        company_or_person: string;
        estimated_value: number | null;
        confidence: number;
        source: string;
        source_id: string;
        evidence_text: string;
        status: string;
      }
    | undefined;
}

export function listOpportunities(organizationId: string) {
  return db
    .prepare("SELECT * FROM opportunities WHERE organization_id = ? ORDER BY confidence DESC")
    .all(organizationId) as Array<{
    id: string;
    type: string;
    company_or_person: string;
    estimated_value: number | null;
    confidence: number;
    reasons: string;
    recommended_action: string;
    next_step: string;
    missing_info: string;
    source: string;
    source_id: string;
    evidence_text: string;
    status: string;
    detected_at: number;
  }>;
}

export function listRejections(organizationId: string) {
  return db
    .prepare("SELECT * FROM opportunity_rejections WHERE organization_id = ? ORDER BY rejected_at DESC")
    .all(organizationId);
}

export function updateOpportunityStatus(organizationId: string, id: string, status: "sent" | "ignored" | "new") {
  db.prepare("UPDATE opportunities SET status = ? WHERE organization_id = ? AND id = ?").run(
    status,
    organizationId,
    id
  );
}
