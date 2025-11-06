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
  name?: string;
  names?: {
    international?: string;
    [key: string]: string | undefined;
  };
  weblink: string;
}

export interface SRCPlatform {
  id: string;
  name?: string;
  names?: {
    international?: string;
    [key: string]: string | undefined;
  };
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
  
  try {
    while (allRuns.length < limit) {
      // Embed platform in system field - SRC API embeds platform when requested
      let data: SRCRunData;
      try {
        data = await fetchSRCAPI<SRCRunData>(
          `/runs?game=${gameId}&status=verified&orderby=submitted&direction=desc&max=${max}&offset=${offset}&embed=players,category,level,platform`
        );
      } catch (error) {
        console.error(`[SRC API] Error fetching runs at offset ${offset}:`, error);
        // If we have some runs, return what we have; otherwise throw
        if (allRuns.length > 0) {
          console.warn(`[SRC API] Returning ${allRuns.length} runs despite error`);
          return allRuns.slice(0, limit);
        }
        throw error;
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
  } catch (error) {
    console.error(`[SRC API] Error in fetchRunsNotOnLeaderboards:`, error);
    throw error;
  }
}

/**
 * Fetch a single run by ID from speedrun.com
 * Useful for getting full run details when editing imported runs
 */
export async function fetchSRCRunById(runId: string): Promise<SRCRun | null> {
  try {
    const data = await fetchSRCAPI<{ data: SRCRun }>(
      `/runs/${runId}?embed=players,category,level,platform`
    );
    return data.data || null;
  } catch (error) {
    console.error(`Error fetching SRC run ${runId}:`, error);
    return null;
  }
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
 * Fetch a single platform by ID from speedrun.com
 * Returns the platform name (from names.international)
 */
export async function fetchPlatformById(platformId: string): Promise<string | null> {
  try {
    const data = await fetchSRCAPI<{ data: SRCPlatform }>(`/platforms/${platformId}`);
    if (data.data) {
      return data.data.names?.international || data.data.name || null;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching platform ${platformId}:`, error);
    return null;
  }
}

/**
 * Fetch a single player by ID from speedrun.com
 * Returns the player's username (from names.international)
 */
export async function fetchPlayerById(playerId: string): Promise<string | null> {
  try {
    const endpoint = `/users/${playerId}`;
    const data = await fetchSRCAPI<{ data: SRCPlayer }>(endpoint);
    
    if (!data || !data.data) {
      console.warn(`[fetchPlayerById] No data returned for player ${playerId}`);
      return null;
    }
    
    const player = data.data;
    const name = player.names?.international || null;
    
    if (!name) {
      console.warn(`[fetchPlayerById] Player ${playerId} has no names.international:`, {
        player,
        names: player.names,
        hasNames: !!player.names,
      });
    }
    
    return name;
  } catch (error: any) {
    // Log more details about the error
    const errorMessage = error?.message || String(error);
    const errorStatus = error?.status || error?.statusCode || 'unknown';
    console.error(`[fetchPlayerById] Error fetching player ${playerId}:`, {
      error: errorMessage,
      status: errorStatus,
      endpoint: `/users/${playerId}`,
      fullError: error,
    });
    return null;
  }
}

/**
 * Get player name from embedded player data
 * Handles various SRC API response structures per SRC API documentation
 * If only ID is available, can optionally fetch from API (async version available)
 */
export function getPlayerName(player: SRCRun['players'][0]): string {
  if (!player) return "";
  
  // Guest runs (rel: "guest") have direct name field (anonymous/unregistered players)
  if (player.rel === "guest" && player.name && typeof player.name === 'string' && player.name.trim()) {
    return String(player.name).trim();
  }
  
  // Registered users (rel: "user") have embedded data: player.data.names.international
  if (player.rel === "user" && player.data?.names?.international && typeof player.data.names.international === 'string') {
    const name = String(player.data.names.international).trim();
    if (name) return name;
  }
  
  // Fallback: check other name fields
  if (player.data?.name && typeof player.data.name === 'string' && player.data.name.trim()) {
    return String(player.data.name).trim();
  }
  
  // If we have an ID but no name, return empty string to signal we need to fetch
  // The async version will handle fetching
  if (player.id && player.rel === "user") {
    return ""; // Return empty string to signal we need to fetch
  }
  
  // If it's a guest without a name, return empty
  if (player.rel === "guest") {
    return "";
  }
  
  return "";
}

/**
 * Get player name from embedded player data, with async API fetch fallback
 * Fetches player name from SRC API if embedded data is missing
 */
export async function getPlayerNameAsync(
  player: SRCRun['players'][0],
  playerIdToNameCache?: Map<string, string>
): Promise<string> {
  if (!player) {
    console.warn("[getPlayerNameAsync] No player data provided");
    return "Unknown";
  }
  
  // Log player structure for debugging (first few calls only)
  const debugLog = playerIdToNameCache && playerIdToNameCache.size < 3;
  if (debugLog) {
    console.log("[getPlayerNameAsync] Player data:", {
      rel: player.rel,
      id: player.id,
      name: player.name,
      hasData: !!player.data,
      dataNames: player.data?.names,
      dataName: player.data?.name,
    });
  }
  
  // Guest players (rel: "guest") have name field directly
  if (player.rel === "guest") {
    if (player.name && typeof player.name === 'string' && player.name.trim()) {
      return String(player.name).trim();
    }
    // Guest without name - return placeholder
    return "Guest Player";
  }
  
  // If player has direct name field (sometimes present even for registered users)
  if (player.name && typeof player.name === 'string' && player.name.trim()) {
    return String(player.name).trim();
  }
  
  // Try synchronous extraction first (handles embedded data)
  const syncName = getPlayerName(player);
  if (syncName && syncName !== "") {
    if (debugLog) {
      console.log(`[getPlayerNameAsync] Found name from sync extraction: "${syncName}"`);
    }
    return syncName;
  }
  
  // For registered users, if we have an ID but no name, fetch from API
  // Registered users have rel: "user" or just an ID without rel
  // Extract player ID - could be in player.id or player.data.id
  let playerId: string | undefined;
  if (player.id && typeof player.id === 'string' && player.id.trim()) {
    playerId = player.id.trim();
  } else if (player.data?.id && typeof player.data.id === 'string' && player.data.id.trim()) {
    playerId = player.data.id.trim();
  }
  
  if (playerId) {
    // Check cache first
    if (playerIdToNameCache?.has(playerId)) {
      const cachedName = playerIdToNameCache.get(playerId)!;
      if (cachedName && cachedName.trim()) {
        if (debugLog) {
          console.log(`[getPlayerNameAsync] Found cached name for ${playerId}: "${cachedName}"`);
        }
        return cachedName;
      }
    }
    
    // Fetch from API
    if (debugLog) {
      console.log(`[getPlayerNameAsync] Fetching player ${playerId} from SRC API...`);
    }
    try {
      const name = await fetchPlayerById(playerId);
      if (name && name.trim()) {
        // Cache it
        playerIdToNameCache?.set(playerId, name);
        if (debugLog) {
          console.log(`[getPlayerNameAsync] Successfully fetched name for ${playerId}: "${name}"`);
        }
        return name;
      } else {
        if (debugLog) {
          console.warn(`[getPlayerNameAsync] fetchPlayerById returned null/empty for ${playerId}`);
        }
      }
    } catch (error) {
      console.error(`[getPlayerNameAsync] Failed to fetch player ${playerId}:`, error);
    }
    
    // Last resort: return placeholder with ID (better than "Unknown")
    return `Player ${playerId}`;
  }
  
  // If we have no ID and no name, log it for debugging
  if (debugLog) {
    console.warn("[getPlayerNameAsync] No player ID or name found:", player);
  }
  
  return "Unknown";
}

/**
 * Extract ID and name from embedded resource or string
 * Handles SRC API response structures: embedded { data: { ... } } or plain string ID
 */
export function extractIdAndName(
  value: string | { data: { id?: string; name?: string; names?: { international?: string } } } | { data: Array<{ id?: string; name?: string; names?: { international?: string } }> } | undefined
): { id: string; name: string } {
  if (!value) return { id: "", name: "" };
  
  // Plain string = ID only (no embed)
  if (typeof value === "string") {
    return { id: value.trim(), name: "" };
  }
  
  // Embedded object: { data: { id, name } } or { data: { id, names: { international } } }
  if (value.data && !Array.isArray(value.data)) {
    const data = value.data;
    const id = data.id ? String(data.id).trim() : "";
    
    // Try direct name field first (categories use this)
    if (data.name && typeof data.name === 'string' && data.name.trim()) {
      return { id, name: String(data.name).trim() };
    }
    
    // Try names.international (platforms use this)
    if (data.names?.international && typeof data.names.international === 'string' && data.names.international.trim()) {
      return { id, name: String(data.names.international).trim() };
    }
    
    return { id, name: "" };
  }
  
  // Embedded array: { data: [{ id, name }] }
  if (Array.isArray(value.data) && value.data.length > 0) {
    const first = value.data[0];
    const id = first.id ? String(first.id).trim() : "";
    
    if (first.name && typeof first.name === 'string' && first.name.trim()) {
      return { id, name: String(first.name).trim() };
    }
    
    if (first.names?.international && typeof first.names.international === 'string' && first.names.international.trim()) {
      return { id, name: String(first.names.international).trim() };
    }
    
    return { id, name: "" };
  }
  
  return { id: "", name: "" };
}

/**
 * Extract platform name from various SRC API structures
 * Platforms use names.international, not name field
 */
function extractPlatformName(platform: string | { data: SRCPlatform } | undefined, fallbackMap?: Map<string, string>): string {
  if (!platform) return "";
  
  // If it's a string ID, try fallback map
  if (typeof platform === "string") {
    return fallbackMap?.get(platform) || "";
  }
  
  // Embedded: { data: SRCPlatform }
  if (platform.data) {
    return platform.data.names?.international || platform.data.name || "";
  }
  
  // Direct platform object (rare)
  if ('names' in platform) {
    return (platform as any).names?.international || (platform as any).name || "";
  }
  
  return "";
}

/**
 * Extract platform name with async API fetch fallback
 * Fetches platform name from SRC API if embedded data is missing
 */
async function extractPlatformNameAsync(
  platform: string | { data: SRCPlatform } | undefined,
  fallbackMap?: Map<string, string>,
  platformIdToNameCache?: Map<string, string>
): Promise<string> {
  if (!platform) return "";
  
  // Try synchronous extraction first
  const syncName = extractPlatformName(platform, fallbackMap);
  if (syncName) {
    return syncName;
  }
  
  // If it's a string ID and we don't have it, try to fetch
  if (typeof platform === "string") {
    const platformId = platform.trim();
    if (!platformId) return "";
    
    // Check cache first
    if (platformIdToNameCache?.has(platformId)) {
      return platformIdToNameCache.get(platformId)!;
    }
    
    // Fetch from API
    try {
      const name = await fetchPlatformById(platformId);
      if (name) {
        // Cache it
        platformIdToNameCache?.set(platformId, name);
        return name;
      }
    } catch (error) {
      console.error(`Failed to fetch platform ${platformId}:`, error);
    }
  }
  
  return "";
}

/**
 * Map speedrun.com run to our LeaderboardEntry format
 * Simplified, cleaner implementation
 * Now supports async fetching of player and platform names when only IDs are available
 */
export async function mapSRCRunToLeaderboardEntry(
  run: SRCRun,
  embeddedData?: {
    players?: SRCPlayer[];
    category?: SRCCategory;
    level?: SRCLevel;
    platform?: SRCPlatform;
  },
  categoryMapping: Map<string, string>,
  platformMapping: Map<string, string>,
  levelMapping: Map<string, string>,
  defaultPlayerId: string = "imported",
  categoryNameMapping?: Map<string, string>,
  platformNameMapping?: Map<string, string>,
  srcPlatformIdToName?: Map<string, string>,
  srcCategoryIdToName?: Map<string, string>,
  srcLevelIdToName?: Map<string, string>,
  playerIdToNameCache?: Map<string, string>,
  platformIdToNameCache?: Map<string, string>
): Promise<Partial<import("@/types/database").LeaderboardEntry> & {
  srcRunId: string;
  importedFromSRC: boolean;
}> {
  // === Extract Players ===
  const players = run.players || [];
  
  // Log first few runs for debugging
  const debugLog = run.id && run.id.length < 20;
  if (debugLog) {
    console.log(`[mapSRCRunToLeaderboardEntry] Run ${run.id} players:`, {
      playersCount: players.length,
      players: players.map(p => ({
        rel: p.rel,
        id: p.id,
        name: p.name,
        hasData: !!p.data,
        dataNames: p.data?.names,
      })),
    });
  }
  
  // Determine run type based on player count
  const runType: 'solo' | 'co-op' = players.length > 1 ? 'co-op' : 'solo';
  
  // Use async version to fetch names if needed
  let player1Name = players[0] ? await getPlayerNameAsync(players[0], playerIdToNameCache) : "Unknown";
  let player2Name: string | undefined;
  
  if (runType === 'co-op' && players.length > 1) {
    const fetchedPlayer2Name = await getPlayerNameAsync(players[1], playerIdToNameCache);
    // For co-op runs, always set player2Name even if it's "Unknown"
    // This ensures the run passes validation
    player2Name = fetchedPlayer2Name || "Unknown";
  }
  
  if (debugLog) {
    console.log(`[mapSRCRunToLeaderboardEntry] Run ${run.id} extracted names:`, {
      player1Name,
      player2Name,
      runType,
    });
  }
  
  // Ensure we have valid names - but don't clear player2Name for co-op runs
  if (!player1Name || player1Name.trim() === "") {
    player1Name = "Unknown";
  }
  
  // For co-op runs, ensure player2Name is set (even if Unknown)
  // For solo runs, clear it
  if (runType === 'solo') {
    player2Name = undefined;
  } else if (runType === 'co-op' && (!player2Name || player2Name.trim() === "")) {
    player2Name = "Unknown";
  }
  
  // === Extract Category ===
  const categoryData = extractIdAndName(run.category);
  let ourCategoryId = categoryMapping.get(categoryData.id);
  let categoryName = categoryData.name;
  
  // Try name-based mapping if ID mapping failed
  if (!ourCategoryId && categoryName && categoryNameMapping) {
    ourCategoryId = categoryNameMapping.get(categoryName.toLowerCase().trim());
  }
  
  // Fallback to ID->name map if we don't have name yet
  if (!categoryName && categoryData.id && srcCategoryIdToName) {
    categoryName = srcCategoryIdToName.get(categoryData.id) || "";
  }
  
  // === Extract Platform ===
  const platformData = extractIdAndName(run.system?.platform);
  let ourPlatformId = platformMapping.get(platformData.id);
  let platformName = platformData.name;
  
  // Try direct extraction from embedded platform (more reliable)
  if (!platformName && run.system?.platform) {
    platformName = extractPlatformName(run.system.platform, srcPlatformIdToName);
  }
  
  // Fallback to ID->name map
  if (!platformName && platformData.id && srcPlatformIdToName) {
    platformName = srcPlatformIdToName.get(platformData.id) || "";
  }
  
  // If still no name, try async fetch from API
  if (!platformName && platformData.id && run.system?.platform) {
    platformName = await extractPlatformNameAsync(
      run.system.platform,
      srcPlatformIdToName,
      platformIdToNameCache
    );
  }
  
  // Try name-based mapping if ID mapping failed
  if (!ourPlatformId && platformName && platformNameMapping) {
    ourPlatformId = platformNameMapping.get(platformName.toLowerCase().trim());
  }
  
  // === Extract Level ===
  const levelData = extractIdAndName(run.level);
  let ourLevelId = levelData.id ? levelMapping.get(levelData.id) : undefined;
  let levelName = levelData.name;
  
  // Fallback to ID->name map
  if (!levelName && levelData.id && srcLevelIdToName) {
    levelName = srcLevelIdToName.get(levelData.id) || "";
  }
  
  // === Determine Leaderboard Type ===
  // SRC categories have type: "per-game" or "per-level"
  let leaderboardType: 'regular' | 'individual-level' = 'regular';
  
  let categoryType: "per-game" | "per-level" | undefined;
  if (typeof run.category === 'object' && run.category?.data) {
    categoryType = (run.category.data as SRCCategory).type;
  } else if (embeddedData?.category) {
    categoryType = embeddedData.category.type;
  }
  
  const hasLevel = levelData.id && levelData.id.trim() !== '';
  
  if (categoryType === 'per-level') {
    leaderboardType = 'individual-level';
  } else if (categoryType === 'per-game') {
    leaderboardType = 'regular';
  } else if (hasLevel) {
    leaderboardType = 'individual-level';
  }
  
  // === Convert Time ===
  const time = run.times.primary 
    ? isoDurationToTime(run.times.primary)
    : run.times.primary_t 
      ? secondsToTime(run.times.primary_t)
      : "00:00:00";
  
  // === Convert Date ===
  const date = run.date ? run.date.split('T')[0] : new Date().toISOString().split('T')[0];
  
  // === Extract Video URL ===
  const videoUrl = run.videos?.links?.[0]?.uri || undefined;
  
  // === Build Result ===
  return {
    playerId: defaultPlayerId,
    playerName: player1Name.trim(),
    player2Name: runType === 'solo' ? undefined : (player2Name?.trim() || 'Unknown'),
    category: ourCategoryId || '',
    platform: ourPlatformId || '',
    runType,
    leaderboardType,
    level: ourLevelId || undefined,
    time,
    date,
    videoUrl,
    comment: run.comment || undefined,
    verified: false,
    importedFromSRC: true,
    srcRunId: run.id,
    // Store SRC names as fallback for display
    srcCategoryName: categoryName || undefined,
    srcPlatformName: platformName || undefined,
    srcLevelName: levelName || undefined,
  };
}
