function hostingRequestQuotaCode(error) {
  const message = String(error?.message ?? error ?? "");
  if (message.includes("site_daily_hosting_request_limit")) return "site_daily_hosting_request_limit";
  if (message.includes("deployment_daily_hosting_request_limit")) return "deployment_daily_hosting_request_limit";
  return null;
}

/** Increment one of the shared, trigger-enforced hosting request counters. */
export async function consumeHostingRequest(env, siteId = null, date = new Date()) {
  const dayUtc = date.toISOString().slice(0, 10);
  const statement = siteId === null
    ? env.DB.prepare(
      "INSERT INTO mithrilpress_deployment_daily_requests (singleton, day_utc, request_count) VALUES (1, ?, 1) ON CONFLICT(singleton) DO UPDATE SET day_utc = excluded.day_utc, request_count = CASE WHEN mithrilpress_deployment_daily_requests.day_utc = excluded.day_utc THEN mithrilpress_deployment_daily_requests.request_count + 1 ELSE 1 END",
    ).bind(dayUtc)
    : env.DB.prepare(
        "INSERT INTO mithrilpress_site_daily_requests (site_id, day_utc, request_count) VALUES (?, ?, 1) ON CONFLICT(site_id) DO UPDATE SET day_utc = excluded.day_utc, request_count = CASE WHEN mithrilpress_site_daily_requests.day_utc = excluded.day_utc THEN mithrilpress_site_daily_requests.request_count + 1 ELSE 1 END",
      ).bind(siteId, dayUtc);
  try {
    await env.DB.batch([statement]);
    return null;
  } catch (error) {
    const code = hostingRequestQuotaCode(error);
    if (code) return code;
    throw error;
  }
}
