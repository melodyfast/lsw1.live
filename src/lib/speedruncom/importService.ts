/**
 * Speedrun.com Import Service
 * Handles importing runs from speedrun.com API with proper data mapping and validation
 */

import { 
  getLSWGameId, 
  fetchRunsNotOnLeaderboards,
  mapSRCRunToLeaderboardEntry,
  fetchCategories as fetchSRCCategories,
  fetchLevels as fetchSRCLevels,
  fetchPlatforms as fetchSRCPlatforms,
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
 * Create mapping between SRC IDs and our IDs for categories, platforms, and levels
 */
export async function createSRCMappings() {
  const gameId = await getLSWGameId();
  if (!gameId) {
    throw new Error("Could not find LEGO Star Wars game on speedrun.com");
  }

  // Fetch all data in parallel
  const [ourCategories, ourPlatforms, ourLevels, srcCategories, srcPlatforms, srcLevels] = await Promise.all([
    getCategoriesFromFirestore(),
    getPlatformsFromFirestore(),
    getLevels(),
    fetchSRCCategories(gameId),
    fetchSRCPlatforms(),
    fetchSRCLevels(gameId),
  ]);

  // Create ID mappings (SRC ID -> our ID)
  const categoryMapping = new Map<string, string>();
  const platformMapping = new Map<string, string>();
  const levelMapping = new Map<string, string>();

  // Create name mappings (SRC name -> our ID) for fallback
  const categoryNameMapping = new Map<string, string>();
  const platformNameMapping = new Map<string, string>();

  // Map categories by name (case-insensitive)
  for (const srcCat of srcCategories) {
    const ourCat = ourCategories.find(c => 
      c.name.toLowerCase().trim() === srcCat.name.toLowerCase().trim()
    );
    if (ourCat) {
      categoryMapping.set(srcCat.id, ourCat.id);
      categoryNameMapping.set(srcCat.name.toLowerCase().trim(), ourCat.id);
    }
  }

  // Map platforms by name (case-insensitive)
  for (const srcPlatform of srcPlatforms) {
    const ourPlatform = ourPlatforms.find(p => 
      p.name.toLowerCase().trim() === srcPlatform.name.toLowerCase().trim()
    );
    if (ourPlatform) {
      platformMapping.set(srcPlatform.id, ourPlatform.id);
      platformNameMapping.set(srcPlatform.name.toLowerCase().trim(), ourPlatform.id);
    }
  }

  // Map levels by name (case-insensitive)
  for (const srcLevel of srcLevels) {
    const ourLevel = ourLevels.find(l => 
      l.name.toLowerCase().trim() === srcLevel.name.toLowerCase().trim()
    );
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
    ourCategories,
    ourPlatforms,
    ourLevels,
  };
}

/**
 * Extract SRC data from embedded API response
 */
export function extractSRCData(srcRun: SRCRun) {
  // Extract category
  const srcCategoryId = typeof srcRun.category === 'string' 
    ? srcRun.category 
    : srcRun.category?.data?.id || '';
  const srcCategoryName = typeof srcRun.category === 'string' 
    ? '' 
    : (srcRun.category?.data?.name || '');

  // Extract platform
  let srcPlatformId = '';
  let srcPlatformName = '';
  if (srcRun.system?.platform) {
    if (typeof srcRun.system.platform === 'string') {
      srcPlatformId = srcRun.system.platform;
    } else {
      srcPlatformId = srcRun.system.platform.data?.id || '';
      srcPlatformName = srcRun.system.platform.data?.name || '';
    }
  }

  // Extract level
  let srcLevelId = '';
  let srcLevelName = '';
  if (srcRun.level) {
    if (typeof srcRun.level === 'string') {
      srcLevelId = srcRun.level;
    } else {
      srcLevelId = srcRun.level.data?.id || '';
      srcLevelName = srcRun.level.data?.name || '';
    }
  }

  return {
    srcCategoryId,
    srcCategoryName,
    srcPlatformId,
    srcPlatformName,
    srcLevelId,
    srcLevelName,
  };
}

/**
 * Map SRC IDs to our IDs using both ID and name mappings
 */
export function mapSRCIdsToOurs(
  srcData: ReturnType<typeof extractSRCData>,
  mappings: Awaited<ReturnType<typeof createSRCMappings>>,
  ourLevels: Array<{ id: string; name: string }>
) {
  // Map category
  let ourCategoryId = mappings.categoryMapping.get(srcData.srcCategoryId);
  if (!ourCategoryId && srcData.srcCategoryName) {
    ourCategoryId = mappings.categoryNameMapping.get(srcData.srcCategoryName.toLowerCase().trim());
  }
  if (!ourCategoryId) {
    ourCategoryId = srcData.srcCategoryId; // Fallback to SRC ID
  }

  // Map platform
  let ourPlatformId = mappings.platformMapping.get(srcData.srcPlatformId);
  if (!ourPlatformId && srcData.srcPlatformName) {
    ourPlatformId = mappings.platformNameMapping.get(srcData.srcPlatformName.toLowerCase().trim());
  }
  if (!ourPlatformId) {
    ourPlatformId = srcData.srcPlatformId; // Fallback to SRC ID
  }

  // Map level
  let ourLevelId = srcData.srcLevelId ? mappings.levelMapping.get(srcData.srcLevelId) : undefined;
  if (!ourLevelId && srcData.srcLevelName) {
    const ourLevel = ourLevels.find(l => 
      l.name.toLowerCase().trim() === srcData.srcLevelName.toLowerCase().trim()
    );
    if (ourLevel) {
      ourLevelId = ourLevel.id;
    }
  }
  if (srcData.srcLevelId && !ourLevelId) {
    ourLevelId = srcData.srcLevelId; // Fallback to SRC ID
  }

  return {
    ourCategoryId,
    ourPlatformId,
    ourLevelId,
  };
}

/**
 * Check if a run is a duplicate
 */
export function isDuplicateRun(
  run: Partial<LeaderboardEntry>,
  existingRunKeys: Set<string>
): boolean {
  const normalizeName = (name: string) => name.trim().toLowerCase();
  const player1Name = normalizeName(run.playerName || '');
  const player2Name = run.player2Name ? normalizeName(run.player2Name) : '';
  const runKey = `${player1Name}|${run.category}|${run.platform}|${run.runType}|${run.time}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
  
  // Check for exact duplicate
  if (existingRunKeys.has(runKey)) {
    return true;
  }

  // Check for co-op runs with swapped players
  if (run.runType === 'co-op' && player2Name) {
    const swappedKey = `${player2Name}|${run.category}|${run.platform}|${run.runType}|${run.time}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
    if (existingRunKeys.has(swappedKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Import runs from speedrun.com
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
    // Get game ID
    const gameId = await getLSWGameId();
    if (!gameId) {
      throw new Error("Could not find LEGO Star Wars game on speedrun.com");
    }

    // Fetch runs from SRC
    const srcRuns = await fetchRunsNotOnLeaderboards(gameId);
    if (srcRuns.length === 0) {
      return result;
    }

    // Create mappings
    const mappings = await createSRCMappings();

    // Get existing runs for duplicate checking
    const existingRuns = await getAllRunsForDuplicateCheck();
    const existingSRCRunIds = new Set(
      existingRuns.filter(r => r.srcRunId).map(r => r.srcRunId!)
    );

    // Create duplicate check keys (only for verified runs)
    const normalizeName = (name: string) => name.trim().toLowerCase();
    const existingRunKeys = new Set<string>();
    for (const run of existingRuns.filter(r => r.verified)) {
      const key = `${normalizeName(run.playerName)}|${run.category}|${run.platform}|${run.runType}|${run.time}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
      existingRunKeys.add(key);
      if (run.runType === 'co-op' && run.player2Name) {
        const swappedKey = `${normalizeName(run.player2Name)}|${run.category}|${run.platform}|${run.runType}|${run.time}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
        existingRunKeys.add(swappedKey);
      }
    }

    // Update progress
    onProgress?.({ total: srcRuns.length, imported: 0, skipped: 0 });

    // Import each run
    for (const srcRun of srcRuns) {
      try {
        // Skip if already imported
        if (existingSRCRunIds.has(srcRun.id)) {
          result.skipped++;
          onProgress?.({ 
            total: srcRuns.length, 
            imported: result.imported, 
            skipped: result.skipped 
          });
          continue;
        }

        // Extract SRC data
        const srcData = extractSRCData(srcRun);

        // Map to our IDs
        const ourIds = mapSRCIdsToOurs(srcData, mappings, mappings.ourLevels);

        // Map the run
        const mappedRun = mapSRCRunToLeaderboardEntry(
          srcRun,
          undefined,
          mappings.categoryMapping,
          mappings.platformMapping,
          mappings.levelMapping,
          "imported",
          mappings.categoryNameMapping,
          mappings.platformNameMapping
        );

        // Override with mapped IDs and preserve SRC names
        mappedRun.category = ourIds.ourCategoryId;
        mappedRun.platform = ourIds.ourPlatformId;
        mappedRun.level = ourIds.ourLevelId;

        // Preserve SRC names
        if (srcData.srcCategoryName && !mappedRun.srcCategoryName) {
          mappedRun.srcCategoryName = srcData.srcCategoryName;
        }
        if (srcData.srcPlatformName && !mappedRun.srcPlatformName) {
          mappedRun.srcPlatformName = srcData.srcPlatformName;
        }
        if (srcData.srcLevelName && !mappedRun.srcLevelName) {
          mappedRun.srcLevelName = srcData.srcLevelName;
        }

        // Validate required fields
        if (!mappedRun.category || !mappedRun.platform || mappedRun.category === '' || mappedRun.platform === '') {
          result.skipped++;
          result.errors.push(`Run ${srcRun.id}: missing category or platform`);
          onProgress?.({ 
            total: srcRuns.length, 
            imported: result.imported, 
            skipped: result.skipped 
          });
          continue;
        }

        // Validate and normalize player names
        if (typeof mappedRun.playerName !== 'string' || !mappedRun.playerName || mappedRun.playerName.trim() === '') {
          mappedRun.playerName = 'Unknown';
        } else {
          mappedRun.playerName = mappedRun.playerName.trim();
        }
        if (mappedRun.player2Name) {
          if (typeof mappedRun.player2Name !== 'string' || mappedRun.player2Name.trim() === '') {
            mappedRun.player2Name = undefined;
          } else {
            mappedRun.player2Name = mappedRun.player2Name.trim();
          }
        }

        // Check for duplicates
        if (isDuplicateRun(mappedRun, existingRunKeys)) {
          result.skipped++;
          onProgress?.({ 
            total: srcRuns.length, 
            imported: result.imported, 
            skipped: result.skipped 
          });
          continue;
        }

        // Check player matching
        const player1Matched = await getPlayerByDisplayName(mappedRun.playerName || '');
        const player2Matched = mappedRun.player2Name 
          ? await getPlayerByDisplayName(mappedRun.player2Name) 
          : null;

        const unmatched: { player1?: string; player2?: string } = {};
        if (!player1Matched) {
          unmatched.player1 = mappedRun.playerName;
        }
        if (mappedRun.player2Name && !player2Matched) {
          unmatched.player2 = mappedRun.player2Name;
        }

        // Ensure import flags are set
        mappedRun.importedFromSRC = true;
        mappedRun.srcRunId = srcRun.id;

        // Add the run
        const addedRunId = await addLeaderboardEntry(mappedRun as any);

        if (!addedRunId) {
          result.skipped++;
          result.errors.push(`Run ${srcRun.id}: failed to add to database`);
          onProgress?.({ 
            total: srcRuns.length, 
            imported: result.imported, 
            skipped: result.skipped 
          });
          continue;
        }

        // Store unmatched players
        if ((unmatched.player1 || unmatched.player2) && addedRunId) {
          result.unmatchedPlayers.set(addedRunId, unmatched);
        }

        // Add to existing keys to prevent duplicates within batch
        const normalizeName = (name: string) => name.trim().toLowerCase();
        const player1Name = normalizeName(mappedRun.playerName || '');
        const player2Name = mappedRun.player2Name ? normalizeName(mappedRun.player2Name) : '';
        const runKey = `${player1Name}|${mappedRun.category}|${mappedRun.platform}|${mappedRun.runType}|${mappedRun.time}|${mappedRun.leaderboardType || 'regular'}|${mappedRun.level || ''}`;
        existingRunKeys.add(runKey);

        result.imported++;
        onProgress?.({ 
          total: srcRuns.length, 
          imported: result.imported, 
          skipped: result.skipped 
        });

      } catch (error) {
        result.skipped++;
        result.errors.push(`Run ${srcRun.id}: ${error instanceof Error ? error.message : String(error)}`);
        onProgress?.({ 
          total: srcRuns.length, 
          imported: result.imported, 
          skipped: result.skipped 
        });
      }
    }

    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

