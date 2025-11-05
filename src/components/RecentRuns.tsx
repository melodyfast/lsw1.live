import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Users, Trophy, Sparkles, TrendingUp, Gamepad2 } from "lucide-react";
import { LeaderboardEntry } from "@/types/database";
import { getCategories, getPlatforms } from "@/lib/db";
import { formatDate, formatTime } from "@/lib/utils";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";

interface RecentRunsProps {
  runs: LeaderboardEntry[];
  loading?: boolean;
  showRankBadge?: boolean;
}

export function RecentRuns({ runs, loading, showRankBadge = true }: RecentRunsProps) {
  const [platforms, setPlatforms] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [platformsData, categoriesData] = await Promise.all([
          getPlatforms(),
          getCategories()
        ]);
        setPlatforms(platformsData);
        setCategories(categoriesData);
      } catch (error) {
        // Silent fail
      }
    };
    fetchData();
  }, []);

  // Function to get full category name
  const getCategoryName = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : null;
  };

  // Function to get full platform name
  const getPlatformName = (platformId: string) => {
    const platform = platforms.find(p => p.id === platformId);
    return platform ? platform.name : null;
  };

  return (
    <Card className="bg-gradient-to-br from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
      <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
        <CardTitle className="flex items-center gap-2 text-ctp-text">
          <div className="p-2 bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
            <TrendingUp className="h-5 w-5 text-[hsl(240,21%,15%)]" />
          </div>
          <span>
            Recent Runs
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        {loading ? (
          <LoadingSpinner size="sm" className="py-8" />
        ) : runs.length === 0 ? (
          <div className="text-center py-12">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-[hsl(222,15%,60%)] opacity-50" />
            <p className="text-[hsl(222,15%,60%)]">No recent runs yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run, index) => (
              <Link
                key={run.id}
                to={`/run/${run.id}`}
                className="group relative block overflow-hidden rounded-xl bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border border-[hsl(235,13%,30%)] hover:border-[hsl(var(--mocha-mauve))] transition-all duration-300 hover:shadow-lg hover:shadow-[hsl(var(--mocha-mauve))]/20 hover:-translate-y-1"
              >
                {/* Animated background gradient on hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--mocha-mauve))]/0 via-[hsl(var(--mocha-mauve))]/5 to-[hsl(var(--mocha-mauve))]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <div className="relative flex items-center justify-between p-5">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {showRankBadge && (
                      <div className="flex-shrink-0">
                        {index < 3 ? (
                          <div className={`relative flex items-center justify-center w-12 h-12 font-bold text-lg shadow-lg ${
                            index === 0 
                              ? "bg-gradient-to-br from-[#FFD700] to-[#FFA500] text-[hsl(240,21%,15%)]" 
                              : index === 1 
                              ? "bg-gradient-to-br from-[#bac2de] to-[#89b4fa] text-[hsl(240,21%,15%)]" 
                              : "bg-gradient-to-br from-[#fab387] to-[#fe8019] text-[hsl(240,21%,15%)]"
                          }`}>
                            {index === 0 && <Trophy className="absolute -top-1 -right-1 h-4 w-4 text-[#FFD700]" />}
                            #{index + 1}
                          </div>
                        ) : (
                          <Badge 
                            variant="secondary"
                            className="w-12 h-12 flex items-center justify-center text-lg font-bold bg-gradient-to-br from-[hsl(235,13%,25%)] to-[hsl(235,13%,22%)] text-[hsl(222,15%,70%)] border border-[hsl(235,13%,30%)]"
                          >
                            #{index + 1}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Link
                          to={`/player/${run.playerId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold text-lg truncate hover:opacity-80 transition-all group-hover:scale-105"
                          style={{ color: run.nameColor || '#cba6f7' }}
                        >
                          {run.playerName}
                        </Link>
                        {run.player2Name && (
                          <>
                            <span className="text-[hsl(222,15%,60%)] font-normal">&</span>
                            <span 
                              className="font-semibold text-lg"
                              style={{ color: run.player2Color || '#cba6f7' }}
                            >
                              {run.player2Name}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {getCategoryName(run.category) && (
                          <Badge variant="outline" className="border-[hsl(235,13%,30%)] bg-[hsl(240,21%,18%)] text-[hsl(220,17%,92%)]">
                            {getCategoryName(run.category)}
                          </Badge>
                        )}
                        {getPlatformName(run.platform) && (
                          <Badge variant="outline" className="border-[hsl(235,13%,30%)] bg-[hsl(240,21%,18%)] text-[hsl(222,15%,70%)]">
                            <Gamepad2 className="h-3 w-3 mr-1" />
                            {getPlatformName(run.platform)}
                          </Badge>
                        )}
                        <Badge variant="outline" className="border-[hsl(235,13%,30%)] bg-[hsl(240,21%,18%)] text-[hsl(222,15%,70%)]">
                          {run.runType === 'solo' ? <User className="h-3 w-3 mr-1" /> : <Users className="h-3 w-3 mr-1" />}
                          {run.runType.charAt(0).toUpperCase() + run.runType.slice(1)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0 ml-4">
                    <div className="text-right min-w-[120px]">
                      <div className="flex items-center gap-2 justify-end mb-1">
                        <p className="text-base font-semibold text-ctp-text">
                          {formatTime(run.time)}
                        </p>
                      </div>
                      <p className="text-xs text-[hsl(222,15%,60%)] mt-1.5">
                        {formatDate(run.date)}
                      </p>
                    </div>
                    <div className="text-[hsl(222,15%,60%)] group-hover:text-[hsl(var(--mocha-mauve))] transition-colors">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}