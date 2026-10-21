function boundedHttpUrl(value, base) {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, base);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function sameSourceHost(url, sourceUrl) {
  return url.hostname.toLowerCase() === sourceUrl.hostname.toLowerCase()
    && url.port === sourceUrl.port;
}

const TRACKING_QUERY_PARAMETER = /^(?:utm_[a-z0-9_]+|gclid|dclid|fbclid|msclkid|mc_cid|mc_eid)$/i;

function sourcePathKey(url) {
  const routeParameters = [...url.searchParams.entries()]
    .filter(([name]) => !TRACKING_QUERY_PARAMETER.test(name))
    .sort(([leftName, leftValue], [rightName, rightValue]) => leftName.localeCompare(rightName)
      || leftValue.localeCompare(rightValue));
  const query = new URLSearchParams(routeParameters).toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

function sourceUrl(value, sourceOrigin) {
  const origin = boundedHttpUrl(sourceOrigin, sourceOrigin);
  if (!origin) return null;
  const url = boundedHttpUrl(value, `${origin.origin}/`);
  return url && sameSourceHost(url, origin) ? url : null;
}

function localCanonicalUrl(siteHostname, entry) {
  const path = entry.kind === "page" && entry.slug === "home"
    ? "/"
    : `/${encodeURIComponent(entry.slug)}/`;
  return `https://${siteHostname}${path}`;
}

/** Map source WordPress permalinks to their imported MithrilPress routes. */
export function buildWordPressPermalinkMap(records, sourceOrigin, siteHostname) {
  const map = new Map();
  const ambiguous = new Set();
  for (const record of records ?? []) {
    const url = sourceUrl(record?.sourcePermalink, sourceOrigin);
    if (!url || typeof record?.slug !== "string"
        || (record.kind !== "post" && record.kind !== "page")) continue;
    const key = sourcePathKey(url);
    const target = localCanonicalUrl(siteHostname, record);
    if (ambiguous.has(key)) continue;
    const existing = map.get(key);
    if (existing && existing !== target) {
      map.delete(key);
      ambiguous.add(key);
    } else {
      map.set(key, target);
    }
  }
  return map;
}

/** Rewrite only links that resolve to a known imported item on the admitted source host. */
export function rewriteWordPressLink(value, {
  sourceOrigin,
  sourcePermalink,
  permalinkMap,
} = {}) {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) {
    return { href: null, sourceSite: false, rewritten: false, unresolved: false, removed: true };
  }
  if (value.startsWith("#")) {
    return { href: value, sourceSite: false, rewritten: false, unresolved: false, removed: false };
  }
  const origin = boundedHttpUrl(sourceOrigin, sourceOrigin);
  if (!origin) return { href: null, sourceSite: false, rewritten: false, unresolved: false, removed: true };
  const pageBase = sourceUrl(sourcePermalink, sourceOrigin)?.href ?? `${origin.origin}/`;
  const url = boundedHttpUrl(value, pageBase);
  if (!url) return { href: null, sourceSite: false, rewritten: false, unresolved: false, removed: true };
  if (!sameSourceHost(url, origin)) {
    return { href: url.href, sourceSite: false, rewritten: false, unresolved: false, removed: false };
  }
  const target = permalinkMap?.get(sourcePathKey(url));
  if (target) {
    return {
      href: `${target}${url.search}${url.hash}`,
      sourceSite: true,
      rewritten: true,
      unresolved: false,
      removed: false,
    };
  }
  return {
    href: url.href,
    sourceSite: true,
    rewritten: false,
    unresolved: true,
    removed: false,
  };
}
