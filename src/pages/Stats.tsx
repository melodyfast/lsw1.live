"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { 
  Trophy, 
  Clock, 
  Users, 
  Gamepad2, 
  BarChart3,
  Award
} from "lucide-react";
import { getAllVerifiedRuns, getCategories, getPlatforms } from "@/lib/db";
import { LeaderboardEntry } from "@/types/database";
import { formatTime, parseTimeToSeconds } from "@/lib/utils";
import { getCategoryName, getPlatformName, getLevelName } from "@/lib/dataValidation";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { Link } from "react-router-dom";

// Category name overrides for stats page
const CATEGORY_NAME_OVERRIDES: Record<string, string> = {
  'GdR0b0zs2ZFVVvjsglIL': 'Story Mode - IL',
  'zRhqEIO8iXYUiHoW5qIp': 'Free Play - IL',
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
  worldRecordProgression: Array<{ date: string; count: number }>;
  recentWorldRecords: LeaderboardEntry[];
}

const Stats = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [platforms, setPlatforms] = useState<Array<{ id: string; name: string }>>([]);
  const [levels, setLevels] = useState<Array<{ id: string; name: string }>>([]);

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
        const wrProgression = new Map<string, number>();
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
          const date = wr.date;
          wrProgression.set(date, cumulativeCount);
        });

        const progressionData = Array.from(wrProgression.entries())
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Statistics</h1>
        <p className="text-muted-foreground">Leaderboard and world record statistics</p>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
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

        <Card>
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

        <Card>
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

        <Card>
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

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="progression">World Record Progression</TabsTrigger>
          <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
          <TabsTrigger value="recent">Recent World Records</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
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

            <Card>
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

          <Card>
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
          <Card>
            <CardHeader>
              <CardTitle>World Record Progression</CardTitle>
              <CardDescription>Cumulative world records over time</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.worldRecordProgression.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[400px]">
                  <LineChart data={stats.worldRecordProgression}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getFullYear()}`;
                      }}
                    />
                    <YAxis />
                    <ChartTooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const date = new Date(data.date);
                          return (
                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                              <div className="grid gap-2">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-sm font-medium">Date</span>
                                  <span className="text-sm">{date.toLocaleDateString()}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-sm font-medium">World Records</span>
                                  <span className="text-sm font-bold">{data.count}</span>
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
                      dataKey="count" 
                      stroke="var(--color-count)" 
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ChartContainer>
              ) : (
                <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                  No world record progression data available
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

            <Card>
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
          <Card>
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
      </Tabs>
    </div>
  );
};

export default Stats;

