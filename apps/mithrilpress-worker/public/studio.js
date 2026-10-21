const requestHeader = { "X-MithrilPress-Request": "1" };
let activeConversationId = null;
let activeDraft = null;

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
  loginPanel.hidden = true;
  studioPanel.hidden = false;
  document.querySelector("#logout-button").hidden = false;
  showStatus(loginStatus);
  showStatus(studioStatus, `Signed in as ${result.owner}.`);
  await refreshConversations();
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
    document.querySelector("#logout-button").hidden = true;
    resetConversation();
    conversationList.replaceChildren();
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
      studioPanel.hidden = false;
      document.querySelector("#logout-button").hidden = false;
      showStatus(studioStatus, `Signed in as ${session.owner}.`);
      await refreshConversations();
    }
  } catch {
    loginPanel.hidden = false;
  }
})();
