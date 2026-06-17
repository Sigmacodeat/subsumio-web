/**
 * Legal Brain Types — Core data model for legal case management
 * All personally identifiable information is stored only as hashed/anonymized values.
 */

export type LegalEntityType = "lawyer" | "firm" | "court" | "opponent" | "client";

export type CaseStatus =
  | "open"
  | "pending"
  | "settled"
  | "won"
  | "lost"
  | "appealed"
  | "dormant";

export type EvidenceType =
  | "document"
  | "witness"
  | "expert"
  | "precedent"
  | "statute"
  | "email"
  | "contract";

export type CaseResult = "won" | "lost" | "settled" | "dismissed" | "pending";

// ---------------------------------------------------------------------------
// Legal Entity (Lawyer, Firm, Court, Opponent, Client)
// ---------------------------------------------------------------------------

export interface LegalEntity {
  id: string;
  type: LegalEntityType;
  displayName: string;
  legalAreas: string[];
  specializations: string[];
  jurisdiction: string;
  jurisdictionLevel: "local" | "regional" | "federal" | "european";
  contactHash?: string; // hashed contact info, reversible only by owner
  anonymizedCaseCount: number;
  winRate?: number; // 0-1, computed from anonymized cases
  notes: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  ownerSource: string; // brain source ID, ensures isolation
}

export interface LegalEntityCreateInput {
  type: LegalEntityType;
  displayName: string;
  legalAreas?: string[];
  specializations?: string[];
  jurisdiction?: string;
  jurisdictionLevel?: LegalEntity["jurisdictionLevel"];
  notes?: string;
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Legal Case
// ---------------------------------------------------------------------------

export interface LegalCase {
  id: string;
  caseNumber: string; // internal case number / Aktenzeichen
  displayTitle: string; // anonymized title for display
  legalArea: string; // e.g. "Amtshaftungsrecht"
  subArea?: string; // e.g. "Polizeipflichtverletzung"
  status: CaseStatus;
  priority: "low" | "medium" | "high" | "critical";
  opponentId: string; // ref to LegalEntity
  ownLawyerId?: string; // ref to LegalEntity
  courtId?: string; // ref to LegalEntity
  clientId?: string; // ref to LegalEntity (anonymized)
  facts: string; // anonymized facts
  claims: string[];
  defenses: string[];
  evidence: Evidence[];
  strategy?: Strategy;
  outcome?: Outcome;
  similarCaseIds: string[];
  precedentCaseIds: string[];
  estimatedValue?: { min: number; max: number; currency: string };
  tags: string[];
  createdAt: string;
  updatedAt: string;
  ownerSource: string;
}

export interface LegalCaseCreateInput {
  caseNumber: string;
  displayTitle: string;
  legalArea: string;
  subArea?: string;
  priority?: LegalCase["priority"];
  opponentId: string;
  ownLawyerId?: string;
  courtId?: string;
  clientId?: string;
  facts?: string;
  claims?: string[];
  defenses?: string[];
  estimatedValue?: { min: number; max: number; currency: string };
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export interface Evidence {
  id: string;
  type: EvidenceType;
  description: string;
  source: string;
  date?: string;
  weight: number; // 0-1, assessed probative value
  admitted: boolean;
  challenges: string[]; // possible challenges against this evidence
  notes: string;
}

export interface EvidenceCreateInput {
  type: EvidenceType;
  description: string;
  source: string;
  date?: string;
  weight?: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------

export interface Strategy {
  recommended: string;
  alternatives: string[];
  risks: RiskItem[];
  opportunities: OpportunityItem[];
  settlementRange?: { min: number; max: number; currency: string };
  timeline: string;
  recommendedApproach: "litigation" | "settlement" | "mediation" | "arbitration" | "negotiation";
  confidence: number; // 0-1, system's confidence in this strategy
  generatedAt: string;
}

export interface RiskItem {
  description: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  mitigation?: string;
}

export interface OpportunityItem {
  description: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

export interface Outcome {
  result: CaseResult;
  amount?: number;
  currency?: string;
  reasoning: string;
  isPrecedent: boolean;
  appealPossible: boolean;
  lessonsLearned: string[];
  settledAt?: string;
}

// ---------------------------------------------------------------------------
// Opponent Analysis
// ---------------------------------------------------------------------------

export interface OpponentAnalysis {
  opponentId: string;
  generatedAt: string;
  winRateVsUs: number; // 0-1, based on historical cases
  commonStrategies: string[];
  weaknesses: string[];
  strengths: string[];
  settlementBehavior: "aggressive" | "moderate" | "cooperative" | "unknown";
  averageSettlementTime: string;
  typicalSettlementRange?: { min: number; max: number; currency: string };
  preferredCourts: string[];
  recommendedCounterStrategy: string;
  similarOpponents: string[]; // entity IDs of similar opponents
}

// ---------------------------------------------------------------------------
// Chance Assessment
// ---------------------------------------------------------------------------

export interface ChanceAssessment {
  caseId: string;
  generatedAt: string;
  overallChance: number; // 0-1
  legalChance: number; // 0-1, strength of legal position
  factualChance: number; // 0-1, strength of factual position
  evidentiaryChance: number; // 0-1, strength of evidence
  proceduralChance: number; // 0-1, procedural advantages
  riskFactors: string[];
  successFactors: string[];
  comparableCases: { caseId: string; result: CaseResult; similarity: number }[];
  recommendedNextSteps: string[];
}

// ---------------------------------------------------------------------------
// Precedent Search
// ---------------------------------------------------------------------------

export interface PrecedentSearchResult {
  id: string;
  title: string;
  court: string;
  date: string;
  legalArea: string;
  keyHolding: string;
  relevanceScore: number; // 0-1
  source: "internal" | "external";
  caseRef?: string; // internal case ID if from our brain
}
