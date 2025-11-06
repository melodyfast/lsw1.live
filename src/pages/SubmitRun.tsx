import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Gamepad2, Timer, User, Users, FileText, Sparkles, CheckCircle, Calendar, ChevronDown, ChevronUp, Trophy, Star, Gem, BookOpen } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { addLeaderboardEntry, getCategories, getPlatforms, runTypes, getPlayerByDisplayName, getLevels } from "@/lib/db";
import { useNavigate } from "react-router-dom";

const SubmitRun = () => {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [availableCategories, setAvailableCategories] = useState<{ id: string; name: string }[]>([]);
  const [availableLevels, setAvailableLevels] = useState<{ id: string; name: string }[]>([]);
  const [availablePlatforms, setAvailablePlatforms] = useState<{ id: string; name: string }[]>([]);
  const [availableSubcategories, setAvailableSubcategories] = useState<Array<{ id: string; name: string }>>([]);
  const [leaderboardType, setLeaderboardType] = useState<'regular' | 'individual-level' | 'community-golds'>('regular');
  
  const [formData, setFormData] = useState({
    playerName: currentUser?.displayName || "",
    player2Name: "", // New state for player2Name
    category: "",
    subcategory: "", // Subcategory for regular runs
    level: "", // Level for ILs and Community Golds
    platform: "",
    runType: "",
    time: "",
    date: new Date().toISOString().split('T')[0], // Default to today's date
    videoUrl: "",
    comment: "",
  });
  
  const [loading, setLoading] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // For Individual Level: fetch Story/Free Play categories
        // For Community Golds: fetch community-golds categories (now configurable)
        // For Regular: fetch regular categories
        const categoryType = leaderboardType;
        
        const [fetchedCategories, fetchedLevels, fetchedPlatforms] = await Promise.all([
          getCategories(categoryType),
          getLevels(),
          getPlatforms()
        ]);
        setAvailableCategories(fetchedCategories);
        setAvailableLevels(fetchedLevels);
        setAvailablePlatforms(fetchedPlatforms);
        if (fetchedCategories.length > 0 && !formData.category) {
          setFormData(prev => ({ ...prev, category: fetchedCategories[0].id }));
        } else if (fetchedCategories.length === 0) {
          setFormData(prev => ({ ...prev, category: "" }));
        }
        if (fetchedLevels.length > 0 && (leaderboardType === 'individual-level' || leaderboardType === 'community-golds') && !formData.level) {
          setFormData(prev => ({ ...prev, level: fetchedLevels[0].id }));
        } else if (leaderboardType === 'regular') {
          setFormData(prev => ({ ...prev, level: "" }));
        }
      } catch (error) {
        // Silent fail
      }
    };
    
    fetchData();
  }, [leaderboardType]);

  // Fetch subcategories when category changes (only for regular leaderboard type)
  useEffect(() => {
    const fetchSubcategories = async () => {
      if (leaderboardType === 'regular' && formData.category) {
        try {
          const categories = await getCategories('regular');
          const category = categories.find(c => c.id === formData.category);
          if (category && category.subcategories && category.subcategories.length > 0) {
            // Sort subcategories by order
            const sorted = [...category.subcategories].sort((a, b) => {
              const orderA = a.order ?? Infinity;
              const orderB = b.order ?? Infinity;
              return orderA - orderB;
            });
            setAvailableSubcategories(sorted);
          } else {
            setAvailableSubcategories([]);
            setFormData(prev => ({ ...prev, subcategory: "" }));
          }
        } catch (error) {
          setAvailableSubcategories([]);
          setFormData(prev => ({ ...prev, subcategory: "" }));
        }
      } else {
        setAvailableSubcategories([]);
        setFormData(prev => ({ ...prev, subcategory: "" }));
      }
    };
    
    fetchSubcategories();
  }, [formData.category, leaderboardType]);

  // Update playerName when currentUser loads (if field is still empty)
  useEffect(() => {
    if (currentUser?.displayName) {
      setFormData(prev => {
        // Only update if the field is empty or still has the old email-based default
        if (!prev.playerName || prev.playerName === currentUser.email?.split('@')[0]) {
          return { ...prev, playerName: currentUser.displayName || "" };
        }
        return prev;
      });
    }
  }, [currentUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser) {
      toast({
        title: "Authentication Required",
        description: "Please log in to submit a run.",
        variant: "destructive",
      });
      return;
    }
    
    if (!formData.playerName || !formData.playerName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your player name.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.category || !formData.platform || !formData.runType || !formData.time || !formData.date) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    // For ILs and Community Golds, level is required
    if ((leaderboardType === 'individual-level' || leaderboardType === 'community-golds') && !formData.level) {
      toast({
        title: "Missing Information",
        description: "Please select a level for Individual Level or Community Gold runs.",
        variant: "destructive",
      });
      return;
    }

    if (formData.runType === 'co-op' && !formData.player2Name) {
      toast({
        title: "Missing Information",
        description: "Please enter the second player's name for co-op runs.",
        variant: "destructive",
      });
      return;
    }

    // Check if video is required for this category
    const selectedCategory = availableCategories.find(c => c.id === formData.category);
    const categoryName = selectedCategory?.name || "";
    const normalizedCategory = categoryName.toLowerCase().trim();
    const isNocutsNoships = normalizedCategory === "nocuts noships" || normalizedCategory === "nocutsnoships";
    
    // Video is required for all categories except Nocuts Noships
    if (!isNocutsNoships && (!formData.videoUrl || !formData.videoUrl.trim())) {
      toast({
        title: "Missing Information",
        description: "Video proof is required for this category.",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    
    try {
      // Determine playerId based on whether admin is submitting for someone else
      let playerId = currentUser.uid;
      let finalPlayerName = formData.playerName.trim();
      
      // If admin is submitting for a different player, look up that player
      if (currentUser.isAdmin && formData.playerName.trim() !== (currentUser.displayName || currentUser.email?.split('@')[0] || "")) {
        const targetPlayer = await getPlayerByDisplayName(formData.playerName.trim());
        if (targetPlayer) {
          // Player exists, use their UID
          playerId = targetPlayer.uid;
          // Use the player's actual displayName from the database
          finalPlayerName = targetPlayer.displayName || formData.playerName.trim();
        } else {
          // Player doesn't exist - prevent submission to avoid assigning run to wrong account
          toast({
            title: "Player Not Found",
            description: `Player "${formData.playerName.trim()}" does not have an account. Please create the player account first, or use the Admin panel to add the run manually.`,
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }
      
      const entry: any = {
        playerId: playerId,
        playerName: finalPlayerName,
        category: formData.category,
        platform: formData.platform,
        runType: formData.runType as 'solo' | 'co-op',
        leaderboardType: leaderboardType,
        time: formData.time.trim(),
        date: formData.date,
        verified: false,
      };

      // Add level for ILs and Community Golds
      if (formData.level && (leaderboardType === 'individual-level' || leaderboardType === 'community-golds')) {
        entry.level = formData.level;
      }
      
      // Add subcategory for regular runs
      if (leaderboardType === 'regular' && formData.subcategory && formData.subcategory.trim()) {
        entry.subcategory = formData.subcategory.trim();
      }
      
      // Only include player2Name for co-op runs with a valid value
      if (formData.runType === 'co-op' && formData.player2Name && formData.player2Name.trim()) {
        entry.player2Name = formData.player2Name.trim();
      }
      
      // Only include optional fields if they have values
      if (formData.videoUrl && formData.videoUrl.trim()) {
        entry.videoUrl = formData.videoUrl.trim();
      }
      
      if (formData.comment && formData.comment.trim()) {
        entry.comment = formData.comment.trim();
      }
      
      const result = await addLeaderboardEntry(entry);
      
      if (result) {
        toast({
          title: "Run Submitted",
          description: "Your run has been submitted successfully and is awaiting verification.",
        });
        navigate("/leaderboards");
      } else {
        throw new Error("Failed to submit run");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || error.code || "Failed to submit run. Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e2e] text-ctp-text py-6 overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full">
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Upload className="h-6 w-6 text-[#eba0ac]" />
            <h1 className="text-3xl md:text-4xl font-bold text-[#eba0ac]">
              Submit Your Run
            </h1>
          </div>
          <p className="text-base text-ctp-subtext1 max-w-3xl mx-auto animate-fade-in-delay">
            Share your PB with the community. Make sure to follow our submission guidelines!
          </p>
        </div>

        {!currentUser ? (
          <Card className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 shadow-xl max-w-2xl mx-auto">
            <CardContent className="p-12 text-center">
              <div className="mb-6">
                <Sparkles className="h-16 w-16 mx-auto mb-4 text-ctp-subtext1 opacity-50" />
                <h2 className="text-3xl font-bold mb-4 text-ctp-text">Authentication Required</h2>
                <p className="text-lg text-ctp-subtext1 mb-8">
                  Please log in to submit your run to the leaderboard.
                </p>
              </div>
              <Button className="bg-gradient-to-r from-ctp-mauve to-ctp-lavender hover:from-ctp-lavender hover:to-ctp-mauve text-ctp-crust font-bold px-8 py-6 text-lg transition-all duration-300 hover:scale-105 hover:shadow-lg">
                Log In to Submit
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* Main Form */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
                <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)] py-4">
                  <CardTitle className="flex items-center gap-2 text-xl text-[#eba0ac]">
                    <span>
                      Run Details
                    </span>
                </CardTitle>
              </CardHeader>
                <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Leaderboard Type Tabs */}
                <div>
                  <Label className="text-sm font-semibold mb-2 block">Leaderboard Type *</Label>
                  <Tabs value={leaderboardType} onValueChange={(value) => {
                    setLeaderboardType(value as 'regular' | 'individual-level' | 'community-golds');
                    setFormData(prev => ({ ...prev, category: "", level: "" })); // Reset category and level when type changes
                  }}>
                    <TabsList className="grid w-full grid-cols-3 p-0.5 gap-1">
                      <TabsTrigger 
                        value="regular" 
                        className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
                      >
                        <Trophy className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
                        <span className="hidden min-[375px]:inline">Full Game</span>
                        <span className="min-[375px]:hidden">Game</span>
                      </TabsTrigger>
                      <TabsTrigger 
                        value="individual-level" 
                        className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
                      >
                        <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
                        <span className="hidden sm:inline">Individual Levels</span>
                        <span className="sm:hidden">ILs</span>
                      </TabsTrigger>
                      <TabsTrigger 
                        value="community-golds"
                        className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
                      >
                        <Gem className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
                        <span className="hidden sm:inline">Community Golds</span>
                        <span className="sm:hidden">Golds</span>
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="playerName" className="text-sm font-semibold mb-1.5">Player 1 Name *</Label>
                    <Input
                      id="playerName"
                      name="playerName"
                      value={formData.playerName}
                      onChange={handleChange}
                      placeholder="Enter your username"
                      required
                      className="bg-gradient-to-br from-[hsl(240,21%,18%)] to-[hsl(240,21%,16%)] border-[hsl(235,13%,30%)] h-10 text-sm hover:border-[#cba6f7] hover:bg-gradient-to-br hover:from-[hsl(240,21%,20%)] hover:to-[hsl(240,21%,18%)] transition-all duration-300"
                    />
                  </div>
                  <div>
                    <Label htmlFor="time" className="text-sm font-semibold mb-1.5">Completion Time *</Label>
                    <div className="relative">
                      <Timer className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[hsl(222,15%,60%)]" />
                      <Input
                        id="time"
                        name="time"
                        value={formData.time}
                        onChange={handleChange}
                        placeholder="HH:MM:SS"
                        required
                        className="bg-gradient-to-br from-[hsl(240,21%,18%)] to-[hsl(240,21%,16%)] border-[hsl(235,13%,30%)] h-10 text-sm pl-10 hover:border-[#cba6f7] hover:bg-gradient-to-br hover:from-[hsl(240,21%,20%)] hover:to-[hsl(240,21%,18%)] transition-all duration-300"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="date" className="text-sm font-semibold mb-1.5">Run Date *</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[hsl(222,15%,60%)]" />
                      <Input
                        id="date"
                        name="date"
                        type="date"
                        value={formData.date}
                        onChange={handleChange}
                        required
                        max={new Date().toISOString().split('T')[0]}
                        className="bg-gradient-to-br from-[hsl(240,21%,18%)] to-[hsl(240,21%,16%)] border-[hsl(235,13%,30%)] h-10 text-sm pl-10 hover:border-[#cba6f7] hover:bg-gradient-to-br hover:from-[hsl(240,21%,20%)] hover:to-[hsl(240,21%,18%)] transition-all duration-300"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="runType" className="text-sm font-semibold mb-1.5">Run Type *</Label>
                    <Select value={formData.runType} onValueChange={(value) => handleSelectChange("runType", value)}>
                      <SelectTrigger className="bg-[hsl(240,21%,18%)] border-[hsl(235,13%,30%)] h-10 text-sm hover:border-[hsl(var(--mocha-mauve))] transition-colors">
                        <SelectValue placeholder="Select run type" />
                      </SelectTrigger>
                      <SelectContent>
                        {runTypes.map((type) => (
                          <SelectItem key={type.id} value={type.id} className="text-sm">
                            <div className="flex items-center gap-2">
                              {type.id === 'solo' ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                              {type.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {formData.runType === 'co-op' && (
                  <div>
                    <Label htmlFor="player2Name" className="text-sm font-semibold mb-1.5">Player 2 Name *</Label>
                    <Input
                      id="player2Name"
                      name="player2Name"
                      value={formData.player2Name}
                      onChange={handleChange}
                      placeholder="Enter second player's username"
                      required
                      className="bg-gradient-to-br from-[hsl(240,21%,18%)] to-[hsl(240,21%,16%)] border-[hsl(235,13%,30%)] h-10 text-sm hover:border-[#cba6f7] hover:bg-gradient-to-br hover:from-[hsl(240,21%,20%)] hover:to-[hsl(240,21%,18%)] transition-all duration-300"
                    />
                  </div>
                )}

                {/* Category Selection - Tabs for all types */}
                {availableCategories.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block flex items-center gap-2">
                      {leaderboardType === 'individual-level' ? (
                        <>
                          <BookOpen className="h-3.5 w-3.5 text-[#cba6f7]" />
                          Category Type * (Story or Free Play)
                        </>
                      ) : leaderboardType === 'community-golds' ? (
                        <>
                          <Trophy className="h-3.5 w-3.5 text-[#FFD700]" />
                          Full Game Category *
                        </>
                      ) : (
                        <>
                          <Trophy className="h-3.5 w-3.5 text-[#cba6f7]" />
                          Category *
                        </>
                      )}
                    </Label>
                    <Tabs value={formData.category} onValueChange={(value) => handleSelectChange("category", value)}>
                      <TabsList className="flex w-full p-0.5 gap-1 overflow-x-auto overflow-y-hidden scrollbar-hide" style={{ minWidth: 'max-content' }}>
                        {availableCategories.map((category, index) => (
                          <TabsTrigger 
                            key={category.id} 
                            value={category.id} 
                            className="data-[state=active]:bg-[#94e2d5] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#94e2d5]/50 py-2 px-3 text-sm"
                            style={{ animationDelay: `${index * 50}ms` }}
                          >
                            {category.name}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    {leaderboardType === 'individual-level' && (
                      <p className="text-xs text-[hsl(222,15%,60%)] mt-1">
                        Choose "Story" for story mode levels or "Free Play" for free play levels
                      </p>
                    )}
                    {leaderboardType === 'community-golds' && (
                      <p className="text-xs text-[hsl(222,15%,60%)] mt-1">
                        Select the full game category this Community Gold applies to
                      </p>
                    )}
                  </div>
                )}

                {/* Subcategory Selection (only for regular leaderboard type) */}
                {leaderboardType === 'regular' && availableSubcategories.length > 0 && (
                  <div>
                    <Label className="text-sm font-semibold mb-2 block flex items-center gap-2">
                      <Trophy className="h-3.5 w-3.5 text-[#cba6f7]" />
                      Subcategory (Optional)
                    </Label>
                    <Tabs 
                      value={formData.subcategory || "none"} 
                      onValueChange={(value) => handleSelectChange("subcategory", value === "none" ? "" : value)}
                    >
                      <TabsList className="flex w-full p-0.5 gap-1 overflow-x-auto overflow-y-hidden scrollbar-hide" style={{ minWidth: 'max-content' }}>
                        <TabsTrigger 
                          value="none" 
                          className="data-[state=active]:bg-[#cba6f7] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#cba6f7]/50 py-1.5 sm:py-2 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
                        >
                          None
                        </TabsTrigger>
                        {availableSubcategories.map((subcategory, index) => (
                          <TabsTrigger 
                            key={subcategory.id} 
                            value={subcategory.id} 
                            className="data-[state=active]:bg-[#cba6f7] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#cba6f7]/50 py-1.5 sm:py-2 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap"
                            style={{ animationDelay: `${(index + 1) * 50}ms` }}
                          >
                            {subcategory.name}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    <p className="text-xs text-[hsl(222,15%,60%)] mt-1">
                      Optional: Select a subcategory for this run (e.g., Glitchless, No Major Glitches)
                    </p>
                  </div>
                )}

                {/* Level Selection for ILs and Community Golds */}
                {(leaderboardType === 'individual-level' || leaderboardType === 'community-golds') && (
                  <div>
                    <Label htmlFor="level" className="text-sm font-semibold mb-1.5 flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-[#cba6f7]" />
                      Level *
                    </Label>
                    <Select value={formData.level} onValueChange={(value) => handleSelectChange("level", value)}>
                      <SelectTrigger className="bg-gradient-to-br from-[hsl(240,21%,18%)] to-[hsl(240,21%,16%)] border-[hsl(235,13%,30%)] h-10 text-sm hover:border-[#cba6f7] hover:bg-gradient-to-br hover:from-[hsl(240,21%,20%)] hover:to-[hsl(240,21%,18%)] transition-all duration-300 hover:shadow-lg hover:shadow-[#cba6f7]/20">
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLevels.map((level) => (
                          <SelectItem key={level.id} value={level.id} className="text-sm">
                            {level.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-[hsl(222,15%,60%)] mt-1">
                      {leaderboardType === 'individual-level' 
                        ? "Select the level for this Individual Level run"
                        : "Select the level for this Community Gold run"}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="platform" className="text-sm font-semibold mb-1.5">Platform *</Label>
                    <Select value={formData.platform} onValueChange={(value) => handleSelectChange("platform", value)}>
                      <SelectTrigger className="bg-[hsl(240,21%,18%)] border-[hsl(235,13%,30%)] h-10 text-sm hover:border-[hsl(var(--mocha-mauve))] transition-colors">
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePlatforms.map((platform) => (
                          <SelectItem key={platform.id} value={platform.id} className="text-sm">
                            <div className="flex items-center gap-2">
                              <Gamepad2 className="h-4 w-4" />
                              {platform.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  {(() => {
                    const selectedCategory = availableCategories.find(c => c.id === formData.category);
                    const categoryName = selectedCategory?.name || "";
                    const normalizedCategory = categoryName.toLowerCase().trim();
                    const isNocutsNoships = normalizedCategory === "nocuts noships" || normalizedCategory === "nocutsnoships";
                    const isVideoRequired = !isNocutsNoships;
                    
                    return (
                      <>
                        <Label htmlFor="videoUrl" className="text-sm font-semibold mb-1.5">Video Proof {isVideoRequired ? "*" : ""}</Label>
                        <Input
                          id="videoUrl"
                          name="videoUrl"
                          value={formData.videoUrl}
                          onChange={handleChange}
                          placeholder="https://youtube.com/watch?v=..."
                          required={isVideoRequired}
                          className="bg-gradient-to-br from-[hsl(240,21%,18%)] to-[hsl(240,21%,16%)] border-[hsl(235,13%,30%)] h-10 text-sm hover:border-[#cba6f7] hover:bg-gradient-to-br hover:from-[hsl(240,21%,20%)] hover:to-[hsl(240,21%,18%)] transition-all duration-300"
                        />
                        <p className="text-xs text-[hsl(222,15%,70%)] mt-1 flex items-center gap-1">
                          {isNocutsNoships ? (
                            <>
                              <CheckCircle className="h-3 w-3 text-[hsl(var(--mocha-green))]" />
                              Video proof is optional for Nocuts Noships runs, but recommended.
                            </>
                          ) : (
                            "Upload your run to YouTube and provide the link for verification"
                          )}
                        </p>
                      </>
                    );
                  })()}
                </div>

                <div>
                  <Label htmlFor="comment" className="text-sm font-semibold mb-1.5">Run Comment</Label>
                  <Textarea
                    id="comment"
                    name="comment"
                    value={formData.comment}
                    onChange={handleChange}
                    placeholder="Add a comment about your run (optional)..."
                    className="bg-gradient-to-br from-[hsl(240,21%,18%)] to-[hsl(240,21%,16%)] border-[hsl(235,13%,30%)] hover:border-[#cba6f7] hover:bg-gradient-to-br hover:from-[hsl(240,21%,20%)] hover:to-[hsl(240,21%,18%)] transition-all duration-300 min-h-[80px] resize-none text-sm"
                    rows={3}
                  />
                  <p className="text-xs text-[hsl(222,15%,70%)] mt-1">
                    Share any details about your run, strategies, or highlights
                  </p>
                </div>

                <div className="pt-2">
                  <Button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-[#cba6f7] via-[#f5c2e7] to-[#cba6f7] hover:from-[#f5c2e7] hover:via-[#cba6f7] hover:to-[#f5c2e7] text-[hsl(240,21%,15%)] font-bold py-3 text-base transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-[#cba6f7]/50 disabled:opacity-50 disabled:cursor-not-allowed animate-gradient bg-[length:200%_auto]"
                  >
                    {loading ? "Submitting..." : "Submit Run for Review"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

            {/* Guidelines Section */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <Collapsible open={guidelinesOpen} onOpenChange={setGuidelinesOpen}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)] py-4 cursor-pointer hover:bg-[hsl(240,21%,20%)] transition-colors">
                    <CardTitle className="flex items-center justify-between text-xl">
                      <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
                          <FileText className="h-5 w-5 text-[hsl(240,21%,15%)]" />
                </div>
                <span className="bg-gradient-to-r from-[#cba6f7] to-[#f5c2e7] bg-clip-text text-transparent">
                  Submission Guidelines
                </span>
                      </div>
                      {guidelinesOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </CardTitle>
            </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
            <CardContent className="p-6">
                    <div className="space-y-6 text-base text-[hsl(222,15%,70%)]">
                <div>
                  <h3 className="text-lg font-semibold text-[hsl(220,17%,92%)] mb-3 flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-[hsl(240,21%,18%)] flex items-center justify-center text-sm font-bold border border-[hsl(235,13%,30%)] flex-shrink-0">1</span>
                    Game Rules
                  </h3>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                    <li>Time starts when you select "New Game".</li>
                          <li>Time ends when you lose control of your character.</li>
                    <li>Using codes in the diner is not allowed.</li>
                    <li>Runs must be single segment.</li>
                    <li>Runs done with a USB loader are prohibited.</li>
                    <li>Runs using Swiss to launch the game are allowed.</li>
                          <li>Runs using the debug menu are prohibited.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-[hsl(220,17%,92%)] mb-3 flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-[hsl(240,21%,18%)] flex items-center justify-center text-sm font-bold border border-[hsl(235,13%,30%)] flex-shrink-0">2</span>
                    Video Rules
                  </h3>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                    <li>Runs must have video proof with game audio.</li>
                          <li><strong className="text-[hsl(220,17%,92%)]">Nocuts Noships</strong> runs do not require video proof.</li>
                          <li>Twitch VODs will not be accepted as video proof.</li>
                          <li>All runs must be done RTA; timer may not be paused.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-[hsl(220,17%,92%)] mb-3 flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-[hsl(240,21%,18%)] flex items-center justify-center text-sm font-bold border border-[hsl(235,13%,30%)] flex-shrink-0">3</span>
                    Emulator Rules
                  </h3>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                          <li>Dolphin emulator must use version 5.0 or later.</li>
                    <li>"Speed Up Disc Transfer Rate" must be turned off.</li>
                    <li>"CPU Clock Override" must be set to 100%.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-[hsl(220,17%,92%)] mb-3 flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-[hsl(240,21%,18%)] flex items-center justify-center text-sm font-bold border border-[hsl(235,13%,30%)] flex-shrink-0">4</span>
                    PC Rules
                  </h3>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                    <li>FPS must be capped at 60.</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-[hsl(220,17%,92%)] mb-3 flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-[hsl(240,21%,18%)] flex items-center justify-center text-sm font-bold border border-[hsl(235,13%,30%)] flex-shrink-0">5</span>
                    Solo Rules
                  </h3>
                        <ul className="list-disc pl-6 space-y-2 text-sm">
                    <li>One player, the number of controllers used does not matter.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
                </CollapsibleContent>
              </Collapsible>
          </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubmitRun;