import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { Header } from "@/components/Header";
import Index from "./pages/Index";
import Leaderboards from "./pages/Leaderboards";
import PointsLeaderboard from "./pages/PointsLeaderboard";
import SubmitRun from "./pages/SubmitRun";
import PlayerDetails from "./pages/PlayerDetails";
import RunDetails from "./pages/RunDetails";
import UserSettings from "./pages/UserSettings";
import Admin from "./pages/Admin";
import Live from "./pages/Live";
import Downloads from "./pages/Downloads";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "@/components/AuthProvider";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-grow">
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/leaderboards" element={<Leaderboards />} />
                <Route path="/points" element={<PointsLeaderboard />} />
                <Route path="/submit" element={<SubmitRun />} />
                <Route path="/player/:playerId" element={<PlayerDetails />} />
                <Route path="/run/:runId" element={<RunDetails />} />
                <Route path="/settings" element={<UserSettings />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/live" element={<Live />} />
                <Route path="/downloads" element={<Downloads />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
        <Analytics />
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;