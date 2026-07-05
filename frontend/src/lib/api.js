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
  return res.json();
}

export const api = {
  register: (body) => request("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body) => request("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request("/auth/me"),

  listIncidents: () => request("/incidents"),
  roadConditions: () => request("/road-conditions"),
  createIncident: (body) => request("/incidents", { method: "POST", body: JSON.stringify(body) }),
  confirmIncident: (id) => request(`/incidents/${id}/confirm`, { method: "POST" }),

  listPosts: () => request("/posts"),
  createPost: (body) => request("/posts", { method: "POST", body: JSON.stringify(body) }),
  likePost: (id) => request(`/posts/${id}/like`, { method: "POST" }),
  confirmPost: (id) => request(`/posts/${id}/confirm`, { method: "POST" }),

  listComments: (postId) => request(`/posts/${postId}/comments`),
  createComment: (postId, body) => request(`/posts/${postId}/comments`, { method: "POST", body: JSON.stringify(body) }),

  scanRoute: (body) => request("/route/scan", { method: "POST", body: JSON.stringify(body) }),
  suggestPlaces: (q) => request(`/geocode/suggest?q=${encodeURIComponent(q)}`),
};
