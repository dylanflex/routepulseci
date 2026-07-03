import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AppDataProvider } from "@/context/AppDataContext";
import Landing from "@/pages/Landing";
import MapView from "@/pages/MapView";
import Feed from "@/pages/Feed";
import PostDetail from "@/pages/PostDetail";
import Report from "@/pages/Report";
import Trajet from "@/pages/Trajet";
import Profile from "@/pages/Profile";

const renderAt = (path, route) =>
  render(
    <AppDataProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>{route}</Routes>
      </MemoryRouter>
    </AppDataProvider>
  );

test("Landing renders the hero", () => {
  renderAt("/", <Route path="/" element={<Landing />} />);
  expect(screen.getAllByText(/RoutePulse/i).length).toBeGreaterThan(0);
});

test("MapView renders the incident list", () => {
  renderAt("/carte", <Route path="/carte" element={<MapView />} />);
  expect(screen.getByText("Carte en direct")).toBeInTheDocument();
});

test("Feed renders posts", () => {
  renderAt("/feed", <Route path="/feed" element={<Feed />} />);
  expect(screen.getByText("Le fil")).toBeInTheDocument();
});

test("PostDetail renders comments for a known post", () => {
  renderAt("/feed/p1", <Route path="/feed/:id" element={<PostDetail />} />);
  expect(screen.getByText(/commentaires/)).toBeInTheDocument();
});

test("Report renders the first step", () => {
  renderAt("/signaler", <Route path="/signaler" element={<Report />} />);
  expect(screen.getByText("Signaler un incident")).toBeInTheDocument();
});

test("Trajet renders the search form", () => {
  renderAt("/trajet", <Route path="/trajet" element={<Trajet />} />);
  expect(screen.getByText("Avant de partir")).toBeInTheDocument();
});

test("Profile renders the user header", () => {
  renderAt("/profil", <Route path="/profil" element={<Profile />} />);
  expect(screen.getByText("Aya Kouassi")).toBeInTheDocument();
});
