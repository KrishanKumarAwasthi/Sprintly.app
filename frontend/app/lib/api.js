const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  // Handle 204 No Content (no body to parse)
  if (res.status === 204) {
    if (!res.ok) throw new Error("API error");
    return { status: "success", data: null };
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "API error");
  return json;
}

// Board APIs
export async function getBoards() {
  return request("/boards");
}

export async function getBoard(id) {
  return request(`/boards/${id}`);
}

export async function createBoard(title) {
  return request("/boards", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

// List APIs
export async function getListsByBoard(boardId) {
  return request(`/lists?boardId=${boardId}`);
}

export async function createList({ boardId, title, position }) {
  return request("/lists", {
    method: "POST",
    body: JSON.stringify({ boardId, title, position }),
  });
}

export async function updateList(id, data) {
  return request(`/lists/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteList(id) {
  return request(`/lists/${id}`, { method: "DELETE" });
}

export async function reorderList({ boardId, sourceIndex, destinationIndex }) {
  return request("/lists/reorder", {
    method: "PUT",
    body: JSON.stringify({ boardId, sourceIndex, destinationIndex }),
  });
}

// Card APIs
export async function getCardsByList(listId) {
  return request(`/cards?listId=${listId}`);
}

export async function createCard({ listId, title, description, dueDate, position }) {
  return request("/cards", {
    method: "POST",
    body: JSON.stringify({ listId, title, description, dueDate, position }),
  });
}

export async function updateCard(id, data) {
  return request(`/cards/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteCard(id) {
  return request(`/cards/${id}`, { method: "DELETE" });
}

export async function archiveCard(id) {
  return request(`/cards/${id}/archive`, { method: "PUT" });
}

export async function reorderCard({ listId, sourceIndex, destinationIndex }) {
  return request("/cards/reorder", {
    method: "PUT",
    body: JSON.stringify({ listId, sourceIndex, destinationIndex }),
  });
}

export async function moveCard({ cardId, sourceListId, destinationListId, destinationIndex }) {
  return request("/cards/move", {
    method: "PUT",
    body: JSON.stringify({ cardId, sourceListId, destinationListId, destinationIndex }),
  });
}

export async function searchCards(params) {
  const query = new URLSearchParams();
  if (params.query) query.set("query", params.query);
  if (params.labelId) query.set("labelId", params.labelId);
  if (params.memberId) query.set("memberId", params.memberId);
  if (params.dueDate) query.set("dueDate", params.dueDate);
  return request(`/cards/search?${query.toString()}`);
}

// Label/Member assignment
export async function addLabelToCard(cardId, labelId) {
  return request(`/cards/${cardId}/labels`, {
    method: "POST",
    body: JSON.stringify({ labelId }),
  });
}

export async function removeLabelFromCard(cardId, labelId) {
  return request(`/cards/${cardId}/labels/${labelId}`, { method: "DELETE" });
}

export async function assignMemberToCard(cardId, memberId) {
  return request(`/cards/${cardId}/members`, {
    method: "POST",
    body: JSON.stringify({ memberId }),
  });
}

export async function removeMemberFromCard(cardId, memberId) {
  return request(`/cards/${cardId}/members/${memberId}`, { method: "DELETE" });
}

// Checklist APIs
export async function createChecklist(cardId) {
  return request("/checklists", {
    method: "POST",
    body: JSON.stringify({ cardId }),
  });
}

export async function addChecklistItem(checklistId, content) {
  return request(`/checklists/${checklistId}/items`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function toggleChecklistItem(itemId, completed) {
  return request(`/checklists/items/${itemId}`, {
    method: "PUT",
    body: JSON.stringify({ completed }),
  });
}

export async function deleteChecklistItem(itemId) {
  return request(`/checklists/items/${itemId}`, { method: "DELETE" });
}

// Label APIs
export async function getLabels() {
  return request("/labels");
}

export async function createLabel({ name, color }) {
  return request("/labels", {
    method: "POST",
    body: JSON.stringify({ name, color }),
  });
}

export async function deleteLabel(id) {
  return request(`/labels/${id}`, { method: "DELETE" });
}

// Member APIs
export async function getMembers() {
  return request("/members");
}

export async function createMember({ name }) {
  return request("/members", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function deleteMember(id) {
  return request(`/members/${id}`, { method: "DELETE" });
}

// AI APIs
export async function chatWithBoardAI(boardId, message) {
  return request("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ boardId, message }),
  });
}

