#!/usr/bin/env node
// verify_pr_contracts.mjs — blocking automated gate.
// Asserts the scc_procurement PR views expose the exact columns the frontend depends on,
// over the real anon + Accept-Profile path. Exits non-zero on any contract failure.
// Node 18+ (global fetch). Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from env or .env files.
import { readFileSync, existsSync } from "node:fs";

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}
loadEnv();

// [VERIFY IN REPO] env var names — adjust if the repo uses different ones.
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error(
    "FAIL: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not found in env or .env(.local).",
  );
  process.exit(2);
}

const CONTRACTS = {
  v_pr_tracker:
    "pr_number,total_rfqs,issued_rfqs,rfqs_with_responses,rfqs_evaluated," +
    "total_vendors_invited,total_responses_received,total_items,rfq_references," +
    "first_rfq_created_at,last_rfq_created_at,pr_status,pr_status_code",
  v_pr_rfq_detail:
    "pr_number,rfq_id,rfq_reference,title,rfq_type,rfq_status,created_at," +
    "items_from_this_pr,vendors_invited,responses_received,comparisons_count,finalised_count",
};

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Accept-Profile": "scc_procurement",
};

let failed = false;
for (const [view, columns] of Object.entries(CONTRACTS)) {
  // Selecting the explicit column list makes PostgREST 400 if ANY column is missing,
  // so this verifies the full contract even when the view returns zero rows.
  const url = `${URL.replace(/\/$/, "")}/rest/v1/${view}?select=${encodeURIComponent(columns)}&limit=1`;
  try {
    const res = await fetch(url, { headers });
    if (res.status === 200) {
      console.log(`PASS  ${view} (all ${columns.split(",").length} contract columns present)`);
    } else {
      failed = true;
      console.error(`FAIL  ${view} -> HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  } catch (e) {
    failed = true;
    console.error(`FAIL  ${view} -> ${e.message}`);
  }
}

if (failed) {
  console.error(
    "\nContract gate FAILED. A view column the frontend relies on is missing or unreachable. Do NOT proceed — flag to the backend operator.",
  );
  process.exit(1);
}
console.log("\nContract gate PASSED.");
