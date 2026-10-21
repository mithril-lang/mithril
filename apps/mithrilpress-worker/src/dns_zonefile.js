export const MAX_ZONE_FILE_BYTES = 262_144;
export const MAX_DNS_RECORDS = 2_000;

const DNSSEC_GENERATED_TYPES = new Set(["DNSKEY", "RRSIG", "NSEC", "NSEC3", "NSEC3PARAM"]);
const NAME_DATA_INDEXES = {
  CNAME: [0],
  DNAME: [0],
  NS: [0],
  PTR: [0],
  MX: [1],
  SRV: [3],
  SOA: [0, 1],
  SVCB: [1],
  HTTPS: [1],
};

function dnsError(code, message) {
  return Object.assign(new Error(message), { code });
}

function normalizeLabels(value) {
  if (typeof value !== "string" || value.length > 1024 || value.trim() !== value) return null;
  const raw = value.replace(/\.$/, "");
  if (!raw || raw.startsWith(".") || raw.endsWith(".") || raw.includes("..")) return null;
  const labels = raw.split(".");
  const wildcardSafe = labels.map((label) => label === "*" ? "wildcard" : label).join(".");
  let ascii;
  try {
    ascii = new URL(`http://${wildcardSafe}/`).hostname.toLowerCase();
  } catch {
    return null;
  }
  const normalized = ascii.split(".").map((label, index) => labels[index] === "*" ? "*" : label);
  if (normalized.length !== labels.length || normalized.some((label) => label.length < 1 || label.length > 63
      || !/^(?:\*|[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)$/.test(label))) return null;
  const hostname = normalized.join(".");
  return hostname.length <= 253 ? hostname : null;
}

export function normalizeDnsZoneName(value) {
  const normalized = normalizeLabels(value);
  if (!normalized || normalized.includes("*") || normalized.split(".").length < 2) return null;
  if (normalized.split(".").some((label) => label.includes("_"))
      || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return null;
  return normalized;
}

function normalizeRecordName(value, origin) {
  if (value === "@") return origin;
  const absolute = value.endsWith(".");
  const candidate = absolute ? value.slice(0, -1) : `${value}.${origin}`;
  const normalized = normalizeLabels(candidate);
  if (!normalized) return null;
  return normalized;
}

function withinZone(name, zone) {
  return name === zone || name.endsWith(`.${zone}`);
}

function parseTtl(value) {
  if (typeof value !== "string" || !value) return null;
  const parts = [...value.matchAll(/(\d+)([wdhms]?)/gi)];
  if (!parts.length || parts.map((part) => part[0]).join("") !== value) return null;
  const factors = { "": 1, w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
  let total = 0;
  for (const [, amount, unitRaw] of parts) {
    total += Number(amount) * factors[unitRaw.toLowerCase()];
    if (!Number.isSafeInteger(total) || total > 2_147_483_647) return null;
  }
  return total;
}

function logicalRecords(source) {
  const records = [];
  let buffer = "";
  let depth = 0;
  let inQuote = false;
  let escaped = false;
  let inComment = false;
  let comment = "";
  let physicalLineStart = true;
  let recordStarted = false;
  let ownerOmitted = false;

  const flush = () => {
    const text = buffer.trim();
    if (text) records.push({ text, ownerOmitted, comment: comment.trim() });
    buffer = "";
    comment = "";
    recordStarted = false;
    ownerOmitted = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inComment) {
      if (character !== "\n" && character !== "\r") {
        comment += character;
        continue;
      }
      inComment = false;
      if (depth === 0) flush();
      else buffer += " ";
      physicalLineStart = true;
      continue;
    }

    if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      if (inQuote || escaped) throw dnsError("invalid_zone_file", "Quoted or escaped text cannot cross a zone-file line.");
      if (depth === 0) flush();
      else buffer += " ";
      physicalLineStart = true;
      continue;
    }

    if (physicalLineStart && (character === " " || character === "\t")) {
      if (!recordStarted && depth === 0) ownerOmitted = true;
      continue;
    }
    if (physicalLineStart) physicalLineStart = false;

    if (escaped) {
      buffer += character;
      escaped = false;
      recordStarted = true;
      continue;
    }
    if (character === "\\") {
      buffer += character;
      escaped = true;
      recordStarted = true;
      continue;
    }
    if (character === '"') {
      inQuote = !inQuote;
      buffer += character;
      recordStarted = true;
      continue;
    }
    if (!inQuote && character === ";") {
      inComment = true;
      continue;
    }
    if (!inQuote && character === "(") {
      depth += 1;
      if (depth > 8) throw dnsError("invalid_zone_file", "Zone-file parentheses are nested too deeply.");
      buffer += " ";
      continue;
    }
    if (!inQuote && character === ")") {
      depth -= 1;
      if (depth < 0) throw dnsError("invalid_zone_file", "Zone-file parentheses are unbalanced.");
      buffer += " ";
      continue;
    }
    buffer += character;
    if (!/\s/.test(character)) recordStarted = true;
  }

  if (inQuote || escaped || depth !== 0) throw dnsError("invalid_zone_file", "Zone-file quotes, escapes, or parentheses are incomplete.");
  flush();
  return records;
}

function tokenize(value) {
  const tokens = [];
  let token = "";
  let inQuote = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      token += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      token += character;
      inQuote = !inQuote;
      continue;
    }
    if (/\s/.test(character) && !inQuote) {
      if (token) tokens.push(token);
      token = "";
      continue;
    }
    token += character;
  }
  if (inQuote || escaped) throw dnsError("invalid_zone_file", "A quoted or escaped record value is incomplete.");
  if (token) tokens.push(token);
  return tokens;
}

function canonicalRdata(tokens) {
  return tokens.join(" ");
}

function normalizeRdata(type, tokens, origin) {
  const normalized = [...tokens];
  for (const dataIndex of NAME_DATA_INDEXES[type] ?? []) {
    if (dataIndex >= normalized.length || normalized[dataIndex] === ".") continue;
    const name = normalizeRecordName(normalized[dataIndex], origin);
    if (!name) throw dnsError("invalid_record_data", `The ${type} record contains an invalid domain name in its data.`);
    normalized[dataIndex] = `${name}.`;
  }
  return normalized;
}

function providerRecordSettings(comment) {
  const proxied = /(?:^|[,;=\s])cf-proxied:(true|false)(?=[,;\s]|$)/i.exec(comment);
  return {
    cf_proxied: proxied ? proxied[1].toLowerCase() === "true" : null,
    cf_flatten_cname: /(?:^|[,;=\s])cf-flatten-cname(?=[,;\s]|$)/i.test(comment),
  };
}

function parseRecord(tokens, ownerOmitted, lastOwner, origin, defaultTtl, zone, comment) {
  let index = 0;
  let ownerToken = ownerOmitted ? lastOwner : tokens[index++];
  if (!ownerToken) throw dnsError("invalid_zone_file", "A record omits its owner name before any owner was defined.");
  const owner = normalizeRecordName(ownerToken, origin);
  if (!owner || !withinZone(owner, zone)) throw dnsError("record_outside_zone", "A record owner is invalid or outside the requested zone.");

  let ttl = null;
  let recordClass = "IN";
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^IN$/i.test(token)) {
      recordClass = "IN";
      index += 1;
      continue;
    }
    if (/^(?:CH|CHAOS|HS|NONE|ANY)$/i.test(token)) {
      throw dnsError("unsupported_record_class", "Only Internet (IN) class records are supported by the migration planner.");
    }
    const parsedTtl = parseTtl(token);
    if (parsedTtl !== null) {
      if (ttl !== null) throw dnsError("invalid_zone_file", "A record contains more than one TTL.");
      ttl = parsedTtl;
      index += 1;
      continue;
    }
    break;
  }
  const type = tokens[index]?.toUpperCase();
  if (!type || !/^(?:[A-Z][A-Z0-9-]{0,15}|TYPE\d{1,5})$/.test(type)
      || (type.startsWith("TYPE") && Number(type.slice(4)) > 65535)) {
    throw dnsError("unsupported_record_type", "A record has an invalid or unsupported DNS type token.");
  }
  const rdataTokens = normalizeRdata(type, tokens.slice(index + 1), origin);
  if (!rdataTokens.length) throw dnsError("invalid_zone_file", `The ${type} record has no record data.`);
  const effectiveTtl = ttl ?? defaultTtl;
  const providerSettings = providerRecordSettings(comment);
  return {
    name: owner,
    type,
    ttl: effectiveTtl,
    class: recordClass,
    rdata: canonicalRdata(rdataTokens),
    rdata_tokens: rdataTokens,
    ...providerSettings,
  };
}

export function parseDnsZoneFile(source, expectedZone) {
  const zoneName = normalizeDnsZoneName(expectedZone);
  if (!zoneName) throw dnsError("invalid_zone_name", "Enter a valid fully qualified DNS zone name.");
  if (typeof source !== "string" || !source || new TextEncoder().encode(source).byteLength > MAX_ZONE_FILE_BYTES) {
    throw dnsError("zone_file_too_large", "Upload a non-empty zone file no larger than 256 KiB.");
  }
  if (source.includes("\u0000")) throw dnsError("invalid_zone_file", "The zone file contains a null byte.");

  let origin = zoneName;
  let defaultTtl = null;
  let lastOwner = null;
  const records = [];
  for (const logical of logicalRecords(source)) {
    const tokens = tokenize(logical.text);
    if (!tokens.length) continue;
    const directive = tokens[0].toUpperCase();
    if (directive === "$ORIGIN") {
      if (logical.ownerOmitted || tokens.length !== 2) throw dnsError("invalid_origin", "Use one explicit $ORIGIN that matches the migration zone.");
      const nextOrigin = normalizeRecordName(tokens[1], zoneName);
      if (!nextOrigin || nextOrigin !== zoneName) throw dnsError("origin_mismatch", "The zone file $ORIGIN must match the migration zone.");
      origin = nextOrigin;
      continue;
    }
    if (directive === "$TTL") {
      if (logical.ownerOmitted || tokens.length !== 2) throw dnsError("invalid_ttl", "The $TTL directive needs exactly one TTL value.");
      defaultTtl = parseTtl(tokens[1]);
      if (defaultTtl === null) throw dnsError("invalid_ttl", "The $TTL directive is invalid.");
      continue;
    }
    if (directive.startsWith("$")) throw dnsError("unsupported_directive", `The zone-file directive ${directive} is not supported; expand it before uploading.`);

    const record = parseRecord(tokens, logical.ownerOmitted, lastOwner, origin, defaultTtl, zoneName, logical.comment);
    lastOwner = logical.ownerOmitted ? lastOwner : tokens[0];
    records.push(record);
    if (records.length > MAX_DNS_RECORDS) throw dnsError("too_many_records", `A migration zone file may contain at most ${MAX_DNS_RECORDS} records.`);
  }
  if (records.length === 0) throw dnsError("empty_zone_file", "The zone file must contain at least one DNS record.");

  const apexSoa = records.filter((record) => record.name === zoneName && record.type === "SOA");
  const apexNs = records.filter((record) => record.name === zoneName && record.type === "NS");
  if (apexSoa.length > 1) throw dnsError("invalid_soa", "The zone file contains more than one apex SOA record.");
  let soaMinimum = null;
  if (apexSoa.length === 1) {
    const soaTokens = apexSoa[0].rdata_tokens;
    if (soaTokens.length < 7 || parseTtl(soaTokens.at(-1)) === null) {
      throw dnsError("invalid_soa", "The apex SOA record must contain its seven standard fields and a valid minimum TTL.");
    }
    soaMinimum = parseTtl(soaTokens.at(-1));
  }
  for (const record of records) {
    if (record.ttl === null) record.ttl = defaultTtl ?? soaMinimum;
    if (record.ttl === null) throw dnsError("missing_ttl", "A record has no TTL and the zone has no $TTL or SOA default.");
  }
  return { zone_name: zoneName, records, apex_soa_present: apexSoa.length === 1, apex_ns_count: apexNs.length };
}

function recordKey(record) {
  const hasProxySetting = ["A", "AAAA", "CNAME"].includes(record.type);
  return JSON.stringify([record.name, record.type, record.ttl, record.class, record.rdata,
    hasProxySetting ? record.cf_proxied === true : null,
    record.type === "CNAME" && Boolean(record.cf_flatten_cname)]);
}

function providerManagedApexRecord(record, zone) {
  return record.name === zone && (record.type === "SOA" || record.type === "NS");
}

function generatedDnssecRecord(record) {
  return DNSSEC_GENERATED_TYPES.has(record.type);
}

export function compareDnsZoneFiles(sourceRecords, targetRecords, zoneName) {
  const source = new Map();
  const target = new Map();
  for (const record of sourceRecords) {
    if (providerManagedApexRecord(record, zoneName) || generatedDnssecRecord(record)) continue;
    const key = recordKey(record);
    source.set(key, (source.get(key) ?? 0) + 1);
  }
  for (const record of targetRecords) {
    if (providerManagedApexRecord(record, zoneName) || generatedDnssecRecord(record)) continue;
    const key = recordKey(record);
    target.set(key, (target.get(key) ?? 0) + 1);
  }

  const removed = [];
  const added = [];
  for (const [key, count] of source) {
    const matched = Math.min(count, target.get(key) ?? 0);
    for (let index = matched; index < count; index += 1) removed.push(JSON.parse(key));
  }
  for (const [key, count] of target) {
    const matched = Math.min(count, source.get(key) ?? 0);
    for (let index = matched; index < count; index += 1) added.push(JSON.parse(key));
  }
  const sortRecords = (items) => items.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  sortRecords(removed);
  sortRecords(added);
  return {
    exact: removed.length === 0 && added.length === 0,
    added: added.map(([name, type, ttl, recordClass, rdata, cf_proxied, cf_flatten_cname]) => ({
      name, type, ttl, class: recordClass, rdata, cf_proxied, cf_flatten_cname,
    })),
    removed: removed.map(([name, type, ttl, recordClass, rdata, cf_proxied, cf_flatten_cname]) => ({
      name, type, ttl, class: recordClass, rdata, cf_proxied, cf_flatten_cname,
    })),
    source_dnssec_records: sourceRecords.filter(generatedDnssecRecord).length,
    target_dnssec_records: targetRecords.filter(generatedDnssecRecord).length,
    excluded_provider_managed_apex_records: true,
  };
}

export function renderDnsZoneFile(records, zoneName) {
  const lines = [
    `; MithrilPress staged DNS import for ${zoneName}.`,
    "; Review every record before importing. Apex SOA/NS and DNSSEC signing records are managed by the destination provider.",
    `$ORIGIN ${zoneName}.`,
  ];
  const importable = records.filter((record) =>
    !providerManagedApexRecord(record, zoneName) && !generatedDnssecRecord(record));
  for (const record of importable) {
    const owner = record.name === zoneName ? "@" : `${record.name.slice(0, -(zoneName.length + 1))}.`;
    const cloudflareTags = [];
    if (["A", "AAAA", "CNAME"].includes(record.type)) {
      cloudflareTags.push(`cf-proxied:${record.cf_proxied === true}`);
    }
    if (record.cf_flatten_cname && record.type === "CNAME") cloudflareTags.push("cf-flatten-cname");
    const tagComment = cloudflareTags.length ? ` ; cf_tags=${cloudflareTags.join(",")}` : "";
    lines.push(`${owner.padEnd(32)} ${record.ttl ?? 3600} IN ${record.type} ${record.rdata}${tagComment}`);
  }
  return `${lines.join("\n")}\n`;
}
