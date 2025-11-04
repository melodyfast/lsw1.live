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
        const recentEntries = await getRecentRuns(5);
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
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)]">
      <div className="py-20 px-4 animate-fade-in">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8 lg:gap-6">
            {/* Left Card - Verified Runs */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] w-full lg:w-[250px] lg:flex-shrink-0 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-[#a6e3a1]/30 hover:border-[#a6e3a1]/50 group order-2 lg:order-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-card-foreground">
                  <CheckCircle className="h-5 w-5 text-[hsl(var(--mocha-green))] transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12" />
                  Verified Runs
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-10 w-24 mb-2" />
                ) : (
                  <div className="text-3xl font-bold text-[hsl(var(--mocha-green))] transition-all duration-300">
                    {totalVerifiedRuns.toLocaleString()}
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-2">
                  Total verified speedruns
                </p>
              </CardContent>
            </Card>

            {/* Center Content - Title, Subtext, Buttons */}
            <div className="flex-1 text-center order-1 lg:order-2">
              <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-[hsl(var(--mocha-sapphire))] via-[hsl(var(--mocha-mauve))] to-[hsl(var(--mocha-lavender))] bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
                lsw1.dev
              </h1>
              <p className="text-xl md:text-2xl mb-10 text-[hsl(222,15%,70%)] max-w-2xl mx-auto animate-fade-in-delay">
                Compete for the fastest times in the galaxy. Track your progress and climb the ranks!
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4 animate-fade-in-delay-2">
                <Button size="lg" className="bg-gradient-to-r from-[#cba6f7] via-[#f5c2e7] to-[#cba6f7] hover:from-[#f5c2e7] hover:via-[#cba6f7] hover:to-[#f5c2e7] text-[hsl(240,21%,15%)] font-bold transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-[#cba6f7]/50 animate-gradient bg-[length:200%_auto]" asChild>
                  <Link to="/submit">Submit Run</Link>
                </Button>
                <Button size="lg" variant="outline" className="text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)] bg-transparent hover:bg-[#89b4fa]/10 hover:border-[#89b4fa] transition-all duration-300 hover:scale-110 hover:shadow-xl" asChild>
                  <Link to="/leaderboards">View All Leaderboards</Link>
                </Button>
              </div>
            </div>

            {/* Right Card - Total Time */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] w-full lg:w-[250px] lg:flex-shrink-0 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-[#cba6f7]/30 hover:border-[#cba6f7]/50 group order-3 lg:order-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-card-foreground">
                  <Clock className="h-5 w-5 text-[hsl(var(--mocha-mauve))] transition-transform duration-300 group-hover:scale-125 group-hover:rotate-12" />
                  Total Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-10 w-32 mb-2" />
                ) : (
                  <div className="text-3xl font-bold text-[#cdd6f4] font-mono transition-all duration-300">
                    {totalTime}
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-2">
                  Combined runtime
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-center">
            <TwitchEmbed channel="lsw1live" />
          </div>
        </div>
      </div>

      <div className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1">
            <div className="col-span-1">
              <div className="text-center mb-8">
                <h2 className="text-3xl md:text-4xl font-bold mb-4 text-[hsl(220,17%,92%)]">Recent Runs</h2>
                <p className="text-[hsl(222,15%,70%)] max-w-2xl mx-auto">
                  Check out the latest speedrun submissions.
                </p>
              </div>

              <RecentRuns runs={recentRunsData} loading={loading} showRankBadge={false} />

              <div className="mt-8 text-center">
                <Button variant="outline" className="text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)] bg-transparent hover:bg-[#89b4fa]/10 hover:border-[#89b4fa] transition-all duration-300 hover:scale-110 hover:shadow-lg" asChild>
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