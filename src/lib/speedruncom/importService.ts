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
  getExistingSRCRunIds,
  addLeaderboardEntry,
  getPlayerByDisplayName,
  runAutoclaimingForAllUsers,
} from "../db";
import { LeaderboardEntry, Category } from "@/types/database";

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

// Cache for player and platform names fetched from API during import (prevents duplicate API calls)
const playerIdToNameCache = new Map<string, string>();
const platformIdToNameCache = new Map<string, string>();
// Cache for gameId to avoid redundant API calls
let cachedGameId: string | null = null;

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
export async function createSRCMappings(srcRuns: SRCRun[], gameId: string): Promise<SRCMappings> {
  if (!Array.isArray(srcRuns)) {
    throw new Error("srcRuns must be an array");
  }

  if (!gameId) {
    throw new Error("gameId is required");
  }

  // Fetch our local data and SRC game-specific data in parallel
  // Note: getLevels() fetches ALL levels across the site (both individual-level and community-golds)
  // to ensure level matching works for all leaderboard types
  const [ourCategories, ourPlatforms, ourLevels, srcCategories, srcLevels] = await Promise.all([
    getCategoriesFromFirestore(),
    getPlatformsFromFirestore(),
    getLevels(), // Fetches all levels - no filtering by leaderboard type
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
  
  for (const run of srcRuns) {
    if (!run || typeof run !== 'object') continue;
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
  // Optimize: Fetch all platforms once and cache, then look up names
  const platformsToFetch = Array.from(uniquePlatforms.values()).filter(p => !p.name && p.id);
  if (platformsToFetch.length > 0) {
    try {
      // Fetch all platforms once and create a lookup map
      const { fetchPlatforms } = await import("../speedruncom");
      const allPlatforms = await fetchPlatforms();
      const platformLookup = new Map<string, string>();
      
      for (const platform of allPlatforms) {
        const name = platform.names?.international || platform.name || '';
        if (name && platform.id) {
          platformLookup.set(platform.id, name);
        }
      }
      
      // Update uniquePlatforms with names from the lookup
      for (const platform of platformsToFetch) {
        const name = platformLookup.get(platform.id);
        if (name) {
          uniquePlatforms.set(platform.id, { id: platform.id, name });
        }
      }
    } catch (error) {
      // Fallback: Fetch platforms individually if bulk fetch fails
      const platformFetchPromises = platformsToFetch.map(async (platform) => {
        try {
          const { fetchPlatformById } = await import("../speedruncom");
          const name = await fetchPlatformById(platform.id);
          if (name) {
            uniquePlatforms.set(platform.id, { id: platform.id, name });
          }
        } catch (error) {
          // Platform fetch failed, skip this platform
        }
      });
      await Promise.all(platformFetchPromises);
    }
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
  
  // Helper: fuzzy match - removes special chars and spaces for better matching
  const fuzzyNormalize = (str: string) => normalize(str).replace(/[^a-z0-9]/g, '');
  
  // Helper: calculate similarity between two strings (simple Levenshtein-like)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    const distance = longer.split('').filter((char, i) => char !== shorter[i]).length;
    return (longer.length - distance) / longer.length;
  };

    // Map categories - match by srcCategoryId first, then by name with improved fuzzy matching
    for (const srcCat of safeSrcCategories) {
      if (!srcCat || !srcCat.name || !srcCat.id) continue;
      
      // Store SRC ID -> name mapping
      srcCategoryIdToName.set(srcCat.id, srcCat.name);
      
      // Determine leaderboardType for this SRC category
      // SRC categories have type: "per-game" or "per-level"
      const srcCategoryType = srcCat.type || 'per-game';
      const expectedLeaderboardType: 'regular' | 'individual-level' = srcCategoryType === 'per-level' ? 'individual-level' : 'regular';
      
      const normalizedSrcName = normalize(srcCat.name);
      const fuzzySrcName = fuzzyNormalize(srcCat.name);
      
      // FIRST: Try to find category by srcCategoryId (most reliable)
      let ourCat = safeOurCategories.find(c => {
        if (!c) return false;
        return (c as any).srcCategoryId === srcCat.id;
      });
      
      // SECOND: If no srcCategoryId match, try name matching with improved fuzzy matching
      if (!ourCat) {
        // Find matching local category - try exact match first, then fuzzy match
        ourCat = safeOurCategories.find(c => {
          if (!c) return false;
          const nameMatch = normalize(c.name) === normalizedSrcName;
          if (!nameMatch) return false;
          
          // Prefer match with same leaderboardType, but allow fallback
          const catType = c.leaderboardType || 'regular';
          return catType === expectedLeaderboardType;
        });
      }
    
    // Fallback 1: if no match with correct type, try any category with exact matching name
    if (!ourCat) {
      ourCat = safeOurCategories.find(c => c && normalize(c.name) === normalizedSrcName);
    }
    
    // Fallback 2: try fuzzy match (without special chars)
    if (!ourCat) {
      ourCat = safeOurCategories.find(c => {
        if (!c) return false;
        return fuzzyNormalize(c.name) === fuzzySrcName;
      });
    }
    
    // Fallback 3: try similarity-based matching (for typos/variations)
    if (!ourCat && fuzzySrcName.length > 3) {
      let bestMatch: typeof safeOurCategories[0] | undefined;
      let bestSimilarity = 0.8; // Minimum 80% similarity
      
      for (const c of safeOurCategories) {
        if (!c) continue;
        const similarity = calculateSimilarity(fuzzyNormalize(c.name), fuzzySrcName);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = c;
        }
      }
      ourCat = bestMatch;
    }
    
    if (ourCat) {
      categoryMapping.set(srcCat.id, ourCat.id);
      // Store name mapping with normalized name (for all name variations)
      categoryNameMapping.set(normalizedSrcName, ourCat.id);
      
      // Also store fuzzy variations for better matching
      if (fuzzySrcName !== normalizedSrcName) {
        categoryNameMapping.set(fuzzySrcName, ourCat.id);
      }
    } else {
      // Category not found in local categories
    }
  }

  // Map platforms (only those used in LSW1 runs) with improved fuzzy matching
  for (const [platformId, platformData] of uniquePlatforms) {
    const platformName = platformData?.name;
    if (!platformName) continue;
    
    srcPlatformIdToName.set(platformId, platformName);
    
    const normalizedPlatformName = normalize(platformName);
    const fuzzyPlatformName = fuzzyNormalize(platformName);
    
    // Try exact match first
    let ourPlatform = safeOurPlatforms.find(p => p && normalize(p.name) === normalizedPlatformName);
    
    // Fallback to fuzzy match
    if (!ourPlatform) {
      ourPlatform = safeOurPlatforms.find(p => {
        if (!p) return false;
        return fuzzyNormalize(p.name) === fuzzyPlatformName;
      });
    }
    
    // Fallback to similarity-based matching
    if (!ourPlatform && fuzzyPlatformName.length > 2) {
      let bestMatch: typeof safeOurPlatforms[0] | undefined;
      let bestSimilarity = 0.85; // Minimum 85% similarity for platforms
      
      for (const p of safeOurPlatforms) {
        if (!p) continue;
        const similarity = calculateSimilarity(fuzzyNormalize(p.name), fuzzyPlatformName);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = p;
        }
      }
      ourPlatform = bestMatch;
    }
    
    if (ourPlatform) {
      platformMapping.set(platformId, ourPlatform.id);
      platformNameMapping.set(normalizedPlatformName, ourPlatform.id);
      if (fuzzyPlatformName !== normalizedPlatformName) {
        platformNameMapping.set(fuzzyPlatformName, ourPlatform.id);
      }
    } else {
      // Platform not found in local platforms
    }
  }

  // Map levels - check against ALL levels configured across the site
  // (both individual-level and community-golds leaderboard types) with improved fuzzy matching
  for (const srcLevel of safeSrcLevels) {
    if (!srcLevel || !srcLevel.id) continue;
    
    const levelName = srcLevel.name || srcLevel.names?.international || '';
    if (!levelName) continue;
    
    // Store SRC ID -> name mapping
    srcLevelIdToName.set(srcLevel.id, levelName);
    
    const normalizedLevelName = normalize(levelName);
    const fuzzyLevelName = fuzzyNormalize(levelName);
    
    // Find matching local level - try exact match first
    let ourLevel = safeOurLevels.find(l => l && normalize(l.name) === normalizedLevelName);
    
    // Fallback to fuzzy match
    if (!ourLevel) {
      ourLevel = safeOurLevels.find(l => {
        if (!l) return false;
        return fuzzyNormalize(l.name) === fuzzyLevelName;
      });
    }
    
    // Fallback to similarity-based matching
    if (!ourLevel && fuzzyLevelName.length > 3) {
      let bestMatch: typeof safeOurLevels[0] | undefined;
      let bestSimilarity = 0.8; // Minimum 80% similarity for levels
      
      for (const l of safeOurLevels) {
        if (!l) continue;
        const similarity = calculateSimilarity(fuzzyNormalize(l.name), fuzzyLevelName);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = l;
        }
      }
      ourLevel = bestMatch;
    }
    
    if (ourLevel) {
      levelMapping.set(srcLevel.id, ourLevel.id);
    } else {
      // Level not found in local levels
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

  // Category and platform are optional - we'll import runs even if they don't match local categories/platforms
  // Admin can assign them during verification
  // No validation errors for missing category/platform - just warnings

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

  // For IL/Community Golds, level is optional - admin can assign during verification
  // No validation error for missing level - just a warning

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
    // Step 1: Get game ID (use cache if available)
    let gameId: string | null = cachedGameId;
    if (!gameId) {
      gameId = await getLSWGameId();
      if (gameId) {
        cachedGameId = gameId; // Cache for future imports
      }
    }
    if (!gameId) {
      result.errors.push("Could not find LEGO Star Wars game on speedrun.com");
      return result;
    }

    // Step 2: Get existing SRC run IDs first (optimized - only fetch IDs, not full runs)
    // This allows us to filter out already-linked runs before processing
    let existingSRCRunIds: Set<string>;
    try {
      existingSRCRunIds = await getExistingSRCRunIds();
    } catch (error) {
      result.errors.push(`Failed to fetch existing run IDs: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }

    // Step 3: Fetch runs from SRC progressively until we find 400 unlinked runs
    // We'll fetch in batches of 200, filtering out already-linked ones, and continue
    // fetching until we have 400 unlinked runs or exhaust all available runs
    const TARGET_UNLINKED_COUNT = 400; // Doubled from 200 to 400
    const BATCH_SIZE = 200;
    const MAX_TOTAL_FETCH = 10000; // Increased safety limit to support larger imports
    
    let srcRuns: SRCRun[] = [];
    let unlinkedRuns: SRCRun[] = [];
    let currentOffset = 0;
    let totalFetched = 0;
    
    try {
      // Keep fetching batches until we have enough unlinked runs or hit limits
      while (unlinkedRuns.length < TARGET_UNLINKED_COUNT && totalFetched < MAX_TOTAL_FETCH) {
        // Fetch the next batch of 200 runs
        const batchRuns = await fetchRunsNotOnLeaderboards(gameId, BATCH_SIZE, currentOffset);
        
        if (batchRuns.length === 0) {
          // No more runs available from SRC
          break;
        }
        
        totalFetched += batchRuns.length;
        
        // Filter out already-linked runs from this batch
        const unlinkedInBatch = batchRuns.filter(run => !existingSRCRunIds.has(run.id));
        unlinkedRuns.push(...unlinkedInBatch);
        
        // Update offset for next batch
        currentOffset += batchRuns.length;
        
        // If we got fewer runs than requested, we've reached the end
        if (batchRuns.length < BATCH_SIZE) {
          break;
        }
      }
      
      if (totalFetched === 0) {
        result.errors.push("No runs found to import");
        return result;
      }
      
      // Take only the first 400 unlinked runs (most recent ones)
      srcRuns = unlinkedRuns.slice(0, TARGET_UNLINKED_COUNT);
      
      if (srcRuns.length === 0) {
        result.errors.push(`No new runs to import - checked ${totalFetched} recent runs and all are already linked on the boards`);
        return result;
      }
    } catch (error) {
      result.errors.push(`Failed to fetch runs: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }

    // Step 4: Create mappings (only for platforms used in these runs) - pass gameId to avoid redundant API call
    let mappings: SRCMappings;
    try {
      mappings = await createSRCMappings(srcRuns, gameId);
    } catch (error) {
      result.errors.push(`Failed to create mappings: ${error instanceof Error ? error.message : String(error)}`);
      return result;
    }

    // Step 4.5: Fetch local categories with subcategories for subcategory mapping
    // This ensures we can map SRC variable values to local subcategory IDs
    let localCategories: Category[] = [];
    try {
      localCategories = await getCategoriesFromFirestore();
    } catch (error) {
      // Continue without subcategory mapping - runs will still import with srcSubcategory
    }

    onProgress?.({ total: srcRuns.length, imported: 0, skipped: 0 });

    // Step 5: Pre-fetch all unique player names to batch lookups
    const uniquePlayerNames = new Set<string>();
    for (const srcRun of srcRuns) {
      if (srcRun.players && Array.isArray(srcRun.players)) {
        for (const player of srcRun.players) {
          if (player && typeof player === 'object') {
            const playerData = 'data' in player && Array.isArray(player.data) ? player.data[0] : 
                             'data' in player ? player.data : player;
            if (playerData?.names?.international) {
              uniquePlayerNames.add(playerData.names.international.trim());
            }
          }
        }
      }
    }

    // Batch lookup all players at once
    const playerNameCache = new Map<string, any>();
    const playerLookupPromises = Array.from(uniquePlayerNames).map(async (name) => {
      try {
        const player = await getPlayerByDisplayName(name);
        if (player) {
          playerNameCache.set(name.toLowerCase(), player);
        }
      } catch (error) {
        // Silently fail - player doesn't exist
      }
    });
    await Promise.all(playerLookupPromises);

    // Step 6: Process runs in parallel batches for better performance
    // Process in batches of 20 to balance speed and API rate limits
    const PROCESS_BATCH_SIZE = 20;
    const runBatches: SRCRun[][] = [];
    for (let i = 0; i < srcRuns.length; i += PROCESS_BATCH_SIZE) {
      runBatches.push(srcRuns.slice(i, i + PROCESS_BATCH_SIZE));
    }

    // Process each batch in parallel
    for (const batch of runBatches) {
      await Promise.all(batch.map(async (srcRun) => {
        try {
          // Double-check: Skip if already exists in database (safety check)
          if (existingSRCRunIds.has(srcRun.id)) {
            result.skipped++;
            onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
            return;
          }

          // Map SRC run to our format
          let mappedRun: Partial<LeaderboardEntry> & { srcRunId: string; importedFromSRC: boolean };
          try {
            mappedRun = await mapSRCRunToLeaderboardEntry(
            srcRun,
            undefined,
            mappings.categoryMapping,
            mappings.platformMapping,
            mappings.levelMapping,
            "", // CRITICAL: Use empty string for unclaimed imported runs - never create temporary profiles
            mappings.categoryNameMapping,
            mappings.platformNameMapping,
            mappings.srcPlatformIdToName,
            mappings.srcCategoryIdToName,
            mappings.srcLevelIdToName,
            playerIdToNameCache,
            platformIdToNameCache,
              localCategories // Pass local categories with subcategories for mapping
            );
          } catch (mapError: any) {
            result.skipped++;
            const errorMessage = mapError instanceof Error ? mapError.message : String(mapError);
            result.errors.push(`Run ${srcRun?.id || 'unknown'}: ${errorMessage}`);
            onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
            return;
          }

          // Set import metadata
          mappedRun.importedFromSRC = true;
          mappedRun.srcRunId = srcRun.id;
          mappedRun.verified = false;

          // Ensure required fields have defaults
          if (!mappedRun.runType) mappedRun.runType = 'solo';
          // CRITICAL: Don't override leaderboardType - mapSRCRunToLeaderboardEntry already sets it correctly
          // Only set default if it's truly undefined/null (shouldn't happen, but safety check)
          if (mappedRun.leaderboardType === undefined || mappedRun.leaderboardType === null) {
            // If leaderboardType is missing, infer from level field
            mappedRun.leaderboardType = mappedRun.level ? 'individual-level' : 'regular';
          }
          if (!mappedRun.playerName || mappedRun.playerName.trim() === '') {
            mappedRun.playerName = 'Unknown';
          }
          
          // Validate time - check if time is missing or 00:00:00 when it shouldn't be
          if (!mappedRun.time || mappedRun.time.trim() === '' || mappedRun.time === '00:00:00') {
            // Check if the source run actually has a time
            if (srcRun.times?.primary_t && srcRun.times.primary_t > 0) {
              // Time exists in source but was lost during conversion - try to fix it
              const fixedTime = secondsToTime(srcRun.times.primary_t);
              if (fixedTime && fixedTime !== '00:00:00') {
                mappedRun.time = fixedTime;
              } else {
                result.errors.push(`Run ${srcRun.id}: time conversion failed`);
              }
            } else if (srcRun.times?.primary && srcRun.times.primary.trim() !== '') {
              // Try ISO duration conversion
              const fixedTime = isoDurationToTime(srcRun.times.primary);
              if (fixedTime && fixedTime !== '00:00:00') {
                mappedRun.time = fixedTime;
              } else {
                result.errors.push(`Run ${srcRun.id}: time conversion failed`);
              }
            } else {
              result.errors.push(`Run ${srcRun.id}: missing time data in source run`);
            }
          }

          // Validate the mapped run - only skip if essential fields are missing
          const validationErrors = validateMappedRun(mappedRun, srcRun.id);
          const criticalErrors = validationErrors.filter(err => 
            err.includes('missing player name') || 
            err.includes('missing time') || 
            err.includes('invalid time format') ||
            err.includes('missing date') ||
            err.includes('invalid date format')
          );
          
          if (criticalErrors.length > 0) {
            result.skipped++;
            result.errors.push(`Run ${srcRun.id}: ${criticalErrors.join(', ')}`);
            onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
            return;
          }
          
          // Log non-critical validation issues as warnings
          const warnings = validationErrors.filter(err => 
            !err.includes('missing player name') && 
            !err.includes('missing time') && 
            !err.includes('invalid time format') &&
            !err.includes('missing date') &&
            !err.includes('invalid date format')
          );

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

          // Check player matching (for warnings only, doesn't block import) - use cached lookups
          const player1Matched = playerNameCache.get(mappedRun.playerName.toLowerCase());
          const player2Matched = mappedRun.player2Name ? playerNameCache.get(mappedRun.player2Name.toLowerCase()) : null;

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
              return;
            }

            // Track unmatched players
            if (unmatched.player1 || unmatched.player2) {
              result.unmatchedPlayers.set(addedRunId, unmatched);
            }

            result.imported++;
            onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });

          } catch (addError: any) {
            result.skipped++;
            const errorMsg = addError?.message || String(addError);
            // Check if this is a duplicate error - don't add to errors array for duplicates
            // Duplicates are expected and handled gracefully
            const isDuplicateError = errorMsg.includes('already exists') || 
                                   errorMsg.includes('srcRunId') ||
                                   errorMsg.includes('duplicate');
            if (!isDuplicateError) {
              result.errors.push(`Run ${srcRun.id}: ${errorMsg}`);
            }
            onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
          }

        } catch (error) {
          // Catch any unexpected errors processing this run
          result.skipped++;
          result.errors.push(`Run ${srcRun.id}: ${error instanceof Error ? error.message : String(error)}`);
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
        }
      }));
    }

    // After importing runs, run autoclaiming for all users with SRC usernames
    // This ensures newly imported runs are automatically claimed
    try {
      const autoclaimResult = await runAutoclaimingForAllUsers();
      if (autoclaimResult.totalClaimed > 0) {
      }
      if (autoclaimResult.errors.length > 0) {
      }
    } catch (autoclaimError) {
      // Don't fail the import if autoclaiming fails
    }

    return result;
  } catch (error) {
    // Catch any unexpected top-level errors
    result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
}
