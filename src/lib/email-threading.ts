/**
 * Email Threading & Import Disambiguation
 *
 * Provides:
 * 1. Thread ID extraction from email headers (Message-ID, In-Reply-To, References)
 * 2. Case matching with ambiguity detection (multiple matches → user must choose)
 * 3. Thread tracking to link replies to original emails
 */

export interface EmailHeaders {
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  subject: string;
  from: string;
  body: string;
  date?: string;
}

export interface CaseMatchCandidate {
  slug: string;
  title: string;
  caseNumber?: string;
  clientName?: string;
  opponentName?: string;
  matchScore: number;
  matchReason: string;
}

export interface EmailImportResult {
  status: "matched" | "ambiguous" | "no_match" | "duplicate";
  matchedCaseSlug?: string;
  candidates?: CaseMatchCandidate[];
  threadId?: string;
  message: string;
}

/**
 * Extracts a thread ID from email headers.
 * Uses In-Reply-To or first Reference, falls back to Message-ID.
 */
export function extractThreadId(headers: EmailHeaders): string {
  if (headers.inReplyTo) {
    return normalizeMessageId(headers.inReplyTo);
  }
  if (headers.references) {
    const refs = headers.references.split(/\s+/).filter(Boolean);
    if (refs.length > 0) {
      return normalizeMessageId(refs[0]);
    }
  }
  return headers.messageId
    ? normalizeMessageId(headers.messageId)
    : `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMessageId(id: string): string {
  return id.trim().replace(/^<|>$/g, "");
}

/**
 * Extracts subject without Re:/Fwd:/Aw: prefixes.
 */
export function stripSubjectPrefix(subject: string): string {
  return subject.replace(/^(\s*(re|aw|fwd|wg|tr)\s*:\s*)+/i, "").trim();
}

interface CaseData {
  slug: string;
  title: string;
  case_number?: string;
  client_name?: string;
  client_slug?: string;
  opponent_name?: string;
}

/**
 * Matches an email to cases with scoring.
 * Returns sorted candidates with scores.
 * If top candidates have equal scores, the result is ambiguous.
 */
export function matchEmailToCases(
  headers: EmailHeaders,
  cases: CaseData[]
): { candidates: CaseMatchCandidate[]; isAmbiguous: boolean } {
  const fromLower = headers.from.toLowerCase();
  const subjectLower = headers.subject.toLowerCase();
  const strippedSubject = stripSubjectPrefix(headers.subject).toLowerCase();
  const candidates: CaseMatchCandidate[] = [];

  for (const c of cases) {
    let score = 0;
    const reasons: string[] = [];

    // Strategy 1: Case number in subject (strongest signal)
    const caseNum = c.case_number?.toLowerCase();
    if (caseNum && caseNum.length > 2) {
      if (subjectLower.includes(caseNum)) {
        score += 200;
        reasons.push("case_number_in_subject");
      } else if (strippedSubject.includes(caseNum)) {
        score += 195;
        reasons.push("case_number_in_stripped_subject");
      }
    }

    // Strategy 2: Client email/name in From
    const clientName = c.client_name?.toLowerCase();
    const clientSlug = c.client_slug?.toLowerCase();
    if (clientName && clientName.length > 2 && fromLower.includes(clientName)) {
      score += 60;
      reasons.push("client_name_in_from");
    }
    if (clientSlug && clientSlug.length > 2 && fromLower.includes(clientSlug)) {
      score += 55;
      reasons.push("client_email_in_from");
    }

    // Strategy 3: Opponent name in From
    const oppName = c.opponent_name?.toLowerCase();
    if (oppName && oppName.length > 2 && fromLower.includes(oppName)) {
      score += 40;
      reasons.push("opponent_name_in_from");
    }

    // Strategy 4: Case title keywords in subject
    if (c.title && strippedSubject.length > 3) {
      const titleWords = c.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      let titleMatches = 0;
      for (const word of titleWords) {
        if (strippedSubject.includes(word)) titleMatches++;
      }
      if (titleMatches >= 2) {
        score += 30 + titleMatches * 5;
        reasons.push("title_keywords_in_subject");
      }
    }

    if (score > 0) {
      candidates.push({
        slug: c.slug,
        title: c.title,
        caseNumber: c.case_number,
        clientName: c.client_name,
        opponentName: c.opponent_name,
        matchScore: score,
        matchReason: reasons.join(", "),
      });
    }
  }

  candidates.sort((a, b) => b.matchScore - a.matchScore);

  // Ambiguous if top 2 have same score or very close scores (within 5 points)
  const isAmbiguous =
    candidates.length >= 2 && candidates[0].matchScore - candidates[1].matchScore < 5;

  return { candidates, isAmbiguous };
}

/**
 * Determines the import result from matching.
 */
export function resolveEmailImport(headers: EmailHeaders, cases: CaseData[]): EmailImportResult {
  const threadId = extractThreadId(headers);
  const { candidates, isAmbiguous } = matchEmailToCases(headers, cases);

  if (candidates.length === 0) {
    return {
      status: "no_match",
      threadId,
      message: "Keine passende Akte gefunden. Prüfen Sie Betreff (Aktenzeichen) oder Absender.",
    };
  }

  if (isAmbiguous) {
    return {
      status: "ambiguous",
      candidates: candidates.slice(0, 5),
      threadId,
      message: `Mehrere Akten passen (${candidates.length}). Bitte wählen Sie die richtige Akte aus.`,
    };
  }

  return {
    status: "matched",
    matchedCaseSlug: candidates[0].slug,
    threadId,
    message: `E-Mail zugeordnet zu: ${candidates[0].title}`,
  };
}
