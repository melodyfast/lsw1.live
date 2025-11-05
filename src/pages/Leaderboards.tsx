import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Filter, User, Users, Trophy, Sparkles, TrendingUp, Star, Gem, Gamepad2 } from "lucide-react";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { getLeaderboardEntries, getCategories, getPlatforms, runTypes, getLevels } from "@/lib/db";
import { LeaderboardEntry } from "@/types/database";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Skeleton } from "@/components/ui/skeleton";
import LegoGoldBrickIcon from "@/components/icons/LegoGoldBrickIcon";

const Leaderboards = () => {
  const [leaderboardType, setLeaderboardType] = useState<'regular' | 'individual-level' | 'community-golds'>('regular');
  const [availableCategories, setAvailableCategories] = useState<{ id: string; name: string }[]>([]);
  const [availableLevels, setAvailableLevels] = useState<{ id: string; name: string }[]>([]);
  const [availablePlatforms, setAvailablePlatforms] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [selectedRunType, setSelectedRunType] = useState(runTypes[0]?.id || "");
  const [showObsoleteRuns, setShowObsoleteRuns] = useState("false");
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [levelsLoading, setLevelsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setCategoriesLoading(true);
      setLevelsLoading(true);
      try {
        // For Individual Level: fetch Story/Free Play categories
        // For Community Golds: fetch full game categories
        // For Regular: fetch regular categories
        const categoryType = leaderboardType === 'community-golds' ? 'regular' : leaderboardType;
        
        const [fetchedCategories, fetchedLevels, fetchedPlatforms] = await Promise.all([
          getCategories(categoryType),
          getLevels(),
          getPlatforms()
        ]);
        
        setAvailableCategories(fetchedCategories);
        setAvailableLevels(fetchedLevels);
        setAvailablePlatforms(fetchedPlatforms);
        
        if (fetchedCategories.length > 0) {
          setSelectedCategory(fetchedCategories[0].id);
        } else {
          setSelectedCategory("");
        }
        
        if (fetchedLevels.length > 0) {
          setSelectedLevel(fetchedLevels[0].id);
        } else {
          setSelectedLevel("");
        }
        
        if (fetchedPlatforms.length > 0 && !selectedPlatform) {
          setSelectedPlatform(fetchedPlatforms[0].id);
        }
      } catch (error) {
        // Silent fail
      } finally {
        setCategoriesLoading(false);
        setLevelsLoading(false);
      }
    };
    
    fetchData();
  }, [leaderboardType]);

  useEffect(() => {
    const fetchLeaderboardData = async () => {
      setLoading(true);
      try {
        const data = await getLeaderboardEntries(
          selectedCategory,
          selectedPlatform,
          selectedRunType as 'solo' | 'co-op',
          showObsoleteRuns === "true",
          leaderboardType,
          (leaderboardType === 'individual-level' || leaderboardType === 'community-golds') ? selectedLevel : undefined
        );
        setLeaderboardData(data);
      } catch (error) {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };

    const hasRequiredFilters = selectedCategory && selectedPlatform && selectedRunType;
    const hasLevelFilter = leaderboardType === 'regular' || selectedLevel;
    
    if (hasRequiredFilters && hasLevelFilter) {
      fetchLeaderboardData();
    }
  }, [selectedCategory, selectedPlatform, selectedRunType, selectedLevel, showObsoleteRuns, leaderboardType]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] py-6">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-8 animate-fade-in">
          <h1 className="text-3xl md:text-4xl font-bold text-ctp-yellow mb-4">
            Leaderboards
          </h1>
          <p className="text-base text-ctp-subtext1 max-w-3xl mx-auto animate-fade-in-delay">
            Browse the fastest times across all categories and platforms
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={leaderboardType} onValueChange={(value) => setLeaderboardType(value as 'regular' | 'individual-level' | 'community-golds')} className="mb-6">
          <TabsList className="grid w-full grid-cols-3 mb-6 rounded-lg p-0.5 gap-1">
            <TabsTrigger 
              value="regular" 
              className="data-[state=active]:bg-ctp-yellow data-[state=active]:text-ctp-crust bg-ctp-surface0 text-ctp-text transition-all duration-300 rounded-md font-medium hover:bg-ctp-surface1 text-sm py-2 px-3"
            >
              <Trophy className="h-3.5 w-3.5 mr-1.5" />
              Full Game
            </TabsTrigger>
            <TabsTrigger 
              value="individual-level" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-ctp-mauve data-[state=active]:to-ctp-lavender data-[state=active]:text-ctp-crust bg-ctp-surface0 text-ctp-text transition-all duration-300 rounded-md font-medium hover:bg-ctp-surface1 text-sm py-2 px-3"
            >
              <Star className="h-3.5 w-3.5 mr-1.5" />
              Individual Levels
            </TabsTrigger>
            <TabsTrigger 
              value="community-golds" 
              className="data-[state=active]:bg-ctp-yellow data-[state=active]:text-ctp-crust bg-ctp-surface0 text-ctp-text transition-all duration-300 rounded-md font-medium hover:bg-ctp-surface1 text-sm py-2 px-3"
            >
              <Gem className="h-3.5 w-3.5 mr-1.5" />
              Community Golds
            </TabsTrigger>
          </TabsList>

          <TabsContent value={leaderboardType} className="mt-0 animate-fade-in">
            {/* Category Tabs */}
            {availableCategories.length > 0 && (
              <div className="mb-6 animate-slide-up">
                <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
                  <TabsList className="grid w-full rounded-lg p-0.5 gap-1" style={{ gridTemplateColumns: `repeat(${availableCategories.length}, 1fr)` }}>
                    {availableCategories.map((category, index) => (
                      <TabsTrigger 
                        key={category.id} 
                        value={category.id} 
                        className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-ctp-mauve data-[state=active]:to-ctp-lavender data-[state=active]:text-ctp-crust bg-ctp-surface0 text-ctp-text transition-all duration-300 rounded-md font-medium hover:bg-ctp-surface1 py-2 px-3 text-sm"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        {category.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>
            )}

            {/* Filters */}
            <Card className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 shadow-xl mb-6 transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-ctp-mauve/20 hover:border-ctp-mauve/50 animate-slide-up-delay">
          <CardHeader className="bg-gradient-to-r from-ctp-base to-ctp-mantle border-b border-ctp-surface1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <div className="relative">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-ctp-mauve to-ctp-lavender opacity-30 blur-sm animate-pulse"></div>
                <div className="relative p-1.5 rounded-lg bg-gradient-to-br from-ctp-mauve to-ctp-lavender transition-transform duration-300 hover:scale-110">
                  <Filter className="h-5 w-5 text-ctp-crust" />
                </div>
              </div>
              <span className="bg-gradient-to-r from-ctp-mauve to-ctp-pink bg-clip-text text-transparent">
                Filter Results
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {(leaderboardType === 'individual-level' || leaderboardType === 'community-golds') && (
                <div className="animate-fade-in" style={{ animationDelay: '100ms' }}>
                  <label className="block text-sm font-semibold mb-2 text-ctp-text flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-ctp-mauve" />
                    Levels
                  </label>
                  <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                    <SelectTrigger className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 h-10 text-sm hover:border-ctp-mauve hover:bg-gradient-to-br hover:from-ctp-surface0 hover:to-ctp-base transition-all duration-300 hover:shadow-lg hover:shadow-ctp-mauve/20">
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
                </div>
              )}
              <div className="animate-fade-in" style={{ animationDelay: '200ms' }}>
                <label className="block text-sm font-semibold mb-2 text-ctp-text flex items-center gap-2">
                  <Gamepad2 className="h-3.5 w-3.5 text-ctp-mauve" />
                  Platform
                </label>
                <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                  <SelectTrigger className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 h-10 text-sm hover:border-ctp-mauve hover:bg-gradient-to-br hover:from-ctp-surface0 hover:to-ctp-base transition-all duration-300 hover:shadow-lg hover:shadow-ctp-mauve/20">
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlatforms.map((platform) => (
                      <SelectItem key={platform.id} value={platform.id} className="text-sm">
                        {platform.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="animate-fade-in" style={{ animationDelay: '300ms' }}>
                <label className="block text-sm font-semibold mb-2 text-ctp-text flex items-center gap-2">
                  {selectedRunType === 'solo' ? (
                    <User className="h-3.5 w-3.5 text-ctp-mauve" />
                  ) : (
                    <Users className="h-3.5 w-3.5 text-ctp-mauve" />
                  )}
                  Run Type
                </label>
                <Select value={selectedRunType} onValueChange={setSelectedRunType}>
                  <SelectTrigger className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 h-10 text-sm hover:border-ctp-mauve hover:bg-gradient-to-br hover:from-ctp-surface0 hover:to-ctp-base transition-all duration-300 hover:shadow-lg hover:shadow-ctp-mauve/20">
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
              <div className="animate-fade-in" style={{ animationDelay: '400ms' }}>
                <label className="block text-sm font-semibold mb-2 text-ctp-text flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-ctp-mauve" />
                  Run Status
                </label>
                <Select value={showObsoleteRuns} onValueChange={setShowObsoleteRuns}>
                  <SelectTrigger className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 h-10 text-sm hover:border-ctp-mauve hover:bg-gradient-to-br hover:from-ctp-surface0 hover:to-ctp-base transition-all duration-300 hover:shadow-lg hover:shadow-ctp-mauve/20">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false" className="text-sm">Current Runs</SelectItem>
                    <SelectItem value="true" className="text-sm">All Runs (including obsolete)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard Table */}
        <Card className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-ctp-mauve/20 hover:border-ctp-mauve/50 animate-slide-up-delay-2">
          <CardHeader className="bg-gradient-to-r from-ctp-base to-ctp-mantle border-b border-ctp-surface1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <div className="relative">
                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-ctp-mauve to-ctp-lavender opacity-30 blur-sm animate-pulse"></div>
                <div className="relative p-1.5 rounded-lg bg-gradient-to-br from-ctp-mauve to-ctp-lavender transition-transform duration-300 hover:scale-110">
                  <TrendingUp className="h-5 w-5 text-ctp-crust" />
                </div>
              </div>
              <span className="bg-gradient-to-r from-ctp-mauve to-ctp-pink bg-clip-text text-transparent">
                {availableCategories.find(c => c.id === selectedCategory)?.name || "Leaderboards"}
              </span>
              {leaderboardData.length > 0 && (
                <span className="ml-auto text-sm font-normal text-ctp-subtext1">
                  {leaderboardData.length} {leaderboardData.length === 1 ? 'entry' : 'entries'}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {loading || categoriesLoading ? (
              <div className="space-y-3 py-6 animate-fade-in">
                <Skeleton className="h-10 w-full animate-pulse" />
                <Skeleton className="h-10 w-full animate-pulse" style={{ animationDelay: '100ms' }} />
                <Skeleton className="h-10 w-full animate-pulse" style={{ animationDelay: '200ms' }} />
                <Skeleton className="h-10 w-[90%] animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            ) : leaderboardData.length === 0 ? (
              <div className="text-center py-12 animate-fade-in">
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 rounded-full bg-gradient-to-br from-ctp-base to-ctp-mantle border border-ctp-surface1">
                    <Trophy className="h-8 w-8 text-ctp-subtext1 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2 text-ctp-text">No entries found</h3>
                    <p className="text-sm text-ctp-subtext1">
                      Try adjusting your filters to see more results
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="animate-fade-in">
                <LeaderboardTable data={leaderboardData} platforms={availablePlatforms} categories={availableCategories} />
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Leaderboards;