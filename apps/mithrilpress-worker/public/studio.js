const requestHeader = { "X-MithrilPress-Request": "1" };
let activeConversationId = null;
let activeDraft = null;
let ownerScopes = [];

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
const domainsPanel = document.querySelector("#domains-panel");
const domainsTab = document.querySelector("#domains-tab");
const usagePanel = document.querySelector("#usage-panel");
const usageTab = document.querySelector("#usage-tab");
const domainList = document.querySelector("#domain-list");
const domainStatus = document.querySelector("#domain-status");
const domainForm = document.querySelector("#domain-form");
const domainUnavailable = document.querySelector("#domain-unavailable");
const defaultHostname = document.querySelector("#default-hostname");

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
  const canDomains = ownerScopes.includes("site:domains");
  const canUsage = canContent || canDomains;
  const showUsage = canUsage && name === "usage";
  const showDomains = canDomains && (name === "domains" || (!canContent && !showUsage));
  const showContent = canContent && !showDomains && !showUsage;
  contentTab.hidden = !canContent;
  domainsTab.hidden = !canDomains;
  usageTab.hidden = !canUsage;
  contentPanel.hidden = !showContent;
  domainsPanel.hidden = !showDomains;
  usagePanel.hidden = !showUsage;
  contentTab.setAttribute("aria-current", showContent ? "page" : "false");
  domainsTab.setAttribute("aria-current", showDomains ? "page" : "false");
  usageTab.setAttribute("aria-current", showUsage ? "page" : "false");
}

function setOwnerScopes(scopes = []) {
  ownerScopes = Array.isArray(scopes) ? scopes : [];
  defaultHostname.textContent = "";
  showStudioView(ownerScopes.includes("content:write") ? "content" : "domains");
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
  if (ownerScopes.includes("site:domains")) await refreshDomains();
  await refreshUsage();
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
  if (!ownerScopes.includes("content:write") && !ownerScopes.includes("site:domains")) return;
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
    document.querySelector("#ai-usage").textContent = `${result.ai_drafting.requests_used} of ${result.ai_drafting.daily_app_limit} shared requests today (UTC)`;
    document.querySelector("#ai-usage-reset").textContent = `Resets at ${result.ai_drafting.resets_at_utc}.`;
  } catch (error) {
    showStatus(target, error.message);
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
    conversationList.replaceChildren();
    domainList.replaceChildren();
  }
});

document.querySelector("#content-tab").addEventListener("click", () => showStudioView("content"));
domainsTab.addEventListener("click", async () => {
  if (!ownerScopes.includes("site:domains")) return;
  showStudioView("domains");
  await refreshDomains();
});
usageTab.addEventListener("click", async () => {
  if (!ownerScopes.includes("content:write") && !ownerScopes.includes("site:domains")) return;
  showStudioView("usage");
  await refreshUsage();
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
      if (ownerScopes.includes("site:domains")) await refreshDomains();
      await refreshUsage();
    }
  } catch {
    loginPanel.hidden = false;
  }
})();
