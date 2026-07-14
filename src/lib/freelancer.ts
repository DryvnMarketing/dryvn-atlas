// Official Freelancer.com API client (https://developers.freelancer.com)
// Auth: OAuth2 bearer token — generate one at freelancer.com → Settings → Developers,
// then set FREELANCER_OAUTH_TOKEN in .env.local.
// Without a token Atlas runs in demo mode (seeded sample projects, no live calls).

const BASE = process.env.FREELANCER_API_BASE ?? "https://www.freelancer.com/api";

function token(): string | undefined {
  return process.env.FREELANCER_OAUTH_TOKEN;
}

export function isLive(): boolean {
  return !!token();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "freelancer-oauth-v1": token()!,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Freelancer API ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.result as T;
}

export interface FLProject {
  id: number;
  title: string;
  preview_description: string;
  description?: string;
  budget: { minimum: number; maximum?: number };
  currency: { code: string };
  jobs?: { name: string }[];
  submitdate: number; // unix seconds
  seo_url: string;
}

/** Search active projects in the given budget band (fixed-price, USD-ish). */
export async function searchProjects(opts: {
  query?: string;
  minBudget: number;
  maxBudget: number;
  limit?: number;
}): Promise<FLProject[]> {
  const params = new URLSearchParams({
    limit: String(opts.limit ?? 50),
    "full_description": "true",
    "job_details": "true",
    min_avg_price: String(opts.minBudget),
    max_avg_price: String(opts.maxBudget),
    project_types: "fixed",
    sort_field: "time_updated",
  });
  if (opts.query) params.set("query", opts.query);
  const result = await api<{ projects: FLProject[] }>(
    `/projects/0.1/projects/active/?${params.toString()}`
  );
  return result.projects ?? [];
}

/** Place a bid on a project. */
export async function placeBid(opts: {
  projectId: number;
  bidderId: number; // our Freelancer user id (FREELANCER_USER_ID)
  amount: number;
  periodDays: number;
  description: string;
}): Promise<{ id: number }> {
  return api<{ id: number }>(`/projects/0.1/bids/`, {
    method: "POST",
    body: JSON.stringify({
      project_id: opts.projectId,
      bidder_id: opts.bidderId,
      amount: opts.amount,
      period: opts.periodDays,
      milestone_percentage: 50,
      description: opts.description,
    }),
  });
}

export interface FLThread {
  id: number;
  context?: { type?: string; id?: number };
  members?: number[];
  time_updated?: number;
}

export interface FLMessage {
  id: number;
  from_user: number;
  message: string;
  time_created: number;
}

/** Fetch message threads for our account (with member user details). */
export async function getThreads(): Promise<{
  threads: FLThread[];
  users: Record<string, { username?: string; display_name?: string }>;
}> {
  const result = await api<{
    threads: (FLThread & { thread?: FLThread })[];
    users?: Record<string, { username?: string; display_name?: string }>;
  }>(`/messages/0.1/threads/?last_message=true&user_details=true&limit=30`);
  // Some responses nest the thread object; normalize.
  const threads = (result.threads ?? []).map((t) => ({ ...(t.thread ?? t), id: t.id ?? t.thread?.id }));
  return { threads: threads as FLThread[], users: result.users ?? {} };
}

/** Fetch messages in a thread, oldest first. */
export async function getThreadMessages(threadId: number): Promise<FLMessage[]> {
  const params = new URLSearchParams({ limit: "100" });
  params.append("threads[]", String(threadId));
  const result = await api<{ messages: FLMessage[] }>(
    `/messages/0.1/messages/?${params.toString()}`
  );
  return (result.messages ?? []).sort((a, b) => a.time_created - b.time_created);
}

/** Send a message in a thread (form-encoded per Freelancer messaging API). */
export async function sendMessage(threadId: number, message: string) {
  const res = await fetch(`${BASE}/messages/0.1/threads/${threadId}/messages/`, {
    method: "POST",
    headers: {
      "freelancer-oauth-v1": token()!,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ message }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Freelancer API ${res.status} sending message: ${body.slice(0, 300)}`);
  }
  return res.json();
}
