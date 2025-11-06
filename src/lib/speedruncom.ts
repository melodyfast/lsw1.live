/**
 * Speedrun.com API integration utilities
 * https://github.com/speedruncomorg/api
 */

const SPEEDRUNCOM_API_BASE = "https://www.speedrun.com/api/v1";

/**
 * Generic API fetch helper with error handling
 */
async function fetchSRCAPI<T>(endpoint: string): Promise<T> {
  try {
    const response = await fetch(`${SPEEDRUNCOM_API_BASE}${endpoint}`);
    if (!response.ok) {
      throw new Error(`SRC API error: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error);
    throw error;
  }
}

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
    const data = await fetchSRCAPI<{ data: SRCGame[] }>("/games?name=LEGO%20Star%20Wars&abbreviation=lsw");
    if (data.data && data.data.length > 0) {
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
 * Uses pagination to fetch up to 500 runs (configurable limit)
 */
export async function fetchRunsNotOnLeaderboards(
  gameId: string, 
  limit: number = 500
): Promise<SRCRun[]> {
  const allRuns: SRCRun[] = [];
  let offset = 0;
  const max = 200; // SRC API max per request
  
  while (allRuns.length < limit) {
    // Embed platform in system field - SRC API embeds platform when requested
    const data = await fetchSRCAPI<SRCRunData>(
      `/runs?game=${gameId}&status=verified&orderby=submitted&direction=desc&max=${max}&offset=${offset}&embed=players,category,level,platform`
    );
    
    // Log first run's platform structure for debugging
    if (allRuns.length === 0 && data.data && data.data.length > 0) {
      const firstRun = data.data[0];
      console.log('[SRC API] First run platform structure:', {
        hasSystem: !!firstRun.system,
        hasPlatform: !!firstRun.system?.platform,
        platformType: typeof firstRun.system?.platform,
        platformValue: firstRun.system?.platform,
        platformIsObject: typeof firstRun.system?.platform === 'object',
        platformData: firstRun.system?.platform,
      });
    }
    
    if (!data.data || data.data.length === 0) {
      break;
    }
    
    allRuns.push(...data.data);
    offset += data.data.length;
    
    // Check pagination limits
    if (data.data.length < max || (data.pagination && offset >= data.pagination.max)) {
      break;
    }
  }
  
  return allRuns.slice(0, limit);
}


/**
 * Fetch all categories for a game
 */
export async function fetchCategories(gameId: string): Promise<SRCCategory[]> {
  try {
    const data = await fetchSRCAPI<{ data: SRCCategory[] }>(`/games/${gameId}/categories`);
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
    const data = await fetchSRCAPI<{ data: SRCLevel[] }>(`/games/${gameId}/levels`);
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
    const data = await fetchSRCAPI<{ data: SRCPlatform[] }>("/platforms");
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
  
  // Check for direct name field first (guest runs - these are anonymous/unregistered players)
  if (player.name) {
    return String(player.name).trim();
  }
  
  // Check embedded data (registered users)
  if (player.data?.names?.international) {
    return String(player.data.names.international).trim();
  }
  
  // Check if player has an ID but no name (registered user without embedded data)
  // This shouldn't happen with proper embedding, but handle it gracefully
  if (player.id) {
    // Could try to fetch name, but for now return a placeholder
    return `Player ${player.id}`;
  }
  
  // Last resort
  return "Unknown";
}

/**
 * Extract ID and name from embedded resource or string
 * Handles various SRC API response structures
 * Returns both ID and name in one pass for efficiency
 * 
 * SRC API with embed returns: { data: { id: "...", name: "..." } }
 * SRC API without embed returns: string (just the ID)
 */
export function extractIdAndName(
  value: string | { data: { id?: string; name?: string; names?: { international?: string } } } | { data: Array<{ id?: string; name?: string; names?: { international?: string } }> } | undefined
): { id: string; name: string } {
  if (!value) return { id: "", name: "" };
  
  // Handle string (ID only - no embed)
  if (typeof value === "string") {
    return { id: value.trim(), name: "" };
  }
  
  // Handle single embedded object: { data: { id: "...", name: "..." } }
  if (value.data && !Array.isArray(value.data)) {
    const data = value.data;
    const id = data.id ? String(data.id).trim() : "";
    let name = "";
    
    // Try name first (direct field) - platforms and categories use this
    if (data.name && typeof data.name === 'string') {
      name = String(data.name).trim();
    } 
    // Fall back to names.international (for some API structures)
    else if (data.names?.international && typeof data.names.international === 'string') {
      name = String(data.names.international).trim();
    }
    // Also check for names object with different structure
    else if (data.names && typeof data.names === 'object') {
      // Try to find any name-like property
      const nameKeys = Object.keys(data.names).filter(k => 
        typeof (data.names as any)[k] === 'string' && (data.names as any)[k]
      );
      if (nameKeys.length > 0) {
        name = String((data.names as any)[nameKeys[0]]).trim();
      }
    }
    
    return { id, name };
  }
  
  // Handle array of embedded objects: { data: [{ id: "...", name: "..." }] }
  if (Array.isArray(value.data) && value.data.length > 0) {
    const first = value.data[0];
    const id = first.id ? String(first.id).trim() : "";
    let name = "";
    
    if (first.name && typeof first.name === 'string') {
      name = String(first.name).trim();
    } else if (first.names?.international && typeof first.names.international === 'string') {
      name = String(first.names.international).trim();
    }
    
    return { id, name };
  }
  
  return { id: "", name: "" };
}

/**
 * Extract ID from embedded resource or string (legacy helper)
 */
function extractId(value: string | { data: { id: string } } | { data: Array<{ id: string }> } | undefined): string {
  return extractIdAndName(value).id;
}

/**
 * Extract name from embedded resource (legacy helper)
 */
function extractName(value: string | { data: { name?: string; names?: { international?: string } } } | { data: Array<{ name?: string; names?: { international?: string } }> } | undefined): string {
  return extractIdAndName(value).name;
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
  
  // Ensure player names are strings and not empty
  if (typeof player1Name !== 'string' || !player1Name || player1Name.trim() === '') {
    player1Name = 'Unknown';
  } else {
    player1Name = player1Name.trim();
  }
  if (player2Name) {
    if (typeof player2Name !== 'string' || !player2Name || player2Name.trim() === '') {
      player2Name = undefined;
    } else {
      player2Name = player2Name.trim();
    }
  }
  
  // Determine run type
  const runType: 'solo' | 'co-op' = players.length > 1 ? 'co-op' : 'solo';
  
  // Extract and map category - use unified extraction
  const categoryData = extractIdAndName(run.category);
  let ourCategoryId = categoryMapping.get(categoryData.id);
  if (!ourCategoryId && categoryData.name && categoryNameMapping) {
    ourCategoryId = categoryNameMapping.get(categoryData.name.toLowerCase().trim());
  }
  const finalCategoryName = categoryData.name || undefined;
  
  // Extract and map platform - use unified extraction
  const platformData = extractIdAndName(run.system?.platform);
  let ourPlatformId = platformMapping.get(platformData.id);
  if (!ourPlatformId && platformData.name && platformNameMapping) {
    ourPlatformId = platformNameMapping.get(platformData.name.toLowerCase().trim());
  }
  const finalPlatformName = platformData.name || undefined;
  
  // Extract and map level - use unified extraction
  const levelData = extractIdAndName(run.level);
  let ourLevelId = levelData.id ? levelMapping.get(levelData.id) : undefined;
  const finalLevelName = levelData.name || undefined;
  
  // Normalize IDs (use empty string if mapping failed - SRC names will be used for display)
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
  const levelId = extractIdAndName(run.level).id;
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

