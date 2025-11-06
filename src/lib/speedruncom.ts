/**
 * Speedrun.com API integration utilities
 * https://github.com/speedruncomorg/api
 */

const SPEEDRUNCOM_API_BASE = "https://www.speedrun.com/api/v1";

export interface SRCGame {
  id: string;
  names: {
    international: string;
  };
  abbreviation: string;
}

export interface SRCPlayer {
  id: string;
  names: {
    international: string;
  };
  weblink: string;
}

export interface SRCCategory {
  id: string;
  name: string;
  type: "per-game" | "per-level";
  weblink: string;
  variables?: {
    data: Array<{
      id: string;
      name: string;
      values: {
        values: Record<string, { label: string }>;
      };
    }>;
  };
}

export interface SRCLevel {
  id: string;
  name: string;
  weblink: string;
}

export interface SRCPlatform {
  id: string;
  name: string;
}

export interface SRCRun {
  id: string;
  weblink: string;
  game: string | { data: SRCGame };
  category: string | { data: SRCCategory };
  level?: string | { data: SRCLevel };
  players: Array<{
    rel: string;
    id?: string;
    name?: string;
    data?: SRCPlayer;
  }>;
  date?: string;
  submitted?: string;
  times: {
    primary: string; // ISO 8601 duration (e.g., "PT1H23M45.678S")
    primary_t: number; // seconds
    realtime?: string;
    realtime_t?: number;
    realtime_noloads?: string;
    realtime_noloads_t?: number;
  };
  videos?: {
    links?: Array<{
      uri: string;
    }>;
  };
  system: {
    platform?: string | { data: SRCPlatform };
    emulated?: boolean;
    region?: string;
  };
  status: {
    status: "new" | "verified" | "rejected";
    examiner?: string;
    "verify-date"?: string;
  };
  comment?: string;
  values?: Record<string, string>;
}

export interface SRCRunData {
  data: SRCRun[];
  pagination?: {
    offset: number;
    max: number;
    size: number;
  };
}

/**
 * Convert ISO 8601 duration to HH:MM:SS format
 */
function isoDurationToTime(duration: string): string {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!match) return "00:00:00";
  
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseFloat(match[3] || "0");
  
  const secondsInt = Math.floor(seconds);
  const milliseconds = Math.floor((seconds - secondsInt) * 1000);
  
  const hoursStr = hours.toString().padStart(2, "0");
  const minutesStr = minutes.toString().padStart(2, "0");
  const secondsStr = secondsInt.toString().padStart(2, "0");
  
  return `${hoursStr}:${minutesStr}:${secondsStr}`;
}

/**
 * Convert seconds to HH:MM:SS format
 */
function secondsToTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Get game ID for LEGO Star Wars: The Video Game
 */
export async function getLSWGameId(): Promise<string | null> {
  try {
    const response = await fetch(`${SPEEDRUNCOM_API_BASE}/games?name=LEGO%20Star%20Wars&abbreviation=lsw`);
    const data = await response.json();
    
    if (data.data && data.data.length > 0) {
      // Find the game with abbreviation "lsw"
      const lswGame = data.data.find((game: SRCGame) => game.abbreviation === "lsw");
      return lswGame?.id || null;
    }
    return null;
  } catch (error) {
    console.error("Error fetching LSW game ID:", error);
    return null;
  }
}

/**
 * Fetch all runs for a game
 * This fetches runs with status "verified" that can be imported
 */
export async function fetchRunsNotOnLeaderboards(gameId: string): Promise<SRCRun[]> {
  const allRuns: SRCRun[] = [];
  let offset = 0;
  const max = 200;
  let hasMore = true;
  
  try {
    while (hasMore) {
      // Fetch runs that are verified
      // We'll filter out ones that are already on our leaderboards later
      const response = await fetch(
        `${SPEEDRUNCOM_API_BASE}/runs?game=${gameId}&status=verified&orderby=submitted&direction=desc&max=${max}&offset=${offset}&embed=players,category,level,platform`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch runs: ${response.statusText}`);
      }
      
      const data: SRCRunData = await response.json();
      
      if (data.data && data.data.length > 0) {
        allRuns.push(...data.data);
        offset += data.data.length;
        
        if (data.data.length < max || !data.pagination) {
          hasMore = false;
        } else if (data.pagination && offset >= data.pagination.max) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
      
      // Limit to prevent too many requests - we can adjust this
      if (offset >= 500) {
        break;
      }
    }
    
    return allRuns;
  } catch (error) {
    console.error("Error fetching runs:", error);
    throw error;
  }
}

/**
 * Fetch runs for a specific category
 */
export async function fetchRunsByCategory(gameId: string, categoryId: string): Promise<SRCRun[]> {
  try {
    const response = await fetch(
      `${SPEEDRUNCOM_API_BASE}/runs?game=${gameId}&category=${categoryId}&status=verified&orderby=submitted&direction=desc&max=200&embed=players,category,level,platform`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch runs: ${response.statusText}`);
    }
    
    const data: SRCRunData = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error fetching runs by category:", error);
    throw error;
  }
}

/**
 * Fetch all categories for a game
 */
export async function fetchCategories(gameId: string): Promise<SRCCategory[]> {
  try {
    const response = await fetch(`${SPEEDRUNCOM_API_BASE}/games/${gameId}/categories`);
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
}

/**
 * Fetch all levels for a game
 */
export async function fetchLevels(gameId: string): Promise<SRCLevel[]> {
  try {
    const response = await fetch(`${SPEEDRUNCOM_API_BASE}/games/${gameId}/levels`);
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error fetching levels:", error);
    return [];
  }
}

/**
 * Fetch all platforms
 */
export async function fetchPlatforms(): Promise<SRCPlatform[]> {
  try {
    const response = await fetch(`${SPEEDRUNCOM_API_BASE}/platforms`);
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error("Error fetching platforms:", error);
    return [];
  }
}

/**
 * Get player name from embedded player data
 * Handles various SRC API response structures
 */
function getPlayerName(player: SRCRun['players'][0]): string {
  if (!player) return "Unknown";
  
  // First check embedded data (most reliable)
  if (player.data?.names?.international) {
    return player.data.names.international.trim();
  }
  
  // Check for direct name field (guest runs)
  if (player.name) {
    return String(player.name).trim();
  }
  
  // Last resort
  return "Unknown";
}

/**
 * Extract ID from embedded resource or string
 * Handles various SRC API response structures
 */
function extractId(value: string | { data: { id: string } } | { data: Array<{ id: string }> } | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  
  // Handle single embedded object
  if (value.data && !Array.isArray(value.data) && value.data.id) {
    return String(value.data.id).trim();
  }
  
  // Handle array of embedded objects (unlikely but possible)
  if (Array.isArray(value.data) && value.data.length > 0 && value.data[0]?.id) {
    return String(value.data[0].id).trim();
  }
  
  return "";
}

/**
 * Extract name from embedded resource (for category, platform, level, etc.)
 * Handles various SRC API response structures
 */
function extractName(value: string | { data: { name?: string; names?: { international?: string } } } | { data: Array<{ name?: string; names?: { international?: string } }> } | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  
  // Handle single embedded object
  if (value.data && !Array.isArray(value.data)) {
    // Try name field first
    if (value.data.name) {
      return String(value.data.name).trim();
    }
    // Try names.international
    if (value.data.names?.international) {
      return String(value.data.names.international).trim();
    }
  }
  
  // Handle array of embedded objects
  if (Array.isArray(value.data) && value.data.length > 0) {
    const first = value.data[0];
    if (first.name) {
      return String(first.name).trim();
    }
    if (first.names?.international) {
      return String(first.names.international).trim();
    }
  }
  
  return "";
}

/**
 * Map speedrun.com run to our LeaderboardEntry format
 */
export function mapSRCRunToLeaderboardEntry(
  run: SRCRun,
  embeddedData?: {
    players?: SRCPlayer[];
    category?: SRCCategory;
    level?: SRCLevel;
    platform?: SRCPlatform;
  },
  categoryMapping: Map<string, string>, // SRC category ID -> our category ID
  platformMapping: Map<string, string>, // SRC platform ID -> our platform ID
  levelMapping: Map<string, string>, // SRC level ID -> our level ID
  defaultPlayerId: string = "imported", // Default player ID for imported runs
  categoryNameMapping?: Map<string, string>, // SRC category name -> our category ID (for embedded data)
  platformNameMapping?: Map<string, string> // SRC platform name -> our platform ID (for embedded data)
): Partial<import("@/types/database").LeaderboardEntry> & {
  srcRunId: string;
  importedFromSRC: boolean;
} {
  // Extract player names - ensure they're strings
  const players = run.players || [];
  let player1Name = players[0] ? getPlayerName(players[0]) : "Unknown";
  let player2Name = players.length > 1 ? getPlayerName(players[1]) : undefined;
  
  // Ensure player names are strings
  if (typeof player1Name !== 'string') {
    player1Name = String(player1Name || 'Unknown');
  }
  if (player2Name && typeof player2Name !== 'string') {
    player2Name = String(player2Name);
  }
  
  // Determine run type
  const runType: 'solo' | 'co-op' = players.length > 1 ? 'co-op' : 'solo';
  
  // Map category - handle both string ID and embedded object
  const srcCategoryId = extractId(run.category);
  const srcCategoryName = extractName(run.category);
  let ourCategoryId = categoryMapping.get(srcCategoryId);
  // Try name mapping if ID mapping failed and we have name mapping available
  if (!ourCategoryId && srcCategoryName && categoryNameMapping) {
    ourCategoryId = categoryNameMapping.get(srcCategoryName.toLowerCase());
  }
  // Store SRC category name as fallback if mapping fails
  const finalCategoryName = srcCategoryName || (ourCategoryId ? undefined : srcCategoryId);
  
  // Map platform - handle both string ID and embedded object
  const srcPlatformId = extractId(run.system?.platform);
  const srcPlatformName = extractName(run.system?.platform);
  let ourPlatformId = platformMapping.get(srcPlatformId);
  // Try name mapping if ID mapping failed and we have name mapping available
  if (!ourPlatformId && srcPlatformName && platformNameMapping) {
    ourPlatformId = platformNameMapping.get(srcPlatformName.toLowerCase());
  }
  // Store SRC platform name as fallback if mapping fails
  const finalPlatformName = srcPlatformName || (ourPlatformId ? undefined : srcPlatformId);
  
  // Map level - handle both string ID and embedded object
  const srcLevelId = extractId(run.level);
  const srcLevelName = extractName(run.level);
  let ourLevelId = srcLevelId ? levelMapping.get(srcLevelId) : undefined;
  // Store SRC level name as fallback if mapping fails
  const finalLevelName = srcLevelName || (ourLevelId ? undefined : srcLevelId);
  
  // Use mapped IDs or fallback to SRC IDs
  if (!ourCategoryId) {
    ourCategoryId = srcCategoryId; // Fallback to SRC ID if no mapping
  }
  if (!ourPlatformId) {
    ourPlatformId = srcPlatformId; // Fallback to SRC ID if no mapping
  }
  if (srcLevelId && !ourLevelId) {
    ourLevelId = srcLevelId; // Fallback to SRC ID if no mapping
  }
  
  // Ensure category and platform are strings (normalize to empty string if null/undefined)
  ourCategoryId = ourCategoryId ? String(ourCategoryId).trim() : '';
  ourPlatformId = ourPlatformId ? String(ourPlatformId).trim() : '';
  
  // Determine leaderboard type
  // In speedrun.com, categories have a "type" field: "per-game" or "per-level"
  // - "per-game" categories are Full Game runs (regular)
  // - "per-level" categories are Individual Level runs
  // Note: speedrun.com does not support community golds, so we only handle regular and individual-level
  let leaderboardType: 'regular' | 'individual-level' = 'regular';
  
  // Try to get category type from embedded data in the run object
  let categoryType: "per-game" | "per-level" | undefined;
  if (typeof run.category === 'object' && run.category?.data) {
    categoryType = (run.category.data as SRCCategory).type;
  } else if (embeddedData?.category) {
    categoryType = embeddedData.category.type;
  }
  
  // Check if level exists and has a valid ID (not just empty string or null)
  const levelId = extractId(run.level);
  const hasLevel = levelId && levelId.trim() !== '';
  
  // Determine leaderboard type based on category type first, then level
  if (categoryType === 'per-level') {
    // Category is marked as per-level, so it's an Individual Level run
    leaderboardType = 'individual-level';
  } else if (categoryType === 'per-game') {
    // Category is marked as per-game, so it's a Full Game run (even if it has a level field)
    leaderboardType = 'regular';
  } else if (hasLevel) {
    // No category type info, but run has a valid level ID - treat as Individual Level
    leaderboardType = 'individual-level';
  } else {
    // No level and no category type info, default to Full Game
    leaderboardType = 'regular';
  }
  
  
  // Convert time
  const time = run.times.primary ? isoDurationToTime(run.times.primary) : 
               run.times.primary_t ? secondsToTime(run.times.primary_t) : "00:00:00";
  
  // Get video URL
  const videoUrl = run.videos?.links?.[0]?.uri || undefined;
  
  // Convert date
  const date = run.date ? run.date.split('T')[0] : new Date().toISOString().split('T')[0];
  
  return {
    playerId: defaultPlayerId,
    playerName: player1Name,
    player2Name,
    category: ourCategoryId,
    platform: ourPlatformId,
    runType,
    leaderboardType,
    level: ourLevelId,
    time,
    date,
    videoUrl,
    comment: run.comment || undefined,
    verified: false, // Imported runs start as unverified
    importedFromSRC: true,
    srcRunId: run.id,
    // Store SRC names as fallback for display when ID mapping fails
    srcCategoryName: finalCategoryName || undefined,
    srcPlatformName: finalPlatformName || undefined,
    srcLevelName: finalLevelName || undefined,
  };
}

