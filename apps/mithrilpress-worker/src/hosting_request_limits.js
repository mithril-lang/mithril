function hostingRequestQuotaCode(error) {
  const message = String(error?.message ?? error ?? "");
  if (message.includes("site_daily_hosting_request_limit")) return "site_daily_hosting_request_limit";
  if (message.includes("deployment_daily_hosting_request_limit")) return "deployment_daily_hosting_request_limit";
  return null;
}

function deploymentRequestStatement(env, dayUtc) {
  return env.DB.prepare(
    "INSERT INTO mithrilpress_deployment_daily_requests (singleton, day_utc, request_count) VALUES (1, ?, 1) ON CONFLICT(singleton) DO UPDATE SET day_utc = excluded.day_utc, request_count = CASE WHEN mithrilpress_deployment_daily_requests.day_utc = excluded.day_utc THEN mithrilpress_deployment_daily_requests.request_count + 1 ELSE 1 END",
  ).bind(dayUtc);
}

function siteRequestStatement(env, siteId, dayUtc) {
  return env.DB.prepare(
    "INSERT INTO mithrilpress_site_daily_requests (site_id, day_utc, request_count) VALUES (?, ?, 1) ON CONFLICT(site_id) DO UPDATE SET day_utc = excluded.day_utc, request_count = CASE WHEN mithrilpress_site_daily_requests.day_utc = excluded.day_utc THEN mithrilpress_site_daily_requests.request_count + 1 ELSE 1 END",
  ).bind(siteId, dayUtc);
}

async function consumeRequestStatements(env, statements) {
  try {
    await env.DB.batch(statements);
    return null;
  } catch (error) {
    const code = hostingRequestQuotaCode(error);
    if (code) return code;
    throw error;
  }
}

/** Increment one trigger-enforced hosting request counter. */
export async function consumeHostingRequest(env, siteId = null, date = new Date()) {
  const dayUtc = date.toISOString().slice(0, 10);
  const statement = siteId === null
    ? deploymentRequestStatement(env, dayUtc)
    : siteRequestStatement(env, siteId, dayUtc);
  return consumeRequestStatements(env, [statement]);
}

/** Atomically charge a public site's request to both shared and site counters. */
export async function consumeHostingRequestForSite(env, siteId, date = new Date()) {
  if (typeof siteId !== "string" || siteId.length === 0) {
    throw new TypeError("A site ID is required for a site-scoped hosting request.");
  }
  const dayUtc = date.toISOString().slice(0, 10);
  return consumeRequestStatements(env, [
    deploymentRequestStatement(env, dayUtc),
    siteRequestStatement(env, siteId, dayUtc),
  ]);
}
