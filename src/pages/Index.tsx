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
      <div className="py-20 px-4 sm:px-6 animate-fade-in">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8">
            {/* Left Side - Verified Runs Card */}
            <div className="lg:col-span-3 lg:order-1 min-w-0">
              <Card className="bg-gradient-to-br from-ctp-base via-ctp-mantle to-ctp-crust border-ctp-surface1 w-full transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-ctp-green/30 hover:border-ctp-green/50 group">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-card-foreground text-lg sm:text-xl whitespace-nowrap">
                    <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-ctp-green transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12 flex-shrink-0" />
                    <span className="truncate">Verified Runs</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <Skeleton className="h-12 w-32 mb-2" />
                  ) : (
                    <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-ctp-green transition-all duration-300 truncate">
                      {totalVerifiedRuns.toLocaleString()}
                    </div>
                  )}
                  <p className="text-sm sm:text-base text-muted-foreground mt-3 whitespace-nowrap">
                    Total verified speedruns
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Center Content - Title, Subtext, Buttons */}
            <div className="lg:col-span-6 text-center lg:order-2 min-w-0">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold mb-6 text-[#74c7ec] whitespace-nowrap truncate">
                lsw1.dev
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl mb-10 text-ctp-subtext1 max-w-2xl mx-auto animate-fade-in-delay px-2">
                The official site for the LEGO Star Wars: The Video Game speedrunning community. Track your progress and try to earn a stud on the leaderboards!
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4 animate-fade-in-delay-2 px-2">
                <Button size="lg" className="bg-gradient-to-r from-ctp-mauve via-ctp-pink to-ctp-mauve hover:from-ctp-pink hover:via-ctp-mauve hover:to-ctp-pink text-ctp-crust font-bold transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-ctp-mauve/50 animate-gradient bg-[length:200%_auto] whitespace-nowrap" asChild>
                  <Link to="/submit">Submit Run</Link>
                </Button>
                <Button size="lg" variant="outline" className="text-ctp-text hover:text-ctp-text border-ctp-surface1 bg-transparent hover:bg-ctp-blue/10 hover:border-ctp-blue transition-all duration-300 hover:scale-110 hover:shadow-xl whitespace-nowrap" asChild>
                  <Link to="/leaderboards">View All Leaderboards</Link>
                </Button>
              </div>
            </div>

            {/* Right Side - Total Time Card */}
            <div className="lg:col-span-3 lg:order-3 min-w-0">
              <Card className="bg-gradient-to-br from-ctp-base via-ctp-mantle to-ctp-crust border-ctp-surface1 w-full transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-ctp-mauve/30 hover:border-ctp-mauve/50 group">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-card-foreground text-lg sm:text-xl whitespace-nowrap">
                    <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-ctp-mauve transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12 flex-shrink-0" />
                    <span className="truncate">Total Time</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {statsLoading ? (
                    <Skeleton className="h-12 w-40 mb-2" />
                  ) : (
                    <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-ctp-text transition-all duration-300 truncate">
                      {totalTime}
                    </div>
                  )}
                  <p className="text-sm sm:text-base text-muted-foreground mt-3 whitespace-nowrap">
                    Combined runtime
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <div className="py-16 px-4 sm:px-6 overflow-x-hidden">
        <div className="max-w-7xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left Side - Twitch Embed */}
            <div className="lg:col-span-2 min-w-0">
              <div className="flex justify-center overflow-x-auto">
                <div className="w-full max-w-full">
                  <TwitchEmbed channel="lsw1live" />
                </div>
              </div>
            </div>

            {/* Right Side - Recent Runs */}
            <div className="lg:col-span-3 min-w-0">
              <div className="mb-3">
                <h2 className="text-lg sm:text-xl font-bold mb-1.5 text-ctp-text">Recent Runs</h2>
                <p className="text-xs text-ctp-subtext1">
                  Check out the latest speedrun submissions.
                </p>
              </div>

              <div className="overflow-x-auto">
                <div className="[&_header]:hidden [&_div[class*='CardContent']]:!p-4 [&_div[class*='space-y-5']]:!space-y-3">
                  <RecentRuns runs={recentRunsData} loading={loading} showRankBadge={false} />
                </div>
              </div>

              <div className="mt-3 text-center">
                <Button variant="outline" size="sm" className="text-xs text-ctp-text border-ctp-surface1 bg-transparent hover:bg-ctp-blue/10 hover:border-ctp-blue transition-all duration-300 hover:scale-105 hover:shadow-lg whitespace-nowrap" asChild>
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