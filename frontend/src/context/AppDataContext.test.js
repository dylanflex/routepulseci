import { renderHook, act, waitFor } from "@testing-library/react";
import { AppDataProvider, useAppData } from "@/context/AppDataContext";
import { api } from "@/lib/api";

// react-scripts' Jest config sets resetMocks: true, which strips mock
// implementations before every test — so they must be (re)established in
// beforeEach rather than inline in the jest.mock() factory.
jest.mock("@/lib/api");

let incidents;
let posts;
let comments;

beforeEach(() => {
  incidents = [
    { id: "i1", type: "jam", x: 1, y: 1, road: "Test", severity: "dense", confirmed: 1, created_at: new Date().toISOString() },
  ];
  posts = [
    { id: "p1", author: { name: "A", handle: "@a", avatar: "A", verified: false, badge: "" }, location: "L", type: "jam", severity: "dense", text: "hello", image: null, likes: 5, comments: 0, shares: 0, confirmed: 1, created_at: new Date().toISOString() },
    { id: "p2", author: { name: "B", handle: "@b", avatar: "B", verified: false, badge: "" }, location: "L2", type: "jam", severity: "dense", text: "hi", image: null, likes: 2, comments: 0, shares: 0, confirmed: 1, created_at: new Date().toISOString() },
  ];
  comments = {};

  api.listIncidents.mockImplementation(() => Promise.resolve(incidents));
  api.createIncident.mockImplementation((body) => {
    const incident = { id: `i-${incidents.length + 1}`, confirmed: 1, created_at: new Date().toISOString(), ...body };
    incidents = [incident, ...incidents];
    return Promise.resolve(incident);
  });
  api.confirmIncident.mockImplementation((id) => {
    incidents = incidents.map((i) => (i.id === id ? { ...i, confirmed: i.confirmed + 1 } : i));
    return Promise.resolve(incidents.find((i) => i.id === id));
  });
  api.listPosts.mockImplementation(() => Promise.resolve(posts));
  api.createPost.mockImplementation((body) => {
    const post = {
      id: `p-${posts.length + 1}`,
      author: { name: body.author_name, handle: body.author_handle, avatar: body.author_avatar, verified: body.author_verified, badge: body.author_badge },
      location: body.location,
      type: body.type,
      severity: body.severity,
      text: body.text,
      image: body.image ?? null,
      likes: 0,
      comments: 0,
      shares: 0,
      confirmed: 1,
      created_at: new Date().toISOString(),
    };
    posts = [post, ...posts];
    return Promise.resolve(post);
  });
  api.likePost.mockImplementation((id, delta) => {
    posts = posts.map((p) => (p.id === id ? { ...p, likes: p.likes + delta } : p));
    return Promise.resolve(posts.find((p) => p.id === id));
  });
  api.confirmPost.mockImplementation((id) => {
    posts = posts.map((p) => (p.id === id ? { ...p, confirmed: p.confirmed + 1 } : p));
    return Promise.resolve(posts.find((p) => p.id === id));
  });
  api.listComments.mockImplementation((postId) => Promise.resolve(comments[postId] || []));
  api.createComment.mockImplementation((postId, body) => {
    const comment = { id: `c-${Date.now()}`, post_id: postId, created_at: new Date().toISOString(), likes: 0, ...body };
    comments[postId] = [...(comments[postId] || []), comment];
    posts = posts.map((p) => (p.id === postId ? { ...p, comments: p.comments + 1 } : p));
    return Promise.resolve(comment);
  });
});

const wrapper = ({ children }) => <AppDataProvider>{children}</AppDataProvider>;

async function renderReady() {
  const { result } = renderHook(() => useAppData(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

test("loads incidents and posts from the API on mount", async () => {
  const result = await renderReady();
  expect(result.current.incidents.length).toBeGreaterThan(0);
  expect(result.current.posts.length).toBeGreaterThan(0);
});

test("submitReport adds a new incident and a matching feed post", async () => {
  const result = await renderReady();
  const incidentsBefore = result.current.incidents.length;
  const postsBefore = result.current.posts.length;

  await act(async () => {
    await result.current.submitReport({ type: "jam", severity: "dense", note: "Test embouteillage", postToFeed: true });
  });

  expect(result.current.incidents.length).toBe(incidentsBefore + 1);
  expect(result.current.posts.length).toBe(postsBefore + 1);
  expect(result.current.posts[0].text).toBe("Test embouteillage");
});

test("submitReport skips the feed post when postToFeed is false", async () => {
  const result = await renderReady();
  const postsBefore = result.current.posts.length;

  await act(async () => {
    await result.current.submitReport({ type: "flood", severity: "danger", note: "", postToFeed: false });
  });

  expect(result.current.posts.length).toBe(postsBefore);
});

test("likePost updates only the targeted post", async () => {
  const result = await renderReady();
  const [post, other] = result.current.posts;

  await act(async () => {
    await result.current.likePost(post.id, 1);
  });

  expect(result.current.posts.find((p) => p.id === post.id).likes).toBe(post.likes + 1);
  expect(result.current.posts.find((p) => p.id === other.id).likes).toBe(other.likes);
});

test("addComment appends a comment and bumps the post's comment count", async () => {
  const result = await renderReady();
  const post = result.current.posts[0];
  const before = post.comments;

  await act(async () => {
    await result.current.addComment(post.id, { author: "Vous", avatar: "VS", text: "Salut" });
  });

  const fetchedComments = await result.current.fetchComments(post.id);
  expect(fetchedComments.length).toBeGreaterThan(0);
  expect(result.current.posts.find((p) => p.id === post.id).comments).toBe(before + 1);
});
