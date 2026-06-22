// Shared Memex types (mirrors API responses)

export type Section =
  | "dashboard"
  | "chat"
  | "notes"
  | "decisions"
  | "timeline"
  | "email"
  | "analytics"
  | "settings"

export interface NoteSummary {
  id: string
  title: string
  sourcePath: string
  project: string
  tags: string[]
  chunkCount: number
  decisionCount: number
  createdAt: string
  updatedAt: string
}

export interface NoteDetail extends NoteSummary {
  content: string
  contentHash: string
  chunks: {
    id: string
    chunkIndex: number
    text: string
    headingPath: string
    tokens: number
  }[]
  decisions: {
    id: string
    title: string
    rationale: string
    decisionDate: string
  }[]
}

export interface DecisionSummary {
  id: string
  title: string
  decisionDate: string
  rationale: string
  alternatives: string[]
  outcome: string
  participants: string[]
  project: string
  confidence: number
  createdAt: string
  note: { id: string; title: string; sourcePath: string }
  chunk: {
    id: string
    chunkIndex: number
    headingPath: string
    snippet: string
  }
}

export interface Citation {
  chunkId: string
  sourcePath: string
  headingPath: string
  chunkIndex: number
  snippet: string
  score: number
}

export interface ChatMessageData {
  id: string
  sessionId: string
  role: "user" | "assistant"
  content: string
  citations: Citation[]
  createdAt: string
}

export interface ChatSessionSummary {
  id: string
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
  preview: string
}

export interface EmailData {
  id: string
  toAddress: string
  fromName: string
  subject: string
  bodyMarkdown: string
  bodyHtml: string
  status: string
  sourceType: string
  sourceId: string
  errorMessage: string
  queuedAt: string
  sentAt: string | null
  deliveredAt: string | null
}

export interface EmailTemplateData {
  id: string
  name: string
  type: string
  subject: string
  bodyMarkdown: string
}

export interface StatsData {
  counts: {
    notes: number
    decisions: number
    sessions: number
    messages: number
    emails: number
    emailsDelivered: number
  }
  corpus: {
    chunkCount: number
    noteCount: number
    avgTokensPerChunk: number
    uniqueTerms: number
  }
  citationCoverage: number
  refusalRate: number
  emailsBySource: { sourceType: string; count: number }[]
  decisionsByProject: { project: string; count: number }[]
  notesByProject: { project: string; count: number }[]
}

export interface TimelineEvent {
  type: "note" | "decision"
  id: string
  timestamp: string
  title: string
  project: string
  sourcePath: string
  // note-only
  chunkCount?: number
  decisionCount?: number
  // decision-only
  rationale?: string
  decisionDate?: string
  noteId?: string
  noteTitle?: string
}

export interface ProfileData {
  id: string
  email: string
  name: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  dailyDigest: boolean
  digestHour: number
}

export interface ChunkDetail {
  chunk: {
    id: string
    text: string
    headingPath: string
    chunkIndex: number
    tokens: number
    note: {
      id: string
      title: string
      sourcePath: string
      project: string
      tags: string[]
    }
    decisions: {
      id: string
      title: string
      rationale: string
      decisionDate: string
    }[]
  }
}

export interface AnalyticsData {
  mostCitedChunks: {
    chunkId: string
    sourcePath: string
    headingPath: string
    chunkIndex: number
    count: number
  }[]
  recentQuestions: {
    question: string
    timestamp: string
  }[]
  questionActivity: {
    date: string
    count: number
  }[]
  projectStats: {
    project: string
    notes: number
    decisions: number
  }[]
  summary: {
    totalQuestions: number
    totalAnswers: number
    totalCitations: number
    avgCitationsPerAnswer: number
    uniqueCitedChunks: number
  }
}
