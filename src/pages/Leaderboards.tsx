import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, User, Users, Trophy, Sparkles, TrendingUp } from "lucide-react";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { getLeaderboardEntries, getCategories, getPlatforms, runTypes } from "@/lib/db";
import { LeaderboardEntry } from "@/types/database";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import LegoGoldBrickIcon from "@/components/icons/LegoGoldBrickIcon";

const Leaderboards = () => {
  const [availableCategories, setAvailableCategories] = useState<{ id: string; name: string }[]>([]);
  const [availablePlatforms, setAvailablePlatforms] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [selectedRunType, setSelectedRunType] = useState(runTypes[0]?.id || "");
  const [showObsoleteRuns, setShowObsoleteRuns] = useState("false");
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setCategoriesLoading(true);
      try {
        const [fetchedCategories, fetchedPlatforms] = await Promise.all([
          getCategories(),
          getPlatforms()
        ]);
        setAvailableCategories(fetchedCategories);
        setAvailablePlatforms(fetchedPlatforms);
        if (fetchedCategories.length > 0 && !selectedCategory) {
          setSelectedCategory(fetchedCategories[0].id);
        }
        if (fetchedPlatforms.length > 0 && !selectedPlatform) {
          setSelectedPlatform(fetchedPlatforms[0].id);
        }
      } catch (error) {
        // Silent fail
      } finally {
        setCategoriesLoading(false);
      }
    };
    
    fetchData();
  }, []);

  useEffect(() => {
    const fetchLeaderboardData = async () => {
      setLoading(true);
      try {
        const data = await getLeaderboardEntries(
          selectedCategory,
          selectedPlatform,
          selectedRunType,
          showObsoleteRuns === "true"
        );
        setLeaderboardData(data);
      } catch (error) {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };

    if (selectedCategory && selectedPlatform && selectedRunType) {
      fetchLeaderboardData();
    }
  }, [selectedCategory, selectedPlatform, selectedRunType, showObsoleteRuns]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] py-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12 animate-fade-in">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-br from-[#FFD700] to-[#FFA500] shadow-lg">
              <Trophy className="h-10 w-10 text-[hsl(240,21%,15%)]" />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-[#FFD700] via-[#FFA500] to-[#FFD700] bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
              Leaderboards
            </h1>
          </div>
          <p className="text-xl text-[hsl(222,15%,70%)] max-w-3xl mx-auto">
            Browse the fastest times across all categories and platforms
          </p>
        </div>

        {/* Filters */}
        <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl mb-10">
          <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
            <CardTitle className="flex items-center gap-3 text-2xl">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
                <Filter className="h-6 w-6 text-[hsl(240,21%,15%)]" />
              </div>
              <span className="bg-gradient-to-r from-[#cba6f7] to-[#f5c2e7] bg-clip-text text-transparent">
                Filter Results
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div>
                <label className="block text-base font-semibold mb-3 text-[hsl(220,17%,92%)]">Category</label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="bg-[hsl(240,21%,18%)] border-[hsl(235,13%,30%)] h-12 text-base hover:border-[hsl(var(--mocha-mauve))] transition-colors">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id} className="text-base">
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-base font-semibold mb-3 text-[hsl(220,17%,92%)]">Platform</label>
                <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                  <SelectTrigger className="bg-[hsl(240,21%,18%)] border-[hsl(235,13%,30%)] h-12 text-base hover:border-[hsl(var(--mocha-mauve))] transition-colors">
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePlatforms.map((platform) => (
                      <SelectItem key={platform.id} value={platform.id} className="text-base">
                        {platform.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-base font-semibold mb-3 text-[hsl(220,17%,92%)]">Run Type</label>
                <Select value={selectedRunType} onValueChange={setSelectedRunType}>
                  <SelectTrigger className="bg-[hsl(240,21%,18%)] border-[hsl(235,13%,30%)] h-12 text-base hover:border-[hsl(var(--mocha-mauve))] transition-colors">
                    <SelectValue placeholder="Select run type" />
                  </SelectTrigger>
                  <SelectContent>
                    {runTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id} className="text-base">
                        <div className="flex items-center gap-2">
                          {type.id === 'solo' ? <User className="h-5 w-5" /> : <Users className="h-5 w-5" />}
                          {type.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-base font-semibold mb-3 text-[hsl(220,17%,92%)]">Run Status</label>
                <Select value={showObsoleteRuns} onValueChange={setShowObsoleteRuns}>
                  <SelectTrigger className="bg-[hsl(240,21%,18%)] border-[hsl(235,13%,30%)] h-12 text-base hover:border-[hsl(var(--mocha-mauve))] transition-colors">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false" className="text-base">Current Runs</SelectItem>
                    <SelectItem value="true" className="text-base">All Runs (including obsolete)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard Table */}
        <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
          <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
            <CardTitle className="flex items-center gap-3 text-2xl">
              <div className="p-2 rounded-lg bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
                <TrendingUp className="h-6 w-6 text-[hsl(240,21%,15%)]" />
              </div>
              <span className="bg-gradient-to-r from-[#cba6f7] to-[#f5c2e7] bg-clip-text text-transparent">
                {availableCategories.find(c => c.id === selectedCategory)?.name || "Leaderboards"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            {loading ? (
              <LoadingSpinner size="sm" className="py-12" />
            ) : (
              <LeaderboardTable data={leaderboardData} platforms={availablePlatforms} categories={availableCategories} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Leaderboards;