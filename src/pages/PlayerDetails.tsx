import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerProfile } from "@/components/PlayerProfile";
import { ArrowLeft, Trophy, User, Users, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { getPlayerRuns, getPlayerByUid, getCategories, getPlatforms, getPlayerPendingRuns } from "@/lib/db";
import LegoStudIcon from "@/components/icons/LegoStudIcon";
import { Player, LeaderboardEntry } from "@/types/database";
import { formatDate, formatTime } from "@/lib/utils";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useAuth } from "@/components/AuthProvider";

const PlayerDetails = () => {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [playerRuns, setPlayerRuns] = useState<LeaderboardEntry[]>([]);
  const [pendingRuns, setPendingRuns] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [platforms, setPlatforms] = useState<{ id: string; name: string }[]>([]);
  const isOwnProfile = currentUser?.uid === playerId;

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (!playerId) return;
      
      setLoading(true);
      try {
        const [fetchedPlayer, fetchedRuns, fetchedCategories, fetchedPlatforms] = await Promise.all([
          getPlayerByUid(playerId),
          getPlayerRuns(playerId),
          getCategories(),
          getPlatforms()
        ]);
        
        setPlayer(fetchedPlayer);
        setPlayerRuns(fetchedRuns);
        setCategories(fetchedCategories);
        setPlatforms(fetchedPlatforms);
        
        // Only fetch pending runs if viewing own profile
        // Check both currentUser exists and uid matches playerId
        if (currentUser && currentUser.uid && currentUser.uid === playerId) {
          try {
            console.log("Fetching pending runs for playerId:", playerId);
            const fetchedPending = await getPlayerPendingRuns(playerId);
            console.log("Fetched pending runs:", fetchedPending);
            setPendingRuns(fetchedPending || []);
          } catch (error) {
            console.error("Error fetching pending runs:", error);
            setPendingRuns([]);
          }
        } else {
          // Clear pending runs if not own profile
          console.log("Not own profile or currentUser not loaded. Clearing pending runs.");
          setPendingRuns([]);
        }
      } catch (error) {
        // Error handling - player data fetch failed
        console.error("Error fetching player data:", error);
        setPlayer(null);
        setPlayerRuns([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [playerId, currentUser?.uid]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] flex items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] py-8">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="text-3xl font-bold mb-4">Player Not Found</h1>
          <p className="text-[hsl(222,15%,60%)] mb-8">The requested player could not be found.</p>
          <Button variant="outline" className="text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)] hover:bg-[hsl(234,14%,29%)]" asChild>
            <Link to="/leaderboards">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Leaderboards
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1e2e] text-ctp-text py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mb-6">
          <Button variant="outline" className="text-[hsl(220,17%,92%)] border-[hsl(235,13%,30%)] hover:bg-[hsl(234,14%,29%)]" asChild>
            <Link to="/leaderboards">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Leaderboards
            </Link>
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">
            <span style={{ color: player.nameColor || 'inherit' }}>{player.displayName}</span>'s Profile
          </h1>
          <p className="text-ctp-overlay0">View all runs and achievements</p>
        </div>

        <PlayerProfile 
          playerName={player.displayName || "Unknown Player"} 
          joinDate={player.joinDate ? formatDate(player.joinDate) : "Unknown"} 
          stats={{
            totalRuns: player.totalRuns || 0,
            bestRank: player.bestRank || 0,
            favoriteCategory: player.favoriteCategory || "Not set",
            favoritePlatform: player.favoritePlatform || "Not set",
          }} 
          nameColor={player.nameColor}
          profilePicture={player.profilePicture}
          bio={player.bio}
          pronouns={player.pronouns}
        />

        {/* Pending Submissions Panel - Only show for own profile */}
        {isOwnProfile && (
          <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] mt-8 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-ctp-text">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-ctp-mauve to-ctp-lavender opacity-30 blur-sm animate-pulse"></div>
                  <div className="relative p-1.5 bg-gradient-to-br from-ctp-mauve to-ctp-lavender transition-transform duration-300 hover:scale-110">
                    <Clock className="h-5 w-5 text-ctp-crust" />
                  </div>
                </div>
                Pending Submissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingRuns.length === 0 ? (
                <p className="text-ctp-overlay0 text-center py-4">No pending submissions</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[hsl(235,13%,30%)]">
                        <th className="py-3 px-4 text-left">Category</th>
                        <th className="py-3 px-4 text-left">Time</th>
                        <th className="py-3 px-4 text-left">Date</th>
                        <th className="py-3 px-4 text-left">Platform</th>
                        <th className="py-3 px-4 text-left">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingRuns.map((run) => {
                        const categoryName = categories.find(c => c.id === run.category)?.name || run.category;
                        const platformName = platforms.find(p => p.id === run.platform)?.name || run.platform;
                        
                        return (
                          <tr 
                            key={run.id} 
                            className="border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)] cursor-pointer transition-colors"
                            onClick={() => navigate(`/run/${run.id}`)}
                          >
                            <td className="py-3 px-4 font-medium">{categoryName}</td>
                            <td className="py-3 px-4 font-mono">{formatTime(run.time)}</td>
                            <td className="py-3 px-4 text-ctp-overlay0">{formatDate(run.date)}</td>
                            <td className="py-3 px-4">
                              <Badge variant="outline" className="border-[hsl(235,13%,30%)]">
                                {platformName}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant="outline" className="border-[hsl(235,13%,30%)] flex items-center gap-1 w-fit">
                                {run.runType === 'solo' ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                                {run.runType.charAt(0).toUpperCase() + run.runType.slice(1)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] mt-8 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-ctp-text">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-ctp-mauve to-ctp-lavender opacity-30 blur-sm animate-pulse"></div>
                <div className="relative p-1.5 bg-gradient-to-br from-ctp-mauve to-ctp-lavender transition-transform duration-300 hover:scale-110">
                  <Trophy className="h-5 w-5 text-ctp-crust" />
                </div>
              </div>
              Recent Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {playerRuns.length === 0 ? (
              <p className="text-ctp-overlay0 text-center py-4">No runs submitted yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[hsl(235,13%,30%)]">
                      <th className="py-3 px-4 text-left">Rank</th>
                      <th className="py-3 px-4 text-left">Category</th>
                      <th className="py-3 px-4 text-left">Time</th>
                      <th className="py-3 px-4 text-left">Date</th>
                      <th className="py-3 px-4 text-left">Platform</th>
                      <th className="py-3 px-4 text-left">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerRuns.map((run) => {
                      const categoryName = categories.find(c => c.id === run.category)?.name || run.category;
                      const platformName = platforms.find(p => p.id === run.platform)?.name || run.platform;
                      
                      return (
                        <tr 
                          key={run.id} 
                          className="border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)] cursor-pointer transition-colors"
                          onClick={() => navigate(`/run/${run.id}`)}
                        >
                          <td className="py-3 px-4">
                            {run.rank ? (
                              run.rank === 1 ? (
                                <LegoStudIcon size={36} color="#0055BF" />
                              ) : run.rank === 2 ? (
                                <LegoStudIcon size={36} color="#FFD700" />
                              ) : run.rank === 3 ? (
                                <LegoStudIcon size={36} color="#C0C0C0" />
                              ) : (
                                <span className="font-bold text-base text-ctp-text w-9 h-9 flex items-center justify-center">
                                  #{run.rank}
                                </span>
                              )
                            ) : (
                              <span className="text-ctp-overlay0">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium">{categoryName}</td>
                          <td className="py-3 px-4 text-base font-semibold">{formatTime(run.time)}</td>
                          <td className="py-3 px-4 text-ctp-overlay0">{formatDate(run.date)}</td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="border-[hsl(235,13%,30%)]">
                              {platformName}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" className="border-[hsl(235,13%,30%)] flex items-center gap-1 w-fit">
                              {run.runType === 'solo' ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                              {run.runType.charAt(0).toUpperCase() + run.runType.slice(1)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PlayerDetails;