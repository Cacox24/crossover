// Vercel function behind the "Sync now" button.
// POST starts the GitHub Action that runs `npm run sync` and commits public/data.json (Vercel then redeploys).
// GET reports the latest run so the page can follow along. One sync per 10 minutes, so reviewers can't spam it.
// Env (Vercel project settings): GH_TOKEN (fine-grained, Actions read/write on this repo only), GH_REPO = "Cacox24/crossover".
const WORKFLOW = "sync.yml";
const COOLDOWN_MS = 10 * 60 * 1000;

async function gh(path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${process.env.GH_REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers ?? {}) },
  });
}
async function latest() {
  const r = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=1`);
  if (!r.ok) return null;
  const run = (await r.json()).workflow_runs?.[0];
  return run ? { id: run.id as number, status: run.status as string, conclusion: run.conclusion as string | null, createdAt: run.created_at as string } : null;
}

export default async function handler(req: { method?: string }, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  if (!process.env.GH_TOKEN || !process.env.GH_REPO) return res.status(503).json({ error: "not_configured" });
  const last = await latest();
  if (req.method === "GET") return res.status(200).json({ run: last });
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  if (last && (last.status !== "completed" || Date.now() - Date.parse(last.createdAt) < COOLDOWN_MS)) {
    return res.status(429).json({ run: last });
  }
  const r = await gh(`/actions/workflows/${WORKFLOW}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
  if (!r.ok) return res.status(502).json({ error: "dispatch_failed", status: r.status });
  return res.status(202).json({ started: new Date().toISOString() });
}
