import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const [posts, setPosts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [commentsByPost, setCommentsByPost] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.listIncidents(), api.listPosts()])
      .then(([incidentsData, postsData]) => {
        setIncidents(incidentsData);
        setPosts(postsData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const likePost = useCallback(async (postId, delta) => {
    const updated = await api.likePost(postId, delta);
    setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
  }, []);

  const confirmPost = useCallback(async (postId) => {
    const updated = await api.confirmPost(postId);
    setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
  }, []);

  const confirmIncident = useCallback(async (incidentId) => {
    const updated = await api.confirmIncident(incidentId);
    setIncidents((prev) => prev.map((i) => (i.id === incidentId ? updated : i)));
  }, []);

  const fetchComments = useCallback(async (postId) => {
    const comments = await api.listComments(postId);
    setCommentsByPost((prev) => ({ ...prev, [postId]: comments }));
    return comments;
  }, []);

  const addComment = useCallback(async (postId, text) => {
    const comment = await api.createComment(postId, { text });
    setCommentsByPost((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), comment] }));
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments: p.comments + 1 } : p)));
  }, []);

  const submitReport = useCallback(async ({ type, severity, note, postToFeed }) => {
    const { lat, lng } = await getCurrentPosition();
    const incident = await api.createIncident({ type, lat, lng, road: "Position actuelle", severity });
    setIncidents((prev) => [incident, ...prev]);

    if (postToFeed) {
      const post = await api.createPost({
        location: "Votre position",
        type,
        severity,
        text: note || "Nouvelle alerte signalée.",
      });
      setPosts((prev) => [post, ...prev]);
    }
  }, []);

  const value = {
    posts,
    incidents,
    commentsByPost,
    loading,
    error,
    likePost,
    confirmPost,
    confirmIncident,
    addComment,
    submitReport,
    fetchComments,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within an AppDataProvider");
  return ctx;
}
