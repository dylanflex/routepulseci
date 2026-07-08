import { createContext, useContext, useCallback, useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geo";

const AppDataContext = createContext(null);

// The provider owns its own QueryClient (one per mount) so the whole app shares
// a single cache, while each test render stays isolated. This is why index.js
// no longer needs a QueryClientProvider of its own.
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
      mutations: { retry: 0 },
    },
  });
}

export function AppDataProvider({ children }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AppData>{children}</AppData>
    </QueryClientProvider>
  );
}

function AppData({ children }) {
  const qc = useQueryClient();
  const [commentsByPost, setCommentsByPost] = useState({});

  const incidentsQuery = useQuery({
    queryKey: ["incidents"],
    queryFn: api.listIncidents,
    // "Carte en direct" should live up to its name: poll for new citizen
    // reports and refresh when the user returns to the tab.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const postsQuery = useQuery({ queryKey: ["posts"], queryFn: api.listPosts });
  // Live community numbers for the landing page (replaces hardcoded figures).
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  // Top contributors — the community ranking that drives engagement.
  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => api.leaderboard(10),
  });
  // Real road-condition segments (coloured by nearby incidents), polled with the map.
  const roadConditionsQuery = useQuery({
    queryKey: ["road-conditions"],
    queryFn: api.roadConditions,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  // Recurring incident patterns per road (see server.compute_risk_zones) --
  // history-based, so it changes far less often than live incidents/roads.
  const riskZonesQuery = useQuery({ queryKey: ["risk-zones"], queryFn: api.riskZones });

  const patchPost = useCallback(
    (updated) => qc.setQueryData(["posts"], (prev = []) => prev.map((p) => (p.id === updated.id ? updated : p))),
    [qc],
  );
  const patchIncident = useCallback(
    (updated) => qc.setQueryData(["incidents"], (prev = []) => prev.map((i) => (i.id === updated.id ? updated : i))),
    [qc],
  );

  const likeMutation = useMutation({ mutationFn: (postId) => api.likePost(postId), onSuccess: patchPost });
  const confirmPostMutation = useMutation({ mutationFn: (postId) => api.confirmPost(postId), onSuccess: patchPost });
  const confirmIncidentMutation = useMutation({ mutationFn: (id) => api.confirmIncident(id), onSuccess: patchIncident });

  const addCommentMutation = useMutation({
    mutationFn: ({ postId, text, parentCommentId }) =>
      api.createComment(postId, { text, parent_comment_id: parentCommentId ?? null }),
    onSuccess: (comment, { postId }) => {
      setCommentsByPost((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), comment] }));
      qc.setQueryData(["posts"], (prev = []) => prev.map((p) => (p.id === postId ? { ...p, comments: p.comments + 1 } : p)));
    },
  });

  const likeCommentMutation = useMutation({
    mutationFn: ({ commentId }) => api.likeComment(commentId),
    onSuccess: (updated, { postId }) => {
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: (prev[postId] || []).map((c) => (c.id === updated.id ? updated : c)),
      }));
    },
  });

  const reportPostMutation = useMutation({ mutationFn: (postId) => api.reportPost(postId) });

  const submitReportMutation = useMutation({
    mutationFn: async ({ type, severity, note, postToFeed, image }) => {
      const { lat, lng } = await getCurrentPosition();
      const incident = await api.createIncident({ type, lat, lng, road: "Position actuelle", severity });
      let post = null;
      if (postToFeed) {
        post = await api.createPost({
          location: "Votre position",
          type,
          severity,
          text: note || "Nouvelle alerte signalée.",
          image: image || null,
        });
      }
      return { incident, post };
    },
    onSuccess: ({ incident, post }) => {
      qc.setQueryData(["incidents"], (prev = []) => [incident, ...prev]);
      if (post) qc.setQueryData(["posts"], (prev = []) => [post, ...prev]);
    },
  });

  // Mutations expose promise-returning helpers so callers can await + catch and
  // surface a toast on failure (no more silent unhandled rejections).
  const likePost = useCallback((postId) => likeMutation.mutateAsync(postId), [likeMutation]);
  const confirmPost = useCallback((postId) => confirmPostMutation.mutateAsync(postId), [confirmPostMutation]);
  const confirmIncident = useCallback((id) => confirmIncidentMutation.mutateAsync(id), [confirmIncidentMutation]);
  const addComment = useCallback(
    (postId, text, parentCommentId) => addCommentMutation.mutateAsync({ postId, text, parentCommentId }),
    [addCommentMutation],
  );
  const likeComment = useCallback(
    (postId, commentId) => likeCommentMutation.mutateAsync({ postId, commentId }),
    [likeCommentMutation],
  );
  const reportPost = useCallback((postId) => reportPostMutation.mutateAsync(postId), [reportPostMutation]);
  const submitReport = useCallback((args) => submitReportMutation.mutateAsync(args), [submitReportMutation]);

  const fetchComments = useCallback(async (postId) => {
    const comments = await api.listComments(postId);
    setCommentsByPost((prev) => ({ ...prev, [postId]: comments }));
    return comments;
  }, []);

  const value = {
    posts: postsQuery.data ?? [],
    incidents: incidentsQuery.data ?? [],
    roadConditions: roadConditionsQuery.data ?? [],
    riskZones: riskZonesQuery.data ?? [],
    stats: statsQuery.data ?? null,
    leaderboard: leaderboardQuery.data ?? [],
    incidentsUpdatedAt: incidentsQuery.dataUpdatedAt,
    incidentsFetching: incidentsQuery.isFetching,
    refetchIncidents: incidentsQuery.refetch,
    commentsByPost,
    loading: incidentsQuery.isLoading || postsQuery.isLoading,
    error: incidentsQuery.error?.message || postsQuery.error?.message || null,
    likePost,
    confirmPost,
    confirmIncident,
    addComment,
    likeComment,
    reportPost,
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
