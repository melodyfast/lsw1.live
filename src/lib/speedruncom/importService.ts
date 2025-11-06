/**
 * Speedrun.com Import Service
 * Simplified, robust import system based on SRC API best practices
 */

import { 
  getLSWGameId, 
  fetchRunsNotOnLeaderboards,
  mapSRCRunToLeaderboardEntry,
  fetchCategories as fetchSRCCategories,
  fetchLevels as fetchSRCLevels,
  fetchPlatformById,
  type SRCRun,
} from "../speedruncom";
import { 
  getCategoriesFromFirestore,
  getPlatformsFromFirestore,
  getLevels,
  getAllRunsForDuplicateCheck,
  addLeaderboardEntry,
  getPlayerByDisplayName,
} from "../db";
import { LeaderboardEntry } from "@/types/database";

export interface ImportResult {
  imported: number;
  skipped: number;
  unmatchedPlayers: Map<string, { player1?: string; player2?: string }>;
  errors: string[];
}

export interface ImportProgress {
  total: number;
  imported: number;
  skipped: number;
}

/**
 * SRC Mappings - stores all ID and name mappings between SRC and local data
 */
interface SRCMappings {
  // ID mappings: SRC ID -> Local ID
  categoryMapping: Map<string, string>;
  platformMapping: Map<string, string>;
  levelMapping: Map<string, string>;
  
  // Name mappings: SRC name (lowercase) -> Local ID
  categoryNameMapping: Map<string, string>;
  platformNameMapping: Map<string, string>;
  
  // SRC ID -> SRC name (for fallback when embedded data is missing)
  srcPlatformIdToName: Map<string, string>;
  srcCategoryIdToName: Map<string, string>;
  srcLevelIdToName: Map<string, string>;
}

// Cache for player and platform names fetched from API during import
// This prevents duplicate API calls for the same ID
const playerIdToNameCache = new Map<string, string>();
const platformIdToNameCache = new Map<string, string>();

/**
 * Extract platform ID and name from SRC run data
 * Handles embedded platform data or string ID
 */
function extractPlatformFromRun(run: SRCRun): { id: string; name: string } | null {
  const platform = run.system?.platform;
  if (!platform) return null;

  // If it's a string ID, we'll need to fetch it later
  if (typeof platform === 'string') {
    return { id: platform, name: '' };
  }

  // If it's embedded data
  if (platform.data) {
    const platformData = platform.data;
    const id = platformData.id || '';
    const name = platformData.names?.international || platformData.name || '';
    return { id, name };
  }

  return null;
}

/**
 * Create mapping between SRC IDs and our IDs for categories, platforms, and levels
 * Only fetches platforms that are actually used in the runs being imported
 */
export async function createSRCMappings(srcRuns: SRCRun[]): Promise<SRCMappings> {
  // Validate input
  if (!Array.isArray(srcRuns)) {
    throw new Error("srcRuns must be an array");
  }

  const gameId = await getLSWGameId();
  if (!gameId) {
    throw new Error("Could not find LEGO Star Wars game on speedrun.com");
  }

  // Fetch our local data and SRC game-specific data
  const [ourCategories, ourPlatforms, ourLevels, srcCategories, srcLevels] = await Promise.all([
    getCategoriesFromFirestore(),
    getPlatformsFromFirestore(),
    getLevels(),
    fetchSRCCategories(gameId),
    fetchSRCLevels(gameId),
  ]);

  // Ensure all results are arrays
  const safeSrcCategories = Array.isArray(srcCategories) ? srcCategories : [];
  const safeSrcLevels = Array.isArray(srcLevels) ? srcLevels : [];
  const safeOurCategories = Array.isArray(ourCategories) ? ourCategories : [];
  const safeOurPlatforms = Array.isArray(ourPlatforms) ? ourPlatforms : [];
  const safeOurLevels = Array.isArray(ourLevels) ? ourLevels : [];

  // Extract unique platform IDs/names from runs (only LSW1 platforms)
  const uniquePlatforms = new Map<string, { id: string; name: string }>();
  
  // Safely iterate through runs
  const safeSrcRuns = Array.isArray(srcRuns) ? srcRuns : [];
  for (const run of safeSrcRuns) {
    if (!run || typeof run !== 'object') {
      console.warn("[createSRCMappings] Skipping invalid run:", run);
      continue;
    }
    const platformData = extractPlatformFromRun(run);
    if (platformData && platformData.id) {
      // If we already have this platform ID, skip
      if (uniquePlatforms.has(platformData.id)) {
        continue;
      }
      
      // If we have a name from embedded data, use it
      if (platformData.name) {
        uniquePlatforms.set(platformData.id, platformData);
      } else {
        // Store ID only, we'll fetch the name later
        uniquePlatforms.set(platformData.id, { id: platformData.id, name: '' });
      }
    }
  }

  // Fetch platform names for any platforms we only have IDs for
  const platformsToFetch = Array.from(uniquePlatforms.values()).filter(p => !p.name && p.id);
  const platformFetchPromises = platformsToFetch.map(async (platform) => {
    try {
      const name = await fetchPlatformById(platform.id);
      if (name) {
        uniquePlatforms.set(platform.id, { id: platform.id, name });
      }
    } catch (error) {
      console.warn(`[SRC Mapping] Failed to fetch platform ${platform.id}:`, error);
    }
  });

  if (platformFetchPromises.length > 0) {
    await Promise.all(platformFetchPromises);
  }

  // Initialize mappings
  const categoryMapping = new Map<string, string>();
  const platformMapping = new Map<string, string>();
  const levelMapping = new Map<string, string>();
  const categoryNameMapping = new Map<string, string>();
  const platformNameMapping = new Map<string, string>();
  const srcPlatformIdToName = new Map<string, string>();
  const srcCategoryIdToName = new Map<string, string>();
  const srcLevelIdToName = new Map<string, string>();

  // Helper: normalize for comparison
  const normalize = (str: string) => str.toLowerCase().trim();

  // Map categories
  for (const srcCat of safeSrcCategories) {
    if (!srcCat || !srcCat.name || !srcCat.id) continue;
    
    // Store SRC ID -> name mapping
    srcCategoryIdToName.set(srcCat.id, srcCat.name);
    
    // Find matching local category
    const ourCat = safeOurCategories.find(c => c && normalize(c.name) === normalize(srcCat.name));
    if (ourCat) {
      categoryMapping.set(srcCat.id, ourCat.id);
      categoryNameMapping.set(normalize(srcCat.name), ourCat.id);
    }
  }

  // Map platforms (only those used in LSW1 runs)
  for (const [platformId, platformData] of uniquePlatforms) {
    const platformName = platformData?.name;
    if (!platformName) {
      console.warn(`[SRC Mapping] Platform ${platformId} has no name`);
      continue;
    }
    
    // Store SRC ID -> name mapping (critical for fallback)
    srcPlatformIdToName.set(platformId, platformName);
    
    // Find matching local platform
    const ourPlatform = safeOurPlatforms.find(p => p && normalize(p.name) === normalize(platformName));
    if (ourPlatform) {
      platformMapping.set(platformId, ourPlatform.id);
      platformNameMapping.set(normalize(platformName), ourPlatform.id);
    } else {
      console.log(`[SRC Mapping] Platform "${platformName}" (ID: ${platformId}) not found locally`);
    }
  }

  console.log(`[SRC Mapping] Created ${srcPlatformIdToName.size} platform ID->name mappings (from ${srcRuns.length} LSW1 runs)`);

  // Map levels
  for (const srcLevel of safeSrcLevels) {
    if (!srcLevel || !srcLevel.id) continue;
    
    const levelName = srcLevel.name || srcLevel.names?.international || '';
    if (!levelName) continue;
    
    // Store SRC ID -> name mapping
    srcLevelIdToName.set(srcLevel.id, levelName);
    
    // Find matching local level
    const ourLevel = safeOurLevels.find(l => l && normalize(l.name) === normalize(levelName));
    if (ourLevel) {
      levelMapping.set(srcLevel.id, ourLevel.id);
    }
  }

  return {
    categoryMapping,
    platformMapping,
    levelMapping,
    categoryNameMapping,
    platformNameMapping,
    srcPlatformIdToName,
    srcCategoryIdToName,
    srcLevelIdToName,
  };
}

/**
 * Check if a run is a duplicate based on run data
 */
function isDuplicateRun(
  run: Partial<LeaderboardEntry>,
  existingRunKeys: Set<string>
): boolean {
  const normalizeName = (name: string) => name.trim().toLowerCase();
  const player1Name = normalizeName(run.playerName || '');
  const player2Name = run.player2Name ? normalizeName(run.player2Name) : '';
  
  // Create run key: player1|player2|category|platform|runType|time|leaderboardType|level
  const runKey = `${player1Name}|${player2Name}|${run.category || ''}|${run.platform || ''}|${run.runType || 'solo'}|${run.time || ''}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
  
  if (existingRunKeys.has(runKey)) {
    return true;
  }

  // For co-op runs, also check swapped players
  if (run.runType === 'co-op' && player2Name) {
    const swappedKey = `${player2Name}|${player1Name}|${run.category || ''}|${run.platform || ''}|${run.runType || 'co-op'}|${run.time || ''}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
    if (existingRunKeys.has(swappedKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate a mapped run before importing
 * Returns validation errors if any
 */
function validateMappedRun(
  run: Partial<LeaderboardEntry> & { srcRunId: string },
  srcRunId: string
): string[] {
  const errors: string[] = [];

  // Essential fields
  if (!run.playerName || run.playerName.trim() === '') {
    errors.push('missing player name');
  }

  if (!run.time || run.time.trim() === '') {
    errors.push('missing time');
  } else if (!/^\d{1,2}:\d{2}:\d{2}$/.test(run.time)) {
    errors.push(`invalid time format "${run.time}" (expected HH:MM:SS)`);
  }

  if (!run.date || run.date.trim() === '') {
    errors.push('missing date');
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(run.date)) {
    errors.push(`invalid date format "${run.date}" (expected YYYY-MM-DD)`);
  }

  // Category must be mapped (we only import runs with matching categories)
  if (!run.category || run.category.trim() === '') {
    errors.push(`category "${run.srcCategoryName || 'Unknown'}" not found on leaderboards`);
  }

  // Platform validation - allow empty if SRC name exists
  if (!run.platform && !run.srcPlatformName) {
    errors.push('missing platform');
  }

  // Run type must be valid
  if (run.runType && run.runType !== 'solo' && run.runType !== 'co-op') {
    errors.push(`invalid run type "${run.runType}"`);
  }

  // Leaderboard type must be valid
  if (run.leaderboardType && 
      run.leaderboardType !== 'regular' && 
      run.leaderboardType !== 'individual-level' && 
      run.leaderboardType !== 'community-golds') {
    errors.push(`invalid leaderboard type "${run.leaderboardType}"`);
  }

  // For IL/Community Golds, level should be present if category requires it
  if ((run.leaderboardType === 'individual-level' || run.leaderboardType === 'community-golds') && 
      !run.level && !run.srcLevelName) {
    errors.push('missing level for individual level run');
  }

  // For co-op, player2Name should be present
  // Allow "Unknown" as a placeholder (admin can fix later)
  if (run.runType === 'co-op') {
    if (!run.player2Name || (run.player2Name.trim() === '' && run.player2Name !== 'Unknown')) {
      errors.push('missing player 2 name for co-op run');
    }
  }

  return errors;
}

/**
 * Import runs from speedrun.com
 * Simplified, robust implementation with clear error handling
 */
export async function importSRCRuns(
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    unmatchedPlayers: new Map(),
    errors: [],
  };

  try {
    // Step 1: Get game ID
    const gameId = await getLSWGameId();
    if (!gameId) {
      result.errors.push("Could not find LEGO Star Wars game on speedrun.com");
      return result;
    }

    // Step 2: Fetch runs from SRC
    let srcRuns: SRCRun[];
    try {
      srcRuns = await fetchRunsNotOnLeaderboards(gameId, 500);
    } catch (error) {
      result.errors.push(`Failed to fetch runs: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }

    if (srcRuns.length === 0) {
      result.errors.push("No runs found to import");
      return result;
    }

    // Step 3: Create mappings (only for platforms used in these runs)
    let mappings: SRCMappings;
    try {
      mappings = await createSRCMappings(srcRuns);
    } catch (error) {
      result.errors.push(`Failed to create mappings: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }

    // Step 4: Get existing runs for duplicate checking
    let existingRuns: LeaderboardEntry[];
    try {
      existingRuns = await getAllRunsForDuplicateCheck();
    } catch (error) {
      result.errors.push(`Failed to fetch existing runs: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }

    // Build sets for duplicate checking
    const existingSRCRunIds = new Set(
      existingRuns.filter(r => r.srcRunId).map(r => r.srcRunId!)
    );

    const normalizeName = (name: string) => name.trim().toLowerCase();
    const existingRunKeys = new Set<string>();
    for (const run of existingRuns.filter(r => r.verified)) {
      const player1Name = normalizeName(run.playerName);
      const player2Name = run.player2Name ? normalizeName(run.player2Name) : '';
      const key = `${player1Name}|${player2Name}|${run.category || ''}|${run.platform || ''}|${run.runType || 'solo'}|${run.time || ''}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
      existingRunKeys.add(key);
      
      // For co-op runs, also add swapped key
      if (run.runType === 'co-op' && player2Name) {
        const swappedKey = `${player2Name}|${player1Name}|${run.category || ''}|${run.platform || ''}|${run.runType || 'co-op'}|${run.time || ''}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
        existingRunKeys.add(swappedKey);
      }
    }

    onProgress?.({ total: srcRuns.length, imported: 0, skipped: 0 });

    // Step 5: Process each run
    for (const srcRun of srcRuns) {
      try {
        // Skip if already imported
        if (existingSRCRunIds.has(srcRun.id)) {
          result.skipped++;
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
          continue;
        }

        // Map SRC run to our format (now async to support fetching names from API)
        let mappedRun: Partial<LeaderboardEntry> & { srcRunId: string; importedFromSRC: boolean };
        try {
          mappedRun = await mapSRCRunToLeaderboardEntry(
            srcRun,
            undefined,
            mappings.categoryMapping,
            mappings.platformMapping,
            mappings.levelMapping,
            "imported",
            mappings.categoryNameMapping,
            mappings.platformNameMapping,
            mappings.srcPlatformIdToName,
            mappings.srcCategoryIdToName,
            mappings.srcLevelIdToName,
            playerIdToNameCache,
            platformIdToNameCache
          );
        } catch (mapError) {
          result.skipped++;
          result.errors.push(`Run ${srcRun.id}: mapping failed: ${mapError instanceof Error ? mapError.message : String(mapError)}`);
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
          continue;
        }

        // Set import metadata
        mappedRun.importedFromSRC = true;
        mappedRun.srcRunId = srcRun.id;
        mappedRun.verified = false;

        // Ensure required fields have defaults
        if (!mappedRun.runType) mappedRun.runType = 'solo';
        if (!mappedRun.leaderboardType) mappedRun.leaderboardType = 'regular';
        if (!mappedRun.playerName || mappedRun.playerName.trim() === '') {
          mappedRun.playerName = 'Unknown';
        }

        // Validate the mapped run
        const validationErrors = validateMappedRun(mappedRun, srcRun.id);
        if (validationErrors.length > 0) {
          result.skipped++;
          result.errors.push(`Run ${srcRun.id}: ${validationErrors.join(', ')}`);
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
          continue;
        }

        // Handle platform - allow empty if SRC name exists
        if (!mappedRun.platform || mappedRun.platform.trim() === '') {
          if (!mappedRun.srcPlatformName) {
            mappedRun.platform = '';
            mappedRun.srcPlatformName = 'Unknown Platform (from SRC)';
            result.errors.push(`Run ${srcRun.id}: missing platform (using placeholder)`);
          } else {
            mappedRun.platform = '';
          }
        }

        // Normalize player names
        mappedRun.playerName = mappedRun.playerName.trim();
        
        // For co-op runs, preserve player2Name even if it's "Unknown"
        if (mappedRun.runType === 'co-op') {
          if (mappedRun.player2Name) {
            mappedRun.player2Name = mappedRun.player2Name.trim() || "Unknown";
          } else {
            mappedRun.player2Name = "Unknown";
          }
        } else {
          // For solo runs, clear player2Name
          mappedRun.player2Name = undefined;
        }

        // Check for duplicates
        if (isDuplicateRun(mappedRun, existingRunKeys)) {
          result.skipped++;
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
          continue;
        }

        // Check player matching (for warnings, doesn't block import)
        const player1Matched = await getPlayerByDisplayName(mappedRun.playerName);
        const player2Matched = mappedRun.player2Name ? await getPlayerByDisplayName(mappedRun.player2Name) : null;

        const unmatched: { player1?: string; player2?: string } = {};
        if (!player1Matched) unmatched.player1 = mappedRun.playerName;
        if (mappedRun.player2Name && !player2Matched) unmatched.player2 = mappedRun.player2Name;

        // Save to database
        try {
          const addedRunId = await addLeaderboardEntry(mappedRun as LeaderboardEntry);
          if (!addedRunId) {
            result.skipped++;
            result.errors.push(`Run ${srcRun.id}: failed to save to database`);
            onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
            continue;
          }

          // Track unmatched players
          if (unmatched.player1 || unmatched.player2) {
            result.unmatchedPlayers.set(addedRunId, unmatched);
          }

          // Add to existing keys to prevent batch duplicates
          const player1Name = normalizeName(mappedRun.playerName);
          const player2Name = mappedRun.player2Name ? normalizeName(mappedRun.player2Name) : '';
          const runKey = `${player1Name}|${player2Name}|${mappedRun.category || ''}|${mappedRun.platform || ''}|${mappedRun.runType || 'solo'}|${mappedRun.time || ''}|${mappedRun.leaderboardType || 'regular'}|${mappedRun.level || ''}`;
          existingRunKeys.add(runKey);

          result.imported++;
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });

        } catch (addError: any) {
          result.skipped++;
          const errorMsg = addError?.message || String(addError);
          result.errors.push(`Run ${srcRun.id}: ${errorMsg}`);
          console.error(`Failed to save run ${srcRun.id}:`, addError);
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
        }

      } catch (error) {
        // Catch any unexpected errors processing this run
        result.skipped++;
        result.errors.push(`Run ${srcRun.id}: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`Error processing run ${srcRun.id}:`, error);
        onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
      }
    }

    return result;
  } catch (error) {
    // Catch any unexpected top-level errors
    result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Import error:", error);
    return result;
  }
}
