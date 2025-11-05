import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { TrendingUp, Sparkles, Plus } from "lucide-react";
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
    <div className="min-h-screen bg-[#1e1e2e] text-[hsl(220,17%,92%)] py-6">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Plus className="h-6 w-6 text-[#fab387]" />
            <h1 className="text-3xl md:text-4xl font-bold text-[#fab387]">
              Points Leaderboard
            </h1>
          </div>
          <p className="text-base text-ctp-subtext1 max-w-3xl mx-auto animate-fade-in-delay">
            Top players ranked by their total points. Points are only awarded for GameCube runs in Any% and Nocuts Noships. Points are calculated exponentially for faster times, with special bonuses for exceptional milestone times!
          </p>
        </div>

        <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
          <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
            <CardTitle className="flex items-center gap-2 text-xl text-[#fab387]">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-[#fab387] to-[#fe8019] opacity-30 blur-sm animate-pulse"></div>
                <div className="relative p-1.5 bg-gradient-to-br from-[#fab387] to-[#fe8019] transition-transform duration-300 hover:scale-110">
                  <TrendingUp className="h-5 w-5 text-ctp-crust" />
                </div>
              </div>
              <span>
                Top Players by Points
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {loading ? (
              <LoadingSpinner size="sm" className="py-8" />
            ) : players.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="h-12 w-12 mx-auto mb-3 text-[hsl(222,15%,60%)] opacity-50" />
                <p className="text-base text-[hsl(222,15%,60%)]">
                  No players with points yet. Submit and verify runs to earn points!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
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
                        className={`relative overflow-hidden transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl animate-fade-in ${
                          rank === 1
                            ? "bg-gradient-to-br from-[#89b4fa]/20 via-[#89b4fa]/15 to-[#89b4fa]/10 border-2 border-[#89b4fa]/50 hover:border-[#89b4fa] hover:shadow-[#89b4fa]/30"
                            : rank === 2
                            ? "bg-gradient-to-br from-[#74c7ec]/20 via-[#74c7ec]/15 to-[#74c7ec]/10 border-2 border-[#74c7ec]/50 hover:border-[#74c7ec] hover:shadow-[#74c7ec]/30"
                            : rank === 3
                            ? "bg-gradient-to-br from-[#89dceb]/20 via-[#89dceb]/15 to-[#89dceb]/10 border-2 border-[#89dceb]/50 hover:border-[#89dceb] hover:shadow-[#89dceb]/30"
                            : "bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border border-[hsl(235,13%,30%)] hover:border-[hsl(var(--mocha-mauve))] hover:shadow-[hsl(var(--mocha-mauve))]/20"
                        }`}
                        style={{ animationDelay: `${index * 0.05}s` }}
                      >
                        {/* Animated background gradient on hover */}
                        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--mocha-mauve))]/0 via-[hsl(var(--mocha-mauve))]/5 to-[hsl(var(--mocha-mauve))]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        
                        <div className="relative flex items-center gap-4 p-4">
                          {/* Rank */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {rank === 1 ? (
                              <LegoStudIcon size={40} color="#0055BF" />
                            ) : rank === 2 ? (
                              <LegoStudIcon size={40} color="#FFD700" />
                            ) : rank === 3 ? (
                              <LegoStudIcon size={40} color="#C0C0C0" />
                            ) : (
                              <span className="font-bold text-base text-ctp-text w-10 h-10 flex items-center justify-center">
                                #{rank}
                              </span>
                            )}
                          </div>

                          {/* Player Name */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span
                                className="font-bold text-lg group-hover:scale-105 transition-transform duration-300"
                                style={{ color: player.nameColor || "#cba6f7" }}
                              >
                                {displayName}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-ctp-subtext1">
                              <span>{player.totalRuns || 0} verified run{player.totalRuns !== 1 ? 's' : ''}</span>
                            </div>
                          </div>

                          {/* Points */}
                          <div className="text-right flex-shrink-0">
                            <div className="flex items-center gap-1.5 justify-end mb-1">
                              <Plus className="h-5 w-5 text-[#fab387] group-hover:scale-110 transition-transform duration-300" />
                              <div className="text-2xl font-bold text-[#fab387] group-hover:scale-110 transition-transform duration-300">
                                {formatPoints(points)}
                              </div>
                            </div>
                            <div className="text-xs text-ctp-overlay0 uppercase tracking-wider">points</div>
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

