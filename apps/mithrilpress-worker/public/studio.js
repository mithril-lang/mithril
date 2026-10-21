const requestHeader = { "X-MithrilPress-Request": "1" };
let activeConversationId = null;
let activeDraft = null;
let ownerScopes = [];
let selectedFeaturedMediaId = null;
let mediaItems = [];

const loginPanel = document.querySelector("#login-panel");
const studioPanel = document.querySelector("#studio-panel");
const loginStatus = document.querySelector("#login-status");
const studioStatus = document.querySelector("#studio-status");
const chatMessages = document.querySelector("#chat-messages");
const chatInput = document.querySelector("#chat-input");
const conversationList = document.querySelector("#conversation-list");
const draftPanel = document.querySelector("#draft-panel");
const previewLink = document.querySelector("#preview-link");
const draftTitle = document.querySelector("#draft-title");
const draftState = document.querySelector("#draft-state");
const contentPanel = document.querySelector("#content-panel");
const contentTab = document.querySelector("#content-tab");
const mediaPanel = document.querySelector("#media-panel");
const mediaTab = document.querySelector("#media-tab");
const mediaList = document.querySelector("#media-list");
const mediaStatus = document.querySelector("#media-status");
const featuredImageControl = document.querySelector("#featured-image-control");
const domainsPanel = document.querySelector("#domains-panel");
const domainsTab = document.querySelector("#domains-tab");
const dnsMigrationPanel = document.querySelector("#dns-migration-panel");
const dnsMigrationTab = document.querySelector("#dns-migration-tab");
const usagePanel = document.querySelector("#usage-panel");
const usageTab = document.querySelector("#usage-tab");
const domainList = document.querySelector("#domain-list");
const domainStatus = document.querySelector("#domain-status");
const domainForm = document.querySelector("#domain-form");
const domainUnavailable = document.querySelector("#domain-unavailable");
const defaultHostname = document.querySelector("#default-hostname");
const dnsMigrationList = document.querySelector("#dns-migration-list");
const dnsMigrationDetail = document.querySelector("#dns-migration-detail");
const dnsMigrationStatus = document.querySelector("#dns-migration-status");
const dnsMigrationWorkflow = document.querySelector("#dns-migration-workflow");
let activeDnsMigrationId = null;
let cloudflareDnsImportsEnabled = false;

document.querySelector("#site-host").textContent = window.location.host;

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET") headers.set("X-MithrilPress-Request", "1");
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const contentType = response.headers.get("Content-Type") || "";
  const result = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(result?.error?.message || `Request failed (${response.status}).`);
  return result;
}

function showStatus(target, message = "") {
  target.textContent = message;
}

function showStudioView(name) {
  const canContent = ownerScopes.includes("content:write");
  const canMedia = ownerScopes.includes("media:write");
  const canDomains = ownerScopes.includes("site:domains");
  const canDnsMigration = ownerScopes.includes("site:dns-migrate");
  const canUsage = canContent || canMedia || canDomains;
  const showUsage = canUsage && name === "usage";
  const showDnsMigration = canDnsMigration && (name === "dns-migration" || (!canContent && !canMedia && !canDomains && !showUsage));
  const showDomains = canDomains && (name === "domains" || (!canContent && !canMedia && !showUsage && !showDnsMigration));
  const showMedia = canMedia && (name === "media" || (!canContent && !canDomains && !canDnsMigration && !showUsage));
  const showContent = canContent && !showDomains && !showUsage && !showDnsMigration && !showMedia;
  contentTab.hidden = !canContent;
  mediaTab.hidden = !canMedia;
  domainsTab.hidden = !canDomains;
  dnsMigrationTab.hidden = !canDnsMigration;
  usageTab.hidden = !canUsage;
  contentPanel.hidden = !showContent;
  mediaPanel.hidden = !showMedia;
  domainsPanel.hidden = !showDomains;
  dnsMigrationPanel.hidden = !showDnsMigration;
  usagePanel.hidden = !showUsage;
  contentTab.setAttribute("aria-current", showContent ? "page" : "false");
  mediaTab.setAttribute("aria-current", showMedia ? "page" : "false");
  domainsTab.setAttribute("aria-current", showDomains ? "page" : "false");
  dnsMigrationTab.setAttribute("aria-current", showDnsMigration ? "page" : "false");
  usageTab.setAttribute("aria-current", showUsage ? "page" : "false");
}

function setOwnerScopes(scopes = []) {
  ownerScopes = Array.isArray(scopes) ? scopes : [];
  defaultHostname.textContent = "";
  showStudioView(ownerScopes.includes("content:write") ? "content"
    : ownerScopes.includes("media:write") ? "media"
      : ownerScopes.includes("site:domains") ? "domains" : "dns-migration");
  featuredImageControl.hidden = !ownerScopes.includes("content:write") || !ownerScopes.includes("media:write");
  renderFeaturedImageSelection();
}

function renderFeaturedImageSelection() {
  const label = document.querySelector("#featured-image-label");
  const selected = mediaItems.find((item) => item.id === selectedFeaturedMediaId);
  label.textContent = selected ? `Featured image: ${selected.alt_text || `Image ${selected.id}`}` : "No featured image selected.";
}

function clearMessages() {
  chatMessages.replaceChildren();
}

function renderMessage(role, body, error = false) {
  const message = document.createElement("div");
  message.className = `message ${error ? "message-error" : role === "user" ? "message-user" : "message-assistant"}`;
  message.dataset.role = role;
  message.textContent = body;
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showDraft(draft, revisionId, state, previewUrl) {
  if (!draft || !revisionId) {
    activeDraft = null;
    draftPanel.hidden = true;
    return;
  }
  activeDraft = { revisionId, state };
  draftPanel.hidden = false;
  draftTitle.textContent = draft.title || "Untitled draft";
  draftState.textContent = `Revision state: ${state || "private-preview"}`;
  previewLink.href = previewUrl || `/_mithrilpress/preview/${revisionId}/${encodeURIComponent(draft.slug)}`;
  document.querySelector("#approve-button").hidden = state !== "private-preview";
  document.querySelector("#publish-button").hidden = state !== "approved";
}

function resetConversation() {
  activeConversationId = null;
  selectedFeaturedMediaId = null;
  renderFeaturedImageSelection();
  document.querySelector("#delete-conversation").hidden = true;
  document.querySelector("#editor-title").textContent = "What should we write?";
  clearMessages();
  const emptyState = document.createElement("p");
  emptyState.className = "empty-state";
  emptyState.textContent = "Describe the post or page you want. You can refine it by chatting; every response remains a private draft.";
  chatMessages.append(emptyState);
  showDraft(null, null, null);
  document.querySelector("#send-button").textContent = "Create draft";
  showStatus(studioStatus);
}

async function refreshConversations() {
  const result = await api("/_mithrilpress/api/studio/conversations");
  conversationList.replaceChildren();
  for (const conversation of result.conversations) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "conversation-item";
    button.setAttribute("aria-current", conversation.id === activeConversationId ? "page" : "false");
    const title = document.createElement("span");
    title.className = "conversation-item-title";
    title.textContent = conversation.title || "New draft";
    const state = document.createElement("span");
    state.className = "conversation-item-state";
    state.textContent = conversation.draft_state || "No draft yet";
    button.append(title, state);
    button.addEventListener("click", () => openConversation(conversation.id));
    item.append(button);
    conversationList.append(item);
  }
}

async function openConversation(id) {
  showStatus(studioStatus);
  try {
    const result = await api(`/_mithrilpress/api/studio/conversations/${encodeURIComponent(id)}`);
    activeConversationId = result.conversation.id;
    document.querySelector("#delete-conversation").hidden = false;
    document.querySelector("#editor-title").textContent = "Refine your draft";
    clearMessages();
    for (const message of result.conversation.messages) renderMessage(message.role, message.body);
    if (result.conversation.draft) {
      selectedFeaturedMediaId = result.conversation.draft.featured_media_id ?? null;
      renderFeaturedImageSelection();
      showDraft(result.conversation.draft, result.conversation.draft_revision_id, result.conversation.draft_state);
      document.querySelector("#content-kind").value = result.conversation.draft.kind;
      document.querySelector("#send-button").textContent = "Update draft";
    } else {
      showDraft(null, null, null);
      document.querySelector("#send-button").textContent = "Create draft";
    }
    await refreshConversations();
  } catch (error) {
    showStatus(studioStatus, error.message);
  }
}

async function signIn(token) {
  const result = await api("/_mithrilpress/api/studio/session", { method: "POST", body: { token }, headers: requestHeader });
  setOwnerScopes(result.scopes);
  loginPanel.hidden = true;
  studioPanel.hidden = false;
  document.querySelector("#studio-nav").hidden = false;
  document.querySelector("#logout-button").hidden = false;
  showStatus(loginStatus);
  showStatus(studioStatus, `Signed in as ${result.owner}.`);
  if (ownerScopes.includes("content:write")) await refreshConversations();
  if (ownerScopes.includes("media:write")) await refreshMedia();
  if (ownerScopes.includes("site:domains")) await refreshDomains();
  if (ownerScopes.includes("site:dns-migrate")) await refreshDnsMigrations();
  if (ownerScopes.includes("content:write") || ownerScopes.includes("media:write") || ownerScopes.includes("site:domains")) await refreshUsage();
}

function addDomainRecord(card, record, label) {
  const block = document.createElement("div");
  block.className = "domain-record";
  const heading = document.createElement("strong");
  heading.textContent = label;
  const value = document.createElement("code");
  value.textContent = `${record.type}  ${record.name}  ${record.value}`;
  block.append(heading, value);
  card.append(block);
}

function domainButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button button-small ${className || ""}`.trim();
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderDomain(domain) {
  const card = document.createElement("li");
  card.className = "domain-card";
  const heading = document.createElement("div");
  heading.className = "domain-card-heading";
  const hostname = document.createElement("h2");
  hostname.textContent = domain.hostname;
  const state = document.createElement("span");
  state.className = "domain-state";
  state.textContent = (domain.status || "unknown").replaceAll("_", " ");
  heading.append(hostname, state);
  card.append(heading);

  if (domain.ownership_record) addDomainRecord(card, domain.ownership_record, "Ownership verification");
  for (const record of domain.validation_records || []) addDomainRecord(card, record, "TLS validation");
  if (domain.cname_record) addDomainRecord(card, domain.cname_record, "Customer DNS · keep DNS only");

  const actions = document.createElement("div");
  actions.className = "domain-card-actions";
  if (domain.status === "ownership_pending" || domain.status === "provider_pending" || domain.status === "provider_creating"
      || (domain.status === "action_required" && !domain.provider_status)) {
    const label = domain.status === "ownership_pending" ? "Verify ownership"
      : domain.status === "provider_pending" ? "Continue setup" : "Retry setup";
    actions.append(domainButton(label, "button-secondary", async () => runDomainAction(domain, "verify")));
  } else if (domain.status !== "detached" && domain.status !== "provider_creating") {
    actions.append(domainButton("Refresh status", "button-secondary", async () => runDomainAction(domain, "refresh")));
  }
  if (domain.status !== "detached") {
    actions.append(domainButton(domain.status === "detaching" ? "Retry removal" : "Remove hostname", "domain-remove", async () => {
      if (!window.confirm(`Remove ${domain.hostname} from this site? The hostname will stop serving this site immediately.`)) return;
      await runDomainAction(domain, "delete");
    }));
  }
  if (actions.childElementCount > 0) card.append(actions);
  return card;
}

async function refreshDomains() {
  if (!ownerScopes.includes("site:domains")) return;
  try {
    const result = await api("/_mithrilpress/api/domains");
    defaultHostname.textContent = `Default address: ${result.default_hostname || window.location.host}`;
    domainForm.hidden = !result.enabled;
    domainUnavailable.hidden = result.enabled;
    domainList.replaceChildren();
    for (const domain of result.domains || []) domainList.append(renderDomain(domain));
    if (result.domains?.length === 0 && result.enabled) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "No customer domains are connected yet.";
      domainList.append(empty);
    }
  } catch (error) {
    showStatus(domainStatus, error.message);
  }
}

async function refreshUsage() {
  if (!ownerScopes.includes("content:write") && !ownerScopes.includes("media:write") && !ownerScopes.includes("site:domains")) return;
  const target = document.querySelector("#usage-status");
  showStatus(target);
  try {
    const result = await api("/_mithrilpress/api/studio/usage");
    const stored = Math.max(0, Number(result.storage.estimated_content_bytes) || 0);
    const limit = Math.max(1, Number(result.storage.site_limit_bytes) || 1);
    const usedMiB = (stored / (1024 * 1024)).toFixed(2);
    const limitMiB = (limit / (1024 * 1024)).toFixed(2);
    document.querySelector("#site-storage-usage").textContent = `${usedMiB} MiB of ${limitMiB} MiB`;
    const progress = document.querySelector("#site-storage-progress");
    progress.max = limit;
    progress.value = Math.min(stored, limit);
    const sharedLimit = Math.max(0, Number(result.storage.shared_deployment_limit_bytes) || 0);
    document.querySelector("#shared-storage-limit").textContent = `Shared retained-content ceiling: ${(sharedLimit / (1024 * 1024)).toFixed(0)} MiB across this hosting deployment. Aggregate usage is managed by the host operator.`;
    document.querySelector("#site-hosting-usage").textContent = `${result.hosting_requests.site_requests_used} of ${result.hosting_requests.site_daily_limit} site requests today (UTC)`;
    document.querySelector("#site-hosting-reset").textContent = `Shared deployment usage: ${result.hosting_requests.deployment_requests_used} of ${result.hosting_requests.shared_deployment_daily_limit} requests today. Every hosted route consumes this allowance; unresolved hosts consume the shared cap only. Resets at ${result.hosting_requests.resets_at_utc}.`;
    document.querySelector("#ai-usage").textContent = `${result.ai_drafting.requests_used} of ${result.ai_drafting.daily_app_limit} shared requests today (UTC)`;
    const estimatedNeurons = Math.max(0, Number(result.ai_drafting.estimated_neurons_reserved) || 0);
    const estimatedNeuronLimit = Math.max(0, Number(result.ai_drafting.estimated_neuron_reservation_limit) || 0);
    document.querySelector("#ai-usage-reset").textContent = `App reservation: ${estimatedNeurons.toLocaleString()} of ${estimatedNeuronLimit.toLocaleString()} estimated Neurons today (2× safety estimate, not provider metering). Workers Free stops inference after ${result.ai_drafting.provider_free_neurons_per_day.toLocaleString()} account-wide Neurons per UTC day; other workloads may use this allowance first. Actual usage is available only in Cloudflare. Resets at ${result.ai_drafting.resets_at_utc}.`;
    const media = result.r2_media;
    const mediaUsed = (Number(media.site_used_bytes) / (1024 * 1024)).toFixed(2);
    const mediaLimit = (Number(media.site_limit_bytes) / (1024 * 1024)).toFixed(0);
    document.querySelector("#media-storage-usage").textContent = `${mediaUsed} MiB of ${mediaLimit} MiB used`;
    document.querySelector("#r2-media-usage").textContent = `${mediaUsed} MiB of ${mediaLimit} MiB for this site; ${media.site_daily_reads_used}/${media.site_daily_reads_limit} site reads and ${media.daily_reads_used}/${media.daily_reads_limit} shared reads, plus ${media.daily_uploads_and_deletes_used}/${media.daily_uploads_and_deletes_limit} uploads/deletes today (UTC).`;
  } catch (error) {
    showStatus(target, error.message);
  }
}

function renderMediaItem(item) {
  const card = document.createElement("li");
  card.className = "media-card";
  const image = document.createElement("img");
  image.className = "media-preview";
  image.src = `/_mithrilpress/media/${item.id}`;
  image.alt = item.alt_text || "";
  image.loading = "lazy";
  const details = document.createElement("div");
  details.className = "media-details";
  const title = document.createElement("strong");
  title.textContent = item.alt_text || `Image ${item.id}`;
  const metadata = document.createElement("span");
  metadata.textContent = `${item.content_type} · ${item.width} × ${item.height} · ${(item.byte_length / 1024).toFixed(1)} KiB`;
  details.append(title, metadata);
  const actions = document.createElement("div");
  actions.className = "media-actions";
  if (ownerScopes.includes("content:write")) {
    actions.append(domainButton(selectedFeaturedMediaId === item.id ? "Selected" : "Use as featured image", "button-secondary", () => {
      selectedFeaturedMediaId = item.id;
      renderFeaturedImageSelection();
      renderMediaList();
      showStudioView("content");
      showStatus(studioStatus, "Featured image selected for this draft. Save the draft to keep the change.");
    }));
  }
  actions.append(domainButton("Delete", "domain-remove", async () => {
    if (!window.confirm("Delete this image? Content that uses it may display without an image.")) return;
    try {
      await api(`/_mithrilpress/api/media/${item.id}`, { method: "DELETE", headers: requestHeader });
      if (selectedFeaturedMediaId === item.id) selectedFeaturedMediaId = null;
      await refreshMedia();
      renderFeaturedImageSelection();
    } catch (error) {
      showStatus(mediaStatus, error.message);
    }
  }));
  card.append(image, details, actions);
  return card;
}

function renderMediaList() {
  mediaList.replaceChildren();
  for (const item of mediaItems) mediaList.append(renderMediaItem(item));
  if (!mediaItems.length) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No images have been uploaded.";
    mediaList.append(empty);
  }
  renderFeaturedImageSelection();
}

async function refreshMedia() {
  if (!ownerScopes.includes("media:write")) return;
  showStatus(mediaStatus);
  try {
    const result = await api("/_mithrilpress/api/media");
    mediaItems = result.media || [];
    const used = (Number(result.storage.used_bytes) / (1024 * 1024)).toFixed(2);
    const limit = (Number(result.storage.site_limit_bytes) / (1024 * 1024)).toFixed(0);
    document.querySelector("#media-storage-usage").textContent = `${used} MiB of ${limit} MiB used`;
    renderMediaList();
  } catch (error) {
    showStatus(mediaStatus, error.message);
  }
}

async function runDomainAction(domain, action) {
  showStatus(domainStatus, action === "verify" ? "Checking ownership and provisioning TLS…" : "Refreshing hostname status…");
  try {
    const method = action === "delete" ? "DELETE" : "POST";
    const result = await api(`/_mithrilpress/api/domains/${encodeURIComponent(domain.id)}${action === "verify" || action === "refresh" ? `/${action}` : ""}`, {
      method,
      headers: requestHeader,
      ...(method === "POST" ? { body: {} } : {}),
    });
    showStatus(domainStatus, result.message || "Hostname status updated.");
    await refreshDomains();
  } catch (error) {
    showStatus(domainStatus, error.message);
    await refreshDomains();
  }
}

function dnsBlock(title, content) {
  const block = document.createElement("section");
  block.className = "dns-migration-step";
  const heading = document.createElement("h3");
  heading.textContent = title;
  block.append(heading);
  if (content) {
    const text = document.createElement("p");
    text.textContent = content;
    block.append(text);
  }
  dnsMigrationWorkflow.append(block);
  return block;
}

function dnsField(parent, labelText, options = {}) {
  const label = document.createElement("label");
  label.className = "dns-migration-field";
  label.textContent = labelText;
  const field = document.createElement(options.multiline ? "textarea" : "input");
  if (options.multiline) field.rows = options.rows || 8;
  else field.type = options.type || "text";
  field.maxLength = options.maxLength || 300000;
  field.placeholder = options.placeholder || "";
  if (options.autocomplete) field.autocomplete = options.autocomplete;
  if (options.spellcheck !== undefined) field.spellcheck = options.spellcheck;
  if (options.value) field.value = options.value;
  if (options.readOnly) field.readOnly = true;
  label.append(field);
  parent.append(label);
  return field;
}

function dnsCheck(parent, text) {
  const label = document.createElement("label");
  label.className = "dns-migration-check";
  const input = document.createElement("input");
  input.type = "checkbox";
  const description = document.createElement("span");
  description.textContent = text;
  label.append(input, description);
  parent.append(label);
  return input;
}

function dnsActionButton(parent, text, handler, className = "button-secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button button-small ${className}`;
  button.textContent = text;
  button.addEventListener("click", handler);
  parent.append(button);
  return button;
}

function dnsDetails(parent, summaryText, value) {
  const details = document.createElement("details");
  details.className = "dns-migration-diff";
  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  const pre = document.createElement("pre");
  pre.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  details.append(summary, pre);
  parent.append(details);
}

async function runDnsMigrationAction(id, action, body = {}, method = "POST", extraHeaders = {}) {
  showStatus(dnsMigrationStatus, "Saving migration progress…");
  try {
    const result = await api(`/_mithrilpress/api/dns-migrations/${encodeURIComponent(id)}${action ? `/${action}` : ""}`, {
      method,
      headers: { ...requestHeader, ...extraHeaders },
      ...(method === "POST" ? { body } : {}),
    });
    showStatus(dnsMigrationStatus, result.message || "Migration plan updated.");
    await refreshDnsMigrations(id);
  } catch (error) {
    showStatus(dnsMigrationStatus, error.message);
    await loadDnsMigration(id);
  }
}

function renderDnsMigrationDetail(migration) {
  dnsMigrationDetail.hidden = false;
  document.querySelector("#dns-migration-detail-title").textContent = migration.zone_name;
  document.querySelector("#dns-migration-state").textContent = migration.status.replaceAll("_", " ");
  dnsMigrationWorkflow.replaceChildren();

  const originalNs = (migration.source_nameservers || []).join("\n") || "Unavailable";
  const dnsStateCaptured = Boolean(migration.source_dns_state_captured_at);
  const originalDs = migration.source_ds_records?.length
    ? migration.source_ds_records.join("\n")
    : "No DS record was visible when ownership was verified.";
  const sourceStatus = dnsStateCaptured
    ? `Captured ${new Date(migration.source_dns_state_captured_at).toLocaleString()} · ${migration.source_record_count ?? "Source zone not uploaded"} records`
    : "Pending domain ownership proof. MithrilPress has not queried nameserver or DNSSEC state.";
  dnsBlock("Captured rollback state", sourceStatus);
  if (dnsStateCaptured) dnsDetails(dnsMigrationWorkflow.lastElementChild, "Captured source nameservers", originalNs);
  if (dnsStateCaptured) dnsDetails(dnsMigrationWorkflow.lastElementChild, "Captured source DNSSEC DS records", originalDs);

  if (migration.status === "ownership_pending") {
    const block = dnsBlock("1. Verify domain control", `Publish this TXT record before ${migration.ownership_expires_at || "the challenge expires"}.`);
    if (migration.ownership_record) {
      const code = document.createElement("code");
      code.textContent = `${migration.ownership_record.name}  TXT  ${migration.ownership_record.value}`;
      block.append(code);
    }
    dnsActionButton(block, "Verify TXT record", () => runDnsMigrationAction(migration.id, "verify-ownership"));
  }

  if (["source_pending", "source_loaded"].includes(migration.status)) {
    const block = dnsBlock("2. Upload the source DNS zone", "Paste a complete BIND export from the current authoritative provider. Zone snapshots can contain sensitive TXT values and stay private to this site.");
    const source = dnsField(block, "Source BIND zone file", { multiline: true, rows: 10, placeholder: "$ORIGIN example.com.\nwww 300 IN A 192.0.2.10" });
    dnsActionButton(block, migration.source_record_count ? "Replace source snapshot" : "Validate source zone", () => {
      void runDnsMigrationAction(migration.id, "source", { zone_file: source.value });
    }, "button-primary");
  }

  if (["source_loaded", "target_loaded"].includes(migration.status)) {
    if (migration.import_zone_text) {
      const block = dnsBlock("Destination import file", "Review this generated BIND file and its DNS-only defaults. You can import it into the staged destination zone yourself or connect a Cloudflare zone below.");
      dnsField(block, "BIND import file", { multiline: true, rows: 10, value: migration.import_zone_text, readOnly: true });
    }

    const cloudflareBlock = dnsBlock("Optional: read a Cloudflare staging zone", "Use a Cloudflare API token scoped to this zone with Zone Read and DNS Read. The token is sent only with this request and is not saved by MithrilPress. DNS Write is needed only for the explicit additive import below.");
    const zoneId = dnsField(cloudflareBlock, "Cloudflare zone ID", {
      maxLength: 32,
      placeholder: "32-character zone ID",
      value: migration.target_provider === "cloudflare" ? migration.target_provider_zone_id : "",
    });
    const readToken = dnsField(cloudflareBlock, "Short-lived Cloudflare API token", {
      type: "password", maxLength: 512, autocomplete: "off", spellcheck: false,
      placeholder: "Paste a zone-scoped token for this request",
    });
    dnsActionButton(cloudflareBlock, "Read and stage zone", () => {
      const token = readToken.value;
      readToken.value = "";
      if (!token || !zoneId.value.trim()) {
        showStatus(dnsMigrationStatus, "Enter the Cloudflare zone ID and a short-lived API token.");
        return;
      }
      void runDnsMigrationAction(migration.id, "cloudflare-target", { zone_id: zoneId.value.trim() }, "POST", {
        "X-MithrilPress-Cloudflare-Token": token,
      });
    }, "button-primary");

    if (migration.status === "target_loaded" && migration.target_provider === "cloudflare"
        && migration.diff?.removed?.length && migration.diff?.added?.length === 0) {
      if (!cloudflareDnsImportsEnabled) {
        dnsBlock("Cloudflare import is not enabled", "This deployment keeps provider writes disabled until the import behavior is qualified against an isolated Cloudflare zone. You can review the generated BIND file and stage records manually.");
      } else {
        const importBlock = dnsBlock("Add only missing source records", `${migration.diff.removed.length} source records are missing. MithrilPress will submit only this missing-record set. The live Cloudflare zone is checked again before the import and read back afterward.`);
        const importToken = dnsField(importBlock, "Short-lived Cloudflare API token with DNS Write", {
          type: "password", maxLength: 512, autocomplete: "off", spellcheck: false,
          placeholder: "Paste a zone-scoped token for this request",
        });
        const confirm = dnsCheck(importBlock, `I reviewed the ${migration.diff.removed.length} missing records and authorize MithrilPress to add only those records to Cloudflare.`);
        dnsActionButton(importBlock, "Import missing records", () => {
          const token = importToken.value;
          importToken.value = "";
          if (!token || !confirm.checked) {
            showStatus(dnsMigrationStatus, "Paste the short-lived token and confirm the exact missing-record plan.");
            return;
          }
          void runDnsMigrationAction(migration.id, "cloudflare-import", {
            confirm: true,
            target_zone_sha256: migration.target_zone_sha256,
          }, "POST", { "X-MithrilPress-Cloudflare-Token": token });
        }, "button-primary");
      }
    }

    const block = dnsBlock("3. Stage the destination zone manually", "Alternatively, create or select the destination zone in your DNS provider, import the source records, then paste the assigned nameservers and exported BIND zone.");
    const nameservers = dnsField(block, "Destination nameservers (one per line)", {
      multiline: true, rows: 3, placeholder: "ada.ns.cloudflare.com\nbob.ns.cloudflare.com",
      value: (migration.target_nameservers || []).join("\n"),
    });
    const target = dnsField(block, "Destination BIND zone export", { multiline: true, rows: 10, placeholder: "$ORIGIN example.com.\nwww 300 IN A 192.0.2.10" });
    dnsActionButton(block, migration.status === "target_loaded" ? "Refresh destination diff" : "Compare destination zone", () => {
      void runDnsMigrationAction(migration.id, "target", {
        nameservers: nameservers.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
        zone_file: target.value,
      });
    }, "button-primary");
  }

  if (migration.diff) {
    const block = dnsBlock("Record comparison", migration.diff.exact
      ? "Compared DNS records match after excluding provider-managed apex SOA/NS and generated DNSSEC records. Review the excluded provider records and DNSSEC settings separately."
      : `${migration.diff.added.length} destination-only records and ${migration.diff.removed.length} missing source records. Do not approve until the staged records match.`);
    dnsDetails(block, "View record-by-record diff", migration.diff);
    if (migration.diff.source_dnssec_records || migration.diff.target_dnssec_records) {
      const warning = document.createElement("p");
      warning.className = "dns-migration-warning";
      warning.textContent = `DNSSEC generated records are excluded from the comparison (${migration.diff.source_dnssec_records} source, ${migration.diff.target_dnssec_records} destination). Handle DS records separately using the captured DNSSEC state.`;
      block.append(warning);
    }
  }

  if (migration.status === "target_loaded" && migration.diff?.exact) {
    const block = dnsBlock("4. Approve this snapshot", "The digest below binds the source file, destination export, nameservers, and exact diff. Approval authorizes the owner to perform the later manual registrar cutover.");
    const digest = document.createElement("code");
    digest.textContent = migration.approval_digest || "";
    block.append(digest);
    const confirm = dnsCheck(block, "I reviewed the full DNS record diff and destination import. I understand that the old DS record must be removed before changing nameservers, and that MithrilPress will not make provider or registrar changes.");
    dnsActionButton(block, "Approve exact DNS diff", () => {
      if (!confirm.checked) {
        showStatus(dnsMigrationStatus, "Review and confirm the exact DNS diff before approval.");
        return;
      }
      void runDnsMigrationAction(migration.id, "approve", { confirm: true, approval_digest: migration.approval_digest });
    }, "button-primary");
  }

  if (migration.status === "owner_approved") {
    const block = dnsBlock("5. Change nameservers at the registrar", "Before the registrar change, remove the old DS record if DNSSEC is enabled. Update only the domain's nameserver delegation using the approved destination nameservers. Keep both DNS providers and all source records active during propagation.");
    const expected = document.createElement("code");
    expected.textContent = `Destination nameservers:\n${(migration.target_nameservers || []).join("\n")}\n\nSource nameservers for rollback:\n${originalNs}`;
    block.append(expected);
    const registrarUpdated = dnsCheck(block, "I changed the registrar nameservers to the destination set above.");
    const oldDsRemoved = dnsCheck(block, "I removed the old DS record before the registrar change, or confirmed that no DS record existed.");
    dnsActionButton(block, "Check destination delegation", () => {
      if (!registrarUpdated.checked || !oldDsRemoved.checked) {
        showStatus(dnsMigrationStatus, "Confirm the manual registrar and DS steps before checking public DNS.");
        return;
      }
      void runDnsMigrationAction(migration.id, "verify-delegation", { registrar_updated: true, old_ds_removed: true });
    }, "button-primary");
  }

  if (["owner_approved", "delegation_verified"].includes(migration.status)) {
    const rollback = dnsBlock("Rollback to the source provider", "If the destination fails, restore the captured source nameservers at the registrar. Restore the captured source DS state only after the source nameservers are authoritative again.");
    dnsDetails(rollback, "Source nameservers to restore", originalNs);
    const ds = document.createElement("code");
    ds.textContent = originalDs;
    rollback.append(ds);
    const registrarRestored = dnsCheck(rollback, "I restored the source nameservers at the registrar.");
    const sourceDsRestored = dnsCheck(rollback, "I restored the captured source DS state after source DNS is authoritative.");
    dnsActionButton(rollback, "Verify source rollback", () => {
      if (!registrarRestored.checked || !sourceDsRestored.checked) {
        showStatus(dnsMigrationStatus, "Confirm the source NS and DS restoration before checking rollback.");
        return;
      }
      void runDnsMigrationAction(migration.id, "verify-rollback", { registrar_restored: true, source_ds_restored: true });
    }, "domain-remove");
  }

  if (migration.delegation_check) dnsDetails(dnsMigrationWorkflow, "Latest destination propagation check", migration.delegation_check);
  if (migration.rollback_check) dnsDetails(dnsMigrationWorkflow, "Latest source rollback check", migration.rollback_check);
  if (migration.status === "delegation_verified" || migration.status === "rolled_back") {
    const block = dnsBlock(migration.status === "delegation_verified" ? "Migration delegation verified" : "Source rollback verified",
      migration.status === "delegation_verified"
        ? "Both recursive resolvers show the approved nameserver set and no DS record. Verify the website, TLS, email delivery, and domain-specific services separately."
        : "Both recursive resolvers show the captured source nameservers and DS state. Verify the website, TLS, and mail service separately.");
    dnsActionButton(block, "Erase snapshots and archive", () => {
      if (!window.confirm("Erase private source and destination zone snapshots and close the rollback window? This cannot be undone.")) return;
      void runDnsMigrationAction(migration.id, null, {}, "DELETE");
    }, "domain-remove");
  } else if (!["cancelled", "archived", "owner_approved"].includes(migration.status)) {
    const block = dnsBlock("Cancel and erase snapshots", "This removes private zone-file content and the ownership TXT value. It does not change DNS or registrar settings.");
    dnsActionButton(block, "Cancel migration plan", () => {
      if (!window.confirm("Cancel the plan and erase its zone snapshots? If you already changed the registrar, restore the source nameservers first.")) return;
      void runDnsMigrationAction(migration.id, null, {}, "DELETE");
    }, "domain-remove");
  }
}

async function loadDnsMigration(id) {
  try {
    const result = await api(`/_mithrilpress/api/dns-migrations/${encodeURIComponent(id)}`);
    activeDnsMigrationId = id;
    cloudflareDnsImportsEnabled = result.cloudflare_dns_imports_enabled === true;
    renderDnsMigrationDetail(result.migration);
  } catch (error) {
    showStatus(dnsMigrationStatus, error.message);
  }
}

async function refreshDnsMigrations(openId = activeDnsMigrationId) {
  if (!ownerScopes.includes("site:dns-migrate")) return;
  try {
    const result = await api("/_mithrilpress/api/dns-migrations");
    dnsMigrationList.replaceChildren();
    for (const migration of result.migrations || []) {
      const card = document.createElement("li");
      card.className = "domain-card dns-migration-card";
      const heading = document.createElement("div");
      heading.className = "domain-card-heading";
      const zone = document.createElement("h2");
      zone.textContent = migration.zone_name;
      const state = document.createElement("span");
      state.className = "domain-state";
      state.textContent = migration.status.replaceAll("_", " ");
      heading.append(zone, state);
      const button = domainButton("Open migration checklist", "button-secondary", () => void loadDnsMigration(migration.id));
      card.append(heading, button);
      dnsMigrationList.append(card);
    }
    if (!result.migrations?.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "No DNS migration plans have been created.";
      dnsMigrationList.append(empty);
      activeDnsMigrationId = null;
      dnsMigrationDetail.hidden = true;
      return;
    }
    if (openId && result.migrations.some((item) => item.id === openId)) await loadDnsMigration(openId);
    else await loadDnsMigration(result.migrations[0].id);
  } catch (error) {
    showStatus(dnsMigrationStatus, error.message);
  }
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const tokenField = document.querySelector("#owner-token");
  const token = tokenField.value.trim();
  tokenField.value = "";
  showStatus(loginStatus, "Signing in…");
  try {
    await signIn(token);
  } catch (error) {
    showStatus(loginStatus, error.message);
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await api("/_mithrilpress/api/studio/session", { method: "DELETE", headers: requestHeader });
  } finally {
    studioPanel.hidden = true;
    loginPanel.hidden = false;
    document.querySelector("#studio-nav").hidden = true;
    document.querySelector("#logout-button").hidden = true;
    setOwnerScopes([]);
    resetConversation();
    mediaItems = [];
    renderMediaList();
    conversationList.replaceChildren();
    domainList.replaceChildren();
    dnsMigrationList.replaceChildren();
    dnsMigrationWorkflow.replaceChildren();
    dnsMigrationDetail.hidden = true;
    activeDnsMigrationId = null;
  }
});

document.querySelector("#content-tab").addEventListener("click", () => showStudioView("content"));
mediaTab.addEventListener("click", async () => {
  if (!ownerScopes.includes("media:write")) return;
  showStudioView("media");
  await refreshMedia();
});
document.querySelector("#choose-featured-image").addEventListener("click", async () => {
  showStudioView("media");
  await refreshMedia();
});
document.querySelector("#clear-featured-image").addEventListener("click", () => {
  selectedFeaturedMediaId = null;
  renderFeaturedImageSelection();
  showStatus(studioStatus, "The featured image will be cleared when you save this draft.");
});
domainsTab.addEventListener("click", async () => {
  if (!ownerScopes.includes("site:domains")) return;
  showStudioView("domains");
  await refreshDomains();
});
dnsMigrationTab.addEventListener("click", async () => {
  if (!ownerScopes.includes("site:dns-migrate")) return;
  showStudioView("dns-migration");
  await refreshDnsMigrations();
});
usageTab.addEventListener("click", async () => {
  if (!ownerScopes.includes("content:write") && !ownerScopes.includes("media:write") && !ownerScopes.includes("site:domains")) return;
  showStudioView("usage");
  await refreshUsage();
});

document.querySelector("#media-upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = document.querySelector("#media-file").files[0];
  const altText = document.querySelector("#media-alt").value;
  const wordpressId = document.querySelector("#wordpress-media-id").value.trim();
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    showStatus(mediaStatus, "Choose an image smaller than 8 MiB.");
    return;
  }
  const button = document.querySelector("#media-upload-button");
  button.disabled = true;
  showStatus(mediaStatus, "Uploading and validating image…");
  const headers = {
    "Content-Type": file.type,
    "X-MithrilPress-Request": "1",
    "X-MithrilPress-Alt": encodeURIComponent(altText),
  };
  if (wordpressId) headers["X-WordPress-Media-ID"] = wordpressId;
  try {
    const response = await fetch("/_mithrilpress/api/media", {
      method: "POST", headers, body: file, credentials: "same-origin",
    });
    const result = response.headers.get("Content-Type")?.includes("application/json") ? await response.json() : null;
    if (!response.ok) throw new Error(result?.error?.message || `Upload failed (${response.status}).`);
    document.querySelector("#media-upload-form").reset();
    showStatus(mediaStatus, "Image uploaded to this site's private media library.");
    await refreshMedia();
    await refreshUsage();
  } catch (error) {
    showStatus(mediaStatus, error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#dns-migration-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const field = document.querySelector("#dns-migration-zone");
  const zoneName = field.value.trim();
  if (!zoneName) return;
  const button = document.querySelector("#create-dns-migration");
  button.disabled = true;
  showStatus(dnsMigrationStatus, "Checking current nameserver and DNSSEC state…");
  try {
    const result = await api("/_mithrilpress/api/dns-migrations", {
      method: "POST", headers: requestHeader, body: { zone_name: zoneName },
    });
    field.value = "";
    activeDnsMigrationId = result.migration.id;
    showStatus(dnsMigrationStatus, result.message);
    await refreshDnsMigrations(result.migration.id);
  } catch (error) {
    showStatus(dnsMigrationStatus, error.message);
  } finally {
    button.disabled = false;
  }
});

domainForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const field = document.querySelector("#custom-hostname");
  const hostname = field.value.trim();
  if (!hostname) return;
  const button = document.querySelector("#add-domain-button");
  button.disabled = true;
  showStatus(domainStatus, "Preparing an ownership challenge…");
  try {
    const result = await api("/_mithrilpress/api/domains", { method: "POST", headers: requestHeader, body: { hostname } });
    field.value = "";
    showStatus(domainStatus, result.message);
    await refreshDomains();
  } catch (error) {
    showStatus(domainStatus, error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#new-conversation").addEventListener("click", resetConversation);

document.querySelector("#delete-conversation").addEventListener("click", async () => {
  if (!activeConversationId) return;
  try {
    await api(`/_mithrilpress/api/studio/conversations/${encodeURIComponent(activeConversationId)}`, { method: "DELETE", headers: requestHeader });
    resetConversation();
    await refreshConversations();
  } catch (error) {
    showStatus(studioStatus, error.message);
  }
});

document.querySelector("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  renderMessage("user", message);
  const button = document.querySelector("#send-button");
  button.disabled = true;
  button.textContent = "Drafting…";
  showStatus(studioStatus);
  try {
    const result = await api("/_mithrilpress/api/studio/chat", {
      method: "POST",
      headers: requestHeader,
      body: { conversation_id: activeConversationId, message, kind: document.querySelector("#content-kind").value },
    });
    activeConversationId = result.conversation_id;
    document.querySelector("#editor-title").textContent = "Refine your draft";
    document.querySelector("#delete-conversation").hidden = false;
    renderMessage("assistant", result.message);
    showDraft(result.draft, result.draft.revision_id, result.draft.state, result.preview_url);
    document.querySelector("#content-kind").value = result.draft.kind;
    showStatus(studioStatus, "A private draft was saved. Review it before approval.");
    await refreshConversations();
    await refreshUsage();
  } catch (error) {
    renderMessage("assistant", error.message, true);
    showStatus(studioStatus, "The conversation remains unpublished.");
  } finally {
    button.disabled = false;
    button.textContent = "Update draft";
    chatInput.focus();
  }
});

document.querySelector("#approve-button").addEventListener("click", async () => {
  if (!activeDraft) return;
  const button = document.querySelector("#approve-button");
  button.disabled = true;
  try {
    const result = await api(`/_mithrilpress/api/revisions/${activeDraft.revisionId}/approve`, { method: "POST", headers: requestHeader, body: {} });
    showDraft({ title: draftTitle.textContent, slug: new URL(previewLink.href).pathname.split("/").filter(Boolean).pop() }, activeDraft.revisionId, result.state, previewLink.getAttribute("href"));
    showStatus(studioStatus, "Revision approved. Publishing is a separate step.");
    await refreshConversations();
  } catch (error) {
    showStatus(studioStatus, error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#publish-button").addEventListener("click", async () => {
  if (!activeDraft) return;
  const button = document.querySelector("#publish-button");
  button.disabled = true;
  try {
    const result = await api(`/_mithrilpress/api/revisions/${activeDraft.revisionId}/publish`, { method: "POST", headers: requestHeader, body: {} });
    activeDraft.state = result.state;
    showDraft({ title: draftTitle.textContent, slug: new URL(previewLink.href).pathname.split("/").filter(Boolean).pop() }, activeDraft.revisionId, result.state, previewLink.getAttribute("href"));
    showStatus(studioStatus, "The approved revision is now public.");
    await refreshConversations();
  } catch (error) {
    showStatus(studioStatus, error.message);
  } finally {
    button.disabled = false;
  }
});

(async () => {
  try {
    const session = await api("/_mithrilpress/api/studio/session");
    if (session.authenticated) {
      loginPanel.hidden = true;
      setOwnerScopes(session.scopes);
      studioPanel.hidden = false;
      document.querySelector("#studio-nav").hidden = false;
      document.querySelector("#logout-button").hidden = false;
      showStatus(studioStatus, `Signed in as ${session.owner}.`);
      if (ownerScopes.includes("content:write")) await refreshConversations();
      if (ownerScopes.includes("media:write")) await refreshMedia();
      if (ownerScopes.includes("site:domains")) await refreshDomains();
      if (ownerScopes.includes("site:dns-migrate")) await refreshDnsMigrations();
      await refreshUsage();
    }
  } catch {
    loginPanel.hidden = false;
  }
})();
