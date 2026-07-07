import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AppDataProvider } from "@/context/AppDataContext";
import { AuthProvider } from "@/context/AuthContext";
import { api, setToken, clearToken } from "@/lib/api";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import MapView from "@/pages/MapView";
import Feed from "@/pages/Feed";
import PostDetail from "@/pages/PostDetail";
import Report from "@/pages/Report";
import Trajet from "@/pages/Trajet";
import Profile from "@/pages/Profile";

// react-scripts' Jest config sets resetMocks: true, which strips mock
// implementations before every test — so they must be (re)established in
// beforeEach rather than inline in the jest.mock() factory.
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return {
    ...actual,
    api: {
      register: jest.fn(),
      login: jest.fn(),
      me: jest.fn(),
      listIncidents: jest.fn(),
      roadConditions: jest.fn(),
      createIncident: jest.fn(),
      confirmIncident: jest.fn(),
      listPosts: jest.fn(),
      createPost: jest.fn(),
      likePost: jest.fn(),
      confirmPost: jest.fn(),
      listComments: jest.fn(),
      createComment: jest.fn(),
      scanRoute: jest.fn(),
      suggestPlaces: jest.fn(),
    },
  };
});

const fakeUser = { id: "u1", username: "aya", display_name: "Aya K.", avatar: "AK", created_at: new Date().toISOString() };

beforeEach(() => {
  clearToken();
  const now = new Date().toISOString();
  const incidents = [{ id: "i1", type: "jam", x: 220, y: 130, road: "Bd Latrille", severity: "blocked", confirmed: 12, created_at: now }];
  const posts = [
    { id: "p1", author: { name: "Aya K.", handle: "@aya_abj", avatar: "AK", verified: true, badge: "Contributeur Or" }, location: "Cocody, Riviera 3", type: "jam", severity: "blocked", text: "Bouchon monstre.", image: null, likes: 142, comments: 1, shares: 34, confirmed: 18, created_at: now },
  ];
  const comments = { p1: [{ id: "c1", post_id: "p1", author: "Serge B.", avatar: "SB", text: "Confirmé.", likes: 12, created_at: now }] };

  api.listIncidents.mockResolvedValue(incidents);
  api.roadConditions.mockResolvedValue([]);
  api.createIncident.mockResolvedValue(incidents[0]);
  api.confirmIncident.mockResolvedValue(incidents[0]);
  api.listPosts.mockResolvedValue(posts);
  api.createPost.mockResolvedValue(posts[0]);
  api.likePost.mockResolvedValue(posts[0]);
  api.confirmPost.mockResolvedValue(posts[0]);
  api.listComments.mockImplementation((postId) => Promise.resolve(comments[postId] || []));
  api.createComment.mockResolvedValue(comments.p1[0]);
  api.me.mockResolvedValue(fakeUser);
  api.login.mockResolvedValue({ access_token: "t", user: fakeUser });
  api.register.mockResolvedValue({ access_token: "t", user: fakeUser });
  api.suggestPlaces.mockResolvedValue([]);
  api.scanRoute.mockResolvedValue({ from: {}, to: {}, distance_km: 1, duration_min: 1, route: [], alerts: [], severe_count: 0, reroute: null, recommendation: null });
});

const renderAt = (path, route) =>
  render(
    <AuthProvider>
      <AppDataProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>{route}</Routes>
        </MemoryRouter>
      </AppDataProvider>
    </AuthProvider>
  );

test("Landing renders the hero", () => {
  renderAt("/", <Route path="/" element={<Landing />} />);
  expect(screen.getAllByText(/RoutePulse/i).length).toBeGreaterThan(0);
});

test("Login renders the form", () => {
  renderAt("/login", <Route path="/login" element={<Login />} />);
  expect(screen.getByRole("heading", { name: "Se connecter" })).toBeInTheDocument();
});

test("Register renders the form", () => {
  renderAt("/register", <Route path="/register" element={<Register />} />);
  expect(screen.getByText("Créer un profil")).toBeInTheDocument();
});

test("MapView renders the incident list", () => {
  renderAt("/carte", <Route path="/carte" element={<MapView />} />);
  expect(screen.getByText("Carte en direct")).toBeInTheDocument();
});

test("MapView's map fullscreen toggle switches on and off", () => {
  renderAt("/carte", <Route path="/carte" element={<MapView />} />);
  const toggle = screen.getByLabelText("Plein écran");
  expect(toggle).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(toggle);
  expect(screen.getByLabelText("Quitter le plein écran")).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByLabelText("Quitter le plein écran"));
  expect(screen.getByLabelText("Plein écran")).toHaveAttribute("aria-pressed", "false");
});

test("MapView's fullscreen mode reveals the avant de partir trip planner", () => {
  renderAt("/carte", <Route path="/carte" element={<MapView />} />);
  expect(screen.queryByPlaceholderText("Point de départ")).not.toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("Plein écran"));
  expect(screen.getByPlaceholderText("Point de départ")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Destination")).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText("Quitter le plein écran"));
  expect(screen.queryByPlaceholderText("Point de départ")).not.toBeInTheDocument();
});

test("Trajet's own map fullscreen does not duplicate its trip planner", async () => {
  renderAt("/trajet", <Route path="/trajet" element={<Trajet />} />);
  fireEvent.change(screen.getByPlaceholderText("Point de départ"), { target: { value: "Cocody" } });
  fireEvent.change(screen.getByPlaceholderText("Destination"), { target: { value: "Plateau" } });
  fireEvent.click(screen.getByText(/Scanner l.itinéraire/));

  // Trajet already has its own "avant de partir" search fields on the page —
  // the map's internal planner must not double them up in fullscreen.
  fireEvent.click(await screen.findByLabelText("Plein écran"));
  expect(screen.getAllByPlaceholderText("Point de départ")).toHaveLength(1);
});

test("Feed renders posts", () => {
  renderAt("/feed", <Route path="/feed" element={<Feed />} />);
  expect(screen.getByText("Le fil")).toBeInTheDocument();
});

test("PostDetail renders comments for a known post", async () => {
  renderAt("/feed/p1", <Route path="/feed/:id" element={<PostDetail />} />);
  expect(await screen.findByText(/commentaires/)).toBeInTheDocument();
});

test("Report renders the first step", () => {
  renderAt("/signaler", <Route path="/signaler" element={<Report />} />);
  expect(screen.getByText("Signaler un incident")).toBeInTheDocument();
});

test("Trajet renders the search form", () => {
  renderAt("/trajet", <Route path="/trajet" element={<Trajet />} />);
  expect(screen.getByText("Avant de partir")).toBeInTheDocument();
});

test("Profile prompts to log in when signed out", () => {
  renderAt("/profil", <Route path="/profil" element={<Profile />} />);
  expect(screen.getByText("Pas encore connecté")).toBeInTheDocument();
});

test("Profile shows the real user once authenticated", async () => {
  setToken("fake-token");
  renderAt("/profil", <Route path="/profil" element={<Profile />} />);
  expect(await screen.findByText("Aya K.")).toBeInTheDocument();
});
