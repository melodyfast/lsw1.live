import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { Trophy, TrendingUp, Sparkles, Zap } from "lucide-react";
import { Player } from "@/types/database";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { getPlayersByPoints } from "@/lib/db";
import LegoStudIcon from "@/components/icons/LegoStudIcon";

const PointsLeaderboard = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlayers = async () => {
      setLoading(true);
      try {
        const playersData = await getPlayersByPoints(100);
        setPlayers(playersData);
      } catch (error) {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  const formatPoints = (points: number) => {
    return new Intl.NumberFormat().format(points);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] py-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12 animate-fade-in">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-br from-[#FFD700] to-[#FFA500] shadow-lg">
              <Trophy className="h-10 w-10 text-[hsl(240,21%,15%)]" />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
              Points Leaderboard
            </h1>
          </div>
          <p className="text-xl text-[hsl(222,15%,70%)] max-w-3xl mx-auto">
            Top players ranked by their total points. Points are only awarded for <strong className="text-[#cba6f7]">GameCube</strong> runs in <strong className="text-[#cba6f7]">Any%</strong> and <strong className="text-[#cba6f7]">Nocuts Noships</strong> categories. Points are calculated exponentially for faster times, with special bonuses for exceptional milestone times!
          </p>
        </div>

        <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
          <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
            <CardTitle className="flex items-center gap-3 text-2xl">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
                <TrendingUp className="h-6 w-6 text-[hsl(240,21%,15%)]" />
              </div>
              <span className="bg-gradient-to-r from-[#cba6f7] to-[#f5c2e7] bg-clip-text text-transparent">
                Top Players by Points
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            {loading ? (
              <LoadingSpinner size="sm" className="py-12" />
            ) : players.length === 0 ? (
              <div className="text-center py-16">
                <Sparkles className="h-16 w-16 mx-auto mb-4 text-[hsl(222,15%,60%)] opacity-50" />
                <p className="text-xl text-[hsl(222,15%,60%)]">
                  No players with points yet. Submit and verify runs to earn points!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {players.map((player, index) => {
                  const rank = index + 1;
                  const points = player.totalPoints || 0;
                  const displayName = player.displayName || player.email?.split('@')[0] || "Unknown Player";
                  
                  return (
                    <Link
                      key={player.uid}
                      to={`/player/${player.uid}`}
                      className="block group"
                    >
                      <div
                        className={`relative overflow-hidden rounded-xl transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl animate-fade-in ${
                          rank === 1
                            ? "bg-gradient-to-br from-[#FFD700]/20 via-[#FFA500]/15 to-[#FFD700]/10 border-2 border-[#FFD700]/50 hover:border-[#FFD700] hover:shadow-[#FFD700]/30"
                            : rank === 2
                            ? "bg-gradient-to-br from-[#bac2de]/20 via-[#89b4fa]/15 to-[#bac2de]/10 border-2 border-[#89b4fa]/50 hover:border-[#89b4fa] hover:shadow-[#89b4fa]/30"
                            : rank === 3
                            ? "bg-gradient-to-br from-[#fab387]/20 via-[#fe8019]/15 to-[#fab387]/10 border-2 border-[#fe8019]/50 hover:border-[#fe8019] hover:shadow-[#fe8019]/30"
                            : "bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border border-[hsl(235,13%,30%)] hover:border-[hsl(var(--mocha-mauve))] hover:shadow-[hsl(var(--mocha-mauve))]/20"
                        }`}
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        {/* Animated background gradient on hover */}
                        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--mocha-mauve))]/0 via-[hsl(var(--mocha-mauve))]/5 to-[hsl(var(--mocha-mauve))]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        
                        <div className="relative flex items-center gap-6 p-6">
                          {/* Rank */}
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {rank === 1 ? (
                              <>
                                <span className="font-bold text-xl text-[hsl(220,17%,92%)] min-w-[2.5rem]">
                                  #{rank}
                                </span>
                                <div className="relative">
                                  <LegoStudIcon size={56} color="#0055BF" />
                                </div>
                              </>
                            ) : rank === 2 ? (
                              <>
                                <span className="font-bold text-xl text-[hsl(220,17%,92%)] min-w-[2.5rem]">
                                  #{rank}
                                </span>
                                <div className="relative">
                                  <LegoStudIcon size={56} color="#FFD700" />
                                </div>
                              </>
                            ) : rank === 3 ? (
                              <>
                                <span className="font-bold text-xl text-[hsl(220,17%,92%)] min-w-[2.5rem]">
                                  #{rank}
                                </span>
                                <div className="relative">
                                  <LegoStudIcon size={56} color="#C0C0C0" />
                                </div>
                              </>
                            ) : (
                              <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg transition-all duration-300 group-hover:scale-110 ${
                                rank <= 10 
                                  ? "bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2] text-[hsl(240,21%,15%)] shadow-lg"
                                  : "bg-[hsl(235,13%,25%)] text-[hsl(222,15%,70%)] border border-[hsl(235,13%,30%)]"
                              }`}>
                                {rank}
                              </div>
                            )}
                          </div>

                          {/* Player Name */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <span
                                className="font-bold text-xl group-hover:scale-105 transition-transform duration-300"
                                style={{ color: player.nameColor || "#cba6f7" }}
                              >
                                {displayName}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-[hsl(222,15%,70%)]">
                              <Trophy className="h-4 w-4" />
                              <span>{player.totalRuns || 0} verified run{player.totalRuns !== 1 ? 's' : ''}</span>
                            </div>
                          </div>

                          {/* Points */}
                          <div className="text-right flex-shrink-0">
                            <div className="flex items-center gap-2 justify-end mb-1">
                              <Zap className="h-6 w-6 text-[#FFD700] group-hover:scale-110 transition-transform duration-300" />
                              <div className="text-3xl font-bold bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] bg-clip-text text-transparent group-hover:scale-110 transition-transform duration-300">
                                {formatPoints(points)}
                              </div>
                            </div>
                            <div className="text-xs text-[hsl(222,15%,60%)] uppercase tracking-wider">points</div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
          opacity: 0;
        }
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default PointsLeaderboard;

