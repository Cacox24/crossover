// Crossover: Google Health API (Fitbit) connection test
// Run from the repo root:  node sync/test-google.mjs
// Opens your browser once to sign in with Google, then saves a refresh token
// to secrets/google_token.json (git-ignored). Never prints tokens.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { exec } from "node:child_process";

const cs = JSON.parse(readFileSync("secrets/client_secret.json", "utf8")).installed;
const SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
];
const BASE = "https://health.googleapis.com/v4/users/me/dataTypes";
const TOKEN_FILE = "secrets/google_token.json";
mkdirSync("raw/fitbit", { recursive: true });
const save = (n, d) => writeFileSync(`raw/fitbit/${n}`, JSON.stringify(d, null, 2));
const ok = (m) => console.log(`✓ ${m}`);
const bad = (m) => console.log(`✗ ${m}`);

// --- 1. OAuth (loopback + PKCE), or reuse saved refresh token -------------
async function tokenRequest(params) {
  const r = await fetch(cs.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cs.client_id, client_secret: cs.client_secret, ...params }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`token endpoint HTTP ${r.status}: ${body.error} ${body.error_description ?? ""}`);
  return body;
}

async function signIn() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      if (!url.searchParams.has("code") && !url.searchParams.has("error")) { res.end(); return; }
      const err = url.searchParams.get("error");
      res.end(err ? `Sign-in failed: ${err}. You can close this tab.` : "Signed in. You can close this tab and go back to Terminal.");
      server.close();
      if (err) return reject(new Error(`Google returned: ${err}`));
      if (url.searchParams.get("state") !== state) return reject(new Error("state mismatch"));
      try {
        resolve(await tokenRequest({
          grant_type: "authorization_code",
          code: url.searchParams.get("code"),
          code_verifier: verifier,
          redirect_uri: redirectUri,
        }));
      } catch (e) { reject(e); }
    });
    let redirectUri;
    server.listen(0, "127.0.0.1", () => {
      redirectUri = `http://localhost:${server.address().port}`;
      const auth = new URL(cs.auth_uri);
      auth.search = new URLSearchParams({
        client_id: cs.client_id, redirect_uri: redirectUri, response_type: "code",
        scope: SCOPES.join(" "), access_type: "offline", prompt: "consent",
        code_challenge: challenge, code_challenge_method: "S256", state,
      });
      console.log("Opening your browser to sign in with Google…");
      console.log("If it doesn't open, paste this URL into your browser:\n" + auth.toString() + "\n");
      exec(`open "${auth.toString()}"`);
    });
  });
}

let access;
if (existsSync(TOKEN_FILE)) {
  const saved = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
  access = (await tokenRequest({ grant_type: "refresh_token", refresh_token: saved.refresh_token })).access_token;
  ok("reused saved Google sign-in");
} else {
  const t = await signIn();
  if (t.refresh_token) writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token: t.refresh_token }), { mode: 0o600 });
  access = t.access_token;
  ok(`signed in (scopes granted: ${t.scope?.split(" ").length ?? "?"})`);
}

const list = async (type, params = {}) => {
  const url = new URL(`${BASE}/${type}/dataPoints`);
  url.search = new URLSearchParams(params);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
};

// --- 2. exercises ----------------------------------------------------------
const ex = await list("exercise", { pageSize: "25" });
save("exercise_latest25.json", ex.body);
if (ex.status !== 200) {
  bad(`exercise: HTTP ${ex.status}`);
  console.log(typeof ex.body === "string" ? ex.body.slice(0, 600) : JSON.stringify(ex.body).slice(0, 600));
  process.exit(1);
}
const points = ex.body.dataPoints ?? [];
ok(`exercise: ${points.length} sessions (newest 25)`);
if (points[0]) console.log("  fields on one session:", JSON.stringify(points[0]).slice(0, 700));

// --- 3. daily recovery signals ---------------------------------------------
for (const t of ["daily-resting-heart-rate", "daily-heart-rate-variability"]) {
  const r = await list(t, { pageSize: "60" });
  save(`${t}.json`, r.body);
  const n = r.body?.dataPoints?.length ?? 0;
  r.status === 200 ? ok(`${t}: ${n} days`) : bad(`${t}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  if (n) console.log("  sample:", JSON.stringify(r.body.dataPoints[0]).slice(0, 300));
}
const sl = await list("sleep", { pageSize: "25" });
save("sleep_latest25.json", sl.body);
sl.status === 200 ? ok(`sleep: ${sl.body?.dataPoints?.length ?? 0} nights`) : bad(`sleep: HTTP ${sl.status} ${JSON.stringify(sl.body).slice(0, 300)}`);

// --- 4. heart-rate samples for one day -------------------------------------
const day = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
const hr = await list("heart-rate", {
  pageSize: "10000",
  filter: `heart_rate.sample_time.physical_time >= "${day}T00:00:00Z" AND heart_rate.sample_time.physical_time < "${day}T23:59:59Z"`,
});
save("heart_rate_sample_day.json", hr.body);
hr.status === 200
  ? ok(`heart-rate samples on ${day}: ${hr.body?.dataPoints?.length ?? 0}`)
  : bad(`heart-rate: HTTP ${hr.status} ${JSON.stringify(hr.body).slice(0, 300)}`);

console.log("\nDone. Raw responses are in raw/fitbit/ (git-ignored).");
