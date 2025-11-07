import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Trophy, CheckCircle, Clock, ExternalLink } from "lucide-react";
import { getRecentRuns, getAllVerifiedRuns } from "@/lib/db";
import { LeaderboardEntry } from "@/types/database";
import { Link } from "react-router-dom";
import { RecentRuns } from "@/components/RecentRuns";
import TwitchEmbed from "@/components/TwitchEmbed";
import { parseTimeToSeconds, formatSecondsToTime } from "@/lib/utils";

// Format seconds into months, days, hours, minutes, seconds in compact format
const formatTimeWithDays = (totalSeconds: number): string => {
  const months = Math.floor(totalSeconds / (30 * 86400)); // Approximate 30 days per month
  const days = Math.floor((totalSeconds % (30 * 86400)) / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  const parts: string[] = [];
  
  if (months > 0) {
    parts.push(`${months}M`);
  }
  if (days > 0) {
    parts.push(`${days}D`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }
  
  return parts.join(' ');
};

const Index = () => {
  const [recentRunsData, setRecentRunsData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalVerifiedRuns, setTotalVerifiedRuns] = useState<number>(0);
  const [totalTime, setTotalTime] = useState<string>("00:00:00");
  const [statsLoading, setStatsLoading] = useState(true);
  const lastRefreshTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch more runs to allow dynamic display based on available space
        const recentEntries = await getRecentRuns(20);
        setRecentRunsData(recentEntries);
      } catch (error) {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Only refresh when page becomes visible AND enough time has passed
    const MIN_REFRESH_INTERVAL = 30000; // Minimum 30 seconds between refreshes
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLastRefresh = Date.now() - lastRefreshTimeRef.current;
        if (timeSinceLastRefresh >= MIN_REFRESH_INTERVAL) {
          fetchData();
          lastRefreshTimeRef.current = Date.now();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      setStatsLoading(true);
      try {
        const verifiedRuns = await getAllVerifiedRuns();
        setTotalVerifiedRuns(verifiedRuns.length);
        
        const totalSeconds = verifiedRuns.reduce((sum, run) => {
          return sum + parseTimeToSeconds(run.time);
        }, 0);
        setTotalTime(formatTimeWithDays(totalSeconds));
      } catch (error) {
        // Silent fail
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="min-h-screen text-ctp-text overflow-x-hidden relative">
      <div className="py-20 px-4 sm:px-6 lg:px-8 animate-fade-in">
        <div className="max-w-[1920px] mx-auto w-full">
          {/* Top Row - Stats Cards and Title */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8 mb-6 lg:mb-8">
            {/* Left Side - Verified Runs Card */}
            <div className="lg:col-span-3 lg:order-1 min-w-0">
              <Card className="glass shadow-colored-green card-hover border-ctp-surface1/50 w-full group overflow-hidden relative rounded-none">
                <div className="absolute inset-0 bg-gradient-to-br from-ctp-green/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <CardHeader className="pb-2 pt-4 px-4 relative z-10">
                  <CardTitle className="flex items-center gap-2 text-card-foreground text-base sm:text-lg lg:text-xl whitespace-nowrap">
                    <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-ctp-green transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12 flex-shrink-0" />
                    <span className="truncate font-semibold">Verified Runs</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-2 relative z-10">
                  {statsLoading ? (
                    <Skeleton className="h-10 w-28 mb-1 bg-ctp-surface0/50" />
                  ) : (
                    <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-ctp-green transition-all duration-300 break-words min-w-0">
                      {totalVerifiedRuns.toLocaleString()}
                    </div>
                  )}
                  <p className="text-xs sm:text-sm lg:text-base text-muted-foreground mt-1.5 whitespace-nowrap">
                    Total verified speedruns
                  </p>
                  <div className="mt-2">
                    <Badge variant="outline" className="border-green-600/50 bg-green-600/10 text-green-400 text-xs px-2 py-0.5 flex items-center gap-1.5 w-fit">
                      <CheckCircle className="h-3 w-3" />
                      <span>Linked with Speedrun.com</span>
                      <a
                        href="https://www.speedrun.com/lsw1"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Center Content - Title, Subtext, Buttons */}
            <div className="lg:col-span-6 text-center lg:order-2 min-w-0">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 whitespace-nowrap truncate animate-fade-in-scale">
                <span className="text-[#74c7ec]">
                  lsw1.dev
                </span>
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl mb-10 text-ctp-subtext1 max-w-3xl mx-auto animate-fade-in-delay px-2 leading-relaxed">
                The official site for the LEGO Star Wars: The Video Game speedrunning community. Track your progress and try to earn a stud on the leaderboards!
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4 lg:gap-6 animate-fade-in-delay-2 px-2">
                <Button size="lg" className="bg-gradient-to-r from-ctp-mauve via-ctp-pink to-ctp-mauve hover:from-ctp-pink hover:via-ctp-mauve hover:to-ctp-pink text-ctp-crust font-bold transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-ctp-mauve/50 animate-gradient bg-[length:200%_auto] whitespace-nowrap text-base sm:text-lg lg:text-xl px-6 sm:px-8 lg:px-10 py-6 sm:py-7 lg:py-8 rounded-none border-0 shadow-colored" asChild>
                  <Link to="/submit">Submit Run</Link>
                </Button>
                <Button size="lg" variant="outline" className="text-ctp-text hover:text-ctp-text border-ctp-surface1/50 bg-glass hover:bg-ctp-blue/10 hover:border-ctp-blue/50 transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-ctp-blue/30 whitespace-nowrap text-base sm:text-lg lg:text-xl px-6 sm:px-8 lg:px-10 py-6 sm:py-7 lg:py-8 rounded-none backdrop-blur-sm" asChild>
                  <Link to="/leaderboards">View All Leaderboards</Link>
                </Button>
              </div>
            </div>

            {/* Right Side - Total Time Card */}
            <div className="lg:col-span-3 lg:order-3 min-w-0">
              <Card className="glass shadow-colored card-hover border-ctp-surface1/50 w-full group overflow-hidden relative rounded-none">
                <div className="absolute inset-0 bg-gradient-to-br from-ctp-mauve/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <CardHeader className="pb-2 pt-4 px-4 relative z-10">
                  <CardTitle className="flex items-center gap-2 text-card-foreground text-base sm:text-lg lg:text-xl whitespace-nowrap">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-ctp-mauve transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12 flex-shrink-0" />
                    <span className="truncate font-semibold">Total Time</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-2 relative z-10">
                  {statsLoading ? (
                    <Skeleton className="h-10 w-36 mb-1 bg-ctp-surface0/50" />
                  ) : (
                    <div className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-ctp-text transition-all duration-300 break-words min-w-0 leading-tight">
                      {totalTime}
                    </div>
                  )}
                  <p className="text-xs sm:text-sm lg:text-base text-muted-foreground mt-1.5 whitespace-nowrap">
                    Combined runtime
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Bottom Row - Twitch Embed and Recent Runs */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8 items-stretch">
            {/* Left Side - Twitch Embed (under Verified Runs) */}
            <div className="lg:col-span-8 min-w-0 flex flex-col">
              <TwitchEmbed channel="lsw1live" />
            </div>

            {/* Right Side - Recent Runs */}
            <div className="lg:col-span-4 min-w-0 flex flex-col">
              <div className="mb-3 flex-shrink-0">
                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold mb-1.5 text-ctp-text flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-ctp-yellow animate-float" />
                  <span>Recent Runs</span>
                </h2>
                <p className="text-sm lg:text-base text-ctp-subtext1">
                  Latest submissions
                </p>
              </div>

              <div className="flex-1 min-h-0 flex flex-col">
                <style>{`
                  .homepage-recent-runs [class*="CardContent"] { padding: 0.75rem !important; }
                  .homepage-recent-runs [class*="space-y-5"] > * + * { margin-top: 0.5rem !important; }
                  .homepage-recent-runs div[class*="p-6"], .homepage-recent-runs div[class*="p-8"] { padding: 0.75rem !important; }
                  .homepage-recent-runs .text-xl { font-size: 1rem !important; }
                  .homepage-recent-runs .text-2xl { font-size: 1.25rem !important; }
                  .homepage-recent-runs div[class*="min-w-"] { min-width: 180px !important; }
                  .homepage-recent-runs .text-sm { font-size: 0.625rem !important; }
                  .homepage-recent-runs span[class*="px-3"] { padding-left: 0.375rem !important; padding-right: 0.375rem !important; }
                  .homepage-recent-runs span[class*="py-1"] { padding-top: 0.125rem !important; padding-bottom: 0.125rem !important; }
                  .homepage-recent-runs div[class*="gap-8"] { gap: 1rem !important; }
                  .homepage-recent-runs div[class*="gap-6"] { gap: 0.5rem !important; }
                  .homepage-recent-runs div[class*="gap-3"] { gap: 0.375rem !important; }
                  .homepage-recent-runs .mb-3 { margin-bottom: 0.5rem !important; }
                  .homepage-recent-runs .mb-2 { margin-bottom: 0.25rem !important; }
                  .homepage-recent-runs .mt-2 { margin-top: 0.25rem !important; }
                  .homepage-recent-runs a[class*="text-xl"] { font-size: 1.125rem !important; font-weight: 700 !important; }
                  .homepage-recent-runs a[class*="text-2xl"] { font-size: 1.375rem !important; font-weight: 700 !important; }
                  .homepage-recent-runs p[class*="text-xl"] { font-size: 1.125rem !important; }
                  .homepage-recent-runs p[class*="text-2xl"] { font-size: 1.375rem !important; }
                `}</style>
                <div className="homepage-recent-runs [&_header]:hidden h-full flex-1 min-h-0">
                  <RecentRuns runs={recentRunsData} loading={loading} showRankBadge={false} />
                </div>
              </div>

              <div className="mt-4 text-center flex-shrink-0">
                <Button variant="outline" size="sm" className="text-sm lg:text-base text-ctp-text border-ctp-surface1/50 bg-glass hover:bg-ctp-blue/10 hover:border-ctp-blue/50 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-ctp-blue/20 whitespace-nowrap px-4 lg:px-6 py-2 lg:py-3 rounded-none backdrop-blur-sm" asChild>
                  <Link to="/leaderboards">View Full Leaderboards</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;