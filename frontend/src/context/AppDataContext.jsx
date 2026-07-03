import { createContext, useContext, useCallback, useState } from "react";
import { POSTS as INITIAL_POSTS, INCIDENTS as INITIAL_INCIDENTS, COMMENTS as INITIAL_COMMENTS } from "@/lib/mockData";

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [incidents, setIncidents] = useState(INITIAL_INCIDENTS);
  const [commentsByPost, setCommentsByPost] = useState(INITIAL_COMMENTS);

  const likePost = useCallback((postId, delta) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likes: p.likes + delta } : p)));
  }, []);

  const confirmPost = useCallback((postId) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, confirmed: p.confirmed + 1 } : p)));
  }, []);

  const confirmIncident = useCallback((incidentId) => {
    setIncidents((prev) => prev.map((i) => (i.id === incidentId ? { ...i, confirmed: i.confirmed + 1 } : i)));
  }, []);

  const addComment = useCallback((postId, comment) => {
    setCommentsByPost((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), comment] }));
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, comments: p.comments + 1 } : p)));
  }, []);

  const submitReport = useCallback(({ type, severity, note, postToFeed }) => {
    const stamp = Date.now();
    setIncidents((prev) => [
      { id: `i-${stamp}`, type, x: 400, y: 300, road: "Position actuelle", severity, confirmed: 1, time: "à l'instant" },
      ...prev,
    ]);

    if (postToFeed) {
      setPosts((prev) => [
        {
          id: `p-${stamp}`,
          author: { name: "Vous", handle: "@vous", avatar: "VS", verified: false, badge: "Contributeur" },
          time: "à l'instant",
          location: "Votre position",
          type,
          severity,
          text: note || "Nouvelle alerte signalée.",
          image: null,
          likes: 0,
          comments: 0,
          shares: 0,
          confirmed: 1,
        },
        ...prev,
      ]);
    }
  }, []);

  const value = {
    posts,
    incidents,
    commentsByPost,
    likePost,
    confirmPost,
    confirmIncident,
    addComment,
    submitReport,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within an AppDataProvider");
  return ctx;
}
