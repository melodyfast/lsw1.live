import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, CheckCircle, Clock } from "lucide-react";
import { getRecentRuns, getAllVerifiedRuns } from "@/lib/db";
import { LeaderboardEntry } from "@/types/database";
import { Link } from "react-router-dom";
import { RecentRuns } from "@/components/RecentRuns";
import TwitchEmbed from "@/components/TwitchEmbed";
import { parseTimeToSeconds, formatSecondsToTime } from "@/lib/utils";

const Index = () => {
  const [recentRunsData, setRecentRunsData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalVerifiedRuns, setTotalVerifiedRuns] = useState<number>(0);
  const [totalTime, setTotalTime] = useState<string>("00:00:00");
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const recentEntries = await getRecentRuns(3);
        setRecentRunsData(recentEntries);
      } catch (error) {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };

    fetchData();
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
        setTotalTime(formatSecondsToTime(totalSeconds));
      } catch (error) {
        // Silent fail
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-[#1e1e2e] text-ctp-text overflow-x-hidden">
      <div className="py-20 px-4 sm:px-6 lg:px-8 animate-fade-in">
        <div className="max-w-[1920px] mx-auto w-full">
          {/* Top Row - Stats Cards and Title */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8 mb-6 lg:mb-8">
            {/* Left Side - Verified Runs Card */}
            <div className="lg:col-span-3 lg:order-1 min-w-0">
              <Card className="bg-gradient-to-br from-ctp-base via-ctp-mantle to-ctp-crust border-ctp-surface1 w-full transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-ctp-green/30 hover:border-ctp-green/50 group">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="flex items-center gap-2 text-card-foreground text-base sm:text-lg lg:text-xl whitespace-nowrap">
                    <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-ctp-green transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12 flex-shrink-0" />
                    <span className="truncate">Verified Runs</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-2">
                  {statsLoading ? (
                    <Skeleton className="h-10 w-28 mb-1" />
                  ) : (
                    <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-ctp-green transition-all duration-300 truncate">
                      {totalVerifiedRuns.toLocaleString()}
                    </div>
                  )}
                  <p className="text-xs sm:text-sm lg:text-base text-muted-foreground mt-1.5 whitespace-nowrap">
                    Total verified speedruns
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Center Content - Title, Subtext, Buttons */}
            <div className="lg:col-span-6 text-center lg:order-2 min-w-0">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 text-[#74c7ec] whitespace-nowrap truncate">
                lsw1.dev
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl mb-10 text-ctp-subtext1 max-w-3xl mx-auto animate-fade-in-delay px-2">
                The official site for the LEGO Star Wars: The Video Game speedrunning community. Track your progress and try to earn a stud on the leaderboards!
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4 lg:gap-6 animate-fade-in-delay-2 px-2">
                <Button size="lg" className="bg-gradient-to-r from-ctp-mauve via-ctp-pink to-ctp-mauve hover:from-ctp-pink hover:via-ctp-mauve hover:to-ctp-pink text-ctp-crust font-bold transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-ctp-mauve/50 animate-gradient bg-[length:200%_auto] whitespace-nowrap text-base sm:text-lg lg:text-xl px-6 sm:px-8 lg:px-10 py-6 sm:py-7 lg:py-8" asChild>
                  <Link to="/submit">Submit Run</Link>
                </Button>
                <Button size="lg" variant="outline" className="text-ctp-text hover:text-ctp-text border-ctp-surface1 bg-transparent hover:bg-ctp-blue/10 hover:border-ctp-blue transition-all duration-300 hover:scale-110 hover:shadow-xl whitespace-nowrap text-base sm:text-lg lg:text-xl px-6 sm:px-8 lg:px-10 py-6 sm:py-7 lg:py-8" asChild>
                  <Link to="/leaderboards">View All Leaderboards</Link>
                </Button>
              </div>
            </div>

            {/* Right Side - Total Time Card */}
            <div className="lg:col-span-3 lg:order-3 min-w-0">
              <Card className="bg-gradient-to-br from-ctp-base via-ctp-mantle to-ctp-crust border-ctp-surface1 w-full transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-ctp-mauve/30 hover:border-ctp-mauve/50 group">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="flex items-center gap-2 text-card-foreground text-base sm:text-lg lg:text-xl whitespace-nowrap">
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 text-ctp-mauve transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12 flex-shrink-0" />
                    <span className="truncate">Total Time</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-2">
                  {statsLoading ? (
                    <Skeleton className="h-10 w-36 mb-1" />
                  ) : (
                    <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-ctp-text transition-all duration-300 truncate">
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
            {/* Left Side - Twitch Embed (under Verified Runs) */}
            <div className="lg:col-span-8 min-w-0">
              <div className="flex justify-center overflow-x-auto h-full">
                <div className="w-full max-w-full">
                  <TwitchEmbed channel="lsw1live" />
                </div>
              </div>
            </div>

            {/* Right Side - Recent Runs */}
            <div className="lg:col-span-4 min-w-0">
              <div className="mb-3">
                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold mb-1.5 text-ctp-text">Recent Runs</h2>
                <p className="text-sm lg:text-base text-ctp-subtext1">
                  Latest submissions
                </p>
              </div>

              <div className="overflow-x-auto">
                <div className="[&_header]:hidden [&_div[class*='CardContent']]:!p-4 [&_div[class*='space-y-5']]:!space-y-3">
                  <RecentRuns runs={recentRunsData} loading={loading} showRankBadge={false} />
                </div>
              </div>

              <div className="mt-4 text-center">
                <Button variant="outline" size="sm" className="text-sm lg:text-base text-ctp-text border-ctp-surface1 bg-transparent hover:bg-ctp-blue/10 hover:border-ctp-blue transition-all duration-300 hover:scale-105 hover:shadow-lg whitespace-nowrap px-4 lg:px-6 py-2 lg:py-3" asChild>
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