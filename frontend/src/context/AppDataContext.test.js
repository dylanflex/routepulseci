import { renderHook, act } from "@testing-library/react";
import { AppDataProvider, useAppData } from "@/context/AppDataContext";

const wrapper = ({ children }) => <AppDataProvider>{children}</AppDataProvider>;

test("submitReport adds a new incident and a matching feed post", () => {
  const { result } = renderHook(() => useAppData(), { wrapper });
  const incidentsBefore = result.current.incidents.length;
  const postsBefore = result.current.posts.length;

  act(() => {
    result.current.submitReport({ type: "jam", severity: "dense", note: "Test embouteillage", postToFeed: true });
  });

  expect(result.current.incidents.length).toBe(incidentsBefore + 1);
  expect(result.current.posts.length).toBe(postsBefore + 1);
  expect(result.current.posts[0].text).toBe("Test embouteillage");
});

test("submitReport skips the feed post when postToFeed is false", () => {
  const { result } = renderHook(() => useAppData(), { wrapper });
  const postsBefore = result.current.posts.length;

  act(() => {
    result.current.submitReport({ type: "flood", severity: "danger", note: "", postToFeed: false });
  });

  expect(result.current.posts.length).toBe(postsBefore);
});

test("likePost updates only the targeted post", () => {
  const { result } = renderHook(() => useAppData(), { wrapper });
  const [post, other] = result.current.posts;

  act(() => {
    result.current.likePost(post.id, 1);
  });

  expect(result.current.posts.find((p) => p.id === post.id).likes).toBe(post.likes + 1);
  expect(result.current.posts.find((p) => p.id === other.id).likes).toBe(other.likes);
});

test("addComment appends a comment and bumps the post's comment count", () => {
  const { result } = renderHook(() => useAppData(), { wrapper });
  const post = result.current.posts[0];
  const before = (result.current.commentsByPost[post.id] || []).length;

  act(() => {
    result.current.addComment(post.id, { id: "c-test", author: "Vous", avatar: "VS", time: "à l'instant", text: "Salut", likes: 0 });
  });

  expect(result.current.commentsByPost[post.id].length).toBe(before + 1);
  expect(result.current.posts.find((p) => p.id === post.id).comments).toBe(post.comments + 1);
});
