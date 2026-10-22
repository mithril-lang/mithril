const INDEX_PATH = "/_mithrilpress-wp-api/index.json";
const MAX_INDEX_BYTES = 25 * 1024 * 1024;
const MAX_RECORD_BYTES = 8 * 1024 * 1024;

function json(body, status = 200, headers = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function fail(status, code, message) {
  return json({ error: code, message }, status, { "Cache-Control": "no-store" });
}

async function readJsonAsset(context, pathname, maximumBytes) {
  const asset = await context.env.ASSETS.fetch(new URL(pathname, context.request.url));
  if (!asset.ok || !asset.body) return null;
  const reader = asset.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function boundedInt(value, fallback, minimum, maximum) {
  if (value === null || value === "") return fallback;
  if (!/^[0-9]{1,6}$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function dateFilter(value, endOfDay = false) {
  if (value === null) return { valid: true, value: null };
  if (value.length > 40 || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    return { valid: false, value: null };
  }
  const day = value.slice(0, 10);
  const midnight = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) {
    return { valid: false, value: null };
  }
  const normalized = endOfDay && value.length === 10 ? `${value}T23:59:59.999Z` : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp)
    ? { valid: true, value: new Date(timestamp).toISOString() }
    : { valid: false, value: null };
}

function entryTimestamp(entry, modified = false) {
  const value = modified
    ? entry.modified_gmt ?? entry.modified ?? entry.date_gmt ?? entry.date
    : entry.date_gmt ?? entry.date;
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : -1;
}

function pageHeaders(request, page, perPage, total) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / perPage);
  const headers = { "X-WP-Total": String(total), "X-WP-TotalPages": String(totalPages) };
  if (totalPages > 0) {
    const pageLink = (targetPage) => {
      const target = new URL(request.url);
      target.searchParams.set("page", String(targetPage));
      target.searchParams.set("per_page", String(perPage));
      return `<${target.origin}${target.pathname}${target.search}>`;
    };
    const links = [];
    if (page > 1) links.push(`${pageLink(page - 1)}; rel="prev"`);
    if (page < totalPages) links.push(`${pageLink(page + 1)}; rel="next"`);
    if (links.length) headers.Link = links.join(", ");
  }
  return headers;
}

function validContext(url) {
  const context = url.searchParams.get("context");
  return !context || context === "view" || context === "embed";
}

function validSlug(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 200
    && value.trim() === value && !/[/?#\\\u0000-\u001f\u007f]/u.test(value);
}

async function entryRecord(context, entry) {
  if (!/^\/_mithrilpress-wp-api\/entries\/(posts|pages)\/[1-9][0-9]{0,15}\.json$/.test(entry.record_path ?? "")) return null;
  const record = await readJsonAsset(context, entry.record_path, MAX_RECORD_BYTES);
  return record && record.id === entry.id && record.type === entry.kind ? record : null;
}

async function wordpressEntries(context, catalog, kind, itemId) {
  const request = context.request;
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method_not_allowed", "This WordPress compatibility endpoint is read-only.");
  if (!validContext(url)) return fail(401, "context_not_available", "Authenticated WordPress edit contexts are not available through the public API.");

  const entries = catalog.entries.filter((entry) => entry.kind === kind);
  if (itemId !== null) {
    if (!/^[0-9]{1,15}$/.test(itemId)) return fail(404, "entry_not_found", "Entry not found.");
    const entry = entries.find((candidate) => candidate.id === Number(itemId));
    if (!entry) return fail(404, "entry_not_found", "Entry not found.");
    const record = await entryRecord(context, entry);
    if (!record) return fail(503, "publication_data_unavailable", "The published WordPress record is unavailable.");
    return json(request.method === "HEAD" ? null : record);
  }

  const page = boundedInt(url.searchParams.get("page"), 1, 1, 100000);
  const perPage = boundedInt(url.searchParams.get("per_page"), 10, 1, 100);
  if (page === null || perPage === null) return fail(400, "invalid_pagination", "Use a valid WordPress page and per_page value (1-100).");
  const slug = url.searchParams.get("slug");
  if (slug !== null && !validSlug(slug)) {
    return fail(400, "invalid_slug", "The slug filter is invalid.");
  }
  const searchValue = url.searchParams.get("search");
  const search = searchValue === null ? null : searchValue.trim().toLowerCase();
  if (search !== null && (!search || search.length > 100 || /[\u0000-\u001f\u007f]/.test(search))) {
    return fail(400, "invalid_search", "The search filter must contain 1-100 printable characters.");
  }
  const after = dateFilter(url.searchParams.get("after"));
  const before = dateFilter(url.searchParams.get("before"), true);
  const modifiedAfter = dateFilter(url.searchParams.get("modified_after"));
  const modifiedBefore = dateFilter(url.searchParams.get("modified_before"), true);
  if (![after, before, modifiedAfter, modifiedBefore].every((item) => item.valid)) {
    return fail(400, "invalid_date_filter", "Use an ISO 8601 date or date-time for WordPress date filters.");
  }
  if ((after.value && before.value && after.value > before.value)
      || (modifiedAfter.value && modifiedBefore.value && modifiedAfter.value > modifiedBefore.value)) {
    return fail(400, "invalid_date_range", "A date filter's after value must not be later than its before value.");
  }

  const order = url.searchParams.get("order") ?? "desc";
  const orderby = url.searchParams.get("orderby") ?? "date";
  if (!new Set(["asc", "desc"]).has(order)) return fail(400, "invalid_order", "Sort order must be asc or desc.");
  if (!new Set(["date", "id", "modified", "slug", "title", "relevance"]).has(orderby)) {
    return fail(400, "invalid_orderby", "Sort posts and pages by date, id, modified, relevance, slug, or title.");
  }
  if (orderby === "relevance" && search === null) return fail(400, "search_term_required", "A search filter is required when ordering by relevance.");

  let selected = entries.filter((entry) => {
    if (slug !== null && entry.slug !== slug) return false;
    // Static hosting keeps a compact index: search matches published titles only.
    if (search !== null && !entry.title.toLowerCase().includes(search)) return false;
    const date = entryTimestamp(entry);
    const modified = entryTimestamp(entry, true);
    if (after.value && date < Date.parse(after.value)) return false;
    if (before.value && date > Date.parse(before.value)) return false;
    if (modifiedAfter.value && modified < Date.parse(modifiedAfter.value)) return false;
    if (modifiedBefore.value && modified > Date.parse(modifiedBefore.value)) return false;
    return true;
  });
  const direction = order === "desc" ? -1 : 1;
  selected.sort((left, right) => {
    if (orderby === "relevance") {
      const score = (title) => title.toLowerCase() === search ? 2 : 1;
      const scoreDelta = score(left.title) - score(right.title);
      if (scoreDelta) return scoreDelta * direction;
    }
    const a = orderby === "id" ? left.id
      : orderby === "modified" ? entryTimestamp(left, true)
        : orderby === "slug" ? left.slug.toLowerCase()
          : orderby === "title" ? left.title.toLowerCase() : entryTimestamp(left);
    const b = orderby === "id" ? right.id
      : orderby === "modified" ? entryTimestamp(right, true)
        : orderby === "slug" ? right.slug.toLowerCase()
          : orderby === "title" ? right.title.toLowerCase() : entryTimestamp(right);
    if (a < b) return -direction;
    if (a > b) return direction;
    return left.api_id - right.api_id;
  });

  const headers = pageHeaders(request, page, perPage, selected.length);
  const pageEntries = selected.slice((page - 1) * perPage, page * perPage);
  if (request.method === "HEAD") return json(null, 200, headers);
  const records = await Promise.all(pageEntries.map((entry) => entryRecord(context, entry)));
  if (records.some((record) => !record)) return fail(503, "publication_data_unavailable", "The published WordPress records are unavailable.");
  return json(records, 200, headers);
}

function wordpressTerm(hostname, term) {
  const taxonomy = term.taxonomy;
  const slugPath = taxonomy === "category" ? "category" : "tag";
  const value = {
    id: term.term_id,
    count: term.count,
    description: term.description_html,
    link: `https://${hostname}/${slugPath}/${encodeURIComponent(term.slug)}/`,
    name: term.name,
    slug: term.slug,
    taxonomy,
    meta: {},
  };
  if (taxonomy === "category") value.parent = term.parent_term_id;
  return value;
}

async function wordpressTerms(context, catalog, taxonomy, itemId) {
  const request = context.request;
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method_not_allowed", "This WordPress taxonomy endpoint is read-only.");
  if (!validContext(url)) return fail(401, "context_not_available", "Authenticated WordPress edit contexts are not available through the public API.");
  let terms = catalog.terms.filter((term) => term.taxonomy === taxonomy);
  if (itemId !== null) {
    if (!/^[0-9]{1,15}$/.test(itemId)) return fail(404, "term_not_found", "Term not found.");
    const term = terms.find((candidate) => candidate.term_id === Number(itemId));
    if (!term) return fail(404, "term_not_found", "Term not found.");
    return json(request.method === "HEAD" ? null : wordpressTerm(catalog.hostname, term));
  }

  const page = boundedInt(url.searchParams.get("page"), 1, 1, 100000);
  const perPage = boundedInt(url.searchParams.get("per_page"), 10, 1, 100);
  if (page === null || perPage === null) return fail(400, "invalid_pagination", "Use a valid WordPress page and per_page value (1-100).");
  const slug = url.searchParams.get("slug");
  if (slug !== null && !validSlug(slug)) return fail(400, "invalid_slug", "The term slug filter is invalid.");
  const searchValue = url.searchParams.get("search");
  const search = searchValue === null ? null : searchValue.trim().toLowerCase();
  if (search !== null && (!search || search.length > 100)) return fail(400, "invalid_search", "The term search must contain 1-100 characters.");
  const hideEmpty = url.searchParams.get("hide_empty");
  if (hideEmpty !== null && !["true", "false", "1", "0"].includes(hideEmpty)) return fail(400, "invalid_hide_empty", "Use true, false, 1, or 0 for hide_empty.");
  if (hideEmpty === null || hideEmpty === "true" || hideEmpty === "1") terms = terms.filter((term) => term.count > 0);
  if (slug !== null) terms = terms.filter((term) => term.slug === slug);
  if (search !== null) terms = terms.filter((term) => term.name.toLowerCase().includes(search));

  const order = url.searchParams.get("order") ?? "asc";
  const orderby = url.searchParams.get("orderby") ?? "name";
  if (!new Set(["asc", "desc"]).has(order)) return fail(400, "invalid_order", "Sort order must be asc or desc.");
  if (!new Set(["name", "id", "slug", "count"]).has(orderby)) return fail(400, "invalid_orderby", "Sort terms by name, id, slug, or count.");
  const direction = order === "desc" ? -1 : 1;
  terms.sort((a, b) => {
    const left = orderby === "id" ? a.term_id : orderby === "slug" ? a.slug.toLowerCase() : orderby === "count" ? a.count : a.name.toLowerCase();
    const right = orderby === "id" ? b.term_id : orderby === "slug" ? b.slug.toLowerCase() : orderby === "count" ? b.count : b.name.toLowerCase();
    if (left < right) return -direction;
    if (left > right) return direction;
    return a.term_id - b.term_id;
  });
  const headers = pageHeaders(request, page, perPage, terms.length);
  const result = terms.slice((page - 1) * perPage, page * perPage).map((term) => wordpressTerm(catalog.hostname, term));
  return json(request.method === "HEAD" ? null : result, 200, headers);
}

function wordpressMedia(catalog, itemId) {
  if (!/^[0-9]{1,15}$/.test(itemId)) return null;
  const id = Number(itemId);
  const asset = catalog.media.find((candidate) => candidate.wordpress_source_id === id)
    ?? catalog.media.find((candidate) => candidate.id === id);
  if (!asset) return null;
  const link = `https://${catalog.hostname}${asset.path}`;
  return {
    id: asset.wordpress_source_id ?? asset.id,
    date: asset.created_at,
    slug: `media-${asset.id}`,
    status: "inherit",
    type: "attachment",
    link,
    title: { rendered: asset.alt_text || `Image ${asset.id}` },
    author: 0,
    media_type: "image",
    mime_type: asset.content_type,
    media_details: { width: asset.width, height: asset.height, file: `media-${asset.id}` },
    post: 0,
    source_url: link,
    alt_text: asset.alt_text,
  };
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const match = /^\/wp-json\/wp\/v2\/(posts|pages|categories|tags|media)(?:\/([0-9]+))?\/?$/.exec(url.pathname);
  if (!match) return fail(404, "route_not_found", "This WordPress REST route is not available on the static publication.");
  if (request.method !== "GET" && request.method !== "HEAD") return fail(405, "method_not_allowed", "The WordPress compatibility API is read-only.");

  const catalog = await readJsonAsset(context, INDEX_PATH, MAX_INDEX_BYTES);
  if (!catalog || catalog.schema_version !== 1 || catalog.hostname !== url.hostname
      || !Array.isArray(catalog.entries) || !Array.isArray(catalog.terms) || !Array.isArray(catalog.media)) {
    return fail(503, "publication_data_unavailable", "The published WordPress compatibility index is unavailable.");
  }
  const [, endpoint, itemId] = match;
  if (endpoint === "posts" || endpoint === "pages") {
    return await wordpressEntries(context, catalog, endpoint === "pages" ? "page" : "post", itemId ?? null);
  }
  if (endpoint === "categories" || endpoint === "tags") {
    return await wordpressTerms(context, catalog, endpoint === "categories" ? "category" : "post_tag", itemId ?? null);
  }
  if (itemId === undefined) return fail(404, "route_not_found", "This WordPress REST route is not available on the static publication.");
  const media = wordpressMedia(catalog, itemId);
  if (!media) return fail(404, "media_not_found", "Media item not found.");
  return json(request.method === "HEAD" ? null : media);
}
