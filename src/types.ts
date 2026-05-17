export interface Lead {
  name: string;
  website: string;
  address?: string;
  city?: string;
  state?: string;
  email?: string | null;
  audit?: AuditResult;
  draft?: EmailDraft;
  screenshot?: string;
  status: 'idle' | 'scraping' | 'extracting' | 'processing' | 'done' | 'error';
  error?: string;
}

export interface AuditResult {
  score: number;
  findings: string[];
}

export interface EmailDraft {
  subject: string;
  body: string;
}
