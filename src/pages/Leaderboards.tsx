import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Filter, User, Users, Trophy, Sparkles, TrendingUp, Star, Gem, Gamepad2, Link2 } from "lucide-react";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { Pagination } from "@/components/Pagination";
import { getLeaderboardEntries, getCategories, getPlatforms, runTypes, getLevels, getCategoriesFromFirestore } from "@/lib/db";
import { LeaderboardEntry } from "@/types/database";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Skeleton } from "@/components/ui/skeleton";
import LegoGoldBrickIcon from "@/components/icons/LegoGoldBrickIcon";

const Leaderboards = () => {
  const [leaderboardType, setLeaderboardType] = useState<'regular' | 'individual-level' | 'community-golds'>('regular');
  const [availableCategories, setAvailableCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoriesWithSRC, setCategoriesWithSRC] = useState<{ id: string; srcCategoryId?: string | null }[]>([]);
  const [availableLevels, setAvailableLevels] = useState<{ id: string; name: string }[]>([]);
  const [availablePlatforms, setAvailablePlatforms] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [selectedRunType, setSelectedRunType] = useState(runTypes[0]?.id || "");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("all");
  const [showObsoleteRuns, setShowObsoleteRuns] = useState("false");
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [availableSubcategories, setAvailableSubcategories] = useState<Array<{ id: string; name: string }>>([]);
  const itemsPerPage = 25;
  const requestCounterRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRefreshTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const fetchData = async () => {
      setCategoriesLoading(true);
      setLevelsLoading(true);
      try {
        // For Individual Level: fetch Story/Free Play categories
        // For Community Golds: fetch community-golds categories (now configurable)
        // For Regular: fetch regular categories
        const categoryType = leaderboardType;
        
        const [fetchedCategories, fetchedLevels, fetchedPlatforms, fullCategories] = await Promise.all([
          getCategories(categoryType),
          getLevels(),
          getPlatforms(),
          getCategoriesFromFirestore(categoryType) // Get full category objects with srcCategoryId
        ]);
        
        setAvailableCategories(fetchedCategories);
        setCategoriesWithSRC(fullCategories.map(c => ({ id: c.id, srcCategoryId: c.srcCategoryId })));
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

  // Fetch subcategories when category changes (only for regular leaderboard type)
  useEffect(() => {
    const fetchSubcategories = async () => {
      if (leaderboardType === 'regular' && selectedCategory) {
        try {
          const categories = await getCategories('regular');
          const category = categories.find(c => c.id === selectedCategory);
          if (category && category.subcategories && category.subcategories.length > 0) {
            // Sort subcategories by order
            const sorted = [...category.subcategories].sort((a, b) => {
              const orderA = a.order ?? Infinity;
              const orderB = b.order ?? Infinity;
              return orderA - orderB;
            });
            setAvailableSubcategories(sorted);
            // Reset to "all" when category changes
            setSelectedSubcategory("all");
          } else {
            setAvailableSubcategories([]);
            setSelectedSubcategory("all");
          }
        } catch (error) {
          setAvailableSubcategories([]);
          setSelectedSubcategory("all");
        }
      } else {
        setAvailableSubcategories([]);
        setSelectedSubcategory("all");
      }
    };
    
    fetchSubcategories();
  }, [selectedCategory, leaderboardType]);

  useEffect(() => {
    // Cancel previous request if it exists
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Increment request counter to track the latest request
    const currentRequest = ++requestCounterRef.current;
    
    const fetchLeaderboardData = async () => {
      setLoading(true);
      try {
        const data = await getLeaderboardEntries(
          selectedCategory,
          selectedPlatform,
          selectedRunType as 'solo' | 'co-op',
          showObsoleteRuns === "true",
          leaderboardType,
          (leaderboardType === 'individual-level' || leaderboardType === 'community-golds') ? selectedLevel : undefined,
          (leaderboardType === 'regular' && selectedSubcategory && selectedSubcategory !== 'all') ? selectedSubcategory : undefined
        );
        
        // Only update state if this is still the latest request
        if (currentRequest === requestCounterRef.current && !abortController.signal.aborted) {
        setLeaderboardData(data);
        setCurrentPage(1); // Reset to first page when data changes
        }
      } catch (error) {
        // Only handle error if this is still the latest request and not aborted
        if (currentRequest === requestCounterRef.current && !abortController.signal.aborted) {
        // Silent fail
        }
      } finally {
        // Only update loading state if this is still the latest request
        if (currentRequest === requestCounterRef.current) {
        setLoading(false);
        }
      }
    };

    const hasRequiredFilters = selectedCategory && selectedPlatform && selectedRunType;
    const hasLevelFilter = leaderboardType === 'regular' || selectedLevel;
    
    if (hasRequiredFilters && hasLevelFilter) {
      fetchLeaderboardData();
    } else {
      setLoading(false);
      setLeaderboardData([]);
    }

    // Cleanup: abort request on unmount or dependency change
    return () => {
      abortController.abort();
    };
  }, [selectedCategory, selectedPlatform, selectedRunType, selectedLevel, showObsoleteRuns, leaderboardType, selectedSubcategory]);
  
  // Only refresh when page becomes visible AND enough time has passed
  useEffect(() => {
    const MIN_REFRESH_INTERVAL = 60000; // Minimum 1 minute between refreshes
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLastRefresh = Date.now() - lastRefreshTimeRef.current;
        if (timeSinceLastRefresh < MIN_REFRESH_INTERVAL) {
          return; // Skip if refreshed recently
        }
        
        // Refresh data when user returns to the page
        if (selectedCategory && selectedPlatform && selectedRunType) {
          const hasLevelFilter = leaderboardType === 'regular' || selectedLevel;
          if (hasLevelFilter) {
            // Trigger a refresh by incrementing request counter
            requestCounterRef.current++;
            const fetchLeaderboardData = async () => {
              setLoading(true);
              try {
                const data = await getLeaderboardEntries(
                  selectedCategory,
                  selectedPlatform,
                  selectedRunType as 'solo' | 'co-op',
                  showObsoleteRuns === "true",
                  leaderboardType,
                  (leaderboardType === 'individual-level' || leaderboardType === 'community-golds') ? selectedLevel : undefined,
                  (leaderboardType === 'regular' && selectedSubcategory && selectedSubcategory !== 'all') ? selectedSubcategory : undefined
                );
                setLeaderboardData(data);
                setCurrentPage(1);
                lastRefreshTimeRef.current = Date.now();
              } catch (error) {
                // Silent fail
              } finally {
                setLoading(false);
              }
            };
            fetchLeaderboardData();
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [selectedCategory, selectedPlatform, selectedRunType, selectedLevel, showObsoleteRuns, leaderboardType, selectedSubcategory]);

  return (
    <div className="min-h-screen bg-[#1e1e2e] text-ctp-text py-4 sm:py-6 overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 w-full">
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Trophy className="h-6 w-6 text-[#a6e3a1]" />
            <h1 className="text-3xl md:text-4xl font-bold text-[#a6e3a1]">
              Leaderboards
            </h1>
          </div>
          <p className="text-base text-ctp-subtext1 max-w-3xl mx-auto animate-fade-in-delay leading-relaxed">
            Browse the fastest times across all categories and platforms
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={leaderboardType} onValueChange={(value) => setLeaderboardType(value as 'regular' | 'individual-level' | 'community-golds')} className="mb-6">
          <TabsList className="grid w-full grid-cols-3 mb-4 sm:mb-6 p-0.5 gap-1 rounded-none">
            <TabsTrigger 
              value="regular" 
              className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap rounded-none"
            >
              <Trophy className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
              <span className="hidden min-[375px]:inline">Full Game</span>
              <span className="min-[375px]:hidden">Game</span>
            </TabsTrigger>
            <TabsTrigger 
              value="individual-level" 
              className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap rounded-none"
            >
              <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
              <span className="hidden sm:inline">Individual Levels</span>
              <span className="sm:hidden">ILs</span>
            </TabsTrigger>
            <TabsTrigger 
              value="community-golds" 
              className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap rounded-none"
            >
              <Gem className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
              <span className="hidden sm:inline">Community Golds</span>
              <span className="sm:hidden">CGs</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={leaderboardType} className="mt-0 animate-fade-in">
            {/* Category Tabs */}
            {(() => {
              // Filter out categories that are disabled for the selected level
              const filteredCategories = availableCategories.filter(category => {
                // Only filter if we have a level selected and it's IL or Community Golds
                if ((leaderboardType === 'individual-level' || leaderboardType === 'community-golds') && selectedLevel) {
                  const levelData = availableLevels.find(l => l.id === selectedLevel);
                  if (levelData && levelData.disabledCategories?.[category.id] === true) {
                    return false; // Category is disabled for this level
                  }
                }
                return true;
              });
              
              // If the currently selected category is disabled, reset to first available
              if (filteredCategories.length > 0 && !filteredCategories.find(c => c.id === selectedCategory)) {
                setTimeout(() => setSelectedCategory(filteredCategories[0].id), 0);
              }
              
              return filteredCategories.length > 0 ? (
                <>
                  <div className="mb-6 animate-slide-up">
                    <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
                      <TabsList className="flex w-full p-0.5 gap-1 overflow-x-auto overflow-y-hidden scrollbar-hide rounded-none" style={{ minWidth: 'max-content' }}>
                        {filteredCategories.map((category, index) => {
                          const categoryWithSRC = categoriesWithSRC.find(c => c.id === category.id);
                          const isLinkedToSRC = categoryWithSRC?.srcCategoryId && categoryWithSRC.srcCategoryId.trim() !== '';
                          
                          return (
                          <TabsTrigger 
                            key={category.id} 
                            value={category.id} 
                            className="data-[state=active]:bg-[#94e2d5] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#94e2d5]/50 py-1.5 sm:py-2 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap rounded-none flex items-center gap-1.5"
                            style={{ animationDelay: `${index * 50}ms` }}
                            title={isLinkedToSRC ? "Linked to Speedrun.com" : undefined}
                          >
                            {category.name}
                            {isLinkedToSRC && (
                              <Link2 className="h-3 w-3 text-[#cba6f7] flex-shrink-0" title="Linked to Speedrun.com" />
                            )}
                          </TabsTrigger>
                          );
                        })}
                      </TabsList>
                    </Tabs>
                  </div>
                  
                  {/* Subcategory Tabs (only for regular leaderboard type) */}
                  {leaderboardType === 'regular' && availableSubcategories.length > 0 && (
                    <div className="mb-6 animate-slide-up">
                      <Tabs value={selectedSubcategory} onValueChange={setSelectedSubcategory}>
                        <TabsList className="flex w-full p-0.5 gap-1 overflow-x-auto overflow-y-hidden scrollbar-hide rounded-none" style={{ minWidth: 'max-content' }}>
                          <TabsTrigger 
                            value="all" 
                            className="data-[state=active]:bg-[#cba6f7] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#cba6f7]/50 py-1.5 sm:py-2 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap rounded-none"
                          >
                            All
                          </TabsTrigger>
                          {availableSubcategories.map((subcategory, index) => (
                            <TabsTrigger 
                              key={subcategory.id} 
                              value={subcategory.id} 
                              className="data-[state=active]:bg-[#cba6f7] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#cba6f7]/50 py-1.5 sm:py-2 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap rounded-none"
                              style={{ animationDelay: `${(index + 1) * 50}ms` }}
                            >
                              {subcategory.name}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                    </div>
                  )}
                </>
              ) : (
                availableCategories.length > 0 && (
                  <div className="mb-6 p-4 bg-ctp-surface0 rounded-none border border-ctp-surface1">
                    <p className="text-sm text-ctp-subtext1">
                      No categories available for the selected level. Please enable categories for this level in the admin panel.
                    </p>
                  </div>
                )
              );
            })()}

        {/* Filters */}
            <Card className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 shadow-xl mb-6 transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-ctp-mauve/20 hover:border-ctp-mauve/50 animate-slide-up-delay rounded-none">
          <CardHeader className="bg-gradient-to-r from-ctp-base to-ctp-mantle border-b border-ctp-surface1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <div className="relative">
                <div className="absolute inset-0 rounded-none bg-gradient-to-br from-ctp-mauve to-ctp-lavender opacity-30 blur-sm animate-pulse"></div>
                <div className="relative p-1.5 rounded-none bg-gradient-to-br from-ctp-mauve to-ctp-lavender transition-transform duration-300 hover:scale-110">
                  <Filter className="h-5 w-5 text-ctp-crust" />
                </div>
              </div>
              <span className="bg-gradient-to-r from-ctp-mauve to-ctp-pink bg-clip-text text-transparent">
                Filter Results
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {(leaderboardType === 'individual-level' || leaderboardType === 'community-golds') && (
                <div className="animate-fade-in" style={{ animationDelay: '100ms' }}>
                  <label className="block text-sm font-semibold mb-2 text-ctp-text flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-ctp-mauve" />
                    Levels
                  </label>
                  <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                    <SelectTrigger className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 h-10 text-sm hover:border-ctp-mauve hover:bg-gradient-to-br hover:from-ctp-surface0 hover:to-ctp-base transition-all duration-300 hover:shadow-lg hover:shadow-ctp-mauve/20 rounded-none">
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
                  <SelectTrigger className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 h-10 text-sm hover:border-ctp-mauve hover:bg-gradient-to-br hover:from-ctp-surface0 hover:to-ctp-base transition-all duration-300 hover:shadow-lg hover:shadow-ctp-mauve/20 rounded-none">
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
                  <SelectTrigger className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 h-10 text-sm hover:border-ctp-mauve hover:bg-gradient-to-br hover:from-ctp-surface0 hover:to-ctp-base transition-all duration-300 hover:shadow-lg hover:shadow-ctp-mauve/20 rounded-none">
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
                  <SelectTrigger className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 h-10 text-sm hover:border-ctp-mauve hover:bg-gradient-to-br hover:from-ctp-surface0 hover:to-ctp-base transition-all duration-300 hover:shadow-lg hover:shadow-ctp-mauve/20 rounded-none">
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
            <CardTitle className="flex items-center gap-2 text-xl text-[#a6e3a1]">
              <span>
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
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner size="lg" />
                </div>
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
                <LeaderboardTable 
                  data={leaderboardData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)} 
                  platforms={availablePlatforms} 
                  categories={availableCategories}
                  levels={availableLevels}
                  leaderboardType={leaderboardType}
                />
                {leaderboardData.length > itemsPerPage && (
                  <Pagination
                    currentPage={currentPage}
                    totalPages={Math.ceil(leaderboardData.length / itemsPerPage)}
                    onPageChange={setCurrentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={leaderboardData.length}
                  />
                )}
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