const BASE_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8000";
const TOKEN_KEY = "routepulse_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request(path, options) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || `${options?.method || "GET"} ${path} failed: ${res.status}`);
  }
  // 204 (e.g. DELETE /me/favorite-zones/{id}) has no body -- res.json() would
  // throw on the empty string.
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  register: (body) => request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request("/auth/me"),

  listIncidents: () => request("/incidents"),
  stats: () => request("/stats"),
  leaderboard: (limit = 10) => request(`/leaderboard?limit=${limit}`),
  myStats: () => request("/me/stats"),
  roadConditions: () => request("/road-conditions"),
  riskZones: () => request("/risk-zones"),
  municipalDashboard: () => request("/admin/dashboard"),
  predictions: () => request("/predictions"),
  predictionsSummary: () => request("/predictions/summary"),
  cityScore: () => request("/city-score"),
  classifyIncident: (text) => request("/incidents/classify", { method: "POST", body: JSON.stringify({ text }) }),
  classifyIncidentImage: (image) => request("/incidents/classify-image", { method: "POST", body: JSON.stringify({ image }) }),
  createIncident: (body) => request("/incidents", { method: "POST", body: JSON.stringify(body) }),
  confirmIncident: (id) => request(`/incidents/${id}/confirm`, { method: "POST" }),

  listPosts: () => request("/posts"),
  createPost: (body) => request("/posts", { method: "POST", body: JSON.stringify(body) }),
  likePost: (id) => request(`/posts/${id}/like`, { method: "POST" }),
  confirmPost: (id) => request(`/posts/${id}/confirm`, { method: "POST" }),

  listComments: (postId) => request(`/posts/${postId}/comments`),
  createComment: (postId, body) => request(`/posts/${postId}/comments`, { method: "POST", body: JSON.stringify(body) }),
  likeComment: (commentId) => request(`/comments/${commentId}/like`, { method: "POST" }),

  reportPost: (id) => request(`/posts/${id}/report`, { method: "POST" }),
  moderationQueue: () => request("/admin/moderation"),
  unhidePost: (id) => request(`/admin/moderation/${id}/unhide`, { method: "POST" }),

  updateMySettings: (body) => request("/me/settings", { method: "PATCH", body: JSON.stringify(body) }),
  listFavoriteZones: () => request("/me/favorite-zones"),
  createFavoriteZone: (body) => request("/me/favorite-zones", { method: "POST", body: JSON.stringify(body) }),
  deleteFavoriteZone: (id) => request(`/me/favorite-zones/${id}`, { method: "DELETE" }),

  copilot: (message, history = []) => request("/copilot", { method: "POST", body: JSON.stringify({ message, history }) }),

  scanRoute: (body) => request("/route/scan", { method: "POST", body: JSON.stringify(body) }),
  // `signal` lets callers abort a stale in-flight suggestion request (see
  // PlaceField) instead of letting it race a newer one to the UI.
  suggestPlaces: (q, { signal } = {}) => request(`/geocode/suggest?q=${encodeURIComponent(q)}`, { signal }),
};
