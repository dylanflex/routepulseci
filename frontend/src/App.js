import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AppDataProvider } from "@/context/AppDataContext";
import Landing from "@/pages/Landing";
import AppShell from "@/pages/AppShell";
import MapView from "@/pages/MapView";
import Feed from "@/pages/Feed";
import PostDetail from "@/pages/PostDetail";
import Report from "@/pages/Report";
import Trajet from "@/pages/Trajet";
import Profile from "@/pages/Profile";
import "@/App.css";

function App() {
  return (
    <div className="App min-h-screen bg-background text-foreground">
      <AppDataProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<MapView />} />
              <Route path="carte" element={<MapView />} />
              <Route path="feed" element={<Feed />} />
              <Route path="feed/:id" element={<PostDetail />} />
              <Route path="signaler" element={<Report />} />
              <Route path="trajet" element={<Trajet />} />
              <Route path="profil" element={<Profile />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </AppDataProvider>
    </div>
  );
}

export default App;
