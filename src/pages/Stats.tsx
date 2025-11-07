"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Trophy, 
  Clock, 
  Users, 
  Gamepad2, 
  BarChart3,
  Award,
  Star,
  Gem,
  Filter,
  TrendingUp
} from "lucide-react";
import { getAllVerifiedRuns, getCategories, getPlatforms, getLevels, runTypes } from "@/lib/db";
import { LeaderboardEntry } from "@/types/database";
import { formatTime, parseTimeToSeconds, formatSecondsToTime } from "@/lib/utils";
import { getCategoryName, getPlatformName, getLevelName } from "@/lib/dataValidation";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Line, LineChart, XAxis, YAxis, CartesianGrid, Brush } from "recharts";
import { Link } from "react-router-dom";

// Category name overrides for stats page
const CATEGORY_NAME_OVERRIDES: Record<string, string> = {
  'GdR0b0zs2ZFVVvjsglIL': 'Story IL',
  'zRhqEIO8iXYUiHoW5qIp': 'Free Play IL',
};

// Helper function to get category name with overrides
const getCategoryNameWithOverride = (
  categoryId: string | undefined | null,
  categories: Array<{ id: string; name: string }>,
  srcCategoryName?: string | null
): string => {
  if (categoryId && CATEGORY_NAME_OVERRIDES[categoryId]) {
    return CATEGORY_NAME_OVERRIDES[categoryId];
  }
  return getCategoryName(categoryId, categories, srcCategoryName);
};

interface StatsData {
  totalRuns: number;
  verifiedRuns: number;
  worldRecords: number;
  runsByCategory: Map<string, number>;
  runsByPlatform: Map<string, number>;
  runsByRunType: { solo: number; coOp: number };
  runsByLeaderboardType: { regular: number; individualLevel: number; communityGolds: number };
  worldRecordProgression: Array<{ date: string; count: number; runs?: LeaderboardEntry[] }>;
  recentWorldRecords: LeaderboardEntry[];
  wrStartDate?: string;
  wrEndDate?: string;
  longestWRHolder?: { playerName: string; days: number };
  allWorldRecords: LeaderboardEntry[];
  allVerifiedRuns: LeaderboardEntry[];
}

const Stats = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [platforms, setPlatforms] = useState<Array<{ id: string; name: string }>>([]);
  const [levels, setLevels] = useState<Array<{ id: string; name: string }>>([]);
  const [wrProgressionLeaderboardType, setWrProgressionLeaderboardType] = useState<'regular' | 'individual-level' | 'community-golds'>('regular');
  const [wrProgressionCategory, setWrProgressionCategory] = useState("");
  const [wrProgressionPlatform, setWrProgressionPlatform] = useState("");
  const [wrProgressionRunType, setWrProgressionRunType] = useState("");
  const [wrProgressionLevel, setWrProgressionLevel] = useState("");
  const [availableWrCategories, setAvailableWrCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [allRuns, fetchedCategories, fetchedPlatforms, fetchedLevels] = await Promise.all([
          getAllVerifiedRuns(),
          getCategories(),
          getPlatforms(),
          import("@/lib/db").then(m => m.getLevels())
        ]);

        setCategories(fetchedCategories);
        setPlatforms(fetchedPlatforms);
        setLevels(fetchedLevels);

        // Calculate statistics
        const verifiedRuns = allRuns.filter(run => run.verified && !run.isObsolete);
        
        // Calculate world records by finding the fastest run in each group
        // Group key: leaderboardType_category_platform_runType_level
        const worldRecordMap = new Map<string, LeaderboardEntry>();
        
        verifiedRuns.forEach(run => {
          const leaderboardType = run.leaderboardType || 'regular';
          const category = run.category || '';
          const platform = run.platform || '';
          const runType = run.runType || 'solo';
          const level = run.level || '';
          const groupKey = `${leaderboardType}_${category}_${platform}_${runType}_${level}`;
          
          const existing = worldRecordMap.get(groupKey);
          if (!existing) {
            worldRecordMap.set(groupKey, run);
          } else {
            // Compare times - keep the faster one
            const existingTime = parseTimeToSeconds(existing.time) || Infinity;
            const currentTime = parseTimeToSeconds(run.time) || Infinity;
            if (currentTime < existingTime) {
              worldRecordMap.set(groupKey, run);
            }
          }
        });
        
        const worldRecords = Array.from(worldRecordMap.values());

        // Group runs by category
        const runsByCategory = new Map<string, number>();
        verifiedRuns.forEach(run => {
          const categoryId = run.category || 'unknown';
          runsByCategory.set(categoryId, (runsByCategory.get(categoryId) || 0) + 1);
        });

        // Group runs by platform
        const runsByPlatform = new Map<string, number>();
        verifiedRuns.forEach(run => {
          const platformId = run.platform || 'unknown';
          runsByPlatform.set(platformId, (runsByPlatform.get(platformId) || 0) + 1);
        });

        // Group by run type
        const runsByRunType = {
          solo: verifiedRuns.filter(run => run.runType === 'solo').length,
          coOp: verifiedRuns.filter(run => run.runType === 'co-op').length,
        };

        // Group by leaderboard type
        const runsByLeaderboardType = {
          regular: verifiedRuns.filter(run => run.leaderboardType === 'regular' || !run.leaderboardType).length,
          individualLevel: verifiedRuns.filter(run => run.leaderboardType === 'individual-level').length,
          communityGolds: verifiedRuns.filter(run => run.leaderboardType === 'community-golds').length,
        };

        // World record progression over time
        // Track runs by date for tooltip display
        const wrProgression = new Map<string, number>();
        const wrRunsByDate = new Map<string, LeaderboardEntry[]>();
        const sortedWRs = worldRecords
          .filter(wr => wr.date)
          .sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return dateA - dateB;
          });

        let cumulativeCount = 0;
        sortedWRs.forEach(wr => {
          cumulativeCount++;
          const date = wr.date!;
          
          // Track runs for this date
          if (!wrRunsByDate.has(date)) {
            wrRunsByDate.set(date, []);
          }
          wrRunsByDate.get(date)!.push(wr);
          
          wrProgression.set(date, cumulativeCount);
        });

        const progressionData = Array.from(wrProgression.entries())
          .map(([date, count]) => ({ 
            date, 
            count,
            runs: wrRunsByDate.get(date) || []
          }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        // Calculate WR start and end dates
        const wrStartDate = progressionData.length > 0 ? progressionData[0].date : undefined;
        const wrEndDate = progressionData.length > 0 ? progressionData[progressionData.length - 1].date : undefined;

        // Calculate who has held WRs the longest
        // Track WR holders by group (category/platform/runType/level) over time
        // For each group, find all runs that were WRs at some point
        const wrHoldersByGroup = new Map<string, Array<{ playerName: string; date: string; endDate?: string }>>();
        const now = new Date();
        const nowDateStr = now.toISOString().split('T')[0];
        
        // Group all verified runs by their leaderboard group
        const runsByGroup = new Map<string, LeaderboardEntry[]>();
        verifiedRuns.forEach(run => {
          if (!run.date) return;
          
          const leaderboardType = run.leaderboardType || 'regular';
          const category = run.category || '';
          const platform = run.platform || '';
          const runType = run.runType || 'solo';
          const level = run.level || '';
          const groupKey = `${leaderboardType}_${category}_${platform}_${runType}_${level}`;
          
          if (!runsByGroup.has(groupKey)) {
            runsByGroup.set(groupKey, []);
          }
          runsByGroup.get(groupKey)!.push(run);
        });
        
        // For each group, sort by time and track WR progression
        runsByGroup.forEach((runs, groupKey) => {
          // Sort by time (fastest first)
          runs.sort((a, b) => {
            const timeA = parseTimeToSeconds(a.time) || Infinity;
            const timeB = parseTimeToSeconds(b.time) || Infinity;
            return timeA - timeB;
          });
          
          // Track when each player held the WR
          // Sort runs by date first to track chronological WR progression
          const runsByDate = [...runs].sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return dateA - dateB;
          });
          
          // Track the current WR holder over time
          const holders: Array<{ playerName: string; date: string; endDate?: string }> = [];
          let currentWR: LeaderboardEntry | null = null;
          let currentWRDate: string | null = null;
          
          // Process runs chronologically
          runsByDate.forEach(run => {
            const runTime = parseTimeToSeconds(run.time) || Infinity;
            const currentWRTime = currentWR ? (parseTimeToSeconds(currentWR.time) || Infinity) : Infinity;
            
            // If this run is faster than current WR, it becomes the new WR
            if (runTime < currentWRTime) {
              // If there was a previous WR holder, record when their WR ended
              if (currentWR && currentWRDate) {
                const lastHolder = holders[holders.length - 1];
                if (lastHolder && lastHolder.playerName === (currentWR.playerName || 'Unknown') && !lastHolder.endDate) {
                  lastHolder.endDate = run.date;
                } else {
                  holders.push({
                    playerName: currentWR.playerName || 'Unknown',
                    date: currentWRDate,
                    endDate: run.date,
                  });
                }
              }
              
              // Set new WR holder
              currentWR = run;
              currentWRDate = run.date;
              holders.push({
                playerName: run.playerName || 'Unknown',
                date: run.date,
                endDate: undefined, // Will be set when broken or at end
              });
            }
          });
          
          // Set end date for current WR holder (if still holding)
          if (holders.length > 0) {
            const lastHolder = holders[holders.length - 1];
            if (!lastHolder.endDate) {
              lastHolder.endDate = nowDateStr;
            }
          }
          
          wrHoldersByGroup.set(groupKey, holders);
        });
        
        // Calculate total days each player has held WRs (across all groups)
        // Sum up all WR-holding periods for each player
        const playerWRDays = new Map<string, number>();
        wrHoldersByGroup.forEach(holders => {
          holders.forEach(holder => {
            const startDate = new Date(holder.date);
            const endDate = new Date(holder.endDate || nowDateStr);
            const days = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
            
            // Sum up days for this player across all groups
            const currentDays = playerWRDays.get(holder.playerName) || 0;
            playerWRDays.set(holder.playerName, currentDays + days);
          });
        });
        
        // Find player with most days
        let longestWRHolder: { playerName: string; days: number } | undefined;
        playerWRDays.forEach((days, playerName) => {
          if (!longestWRHolder || days > longestWRHolder.days) {
            longestWRHolder = { playerName, days };
          }
        });

        // Recent world records (last 20)
        const recentWorldRecords = worldRecords
          .filter(wr => wr.date)
          .sort((a, b) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            return dateB - dateA;
          })
          .slice(0, 20);

        setStats({
          totalRuns: allRuns.length,
          verifiedRuns: verifiedRuns.length,
          worldRecords: worldRecords.length,
          runsByCategory,
          runsByPlatform,
          runsByRunType,
          runsByLeaderboardType,
          worldRecordProgression: progressionData,
          recentWorldRecords,
          wrStartDate,
          wrEndDate,
          longestWRHolder,
          allWorldRecords: worldRecords,
          allVerifiedRuns: verifiedRuns,
        });
        
        // Initialize filter defaults
        if (fetchedPlatforms.length > 0) {
          setWrProgressionPlatform(fetchedPlatforms[0].id);
        }
        if (runTypes.length > 0) {
          setWrProgressionRunType(runTypes[0].id);
        }
        if (fetchedLevels.length > 0) {
          setWrProgressionLevel(fetchedLevels[0].id);
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Update available categories when WR progression leaderboard type changes
  useEffect(() => {
    const updateCategories = async () => {
      try {
        const fetchedCategories = await getCategories(wrProgressionLeaderboardType);
        setAvailableWrCategories(fetchedCategories);
        
        // Auto-select first category if available
        if (fetchedCategories.length > 0) {
          setWrProgressionCategory(fetchedCategories[0].id);
        } else {
          setWrProgressionCategory("");
        }
      } catch (error) {
        setAvailableWrCategories([]);
        setWrProgressionCategory("");
      }
    };
    
    updateCategories();
  }, [wrProgressionLeaderboardType]);

  const topCategories = useMemo(() => {
    if (!stats) return [];
    return Array.from(stats.runsByCategory.entries())
      .map(([id, count]) => ({
        id,
        name: getCategoryNameWithOverride(id, categories),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [stats, categories]);

  const topPlatforms = useMemo(() => {
    if (!stats) return [];
    return Array.from(stats.runsByPlatform.entries())
      .map(([id, count]) => ({
        id,
        name: getPlatformName(id, platforms),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [stats, platforms]);

  // Calculate rankings based on leaderboard positions in full game runs
  const eloRankings = useMemo(() => {
    if (!stats || !stats.allVerifiedRuns) return [];

    // Only include full game runs (regular leaderboard type)
    const fullGameRuns = stats.allVerifiedRuns.filter(run => {
      const leaderboardType = run.leaderboardType || 'regular';
      return leaderboardType === 'regular' && !run.isObsolete;
    });

    // Initialize player stats
    const playerStats = new Map<string, {
      name: string;
      totalRuns: number;
      worldRecords: number;
      bestTime: number;
      bestTimeString: string;
      totalPoints: number;
      topRanks: number[]; // Track ranks achieved
    }>();

    // Group runs by category/platform/runType
    const runsByGroup = new Map<string, LeaderboardEntry[]>();
    
    fullGameRuns.forEach(run => {
      const category = run.category || '';
      const platform = run.platform || '';
      const runType = run.runType || 'solo';
      const groupKey = `${category}_${platform}_${runType}`;
      
      if (!runsByGroup.has(groupKey)) {
        runsByGroup.set(groupKey, []);
      }
      runsByGroup.get(groupKey)!.push(run);
    });

    // Calculate points for each group based on rankings
    runsByGroup.forEach((runs, groupKey) => {
      // Get unique players in this group with their best times
      const playerTimes = new Map<string, { time: number; run: LeaderboardEntry }>();
      
      runs.forEach(run => {
        const playerId = run.playerId || run.playerName;
        if (!playerId) return;
        
        const runTime = parseTimeToSeconds(run.time) || Infinity;
        const existing = playerTimes.get(playerId);
        
        if (!existing || runTime < existing.time) {
          playerTimes.set(playerId, { time: runTime, run });
        }
      });

      // Sort players by time (fastest first) to determine ranks
      const sortedPlayers = Array.from(playerTimes.entries())
        .map(([playerId, data]) => ({ playerId, time: data.time, run: data.run }))
        .sort((a, b) => a.time - b.time);

      // Award points based on rank
      // Points system: Rank 1 = 100, Rank 2 = 75, Rank 3 = 55, Rank 4 = 40, Rank 5 = 30,
      // Rank 6-10 = 20, Rank 11-20 = 10, Rank 21+ = 5
      const getPointsForRank = (rank: number): number => {
        if (rank === 1) return 100;
        if (rank === 2) return 75;
        if (rank === 3) return 55;
        if (rank === 4) return 40;
        if (rank === 5) return 30;
        if (rank >= 6 && rank <= 10) return 20;
        if (rank >= 11 && rank <= 20) return 10;
        if (rank >= 21) return 5;
        return 0;
      };

      // Assign points and track stats for each player
      sortedPlayers.forEach((player, index) => {
        const rank = index + 1;
        const points = getPointsForRank(rank);
        const playerId = player.playerId;

        // Initialize player stats if needed
        if (!playerStats.has(playerId)) {
          playerStats.set(playerId, {
            name: player.run.playerName || 'Unknown',
            totalRuns: 0,
            worldRecords: 0,
            bestTime: Infinity,
            bestTimeString: '',
            totalPoints: 0,
            topRanks: [],
          });
        }

        const playerStat = playerStats.get(playerId)!;
        playerStat.totalPoints += points;
        playerStat.topRanks.push(rank);
        
        // Track best time
        if (player.time < playerStat.bestTime) {
          playerStat.bestTime = player.time;
          playerStat.bestTimeString = player.run.time;
        }

        // Count world records (rank 1)
        if (rank === 1) {
          playerStat.worldRecords++;
        }
      });
    });

    // Count total runs per player
    fullGameRuns.forEach(run => {
      const playerId = run.playerId || run.playerName;
      if (!playerId) return;
      
      if (playerStats.has(playerId)) {
        playerStats.get(playerId)!.totalRuns++;
      }
    });

    // Convert to array and sort by total points (highest first)
    return Array.from(playerStats.entries())
      .map(([playerId, stat]) => ({
        playerId,
        playerName: stat.name,
        elo: stat.totalPoints, // Using "elo" field name for compatibility with existing UI
        totalRuns: stat.totalRuns,
        worldRecords: stat.worldRecords,
        bestTime: stat.bestTime,
        bestTimeString: stat.bestTimeString,
        topRanks: stat.topRanks.sort((a, b) => a - b), // Sort ranks ascending
      }))
      .sort((a, b) => b.elo - a.elo)
      .map((player, index) => ({
        ...player,
        rank: index + 1,
      }));
  }, [stats]);

  // Calculate filtered WR time progression
  const filteredWRTimeProgression = useMemo(() => {
    if (!stats || !stats.allWorldRecords) return [];
    
    // Filter world records by selected criteria
    let filteredWRs = stats.allWorldRecords.filter(wr => {
      if (!wr.date) return false;
      
      // Filter by leaderboard type
      const runLeaderboardType = wr.leaderboardType || 'regular';
      if (runLeaderboardType !== wrProgressionLeaderboardType) return false;
      
      // Filter by category
      if (wrProgressionCategory && wr.category !== wrProgressionCategory) return false;
      
      // Filter by platform
      if (wrProgressionPlatform && wr.platform !== wrProgressionPlatform) return false;
      
      // Filter by run type
      if (wrProgressionRunType && wr.runType !== wrProgressionRunType) return false;
      
      // Filter by level (for IL/CG)
      if ((wrProgressionLeaderboardType === 'individual-level' || wrProgressionLeaderboardType === 'community-golds')) {
        if (wrProgressionLevel && wr.level !== wrProgressionLevel) return false;
      }
      
      return true;
    });
    
    if (filteredWRs.length === 0) return [];
    
    // Group by the same key (category/platform/runType/level) to track progression
    const leaderboardType = wrProgressionLeaderboardType;
    const category = wrProgressionCategory;
    const platform = wrProgressionPlatform;
    const runType = wrProgressionRunType;
    const level = wrProgressionLevel;
    const groupKey = `${leaderboardType}_${category}_${platform}_${runType}_${level}`;
    
    // Get all runs for this specific group (not just WRs, but all verified runs)
    // We need to track when WRs were broken
    const allRunsForGroup = stats.allVerifiedRuns.filter(run => {
      const runLeaderboardType = run.leaderboardType || 'regular';
      if (runLeaderboardType !== leaderboardType) return false;
      if (category && run.category !== category) return false;
      if (platform && run.platform !== platform) return false;
      if (runType && run.runType !== runType) return false;
      if ((leaderboardType === 'individual-level' || leaderboardType === 'community-golds') && level && run.level !== level) return false;
      return true;
    });
    
    // Sort all runs by date chronologically
    const runsByDate = allRunsForGroup
      .filter(run => run.date)
      .sort((a, b) => {
        const dateA = new Date(a.date!).getTime();
        const dateB = new Date(b.date!).getTime();
        return dateA - dateB;
      });
    
    // Track WR progression (best time over time)
    const progression: Array<{ date: string; time: number; timeString: string; run: LeaderboardEntry }> = [];
    let currentBestTime = Infinity;
    let currentBestRun: LeaderboardEntry | null = null;
    
    runsByDate.forEach(run => {
      const runTime = parseTimeToSeconds(run.time) || Infinity;
      
      // If this run is faster than current best, it becomes the new WR
      if (runTime < currentBestTime) {
        currentBestTime = runTime;
        currentBestRun = run;
        progression.push({
          date: run.date!,
          time: runTime,
          timeString: run.time,
          run: run,
        });
      }
    });
    
    return progression;
  }, [stats, wrProgressionLeaderboardType, wrProgressionCategory, wrProgressionPlatform, wrProgressionRunType, wrProgressionLevel]);

  // Loading skeleton component
  const LoadingSkeletons = () => (
    <div className="container mx-auto px-4 py-8 animate-fade-in">
      <div className="mb-8">
        <Skeleton className="h-10 w-64 mb-2" />
        <Skeleton className="h-5 w-96" />
      </div>

      {/* Overview Cards Skeletons */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-slide-up" style={{ animationDelay: `${i * 0.1}s` }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-4 rounded" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs Skeleton */}
      <Card className="animate-slide-up-delay">
        <CardHeader>
          <Skeleton className="h-6 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2 mb-4">
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
            <div className="space-y-4">
              {/* Chart Skeleton */}
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-[400px] w-full" />
              </div>
              {/* Table Skeleton */}
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-[90%]" />
                <Skeleton className="h-10 w-[80%]" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (loading) {
    return <LoadingSkeletons />;
  }

  if (!stats) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Failed to load statistics.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const chartConfig = {
    count: {
      label: "World Records",
      color: "hsl(var(--chart-1))",
    },
  };

  return (
    <div className="container mx-auto px-4 py-8 animate-fade-in">
      <div className="mb-8 animate-slide-up">
        <h1 className="text-4xl font-bold mb-2">Statistics</h1>
        <p className="text-muted-foreground">Leaderboard and world record statistics</p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Verified Runs</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.verifiedRuns.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalRuns.toLocaleString()} total runs
            </p>
          </CardContent>
        </Card>

        <Card className="animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">World Records</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.worldRecords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {((stats.worldRecords / stats.verifiedRuns) * 100).toFixed(1)}% of verified runs
            </p>
          </CardContent>
        </Card>

        <Card className="animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solo Runs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.runsByRunType.solo.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {((stats.runsByRunType.solo / stats.verifiedRuns) * 100).toFixed(1)}% of runs
            </p>
          </CardContent>
        </Card>

        <Card className="animate-slide-up" style={{ animationDelay: '0.4s' }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Co-op Runs</CardTitle>
            <Gamepad2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.runsByRunType.coOp.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {((stats.runsByRunType.coOp / stats.verifiedRuns) * 100).toFixed(1)}% of runs
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="progression">World Record Progression</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="recent">Recent World Records</TabsTrigger>
          <TabsTrigger value="elo">Elo Rankings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="animate-slide-up-delay">
              <CardHeader>
                <CardTitle>Leaderboard Types</CardTitle>
                <CardDescription>Distribution of runs by leaderboard type</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      <span>Regular</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">{stats.runsByLeaderboardType.regular.toLocaleString()}</span>
                      <Badge variant="secondary">
                        {((stats.runsByLeaderboardType.regular / stats.verifiedRuns) * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4" />
                      <span>Individual Levels</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">{stats.runsByLeaderboardType.individualLevel.toLocaleString()}</span>
                      <Badge variant="secondary">
                        {((stats.runsByLeaderboardType.individualLevel / stats.verifiedRuns) * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      <span>Community Golds</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">{stats.runsByLeaderboardType.communityGolds.toLocaleString()}</span>
                      <Badge variant="secondary">
                        {((stats.runsByLeaderboardType.communityGolds / stats.verifiedRuns) * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="animate-slide-up-delay-2">
              <CardHeader>
                <CardTitle>Top Categories</CardTitle>
                <CardDescription>Categories with the most runs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topCategories.map((category) => (
                    <div key={category.id} className="flex items-center justify-between">
                      <span className="text-sm">{category.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{category.count.toLocaleString()}</span>
                        <Badge variant="outline">
                          {((category.count / stats.verifiedRuns) * 100).toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="animate-slide-up-delay-2">
            <CardHeader>
              <CardTitle>Top Platforms</CardTitle>
              <CardDescription>Platforms with the most runs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {topPlatforms.map((platform) => (
                  <div key={platform.id} className="flex items-center justify-between p-2 border rounded">
                    <span className="text-sm font-medium">{platform.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{platform.count.toLocaleString()}</span>
                      <Badge variant="outline">
                        {((platform.count / stats.verifiedRuns) * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progression" className="space-y-4">
          <Card className="animate-slide-up-delay-2">
            <CardHeader>
              <CardTitle>World Record Time Progression</CardTitle>
              <CardDescription>World record times improving over time (lower is better)</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filters - Always show so users can switch leaderboard types even when no data */}
              <div className="mb-6 space-y-4">
                {/* Leaderboard Type Tabs */}
                <Tabs value={wrProgressionLeaderboardType} onValueChange={(value) => setWrProgressionLeaderboardType(value as 'regular' | 'individual-level' | 'community-golds')}>
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="regular" className="flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      <span>Full Game</span>
                    </TabsTrigger>
                    <TabsTrigger value="individual-level" className="flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      <span>Individual Levels</span>
                    </TabsTrigger>
                    <TabsTrigger value="community-golds" className="flex items-center gap-2">
                      <Gem className="h-4 w-4" />
                      <span>Community Golds</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Category Tabs */}
                {availableWrCategories.length > 0 && (
                  <div className="mb-4">
                    <Tabs value={wrProgressionCategory} onValueChange={setWrProgressionCategory}>
                      <TabsList className="flex w-full p-0.5 gap-1 overflow-x-auto overflow-y-hidden scrollbar-hide" style={{ minWidth: 'max-content' }}>
                        {availableWrCategories.map((category) => (
                          <TabsTrigger 
                            key={category.id} 
                            value={category.id} 
                            className="data-[state=active]:bg-[#94e2d5] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-colors font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#94e2d5]/50 py-1.5 sm:py-2 px-2 sm:px-3 text-xs sm:text-sm whitespace-nowrap rounded-none flex items-center gap-1.5"
                          >
                            {category.name || getCategoryNameWithOverride(category.id, availableWrCategories)}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>
                )}

                {/* Filter Card */}
                <Card className="bg-gradient-to-br from-ctp-base to-ctp-mantle border-ctp-surface1 shadow-xl rounded-none">
                  <CardHeader className="bg-gradient-to-r from-ctp-base to-ctp-mantle border-b border-ctp-surface1 py-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Filter className="h-4 w-4 text-ctp-mauve" />
                      <span className="text-ctp-text">Filter Results</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {(wrProgressionLeaderboardType === 'individual-level' || wrProgressionLeaderboardType === 'community-golds') && (
                        <div>
                          <label className="block text-sm font-semibold mb-1.5 text-ctp-text flex items-center gap-2">
                            <Star className="h-3.5 w-3.5 text-ctp-mauve" />
                            Levels
                          </label>
                          <Select value={wrProgressionLevel} onValueChange={setWrProgressionLevel}>
                            <SelectTrigger className="bg-ctp-base border-ctp-surface1 h-9 text-sm rounded-none">
                              <SelectValue placeholder="Select level" />
                            </SelectTrigger>
                            <SelectContent>
                              {levels.map((level) => (
                                <SelectItem key={level.id} value={level.id} className="text-sm">
                                  {level.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-semibold mb-1.5 text-ctp-text flex items-center gap-2">
                          <Gamepad2 className="h-3.5 w-3.5 text-ctp-mauve" />
                          Platform
                        </label>
                        <Select value={wrProgressionPlatform} onValueChange={setWrProgressionPlatform}>
                          <SelectTrigger className="bg-ctp-base border-ctp-surface1 h-9 text-sm rounded-none">
                            <SelectValue placeholder="Select platform" />
                          </SelectTrigger>
                          <SelectContent>
                            {platforms.map((platform) => (
                              <SelectItem key={platform.id} value={platform.id} className="text-sm">
                                {platform.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold mb-1.5 text-ctp-text flex items-center gap-2">
                          {wrProgressionRunType === 'solo' ? (
                            <Users className="h-3.5 w-3.5 text-ctp-mauve" />
                          ) : (
                            <Users className="h-3.5 w-3.5 text-ctp-mauve" />
                          )}
                          Run Type
                        </label>
                        <Select value={wrProgressionRunType} onValueChange={setWrProgressionRunType}>
                          <SelectTrigger className="bg-ctp-base border-ctp-surface1 h-9 text-sm rounded-none">
                            <SelectValue placeholder="Select run type" />
                          </SelectTrigger>
                          <SelectContent>
                            {runTypes.map((type) => (
                              <SelectItem key={type.id} value={type.id} className="text-sm">
                                <div className="flex items-center gap-2">
                                  {type.id === 'solo' ? <Users className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                                  {type.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {filteredWRTimeProgression.length > 0 ? (
                <>
                  {/* WR Statistics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="p-4 border rounded-lg bg-muted/50">
                        <div className="text-sm text-muted-foreground mb-1">First WR</div>
                        <div className="text-lg font-semibold">
                          {new Date(filteredWRTimeProgression[0].date).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {formatTime(filteredWRTimeProgression[0].timeString)}
                        </div>
                      </div>
                      <div className="p-4 border rounded-lg bg-muted/50">
                        <div className="text-sm text-muted-foreground mb-1">Current WR</div>
                        <div className="text-lg font-semibold">
                          {new Date(filteredWRTimeProgression[filteredWRTimeProgression.length - 1].date).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {formatTime(filteredWRTimeProgression[filteredWRTimeProgression.length - 1].timeString)}
                        </div>
                      </div>
                      <div className="p-4 border rounded-lg bg-muted/50">
                        <div className="text-sm text-muted-foreground mb-1">Improvement</div>
                        <div className="text-lg font-semibold">
                          {(() => {
                            const firstTime = filteredWRTimeProgression[0].time;
                            const currentTime = filteredWRTimeProgression[filteredWRTimeProgression.length - 1].time;
                            const improvement = firstTime - currentTime;
                            return formatTime(formatSecondsToTime(improvement));
                          })()}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {filteredWRTimeProgression.length} WR{filteredWRTimeProgression.length !== 1 ? 's' : ''} total
                        </div>
                      </div>
                    </div>
                  
                  <ChartContainer config={chartConfig} className="h-[600px] w-full [&_.recharts-brush]:fill-[hsl(var(--muted))] [&_.recharts-brush]:stroke-[hsl(var(--border))] [&_.recharts-brush-slide]:fill-[hsl(var(--muted))] [&_.recharts-brush-traveller]:fill-[hsl(var(--muted))] [&_.recharts-brush-traveller]:stroke-[hsl(var(--border))]">
                    <LineChart 
                      data={filteredWRTimeProgression}
                      margin={{ top: 10, right: 30, left: 0, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getFullYear()}`;
                        }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        domain={['auto', 'auto']}
                        tickFormatter={(value) => {
                          return formatTime(formatSecondsToTime(value));
                        }}
                        reversed={false}
                      />
                      <ChartTooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            const date = new Date(data.date);
                            const run = data.run as LeaderboardEntry;
                            
                            if (!run) return null;
                            
                            const categoryName = getCategoryNameWithOverride(run.category, categories);
                            const platformName = getPlatformName(run.platform, platforms);
                            const levelName = run.level ? getLevelName(run.level, levels) : null;
                            
                            return (
                              <div className="rounded-lg border bg-background p-3 shadow-lg max-w-md">
                                <div className="grid gap-3">
                                  <div className="flex items-center justify-between gap-4 border-b pb-2">
                                    <span className="text-sm font-medium">Date</span>
                                    <span className="text-sm font-semibold">{date.toLocaleDateString()}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4 border-b pb-2">
                                    <span className="text-sm font-medium">World Record Time</span>
                                    <span className="text-sm font-bold font-mono">{formatTime(data.timeString)}</span>
                                  </div>
                                  <div className="mt-2">
                                    <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                                      WR Holder
                                    </div>
                                    <div className="text-xs border rounded p-2 bg-muted/30">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="font-semibold" style={{ color: run.nameColor || 'inherit' }}>
                                          {run.playerName}
                                          {run.player2Name && ` & ${run.player2Name}`}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap text-muted-foreground">
                                        <span>{categoryName}</span>
                                        {levelName && <span>• {levelName}</span>}
                                        <span>• {platformName}</span>
                                        <span>• {run.runType === 'co-op' ? 'Co-op' : 'Solo'}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="time" 
                        stroke="var(--color-count)" 
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Brush 
                        dataKey="date"
                        height={30}
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getFullYear()}`;
                        }}
                        fill="hsl(var(--muted))"
                        stroke="hsl(var(--border))"
                      />
                    </LineChart>
                  </ChartContainer>
                </>
              ) : (
                <div className="h-[600px] flex items-center justify-center text-muted-foreground">
                  {stats && stats.allWorldRecords.length > 0 
                    ? "No world record progression data available for the selected filters"
                    : "No world record progression data available"}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Runs by Category</CardTitle>
                <CardDescription>Complete breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {Array.from(stats.runsByCategory.entries())
                    .map(([id, count]) => ({
                      id,
                      name: getCategoryNameWithOverride(id, categories),
                      count,
                    }))
                    .sort((a, b) => b.count - a.count)
                    .map((category) => (
                      <div key={category.id} className="flex items-center justify-between py-2 border-b">
                        <span className="text-sm">{category.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{category.count.toLocaleString()}</span>
                          <Badge variant="outline">
                            {((category.count / stats.verifiedRuns) * 100).toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card className="animate-slide-up-delay-2">
              <CardHeader>
                <CardTitle>Runs by Platform</CardTitle>
                <CardDescription>Complete breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {Array.from(stats.runsByPlatform.entries())
                    .map(([id, count]) => ({
                      id,
                      name: getPlatformName(id, platforms),
                      count,
                    }))
                    .sort((a, b) => b.count - a.count)
                    .map((platform) => (
                      <div key={platform.id} className="flex items-center justify-between py-2 border-b">
                        <span className="text-sm">{platform.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{platform.count.toLocaleString()}</span>
                          <Badge variant="outline">
                            {((platform.count / stats.verifiedRuns) * 100).toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <Card className="animate-slide-up-delay">
            <CardHeader>
              <CardTitle>Recent World Records</CardTitle>
              <CardDescription>Most recently achieved world records</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.recentWorldRecords.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recentWorldRecords.map((wr) => {
                      const categoryName = getCategoryNameWithOverride(wr.category, categories);
                      const platformName = getPlatformName(wr.platform, platforms);
                      const levelName = wr.level ? getLevelName(wr.level, levels) : null;
                      const leaderboardTypeName = 
                        wr.leaderboardType === 'individual-level' ? 'IL' :
                        wr.leaderboardType === 'community-golds' ? 'CG' : 'Full Game';

                      return (
                        <TableRow key={wr.id}>
                          <TableCell>
                            {wr.date ? new Date(wr.date).toLocaleDateString() : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Link 
                              to={`/player/${wr.playerId}`}
                              className="text-primary hover:underline"
                            >
                              {wr.playerName}
                              {wr.player2Name && ` & ${wr.player2Name}`}
                            </Link>
                          </TableCell>
                          <TableCell>{categoryName}</TableCell>
                          <TableCell>{platformName}</TableCell>
                          <TableCell>{levelName || '-'}</TableCell>
                          <TableCell className="font-mono">{formatTime(wr.time)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant={wr.runType === 'co-op' ? 'default' : 'secondary'}>
                                {wr.runType === 'co-op' ? 'Co-op' : 'Solo'}
                              </Badge>
                              <Badge variant="outline">{leaderboardTypeName}</Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No recent world records found
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="elo" className="space-y-4">
          <Card className="animate-slide-up-delay">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Elo Rankings
              </CardTitle>
              <CardDescription>
                Player rankings based on leaderboard positions in full game runs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eloRankings.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">
                    Players are ranked by their positions on full game leaderboards. Points are awarded based on rank:
                    Rank 1 = 100 points, Rank 2 = 75, Rank 3 = 55, Rank 4 = 40, Rank 5 = 30, 
                    Ranks 6-10 = 20, Ranks 11-20 = 10, Rank 21+ = 5. Only full game runs (not Individual Levels) are counted.
                  </div>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Rank</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead className="text-right">Elo Rating</TableHead>
                          <TableHead className="text-right">World Records</TableHead>
                          <TableHead className="text-right">Total Runs</TableHead>
                          <TableHead className="text-right">Best Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {eloRankings.map((player) => (
                          <TableRow key={player.playerId}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {player.rank === 1 && <Trophy className="h-4 w-4 text-yellow-500" />}
                                {player.rank === 2 && <Award className="h-4 w-4 text-gray-400" />}
                                {player.rank === 3 && <Award className="h-4 w-4 text-amber-600" />}
                                <span className="font-semibold">#{player.rank}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Link 
                                to={`/player/${player.playerId}`}
                                className="text-primary hover:underline font-medium"
                                style={{ color: player.playerName === 'Unknown' ? 'inherit' : undefined }}
                              >
                                {player.playerName}
                              </Link>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="font-bold text-lg">{player.elo}</span>
                                <span className="text-xs text-muted-foreground">pts</span>
                                {player.elo >= 500 && (
                                  <Badge variant="default" className="bg-yellow-500">
                                    Master
                                  </Badge>
                                )}
                                {player.elo >= 300 && player.elo < 500 && (
                                  <Badge variant="secondary">
                                    Expert
                                  </Badge>
                                )}
                                {player.elo < 300 && player.elo >= 150 && (
                                  <Badge variant="outline">
                                    Advanced
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Trophy className="h-4 w-4 text-yellow-500" />
                                <span className="font-semibold">{player.worldRecords}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-muted-foreground">{player.totalRuns}</span>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {player.bestTime !== Infinity ? formatTime(player.bestTimeString) : 'N/A'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No player data available for Elo rankings
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Stats;

