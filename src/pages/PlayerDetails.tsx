import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerProfile } from "@/components/PlayerProfile";
import { ArrowLeft, Trophy, User, Users, Upload, X, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { getPlayerRuns, getPlayerByUid, getCategories, getPlatforms, getPlayerPendingRuns, updatePlayerProfile } from "@/lib/db";
import { Player, LeaderboardEntry } from "@/types/database";
import { formatDate, formatTime } from "@/lib/utils";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useAuth } from "@/components/AuthProvider";
import { Clock } from "lucide-react";
import { useUploadThing } from "@/lib/uploadthing";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
  const [profilePicture, setProfilePicture] = useState<string>("");
  const { toast } = useToast();
  const { startUpload, isUploading } = useUploadThing("profilePicture");
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
        setProfilePicture(fetchedPlayer?.profilePicture || "");
        
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
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] py-8">
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
          <p className="text-[hsl(222,15%,60%)]">View all runs and achievements</p>
        </div>

        <div className="relative">
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
          />
          {isOwnProfile && (
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] mt-4 shadow-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="h-5 w-5 text-[#cba6f7]" />
                  Edit Profile Picture
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={profilePicture || `https://api.dicebear.com/7.x/lorelei-neutral/svg?seed=${player.displayName}`} />
                    <AvatarFallback>{player.displayName?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;
                          
                          // Validate file size (4MB max)
                          if (file.size > 4 * 1024 * 1024) {
                            toast({
                              title: "File Too Large",
                              description: "Profile picture must be less than 4MB.",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          // Validate file type
                          if (!file.type.startsWith('image/')) {
                            toast({
                              title: "Invalid File Type",
                              description: "Please upload an image file.",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          try {
                            const uploadedFiles = await startUpload([file]);
                            if (uploadedFiles && uploadedFiles.length > 0) {
                              const fileUrl = uploadedFiles[0]?.url;
                              if (fileUrl) {
                                setProfilePicture(fileUrl);
                                // Save immediately
                                const success = await updatePlayerProfile(currentUser!.uid, {
                                  profilePicture: fileUrl
                                });
                                if (success) {
                                  setPlayer({ ...player, profilePicture: fileUrl });
                                  toast({
                                    title: "Profile Picture Updated",
                                    description: "Your profile picture has been saved.",
                                  });
                                } else {
                                  toast({
                                    title: "Error",
                                    description: "Failed to save profile picture.",
                                    variant: "destructive",
                                  });
                                }
                              }
                            }
                          } catch (error) {
                            toast({
                              title: "Upload Failed",
                              description: "Failed to upload profile picture. Please try again.",
                              variant: "destructive",
                            });
                          }
                        };
                        input.click();
                      }}
                      disabled={isUploading}
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] hover:bg-[hsl(234,14%,29%)]"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {isUploading ? "Uploading..." : "Upload Picture"}
                    </Button>
                    {profilePicture && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const success = await updatePlayerProfile(currentUser!.uid, {
                            profilePicture: ""
                          });
                          if (success) {
                            setProfilePicture("");
                            setPlayer({ ...player, profilePicture: "" });
                            toast({
                              title: "Profile Picture Removed",
                              description: "Your profile picture has been removed.",
                            });
                          } else {
                            toast({
                              title: "Error",
                              description: "Failed to remove profile picture.",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="ml-2 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-[hsl(222,15%,60%)] mt-2">
                  Upload a profile picture (max 4MB). Changes are saved automatically.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pending Submissions Panel - Only show for own profile */}
        {isOwnProfile && (
          <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] mt-8 shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-[#f9e2af]" />
                Pending Submissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingRuns.length === 0 ? (
                <p className="text-[hsl(222,15%,60%)] text-center py-4">No pending submissions</p>
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
                            <td className="py-3 px-4 text-[hsl(222,15%,60%)]">{formatDate(run.date)}</td>
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
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[#cba6f7]" />
              Recent Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {playerRuns.length === 0 ? (
              <p className="text-[hsl(222,15%,60%)] text-center py-4">No runs submitted yet</p>
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
                              <Badge 
                                variant={run.rank <= 3 ? "default" : "secondary"} 
                                className={run.rank === 1 ? "bg-gradient-to-br from-[#f9e2af] to-[#f5c2e7]" : run.rank === 2 ? "bg-gradient-to-br from-[#bac2de] to-[#89b4fa]" : run.rank === 3 ? "bg-gradient-to-br from-[#fab387] to-[#74c7ec]" : ""}
                              >
                                #{run.rank}
                              </Badge>
                            ) : (
                              <span className="text-[hsl(222,15%,60%)]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium">{categoryName}</td>
                          <td className="py-3 px-4 font-mono">{formatTime(run.time)}</td>
                          <td className="py-3 px-4 text-[hsl(222,15%,60%)]">{formatDate(run.date)}</td>
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