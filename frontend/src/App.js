import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/context/AuthContext";
import { AppDataProvider } from "@/context/AppDataContext";
import "@/App.css";

// Route-level code splitting: each page ships as its own chunk instead of
// all of them (plus their dependencies — framer-motion, the map, ...) being
// parsed/executed upfront in one bundle before the first page can render.
// The Landing page in particular shouldn't have to pay for Report/Profile/
// Feed's code just to show the marketing page.
const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const AppShell = lazy(() => import("@/pages/AppShell"));
const MapView = lazy(() => import("@/pages/MapView"));
const Feed = lazy(() => import("@/pages/Feed"));
const PostDetail = lazy(() => import("@/pages/PostDetail"));
const Report = lazy(() => import("@/pages/Report"));
const Trajet = lazy(() => import("@/pages/Trajet"));
const Profile = lazy(() => import("@/pages/Profile"));
const Settings = lazy(() => import("@/pages/Settings"));
const MunicipalDashboard = lazy(() => import("@/pages/MunicipalDashboard"));
const Moderation = lazy(() => import("@/pages/Moderation"));

function App() {
  return (
    <div className="App min-h-screen bg-background text-foreground">
      <AuthProvider>
        <AppDataProvider>
          <BrowserRouter>
            <Suspense fallback={null}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/collectivites" element={<MunicipalDashboard />} />
                <Route path="/app" element={<AppShell />}>
                  <Route index element={<MapView />} />
                  <Route path="carte" element={<MapView />} />
                  <Route path="feed" element={<Feed />} />
                  <Route path="feed/:id" element={<PostDetail />} />
                  <Route path="signaler" element={<Report />} />
                  <Route path="trajet" element={<Trajet />} />
                  <Route path="profil" element={<Profile />} />
                  <Route path="parametres" element={<Settings />} />
                  <Route path="moderation" element={<Moderation />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster position="top-center" richColors />
        </AppDataProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
