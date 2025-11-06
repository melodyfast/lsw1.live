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

  // Create mappings by matching names (case-insensitive)
  const categoryMapping = new Map<string, string>();
  const platformMapping = new Map<string, string>();
  const levelMapping = new Map<string, string>();
  const categoryNameMapping = new Map<string, string>();
  const platformNameMapping = new Map<string, string>();

  // Map categories
  for (const srcCat of srcCategories) {
    const ourCat = ourCategories.find(c => 
      c.name.toLowerCase().trim() === srcCat.name.toLowerCase().trim()
    );
    if (ourCat) {
      categoryMapping.set(srcCat.id, ourCat.id);
      categoryNameMapping.set(srcCat.name.toLowerCase().trim(), ourCat.id);
    }
  }

  // Map platforms
  for (const srcPlatform of srcPlatforms) {
    const ourPlatform = ourPlatforms.find(p => 
      p.name.toLowerCase().trim() === srcPlatform.name.toLowerCase().trim()
    );
    if (ourPlatform) {
      platformMapping.set(srcPlatform.id, ourPlatform.id);
      platformNameMapping.set(srcPlatform.name.toLowerCase().trim(), ourPlatform.id);
    }
  }

  // Map levels
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
 * Check if a run is a duplicate
 */
function isDuplicateRun(
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
 * Simplified approach: try to import, catch and log errors but continue
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
      result.errors.push("Could not find LEGO Star Wars game on speedrun.com");
      return result;
    }

    // Fetch runs from SRC
    const srcRuns = await fetchRunsNotOnLeaderboards(gameId, 500);
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

    onProgress?.({ total: srcRuns.length, imported: 0, skipped: 0 });

    // Import each run
    for (const srcRun of srcRuns) {
      try {
        // Skip if already imported
        if (existingSRCRunIds.has(srcRun.id)) {
          result.skipped++;
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
          continue;
        }

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

        // Set import flags - ensure importedFromSRC is explicitly true (boolean)
        mappedRun.importedFromSRC = true as boolean;
        mappedRun.srcRunId = srcRun.id;
        mappedRun.verified = false;
        
        // Ensure all required fields for import are present
        if (!mappedRun.srcCategoryName && !mappedRun.category) {
          console.warn(`Run ${srcRun.id}: No category ID or SRC category name`);
        }
        if (!mappedRun.srcPlatformName && !mappedRun.platform) {
          console.warn(`Run ${srcRun.id}: No platform ID or SRC platform name`);
        }

        // Ensure required fields are present
        if (!mappedRun.playerName || mappedRun.playerName.trim() === '') {
          mappedRun.playerName = 'Unknown';
        }
        if (!mappedRun.time || !mappedRun.date) {
          result.skipped++;
          result.errors.push(`Run ${srcRun.id}: missing time or date`);
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
          continue;
        }

        // Use placeholder values if mapping failed (for imported runs, empty strings are OK if we have SRC names)
        // But validation might still require non-empty, so use a placeholder
        if (!mappedRun.category || mappedRun.category.trim() === '') {
          // Use placeholder if no SRC name either
          if (!mappedRun.srcCategoryName) {
            result.skipped++;
            result.errors.push(`Run ${srcRun.id}: missing category`);
            onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
            continue;
          }
          // For imported runs with SRC names, empty category ID is OK - validation allows it
          mappedRun.category = '';
        }
        if (!mappedRun.platform || mappedRun.platform.trim() === '') {
          // Use placeholder if no SRC name either
          if (!mappedRun.srcPlatformName) {
            result.skipped++;
            result.errors.push(`Run ${srcRun.id}: missing platform`);
            onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
            continue;
          }
          // For imported runs with SRC names, empty platform ID is OK - validation allows it
          mappedRun.platform = '';
        }

        // Normalize player names
        mappedRun.playerName = mappedRun.playerName.trim();
        if (mappedRun.player2Name) {
          mappedRun.player2Name = mappedRun.player2Name.trim() || undefined;
        }

        // Check for duplicates
        if (isDuplicateRun(mappedRun, existingRunKeys)) {
          result.skipped++;
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
          continue;
        }

        // Check player matching (for warnings, but don't block import)
        const player1Matched = await getPlayerByDisplayName(mappedRun.playerName);
        const player2Matched = mappedRun.player2Name ? await getPlayerByDisplayName(mappedRun.player2Name) : null;

        const unmatched: { player1?: string; player2?: string } = {};
        if (!player1Matched) unmatched.player1 = mappedRun.playerName;
        if (mappedRun.player2Name && !player2Matched) unmatched.player2 = mappedRun.player2Name;

        // Log the mapped run before attempting to add (for first few runs)
        if (result.imported + result.skipped < 3) {
          console.log(`[Import] Attempting to add run ${srcRun.id}:`, {
            category: mappedRun.category,
            platform: mappedRun.platform,
            srcCategoryName: mappedRun.srcCategoryName,
            srcPlatformName: mappedRun.srcPlatformName,
            importedFromSRC: mappedRun.importedFromSRC,
            playerName: mappedRun.playerName,
            time: mappedRun.time,
            date: mappedRun.date,
            leaderboardType: mappedRun.leaderboardType,
            runType: mappedRun.runType,
          });
        }

        // Try to add the run
        try {
          const addedRunId = await addLeaderboardEntry(mappedRun as LeaderboardEntry);

          if (!addedRunId) {
            result.skipped++;
            result.errors.push(`Run ${srcRun.id}: failed to add to database`);
            onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
            continue;
          }

          // Store unmatched players
          if (unmatched.player1 || unmatched.player2) {
            result.unmatchedPlayers.set(addedRunId, unmatched);
          }

          // Add to existing keys to prevent batch duplicates
          const player1Name = normalizeName(mappedRun.playerName);
          const player2Name = mappedRun.player2Name ? normalizeName(mappedRun.player2Name) : '';
          const runKey = `${player1Name}|${mappedRun.category}|${mappedRun.platform}|${mappedRun.runType}|${mappedRun.time}|${mappedRun.leaderboardType || 'regular'}|${mappedRun.level || ''}`;
          existingRunKeys.add(runKey);

          result.imported++;
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });

        } catch (addError: any) {
          // Catch validation or database errors
          result.skipped++;
          const errorMsg = addError?.message || String(addError);
          result.errors.push(`Run ${srcRun.id}: ${errorMsg}`);
          console.error(`Failed to add run ${srcRun.id}:`, addError, mappedRun);
          onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
        }

      } catch (error) {
        // Catch any other errors in processing this run
        result.skipped++;
        result.errors.push(`Run ${srcRun.id}: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`Error processing run ${srcRun.id}:`, error);
        onProgress?.({ total: srcRuns.length, imported: result.imported, skipped: result.skipped });
      }
    }

    return result;
  } catch (error) {
    // Catch any unexpected errors and return them in the result instead of throwing
    result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Import error:", error);
    return result;
  }
}
