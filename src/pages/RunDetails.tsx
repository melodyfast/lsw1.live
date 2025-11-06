import { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, User, Users, Calendar, CheckCircle, UserCircle, Trophy, Edit2, Save, X, Trash2, Plus } from "lucide-react";
import LegoStudIcon from "@/components/icons/LegoStudIcon";
import { getLeaderboardEntryById, getPlayerByUid, getPlayerByDisplayName, getCategories, getPlatforms, runTypes, updateLeaderboardEntry, deleteLeaderboardEntry } from "@/lib/db";
import { LeaderboardEntry, Player } from "@/types/database";
import { VideoEmbed } from "@/components/VideoEmbed";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/AuthProvider";
import { formatDate, calculatePoints, formatTime } from "@/lib/utils";

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
  const [isOwnerEdit, setIsOwnerEdit] = useState(false); // Separate state for owner-only edit mode
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
  const [displayPoints, setDisplayPoints] = useState<number | null>(null);
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
            const player2Data = await getPlayerByDisplayName(runData.player2Name);
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
    setIsOwnerEdit(false);
  };

  const handleOwnerEditClick = () => {
    setIsEditing(true);
    setIsOwnerEdit(true);
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
    setIsOwnerEdit(false);
  };

  const handleSaveEdit = async () => {
    if (!run || !runId) return;
    
    setSaving(true);
    try {
      let updateData: any;

      if (isOwnerEdit) {
        // Owner edit mode: only allow comment and date
        updateData = {
          date: editFormData.date,
        };

        if (editFormData.comment.trim()) {
          updateData.comment = editFormData.comment.trim();
        } else {
          // Set to null to remove the field
          updateData.comment = null;
        }
      } else {
        // Admin edit mode: allow all fields
        updateData = {
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
          // Update edit form data with new run data
          setEditFormData({
            playerName: updatedRun.playerName || "",
            player2Name: updatedRun.player2Name || "",
            time: updatedRun.time || "",
            category: updatedRun.category || "",
            platform: updatedRun.platform || "",
            runType: updatedRun.runType || "",
            date: updatedRun.date || "",
            videoUrl: updatedRun.videoUrl || "",
            comment: updatedRun.comment || "",
          });
          // Force height recalculation after run data updates
          setTimeout(() => {
            if (leftColumnRef.current && detailsCardRef.current) {
              const leftColumnHeight = leftColumnRef.current.offsetHeight;
              detailsCardRef.current.style.height = `${leftColumnHeight + 264}px`;
            }
          }, 200);
        }
        setIsEditing(false);
        setIsOwnerEdit(false);
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

  // Calculate points when run data changes (must be before early returns)
  useEffect(() => {
    if (!run) {
      setDisplayPoints(null);
      return;
    }

    const calculateDisplayPoints = async () => {
      // Always use stored points if available (most reliable)
      if (run.points !== undefined && run.points !== null && run.points >= 0) {
        setDisplayPoints(run.points);
        return;
      }

      // Obsolete runs still get base points (10), but not bonus points
      // Only calculate if points not stored and run is verified
      if (!run.verified) {
        setDisplayPoints(0);
        return;
      }
      
      // Obsolete runs get base points (10) but no rank bonus

      // Calculate points using stored rank (split for co-op runs)
      const category = categories.find((c) => c.id === run.category);
      const platform = platforms.find((p) => p.id === run.platform);
      
      const calculated = calculatePoints(
        run.time,
        category?.name || "Unknown",
        platform?.name || "Unknown",
        run.category,
        run.platform,
        run.rank,
        run.runType as 'solo' | 'co-op' | undefined
      );
      setDisplayPoints(calculated);
    };
    
    calculateDisplayPoints();
  }, [run?.points, run?.verified, run?.isObsolete, run?.rank, run?.time, run?.category, run?.platform, run?.runType, categories, platforms]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1e1e2e] text-ctp-text py-8">
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
  
  // Use stored points as fallback while calculating
  const finalDisplayPoints = displayPoints !== null ? displayPoints : (run.points || 0);

  return (
    <div className="min-h-screen bg-[#1e1e2e] text-ctp-text py-8 overflow-x-hidden">
      <div className="max-w-[120rem] mx-auto px-4 sm:px-6 w-full" id="page-container">
        <Button
          variant="ghost"
          onClick={() => navigate("/leaderboards")}
          className="mb-6 text-ctp-overlay0 hover:text-ctp-text"
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
            <Card ref={detailsCardRef} className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] overflow-y-auto shadow-xl">
              <CardHeader className="pb-6 px-6 pt-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl text-[#a6e3a1]">Run Details</CardTitle>
                  {!isEditing && (
                    <div className="flex gap-2">
                      {/* Show edit button for run owner (non-admin) */}
                      {currentUser && !currentUser.isAdmin && currentUser.uid === run.playerId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleOwnerEditClick}
                          className="border-[hsl(235,13%,30%)] bg-gradient-to-r from-transparent via-[hsl(237,16%,24%)]/50 to-transparent hover:from-[hsl(237,16%,24%)] hover:via-[hsl(237,16%,28%)] hover:to-[hsl(237,16%,24%)] hover:border-[#cba6f7]/50"
                        >
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      )}
                      {/* Show full admin controls */}
                      {currentUser?.isAdmin && (
                        <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleEditClick}
                            className="border-[hsl(235,13%,30%)] bg-gradient-to-r from-transparent via-[hsl(237,16%,24%)]/50 to-transparent hover:from-[hsl(237,16%,24%)] hover:via-[hsl(237,16%,28%)] hover:to-[hsl(237,16%,24%)] hover:border-[#cba6f7]/50"
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDeleteRun}
                        disabled={deleting}
                            className="border-red-500/50 text-red-500 bg-gradient-to-r from-transparent via-red-500/10 to-transparent hover:from-red-500/20 hover:via-red-500/30 hover:to-red-500/20 hover:bg-red-500 hover:text-white hover:border-red-500"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {deleting ? "Deleting..." : "Delete"}
                      </Button>
                        </>
                      )}
                    </div>
                  )}
                  {isEditing && (
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
                    {isOwnerEdit ? (
                      // Owner edit mode: only comment and date
                      <>
                        <div>
                          <Label htmlFor="edit-date">Date</Label>
                          <Input
                            id="edit-date"
                            type="date"
                            value={editFormData.date}
                            onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                            className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                            max={new Date().toISOString().split('T')[0]}
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
                            placeholder="Add a description or comment about this run..."
                          />
                        </div>
                      </>
                    ) : (
                      // Admin edit mode: all fields
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
                            className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
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
                    )}
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
                      <div className="text-3xl font-bold text-ctp-text flex items-center gap-3">
                        {formatTime(run.time)}
                      </div>
                    </div>

                    {run.rank && (
                      <div>
                        <div className="text-base text-muted-foreground mb-2 font-medium">Rank</div>
                        <div className="flex items-center gap-2">
                          {run.rank === 1 ? (
                            <>
                              <LegoStudIcon size={36} color="#0055BF" />
                              <span className="font-bold text-base text-ctp-text">
                                #{run.rank}
                              </span>
                            </>
                          ) : run.rank === 2 ? (
                            <>
                              <LegoStudIcon size={36} color="#FFD700" />
                              <span className="font-bold text-base text-ctp-text">
                                #{run.rank}
                              </span>
                            </>
                          ) : run.rank === 3 ? (
                            <>
                              <LegoStudIcon size={36} color="#C0C0C0" />
                              <span className="font-bold text-base text-ctp-text">
                                #{run.rank}
                              </span>
                            </>
                          ) : (
                            <span className="font-bold text-base text-ctp-text">
                              #{run.rank}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

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

                {/* Points */}
                {run.verified && !run.isObsolete && finalDisplayPoints > 0 && (
                  <div>
                    <div className="text-base text-muted-foreground mb-2 font-medium">Points Earned</div>
                    <div className="flex items-center gap-2 text-lg">
                      <Plus className="h-5 w-5 text-[#fab387]" />
                      <span className="font-bold text-[#fab387]">
                        +{finalDisplayPoints.toLocaleString()}
                      </span>
                      <span className="text-muted-foreground text-sm">points</span>
                      {run.runType === 'co-op' && (
                        <span className="text-muted-foreground text-xs">(split between both players)</span>
                      )}
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

