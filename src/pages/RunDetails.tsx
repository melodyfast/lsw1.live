import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, User, Users, Timer, Calendar, CheckCircle, UserCircle, Trophy, Edit2, Save, X, Trash2 } from "lucide-react";
import { getLeaderboardEntryById, getPlayerByUid, getPlayerByUsername, getCategories, getPlatforms, runTypes, updateLeaderboardEntry, deleteLeaderboardEntry } from "@/lib/db";
import { LeaderboardEntry, Player } from "@/types/database";
import { VideoEmbed } from "@/components/VideoEmbed";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/AuthProvider";
import { formatDate, calculatePoints } from "@/lib/utils";

const RunDetails = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useAuth();
  const [run, setRun] = useState<LeaderboardEntry | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [player2, setPlayer2] = useState<Player | null>(null);
  const [verifier, setVerifier] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [platforms, setPlatforms] = useState<{ id: string; name: string }[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({
    playerName: "",
    player2Name: "",
    time: "",
    category: "",
    platform: "",
    runType: "" as 'solo' | 'co-op' | '',
    date: "",
    videoUrl: "",
    comment: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const detailsCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchRunData = async () => {
      if (!runId) {
        toast({
          title: "Error",
          description: "Run ID is missing.",
          variant: "destructive",
        });
        navigate("/leaderboards");
        return;
      }

      setLoading(true);
      try {
        const [runData, fetchedCategories, fetchedPlatforms] = await Promise.all([
          getLeaderboardEntryById(runId),
          getCategories(),
          getPlatforms()
        ]);
        
        if (!runData) {
          toast({
            title: "Run Not Found",
            description: "This run could not be found.",
            variant: "destructive",
          });
          navigate("/leaderboards");
          return;
        }

        setRun(runData);
        setCategories(fetchedCategories);
        setPlatforms(fetchedPlatforms);
        
        // Initialize edit form data
        setEditFormData({
          playerName: runData.playerName || "",
          player2Name: runData.player2Name || "",
          time: runData.time || "",
          category: runData.category || "",
          platform: runData.platform || "",
          runType: runData.runType || "",
          date: runData.date || "",
          videoUrl: runData.videoUrl || "",
          comment: runData.comment || "",
        });

        // Fetch player data
        if (runData.playerId) {
          const playerData = await getPlayerByUid(runData.playerId);
          setPlayer(playerData);
        }

        // Fetch player2 data for co-op runs
        if (runData.player2Name && runData.runType === 'co-op') {
          try {
            const player2Data = await getPlayerByUsername(runData.player2Name);
            if (player2Data) {
              setPlayer2(player2Data);
            }
          } catch {
            // Silent fail - player2 might not have an account
          }
        }

        // Fetch verifier data if verifiedBy exists
        if (runData.verifiedBy) {
          // Try to parse as UID first, then fetch player
          // If it's a name/email, we'll just display it as-is
          try {
            const verifierData = await getPlayerByUid(runData.verifiedBy);
            if (verifierData) {
              setVerifier(verifierData);
            }
          } catch {
            // verifiedBy might be a name/email string, not a UID
            // We'll handle this in the display
          }
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to load run details.",
          variant: "destructive",
        });
        navigate("/leaderboards");
      } finally {
        setLoading(false);
      }
    };

    fetchRunData();
  }, [runId, navigate, toast]);

  useEffect(() => {
    if (leftColumnRef.current && detailsCardRef.current) {
      const updateHeight = () => {
        if (leftColumnRef.current && detailsCardRef.current) {
          // Get the height of the entire left column (video + comment)
          const leftColumnHeight = leftColumnRef.current.offsetHeight;
          // Add extra height to make the details panel slightly taller
          detailsCardRef.current.style.height = `${leftColumnHeight + 264}px`;
        }
      };

      // Initial height calculation
      updateHeight();

      // Use ResizeObserver to update height when left column changes
      const resizeObserver = new ResizeObserver(() => {
        updateHeight();
      });
      
      resizeObserver.observe(leftColumnRef.current);
      
      // Also update on a short delay to handle async content loading
      const timeoutId = setTimeout(updateHeight, 100);
      
      return () => {
        resizeObserver.disconnect();
        clearTimeout(timeoutId);
      };
    }
  }, [run, isEditing]);

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (run) {
      setEditFormData({
        playerName: run.playerName || "",
        player2Name: run.player2Name || "",
        time: run.time || "",
        category: run.category || "",
        platform: run.platform || "",
        runType: run.runType || "",
        date: run.date || "",
        videoUrl: run.videoUrl || "",
        comment: run.comment || "",
      });
    }
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!run || !runId) return;
    
    setSaving(true);
    try {
      const updateData: any = {
        playerName: editFormData.playerName.trim(),
        time: editFormData.time.trim(),
        category: editFormData.category,
        platform: editFormData.platform,
        runType: editFormData.runType as 'solo' | 'co-op',
        date: editFormData.date,
      };

      if (editFormData.runType === 'co-op' && editFormData.player2Name.trim()) {
        updateData.player2Name = editFormData.player2Name.trim();
      } else if (editFormData.runType === 'solo') {
        // Don't include player2Name for solo runs - it will be removed if it exists
        updateData.player2Name = null;
      }

      if (editFormData.videoUrl.trim()) {
        updateData.videoUrl = editFormData.videoUrl.trim();
      } else {
        // Set to null to remove the field
        updateData.videoUrl = null;
      }

      if (editFormData.comment.trim()) {
        updateData.comment = editFormData.comment.trim();
      } else {
        // Set to null to remove the field
        updateData.comment = null;
      }

      const success = await updateLeaderboardEntry(runId, updateData);
      
      if (success) {
        toast({
          title: "Run Updated",
          description: "The run information has been successfully updated.",
        });
        // Reload run data
        const updatedRun = await getLeaderboardEntryById(runId);
        if (updatedRun) {
          setRun(updatedRun);
          // Force height recalculation after run data updates
          setTimeout(() => {
            if (leftColumnRef.current && detailsCardRef.current) {
              const leftColumnHeight = leftColumnRef.current.offsetHeight;
              detailsCardRef.current.style.height = `${leftColumnHeight + 264}px`;
            }
          }, 200);
        }
        setIsEditing(false);
      } else {
        throw new Error("Failed to update run");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update run information.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRun = async () => {
    if (!run || !runId) return;
    
    const categoryName = categories.find((c) => c.id === run.category)?.name || run.category;
    
    // Confirm deletion
    if (!window.confirm(`Are you sure you want to delete this run?\n\nPlayer: ${run.playerName}\nTime: ${run.time}\nCategory: ${categoryName}\n\nThis action cannot be undone.`)) {
      return;
    }
    
    setDeleting(true);
    try {
      const success = await deleteLeaderboardEntry(runId);
      
      if (success) {
        toast({
          title: "Run Deleted",
          description: "The run has been successfully deleted.",
        });
        navigate("/leaderboards");
      } else {
        throw new Error("Failed to delete run");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete run.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] py-8">
        <div className="max-w-6xl mx-auto px-4">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  if (!run) {
    return null;
  }

  const category = categories.find((c) => c.id === run.category);
  const platform = platforms.find((p) => p.id === run.platform);
  const runType = runTypes.find((rt) => rt.id === run.runType);
  
  // Calculate points for display if not already set
  const displayPoints = run.points || (run.verified && !run.isObsolete 
    ? calculatePoints(run.time, category?.name || "Unknown", platform?.name)
    : 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] py-8">
      <div className="max-w-[120rem] mx-auto px-4" id="page-container">
        <Button
          variant="ghost"
          onClick={() => navigate("/leaderboards")}
          className="mb-6 text-[hsl(222,15%,60%)] hover:text-[hsl(220,17%,92%)]"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Leaderboards
        </Button>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div ref={leftColumnRef} className="flex-1 space-y-6 min-w-0 w-full">
            {run.videoUrl ? (
              <Card className="bg-card border-border overflow-hidden w-full">
                <CardContent className="p-0">
                  <VideoEmbed url={run.videoUrl} title={`${run.playerName}'s Run`} />
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="p-12 text-center text-muted-foreground text-lg">
                  No video available
                </CardContent>
              </Card>
            )}

            {run.comment && (
              <Card className="bg-card border-border" id="comment-card">
                <CardHeader className="pb-4 px-5 pt-5">
                  <CardTitle className="text-xl text-card-foreground">Description</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 px-5 pb-5">
                  <p className="text-card-foreground whitespace-pre-wrap text-base leading-relaxed">{run.comment}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="w-full lg:w-[24rem] flex-shrink-0">
            <Card ref={detailsCardRef} className="bg-card border-border overflow-y-auto">
              <CardHeader className="pb-6 px-6 pt-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl text-card-foreground">Run Details</CardTitle>
                  {currentUser?.isAdmin && !isEditing && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEditClick}
                        className="border-border"
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDeleteRun}
                        disabled={deleting}
                        className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {deleting ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  )}
                  {currentUser?.isAdmin && isEditing && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelEdit}
                        disabled={saving}
                        className="border-border"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={saving}
                        className="bg-[#cba6f7] hover:bg-[#b4a0e2] text-[hsl(240,21%,15%)]"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {saving ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0 px-6 pb-6 space-y-6">
                {isEditing ? (
                  <>
                    <div>
                      <Label htmlFor="edit-playerName">Player 1 Name</Label>
                      <Input
                        id="edit-playerName"
                        value={editFormData.playerName}
                        onChange={(e) => setEditFormData({ ...editFormData, playerName: e.target.value })}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      />
                    </div>

                    {editFormData.runType === 'co-op' && (
                      <div>
                        <Label htmlFor="edit-player2Name">Player 2 Name</Label>
                        <Input
                          id="edit-player2Name"
                          value={editFormData.player2Name}
                          onChange={(e) => setEditFormData({ ...editFormData, player2Name: e.target.value })}
                          className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                        />
                      </div>
                    )}

                    <div>
                      <Label htmlFor="edit-time">Time</Label>
                      <Input
                        id="edit-time"
                        value={editFormData.time}
                        onChange={(e) => setEditFormData({ ...editFormData, time: e.target.value })}
                        placeholder="HH:MM:SS"
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] font-mono"
                      />
                    </div>

                    <div>
                      <Label htmlFor="edit-category">Category</Label>
                      <Select
                        value={editFormData.category}
                        onValueChange={(value) => setEditFormData({ ...editFormData, category: value })}
                      >
                        <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="edit-platform">Platform</Label>
                      <Select
                        value={editFormData.platform}
                        onValueChange={(value) => setEditFormData({ ...editFormData, platform: value })}
                      >
                        <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {platforms.map((plat) => (
                            <SelectItem key={plat.id} value={plat.id}>
                              {plat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="edit-runType">Run Type</Label>
                      <Select
                        value={editFormData.runType}
                        onValueChange={(value) => setEditFormData({ ...editFormData, runType: value as 'solo' | 'co-op' })}
                      >
                        <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {runTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="edit-date">Date</Label>
                      <Input
                        id="edit-date"
                        type="date"
                        value={editFormData.date}
                        onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      />
                    </div>

                    <div>
                      <Label htmlFor="edit-videoUrl">Video URL</Label>
                      <Input
                        id="edit-videoUrl"
                        value={editFormData.videoUrl}
                        onChange={(e) => setEditFormData({ ...editFormData, videoUrl: e.target.value })}
                        placeholder="https://youtube.com/watch?v=..."
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      />
                    </div>

                    <div>
                      <Label htmlFor="edit-comment">Comment</Label>
                      <Textarea
                        id="edit-comment"
                        value={editFormData.comment}
                        onChange={(e) => setEditFormData({ ...editFormData, comment: e.target.value })}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                        rows={3}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-base text-muted-foreground mb-2 font-medium">Player{run.runType === 'co-op' ? 's' : ''}</div>
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/player/${run.playerId}`}
                          className="font-medium text-lg hover:opacity-80 transition-opacity"
                          style={{ color: player?.nameColor || 'inherit' }}
                        >
                          {run.playerName}
                        </Link>
                        {run.player2Name && (
                          <>
                            <span className="text-muted-foreground">&</span>
                            <span 
                              className="font-medium text-lg"
                              style={{ color: player2?.nameColor || run.player2Color || 'inherit' }}
                            >
                              {run.player2Name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-base text-muted-foreground mb-2 font-medium">Time</div>
                      <div className="font-mono text-3xl font-bold text-[#cdd6f4] flex items-center gap-3">
                        <Timer className="h-7 w-7" />
                        {run.time}
                      </div>
                    </div>

                    <div>
                      <div className="text-base text-muted-foreground mb-2 font-medium">Category</div>
                      <Badge variant="outline" className="border-border text-base px-3 py-1.5">
                        {category?.name || run.category}
                      </Badge>
                    </div>

                    <div>
                      <div className="text-base text-muted-foreground mb-2 font-medium">Platform</div>
                      <Badge variant="outline" className="border-border text-base px-3 py-1.5">
                        {platform?.name || run.platform.toUpperCase()}
                      </Badge>
                    </div>

                    <div>
                      <div className="text-base text-muted-foreground mb-2 font-medium">Run Type</div>
                      <Badge variant="outline" className="border-border flex items-center gap-2 w-fit text-base px-3 py-1.5">
                        {run.runType === 'solo' ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                        {runType?.name || run.runType.charAt(0).toUpperCase() + run.runType.slice(1)}
                      </Badge>
                    </div>

                    <div>
                      <div className="text-base text-muted-foreground mb-2 font-medium">Date</div>
                      <div className="flex items-center gap-2 text-card-foreground text-lg">
                        <Calendar className="h-5 w-5" />
                        {formatDate(run.date)}
                      </div>
                    </div>
                  </>
                )}

                {run.rank && (
                  <div>
                    <div className="text-base text-muted-foreground mb-2 font-medium">Rank</div>
                    <Badge
                      variant={run.rank <= 3 ? "default" : "secondary"}
                      className="flex items-center gap-2 w-fit text-base px-3 py-1.5"
                    >
                      {run.rank === 1 && <span className="w-4 h-4 rounded-full bg-[#0055BF]"></span>}
                      {run.rank === 2 && <span className="w-4 h-4 rounded-full bg-[#FFD700]"></span>}
                      {run.rank === 3 && <span className="w-4 h-4 rounded-full bg-[#A8A8A8]"></span>}
                      #{run.rank}
                    </Badge>
                  </div>
                )}

                {/* Points */}
                {run.verified && !run.isObsolete && displayPoints > 0 && (
                  <div>
                    <div className="text-base text-muted-foreground mb-2 font-medium">Points Earned</div>
                    <div className="flex items-center gap-2 text-lg">
                      <Trophy className="h-5 w-5 text-yellow-500" />
                      <span className="font-bold bg-gradient-to-r from-[#FFD700] to-[#FFA500] bg-clip-text text-transparent">
                        +{displayPoints.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground text-sm">points</span>
                    </div>
                  </div>
                )}

                {/* Verification Status */}
                <div>
                  <div className="text-base text-muted-foreground mb-2 font-medium">Verification Status</div>
                  {run.verified ? (
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-green-500 text-lg">Verified</span>
                      {run.verifiedBy && (
                        <div className="text-base text-muted-foreground ml-2">
                          by {verifier ? (
                            <Link
                              to={`/player/${verifier.uid}`}
                              className="hover:text-[hsl(var(--mocha-mauve))] transition-colors"
                            >
                              {verifier.displayName}
                            </Link>
                          ) : (
                            <span>{run.verifiedBy}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground"></div>
                      <span className="text-muted-foreground text-lg">Pending Verification</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RunDetails;

