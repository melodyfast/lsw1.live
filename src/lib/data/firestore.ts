import { db } from "@/lib/firebase";
import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy, limit as firestoreLimit, deleteField, writeBatch, getDocsFromCache, getDocsFromServer, QueryConstraint, UpdateData, DocumentData, startAfter } from "firebase/firestore";
import { Player, LeaderboardEntry, DownloadEntry, Category, Platform, Level } from "@/types/database";
import { calculatePoints, parseTimeToSeconds } from "@/lib/utils";
import { 
  normalizeLeaderboardEntry, 
  validateLeaderboardEntry,
  normalizeCategoryId,
  normalizePlatformId,
  normalizeLevelId,
} from "@/lib/dataValidation";

/**
 * Helper function to calculate ranks for a group of runs
 * Returns a map of run ID to rank (1-based)
 * Only non-obsolete runs are ranked (obsolete runs get undefined rank)
 * @param additionalRun - Optional run to include in ranking (useful when verifying a new run)
 */
async function calculateRanksForGroup(
  leaderboardType: 'regular' | 'individual-level' | 'community-golds',
  categoryId: string,
  platformId: string,
  runType: 'solo' | 'co-op',
  levelId?: string,
  additionalRun?: LeaderboardEntry
): Promise<Map<string, number>> {
  if (!db) return new Map();
  
  const constraints: QueryConstraint[] = [
    where("verified", "==", true),
    where("leaderboardType", "==", leaderboardType),
    where("category", "==", categoryId),
    where("platform", "==", platformId),
    where("runType", "==", runType),
  ];
  
  if (leaderboardType !== 'regular' && levelId) {
    constraints.push(where("level", "==", levelId));
  }
  
  // Note: Firestore doesn't support ordering by time string directly
  // We'll fetch more runs and sort them in memory to ensure we get the fastest ones
  // For now, fetch up to 500 runs to ensure we capture all runs for accurate ranking
  constraints.push(firestoreLimit(500));
  
  const rankQuery = query(collection(db, "leaderboardEntries"), ...constraints);
  const rankSnapshot = await getDocs(rankQuery);
  
  // Filter out obsolete runs for ranking (only non-obsolete runs count for top 3)
  const nonObsoleteRuns = rankSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
    .filter(run => !run.isObsolete);
  
  // Include additional run if provided and it matches the group criteria
  if (additionalRun && !additionalRun.isObsolete && 
      additionalRun.leaderboardType === leaderboardType &&
      additionalRun.category === categoryId &&
      additionalRun.platform === platformId &&
      additionalRun.runType === runType &&
      (leaderboardType === 'regular' || additionalRun.level === levelId)) {
    // Check if run is already in the list (to avoid duplicates)
    const exists = nonObsoleteRuns.some(r => r.id === additionalRun.id);
    if (!exists) {
      nonObsoleteRuns.push(additionalRun);
    }
  }
  
  // Filter to best time per player (matching leaderboard display logic)
  // Group by player(s) and keep only the fastest run per player combination
  const playerBestRuns = new Map<string, LeaderboardEntry>();
  
  for (const run of nonObsoleteRuns) {
    // Create a key for grouping (player(s), category, platform, runType, leaderboardType, level)
    // For co-op runs, include both players in the key
    const playerId = run.playerId || run.playerName || "";
    const player2Id = run.runType === 'co-op' ? (run.player2Name || "") : "";
    const groupKey = `${playerId}_${player2Id}_${run.category}_${run.platform}_${run.runType || 'solo'}_${run.leaderboardType || 'regular'}_${run.level || ''}`;
    
    const existing = playerBestRuns.get(groupKey);
    if (!existing) {
      playerBestRuns.set(groupKey, run);
    } else {
      // Compare times - keep the faster one
      const existingTime = parseTimeToSeconds(existing.time) || Infinity;
      const currentTime = parseTimeToSeconds(run.time) || Infinity;
      if (currentTime < existingTime) {
        playerBestRuns.set(groupKey, run);
      }
    }
  }
  
  // Get the best runs per player
  const bestRuns = Array.from(playerBestRuns.values());
  
  // Sort by time
  bestRuns.sort((a, b) => {
    const timeA = parseTimeToSeconds(a.time);
    const timeB = parseTimeToSeconds(b.time);
    return timeA - timeB;
  });
  
  // Create rank map (1-based) - only rank the best run per player
  const rankMap = new Map<string, number>();
  bestRuns.forEach((run, index) => {
    rankMap.set(run.id, index + 1);
  });
  
  return rankMap;
}

/**
 * Get leaderboard entries with optimized Firestore queries and SRC integration
 * Uses proper indexing and data validation utilities
 */
export const getLeaderboardEntriesFirestore = async (
  categoryId?: string,
  platformId?: string,
  runType?: 'solo' | 'co-op',
  includeObsolete?: boolean,
  leaderboardType?: 'regular' | 'individual-level' | 'community-golds',
  levelId?: string,
  subcategoryId?: string
): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  
  try {
    // Normalize inputs using data validation utilities
    const normalizedCategoryId = categoryId && categoryId !== "all" ? normalizeCategoryId(categoryId) : undefined;
    const normalizedPlatformId = platformId && platformId !== "all" ? normalizePlatformId(platformId) : undefined;
    const normalizedLevelId = levelId && levelId !== "all" ? normalizeLevelId(levelId) : undefined;
    
    // Build query constraints dynamically based on filters
    // IMPORTANT: Only fetch verified runs - imported runs must be verified before appearing on leaderboards
    const constraints: QueryConstraint[] = [
      where("verified", "==", true),
    ];

    // Helper function to add shared filters to a constraint list
    const addSharedFilters = (constraintList: QueryConstraint[]) => {
      // Add leaderboardType filter for all types (regular, individual-level, community-golds)
      // All IL runs now have leaderboardType === 'individual-level', so we can query directly
      if (leaderboardType) {
        constraintList.push(where("leaderboardType", "==", leaderboardType));
      }

      // Add level filter for ILs and Community Golds (must come after leaderboardType for index)
      if (normalizedLevelId && (leaderboardType === 'individual-level' || leaderboardType === 'community-golds')) {
        constraintList.push(where("level", "==", normalizedLevelId));
      }

      // Add category filter (must come after leaderboardType/level for composite indexes)
      if (normalizedCategoryId) {
        constraintList.push(where("category", "==", normalizedCategoryId));
      }

      // Add platform filter
      if (normalizedPlatformId) {
        constraintList.push(where("platform", "==", normalizedPlatformId));
      }

      // Add runType filter
      if (runType && (runType === "solo" || runType === "co-op")) {
        constraintList.push(where("runType", "==", runType));
      }
      
      // Add subcategory filter (only for regular leaderboard type)
      // Note: We filter client-side for subcategory to handle "all" and undefined cases
      // Firestore queries don't support OR conditions easily, so we'll filter after fetching
    };

    // All leaderboard types now work the same way - query directly by leaderboardType
    // IL runs all have leaderboardType === 'individual-level' set correctly
    const fetchLimit = 500;
    addSharedFilters(constraints);
    constraints.push(firestoreLimit(fetchLimit));
    // Fetch levels BEFORE filtering to check disabled categories
    const levelsSnapshot = await getDocs(collection(db, "levels"));
    const levels = levelsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Level));
    const selectedLevelData = normalizedLevelId ? levels.find(l => l.id === normalizedLevelId) : undefined;
    
    const querySnapshot = await getDocs(query(collection(db, "leaderboardEntries"), ...constraints));
    
    // Normalize and validate entries
    let entries: LeaderboardEntry[] = querySnapshot.docs
      .map(doc => {
        const data = doc.data();
        
        // Normalize the entry data
        const normalized = normalizeLeaderboardEntry({ 
          id: doc.id, 
          ...data 
        } as LeaderboardEntry);
        
        // Ensure id is always present
        return {
          ...normalized,
          id: doc.id,
        } as LeaderboardEntry;
      })
      .filter(entry => {
        // Validate entry
        const validation = validateLeaderboardEntry(entry);
        if (!validation.valid) {
          return false;
        }
        
        // Ensure entry is verified (double-check, though query already filters this)
        if (entry.verified !== true) {
          return false;
        }
        
        // Filter obsolete entries if not including them (will be filtered later for best time per player)
        // Don't filter here - we'll handle obsolete filtering and best-time-per-player logic together
        
        // Filter out non-regular entries when querying for regular leaderboard type
        if (!leaderboardType || leaderboardType === 'regular') {
          const entryLeaderboardType = entry.leaderboardType || 'regular';
          if (entryLeaderboardType !== 'regular') {
            return false;
          }
        }
        
        // For individual-level queries: ensure entry is actually an IL run
        // All IL runs now have leaderboardType === 'individual-level' set correctly
        if (leaderboardType === 'individual-level') {
          // Must have leaderboardType === 'individual-level'
          if (entry.leaderboardType !== 'individual-level') {
            return false;
          }
          
          // IL runs must have a level field
          if (!entry.level || entry.level.trim() === '') {
            return false;
          }
        }
        
        // For community-golds queries: ensure entry is actually a community-golds run
        if (leaderboardType === 'community-golds') {
          const entryLeaderboardType = entry.leaderboardType || 'regular';
          if (entryLeaderboardType !== 'community-golds') {
            return false;
          }
          // Community-golds runs must have a level field
          if (!entry.level || entry.level.trim() === '') {
            return false;
          }
        }
        
        // Additional validation: ensure required fields exist
        // All verified runs should have category and platform (verified runs must be complete)
        // For imported runs, allow empty category/platform if SRC names exist
        if (!entry.time || !entry.runType) {
          return false;
        }
        // For imported runs, allow empty category/platform if SRC names exist
        const isImported = entry.importedFromSRC === true || entry.importedFromSRC === Boolean(true);
        const hasCategory = entry.category && entry.category.trim() !== '';
        const hasPlatform = entry.platform && entry.platform.trim() !== '';
        const hasSRCCategory = entry.srcCategoryName && entry.srcCategoryName.trim() !== '';
        const hasSRCPlatform = entry.srcPlatformName && entry.srcPlatformName.trim() !== '';
        
        if (!hasCategory && !hasSRCCategory) {
          return false;
        }
        if (!hasPlatform && !hasSRCPlatform) {
          return false;
        }
        
        // Filter by subcategory (client-side, only for regular leaderboard type)
        // Subcategory selection is now required - no "all" option
        if (leaderboardType === 'regular' && subcategoryId) {
          // Special case: __none__ means show only runs without a subcategory
          if (subcategoryId === '__none__') {
            // Show only runs without subcategory
            if (entry.subcategory && entry.subcategory.trim() !== '') {
              return false;
            }
          } else {
            // Show only runs with this specific subcategory
            if (!entry.subcategory || entry.subcategory !== subcategoryId) {
              return false;
            }
          }
        }
        
        // Check if category is disabled for this level (for ILs and Community Golds)
        // Only check if we have a category ID (not just SRC name)
        if (normalizedLevelId && selectedLevelData && (leaderboardType === 'individual-level' || leaderboardType === 'community-golds')) {
          // For imported runs with only SRC names, skip this check (category might not be mapped yet)
          if (hasCategory && entry.category) {
            const isCategoryDisabled = selectedLevelData.disabledCategories?.[entry.category] === true;
            if (isCategoryDisabled) {
              return false; // Filter out entries where category is disabled for this level
            }
          }
        }
        
        return true;
      });

    // Sort by time in ascending order (fastest times first)
    // Use parseTimeToSeconds utility for consistent time parsing
    const sortByTime = (entries: LeaderboardEntry[]) => {
      return entries
        .map(entry => ({
          entry,
          totalSeconds: parseTimeToSeconds(entry.time) || Infinity
        }))
        .sort((a, b) => a.totalSeconds - b.totalSeconds)
        .map(item => item.entry);
    };
    
    // Filter obsolete runs: if not including obsolete, only show best time per player
    // If including obsolete, show all runs but separate them
    let nonObsoleteEntries: LeaderboardEntry[] = [];
    let obsoleteEntries: LeaderboardEntry[] = [];
    
    if (!includeObsolete) {
      // Only show best (non-obsolete) time per player
      // Group by player(s) and keep only the fastest run per player combination
      const playerBestRuns = new Map<string, LeaderboardEntry>();
      
      for (const entry of entries) {
        if (entry.isObsolete) continue; // Skip obsolete runs when not including them
        
        // Create a key for grouping (player(s), category, platform, runType, leaderboardType, level)
        // For co-op runs, include both players in the key
        const playerId = entry.playerId || entry.playerName || "";
        const player2Id = entry.runType === 'co-op' ? (entry.player2Name || "") : "";
        const groupKey = `${playerId}_${player2Id}_${entry.category}_${entry.platform}_${entry.runType || 'solo'}_${entry.leaderboardType || 'regular'}_${entry.level || ''}`;
        
        const existing = playerBestRuns.get(groupKey);
        if (!existing) {
          playerBestRuns.set(groupKey, entry);
        } else {
          // Compare times - keep the faster one
          const existingTime = parseTimeToSeconds(existing.time) || Infinity;
          const currentTime = parseTimeToSeconds(entry.time) || Infinity;
          if (currentTime < existingTime) {
            playerBestRuns.set(groupKey, entry);
          }
        }
      }
      
      nonObsoleteEntries = Array.from(playerBestRuns.values());
    } else {
      // Include obsolete runs - separate them but show all
      nonObsoleteEntries = entries.filter(e => !e.isObsolete);
      obsoleteEntries = entries.filter(e => e.isObsolete === true);
    }
    
    const sortedNonObsolete = sortByTime(nonObsoleteEntries);
    const sortedObsolete = sortByTime(obsoleteEntries);
    
    // Clean up temporary fields used for filtering
    const cleanupEntry = (entry: any): LeaderboardEntry => {
      const { _originalLeaderboardType, _originalLevel, ...cleanedEntry } = entry;
      return cleanedEntry as LeaderboardEntry;
    };
    
    // Assign ranks: non-obsolete runs get sequential ranks starting from 1
    // Obsolete runs get ranks that continue from non-obsolete runs
    sortedNonObsolete.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    
    sortedObsolete.forEach((entry, index) => {
      entry.rank = sortedNonObsolete.length + index + 1;
    });
    
    // Combine: non-obsolete first, then obsolete (if including), limit to 200 for display
    entries = includeObsolete 
      ? [...sortedNonObsolete, ...sortedObsolete].slice(0, 200)
      : sortedNonObsolete.slice(0, 200);
    
    // Clean up temporary fields before returning
    entries = entries.map(cleanupEntry);

    // Batch fetch all unique player IDs to avoid N+1 queries
    // Only fetch players for claimed runs (not imported/unclaimed)
    const playerIds = new Set<string>();
    const player2Names = new Set<string>();
    entries.forEach(entry => {
      // Only fetch player data for runs that are claimed (not imported/unclaimed)
      const isUnclaimed = entry.playerId === "imported" || entry.importedFromSRC === true;
      if (!isUnclaimed && entry.playerId) {
        playerIds.add(entry.playerId);
      }
      // For co-op runs, only fetch player2 if the run is claimed
      if (!isUnclaimed && entry.player2Name && entry.runType === 'co-op') {
        player2Names.add(entry.player2Name.trim().toLowerCase());
      }
    });

    // Fetch all players in batch
    const playerMap = new Map<string, Player>();
    if (playerIds.size > 0) {
      const playerPromises = Array.from(playerIds).map(id => getPlayerByUidFirestore(id));
      const players = await Promise.all(playerPromises);
      players.forEach(player => {
        if (player) {
          playerMap.set(player.uid, player);
          // Also index by displayName for player2 lookup
          if (player.displayName) {
            playerMap.set(player.displayName.toLowerCase(), player);
          }
        }
      });
    }

    // Fetch categories and platforms for SRC name fallback (levels already fetched above)
    const [categoriesSnapshot, platformsSnapshot] = await Promise.all([
      getDocs(collection(db, "categories")),
      getDocs(collection(db, "platforms"))
    ]);
    
    const categories = categoriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
    const platforms = platformsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Platform));

    // Import helper functions for name resolution
    const { getCategoryName, getPlatformName, getLevelName } = await import("@/lib/dataValidation");
    
    // Enrich entries with player data, category/platform/level names, and mark unclaimed runs
    const enrichedEntries = entries.map(entry => {
      // Check if run is unclaimed - simply check if playerId is empty/null
      const isUnclaimed = !entry.playerId || entry.playerId.trim() === "";
      
      // Enrich category name (for display on leaderboards)
      if (entry.category) {
        const categoryObj = categories.find(c => c.id === entry.category);
        if (categoryObj) {
          // Category name will be resolved by getCategoryName helper on frontend
          // But we can also store it here if needed - for now, the ID is sufficient
        } else if (entry.srcCategoryName) {
          // Use SRC fallback name if category not found
          // The frontend will use getCategoryName which handles this
        }
      }
      
      // Enrich platform name
      if (entry.platform) {
        const platformObj = platforms.find(p => p.id === entry.platform);
        if (platformObj) {
          // Platform name will be resolved by getPlatformName helper on frontend
        } else if (entry.srcPlatformName) {
          // Use SRC fallback name if platform not found
        }
      }
      
      // Enrich level name (for IL runs)
      if (entry.level) {
        const levelObj = levels.find(l => l.id === entry.level);
        if (levelObj) {
          // Level name will be resolved by getLevelName helper on frontend
        } else if (entry.srcLevelName) {
          // Use SRC fallback name if level not found
        }
      }
      
      // Only enrich player data for claimed runs
      if (!isUnclaimed) {
        // Enrich player data
        const player = playerMap.get(entry.playerId);
        if (player) {
          if (player.displayName) {
            entry.playerName = player.displayName;
          }
          if (player.nameColor) {
            entry.nameColor = player.nameColor;
          }
        }
        
        // For co-op runs, look up player2 by player2Id if available, otherwise by name
        if (entry.runType === 'co-op' && entry.player2Name) {
          // Try to find player2 by ID first (if stored)
          let player2: Player | undefined;
          if (entry.player2Id) {
            player2 = playerMap.get(entry.player2Id);
          }
          // If not found by ID, try by name
          if (!player2) {
            player2 = playerMap.get(entry.player2Name.trim().toLowerCase());
          }
          if (player2) {
            entry.player2Name = player2.displayName || entry.player2Name;
            if (player2.nameColor) {
              entry.player2Color = player2.nameColor;
            }
            // Store player2Id for linking
            entry.player2Id = player2.uid;
          }
        }
      } else {
        // For unclaimed runs, use SRC player names if available
        if (entry.srcPlayerName) {
          entry.playerName = entry.srcPlayerName;
        }
        if (entry.srcPlayer2Name && entry.runType === 'co-op') {
          entry.player2Name = entry.srcPlayer2Name;
        }
      }
      
      return entry;
    });

    return enrichedEntries;
  } catch (error) {
    return [];
  }
};

export const addLeaderboardEntryFirestore = async (entry: Omit<LeaderboardEntry, 'id' | 'rank' | 'isObsolete'> & { verified?: boolean }): Promise<string | null> => {
  if (!db) return null;
  try {
    // Normalize and validate the entry
    const normalized = normalizeLeaderboardEntry(entry);
    
    // For imported runs, ALWAYS use lenient validation
    // Imported runs can have empty category/platform IDs if SRC names exist
    const isImportedRun = normalized.importedFromSRC === true || normalized.importedFromSRC === Boolean(true) || !!normalized.importedFromSRC;
    
    if (isImportedRun) {
      // For imported runs, only validate essential fields
      // Category and platform can be empty if SRC names exist, or even if they don't (admin can fix later)
      
      if (!normalized.playerName || normalized.playerName.trim() === "") {
        throw new Error("Player name is required");
      }
      if (!normalized.time || normalized.time.trim() === "") {
        throw new Error("Time is required");
      }
      if (!normalized.date || normalized.date.trim() === "") {
        throw new Error("Date is required");
      }
      // Category and platform validation is skipped for imported runs
      // They can be empty - admins will fix them later
    } else {
      // For non-imported runs, use full validation
      const validation = validateLeaderboardEntry(normalized);
      
      if (!validation.valid) {
        throw new Error(`Invalid entry data: ${validation.errors.join(', ')}`);
      }
    }
    
    const newDocRef = doc(collection(db, "leaderboardEntries"));
    // CRITICAL: Preserve leaderboardType from normalized entry
    // normalizeLeaderboardType always returns a valid value, so this should never be undefined
    // But we use the normalized value directly to ensure it's preserved correctly
    const finalLeaderboardType = normalized.leaderboardType || 'regular';
    
    const newEntry: Partial<LeaderboardEntry> & DocumentData = { 
      id: newDocRef.id, 
      playerId: normalized.playerId || entry.playerId,
      playerName: normalized.playerName,
      // For imported runs, category/platform can be empty strings - save them anyway
      category: normalized.category !== undefined ? normalized.category : "",
      platform: normalized.platform !== undefined ? normalized.platform : "",
      runType: normalized.runType || 'solo',
      leaderboardType: finalLeaderboardType,
      time: normalized.time,
      date: normalized.date,
      verified: normalized.verified ?? false, 
      isObsolete: false,
    };
    
    // Only include optional fields if they have values
    if (normalized.player2Name) {
      newEntry.player2Name = normalized.player2Name;
    }
    if (normalized.level) {
      newEntry.level = normalized.level;
    }
    if (normalized.videoUrl) {
      newEntry.videoUrl = normalized.videoUrl;
    }
    if (normalized.comment) {
      newEntry.comment = normalized.comment;
    }
    // Always save importedFromSRC if it's set (even if false, but we expect true for imports)
    if (normalized.importedFromSRC !== undefined) {
      newEntry.importedFromSRC = normalized.importedFromSRC === true || normalized.importedFromSRC === Boolean(true);
    }
    if (normalized.srcRunId) {
      newEntry.srcRunId = normalized.srcRunId;
    }
    // Save SRC fallback names for display when ID mapping fails
    // Use normalized values (they preserve the SRC names)
    if (normalized.srcCategoryName) {
      newEntry.srcCategoryName = normalized.srcCategoryName;
    }
    if (normalized.srcPlatformName) {
      newEntry.srcPlatformName = normalized.srcPlatformName;
    }
    if (normalized.srcLevelName) {
      newEntry.srcLevelName = normalized.srcLevelName;
    }
    // Save SRC player IDs and names for claiming - CRITICAL for matching runs to users
    // Use normalized values to ensure consistency
    if (normalized.srcPlayerId) {
      newEntry.srcPlayerId = normalized.srcPlayerId;
    }
    if (normalized.srcPlayer2Id) {
      newEntry.srcPlayer2Id = normalized.srcPlayer2Id;
    }
    if (normalized.srcPlayerName) {
      newEntry.srcPlayerName = normalized.srcPlayerName;
    }
    if (normalized.srcPlayer2Name) {
      newEntry.srcPlayer2Name = normalized.srcPlayer2Name;
    }
    // Save subcategory info if present
    if (normalized.subcategory) {
      newEntry.subcategory = normalized.subcategory;
    }
    if (normalized.srcSubcategory) {
      newEntry.srcSubcategory = normalized.srcSubcategory;
    }
    
    await setDoc(newDocRef, newEntry);
    
    // NEW: Try to auto-assign the run if it's imported from SRC and unclaimed
    // This happens immediately when the run is added, before any manual claiming
    if (isImportedRun && (!newEntry.playerId || newEntry.playerId.trim() === "")) {
      // Try to auto-assign based on SRC username matching
      try {
        await tryAutoAssignRunFirestore(newDocRef.id, newEntry as LeaderboardEntry);
      } catch (error) {
        // Don't fail run creation if auto-assignment fails - it can be claimed later
        console.error(`Failed to auto-assign run ${newDocRef.id}:`, error);
      }
    }
    
    return newDocRef.id;
  } catch (error) {
    // Re-throw the error so the caller can see what went wrong
    throw error;
  }
};

export const getPlayerByUidFirestore = async (uid: string): Promise<Player | null> => {
  if (!db) return null;
  try {
    // No temporary profiles - only return real player documents
    const playerDocRef = doc(db, "players", uid);
    const playerDocSnap = await getDoc(playerDocRef);
    if (playerDocSnap.exists()) {
      return { id: playerDocSnap.id, ...playerDocSnap.data() } as Player;
    }
    return null;
  } catch (error) {
    return null;
  }
};

export const getPlayerByDisplayNameFirestore = async (displayName: string): Promise<Player | null> => {
  if (!db) return null;
  try {
    // Try direct lookup by displayName (indexed query)
    const normalizedDisplayName = displayName.trim();
    const q = query(
      collection(db, "players"),
      where("displayName", "==", normalizedDisplayName),
      firestoreLimit(1)
    );
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() } as Player;
    }
    
    // Fallback: search by email prefix (only if displayName query fails)
    const allPlayersQuery = query(collection(db, "players"), firestoreLimit(500));
    const allPlayersSnapshot = await getDocs(allPlayersQuery);
    const normalizedSearch = normalizedDisplayName.toLowerCase();
    
    const player = allPlayersSnapshot.docs.find(doc => {
      const data = doc.data();
      const email = (data.email || "").toLowerCase();
      return email.split('@')[0] === normalizedSearch;
    });
    
    if (player) {
      return { id: player.id, ...player.data() } as Player;
    }
    return null;
  } catch (error) {
    
    return null;
  }
};

/**
 * Check if a display name is available (case-insensitive)
 * Returns true if available, false if taken
 */
export const isDisplayNameAvailableFirestore = async (displayName: string): Promise<boolean> => {
  if (!db || !displayName || !displayName.trim()) return false;
  try {
    const normalizedDisplayName = displayName.trim().toLowerCase();
    
    // Get all players and check case-insensitive match
    const allPlayersQuery = query(collection(db, "players"), firestoreLimit(1000));
    const querySnapshot = await getDocs(allPlayersQuery);
    
    for (const doc of querySnapshot.docs) {
      const player = doc.data() as Player;
      const playerDisplayName = (player.displayName || "").trim().toLowerCase();
      
      if (playerDisplayName === normalizedDisplayName) {
        return false; // Display name is taken
      }
    }
    
    return true; // Display name is available
  } catch (error) {
    
    return false; // On error, assume not available to be safe
  }
};

export const getPlayersWithTwitchUsernamesFirestore = async (): Promise<Array<{ uid: string; displayName: string; twitchUsername: string; nameColor?: string; profilePicture?: string }>> => {
  if (!db) return [];
  try {
    const q = query(collection(db, "players"), firestoreLimit(1000));
    const querySnapshot = await getDocs(q);
    
    const players = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Player))
      .filter(player => player.twitchUsername && player.twitchUsername.trim())
      .map(player => ({
        uid: player.uid,
        displayName: player.displayName || "",
        twitchUsername: player.twitchUsername!.trim(),
        nameColor: player.nameColor,
        profilePicture: player.profilePicture,
      }));
    
    return players;
  } catch (error) {
    
    return [];
  }
};

/**
 * Get all players with SRC usernames set
 * Used for running autoclaiming for all users
 */
export const getPlayersWithSRCUsernamesFirestore = async (): Promise<Array<{ uid: string; srcUsername: string }>> => {
  if (!db) return [];
  try {
    const q = query(collection(db, "players"), firestoreLimit(1000));
    const querySnapshot = await getDocs(q);
    
    const players = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Player))
      .filter(player => player.srcUsername && player.srcUsername.trim())
      .map(player => ({
        uid: player.uid,
        srcUsername: player.srcUsername!.trim(),
      }));
    
    return players;
  } catch (error) {
    
    return [];
  }
};

/**
 * Run autoclaiming for all users with SRC usernames set
 * This ensures that all users with autoclaiming enabled get their runs claimed
 * Can be called periodically or when new runs are imported
 */
export const runAutoclaimingForAllUsersFirestore = async (): Promise<{ totalUsers: number; totalClaimed: number; errors: string[] }> => {
  if (!db) {
    return { totalUsers: 0, totalClaimed: 0, errors: [] };
  }
  
  const result = { totalUsers: 0, totalClaimed: 0, errors: [] as string[] };
  
  try {
    // Get all players with SRC usernames
    const playersWithSRC = await getPlayersWithSRCUsernamesFirestore();
    result.totalUsers = playersWithSRC.length;
    
    if (playersWithSRC.length === 0) {
      return result;
    }
    
    
    
    // Run autoclaiming for each user
    // Process in batches to avoid overwhelming the system
    const BATCH_SIZE = 10;
    for (let i = 0; i < playersWithSRC.length; i += BATCH_SIZE) {
      const batch = playersWithSRC.slice(i, i + BATCH_SIZE);
      
      await Promise.all(
        batch.map(async (player) => {
          try {
            const claimResult = await autoClaimRunsBySRCUsernameFirestore(player.uid, player.srcUsername);
            result.totalClaimed += claimResult.claimed;
            if (claimResult.errors.length > 0) {
              result.errors.push(...claimResult.errors.map(err => `User ${player.uid}: ${err}`));
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push(`User ${player.uid} (${player.srcUsername}): ${errorMsg}`);
            
          }
        })
      );
      
      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < playersWithSRC.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    
    
    return result;
  } catch (error) {
    
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
};

export const createPlayerFirestore = async (player: Omit<Player, 'id'>): Promise<string | null> => {
  if (!db) return null;
  try {
    const playerDocRef = doc(db, "players", player.uid);
    await setDoc(playerDocRef, player);
    return player.uid;
  } catch (error) {
    
    return null;
  }
};

/**
 * NEW: Centralized function to try auto-assigning a single run when it's added
 * Checks all users with SRC usernames to see if any match this run
 * This runs immediately when a run is imported, before manual claiming
 */
async function tryAutoAssignRunFirestore(runId: string, runData: LeaderboardEntry): Promise<boolean> {
  if (!db || !runData.importedFromSRC) return false;
  
  // Must be unclaimed
  if (runData.playerId && runData.playerId.trim() !== "") return false;
  
  try {
    // Get the SRC player names from the run (with fallback to playerName)
    const runSRC1 = runData.srcPlayerName ? runData.srcPlayerName.trim().toLowerCase() : 
                   (runData.playerName ? runData.playerName.trim().toLowerCase() : "");
    const runSRC2 = runData.srcPlayer2Name ? runData.srcPlayer2Name.trim().toLowerCase() : 
                   (runData.player2Name ? runData.player2Name.trim().toLowerCase() : "");
    
    if (!runSRC1 && !runSRC2) return false;
    
    // Get all players with SRC usernames
    const playersQuery = query(collection(db, "players"), firestoreLimit(1000));
    const playersSnapshot = await getDocs(playersQuery);
    
    const runDocRef = doc(db, "leaderboardEntries", runId);
    const updateData: Partial<LeaderboardEntry> = {};
    let assigned = false;
    
    // Check each player's SRC username against the run
    for (const playerDoc of playersSnapshot.docs) {
      const player = playerDoc.data() as Player;
      if (!player.srcUsername || !player.srcUsername.trim()) continue;
      
      const playerSRC = player.srcUsername.trim().toLowerCase();
      const isCoOp = runData.runType === 'co-op';
      
      // Check if player1 matches
      if (runSRC1 && runSRC1 === playerSRC) {
        updateData.playerId = player.uid;
        updateData.playerName = player.displayName;
        assigned = true;
      }
      
      // Check if player2 matches (for co-op runs)
      if (runSRC2 && runSRC2 === playerSRC && isCoOp) {
        updateData.player2Id = player.uid;
        updateData.player2Name = player.displayName;
        assigned = true;
      }
    }
    
    // Update the run if we found matches
    if (assigned) {
      await updateDoc(runDocRef, updateData);
      
      // If run is verified, calculate points
      if (runData.verified) {
        const updatedRunDoc = await getDoc(runDocRef);
        if (updatedRunDoc.exists()) {
          const updatedRunData = updatedRunDoc.data() as LeaderboardEntry;
          if (updatedRunData.verified && (updatedRunData.points === undefined || updatedRunData.points === null)) {
            const verifiedBy = "auto-assigned";
            await updateRunVerificationStatusFirestore(runId, true, verifiedBy);
          }
        }
      }
      
      // Recalculate points for assigned players
      const playerIds: string[] = [];
      if (updateData.playerId) playerIds.push(updateData.playerId);
      if (updateData.player2Id && updateData.player2Id !== updateData.playerId) {
        playerIds.push(updateData.player2Id);
      }
      if (playerIds.length > 0) {
        await recalculatePointsForPlayers(playerIds, runData);
      }
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error in tryAutoAssignRunFirestore for run ${runId}:`, error);
    return false;
  }
}

/**
 * Ultra-simplified auto-claim: Just match SRC usernames directly from all leaderboard entries
 * No complex normalization, just simple case-insensitive string matching
 */
export const autoClaimRunsBySRCUsernameFirestore = async (userId: string, srcUsername: string): Promise<{ claimed: number; errors: string[] }> => {
  if (!db || !srcUsername || !srcUsername.trim()) {
    return { claimed: 0, errors: [] };
  }
  
  const result = { claimed: 0, errors: [] as string[] };
  
  try {
    // Get player data
    const player = await getPlayerByUidFirestore(userId);
    if (!player) {
      return result;
    }
    
    // Simple case-insensitive matching function
    const matches = (a: string | null | undefined, b: string): boolean => {
      if (!a) return false;
      return a.trim().toLowerCase() === b.trim().toLowerCase();
    };
    
    const searchUsername = srcUsername.trim().toLowerCase();
    
    // Get ALL leaderboard entries (both verified and unverified)
    // We'll process them all and match by SRC username
    const allRuns: LeaderboardEntry[] = [];
    
    // Get verified runs - fetch ALL runs by paginating through results
    try {
      let verifiedSnapshot;
      let lastDoc = null;
      do {
        let verifiedQuery;
        if (lastDoc) {
          verifiedQuery = query(
            collection(db, "leaderboardEntries"), 
            where("verified", "==", true),
            orderBy("__name__"),
            startAfter(lastDoc),
            firestoreLimit(5000)
          );
        } else {
          verifiedQuery = query(
            collection(db, "leaderboardEntries"), 
            where("verified", "==", true),
            orderBy("__name__"),
            firestoreLimit(5000)
          );
        }
        verifiedSnapshot = await getDocs(verifiedQuery);
        verifiedSnapshot.docs.forEach(doc => {
          allRuns.push({ id: doc.id, ...doc.data() } as LeaderboardEntry);
        });
        if (verifiedSnapshot.docs.length > 0) {
          lastDoc = verifiedSnapshot.docs[verifiedSnapshot.docs.length - 1];
        } else {
          lastDoc = null;
        }
      } while (verifiedSnapshot.docs.length === 5000 && lastDoc);
    } catch (error) {
      // If orderBy fails, fall back to simple query with limit
      try {
        const verifiedQuery = query(collection(db, "leaderboardEntries"), where("verified", "==", true), firestoreLimit(10000));
        const verifiedSnapshot = await getDocs(verifiedQuery);
        verifiedSnapshot.docs.forEach(doc => {
          allRuns.push({ id: doc.id, ...doc.data() } as LeaderboardEntry);
        });
      } catch (error2) {
        // Continue
      }
    }
    
    // Get unverified runs too (they'll be claimed when verified) - fetch ALL runs
    try {
      let unverifiedSnapshot;
      let lastDoc = null;
      do {
        let unverifiedQuery;
        if (lastDoc) {
          unverifiedQuery = query(
            collection(db, "leaderboardEntries"), 
            where("verified", "==", false),
            orderBy("__name__"),
            startAfter(lastDoc),
            firestoreLimit(5000)
          );
        } else {
          unverifiedQuery = query(
            collection(db, "leaderboardEntries"), 
            where("verified", "==", false),
            orderBy("__name__"),
            firestoreLimit(5000)
          );
        }
        unverifiedSnapshot = await getDocs(unverifiedQuery);
        unverifiedSnapshot.docs.forEach(doc => {
          allRuns.push({ id: doc.id, ...doc.data() } as LeaderboardEntry);
        });
        if (unverifiedSnapshot.docs.length > 0) {
          lastDoc = unverifiedSnapshot.docs[unverifiedSnapshot.docs.length - 1];
        } else {
          lastDoc = null;
        }
      } while (unverifiedSnapshot.docs.length === 5000 && lastDoc);
    } catch (error) {
      // If orderBy fails, fall back to simple query with limit
      try {
        const unverifiedQuery = query(collection(db, "leaderboardEntries"), where("verified", "==", false), firestoreLimit(10000));
        const unverifiedSnapshot = await getDocs(unverifiedQuery);
        unverifiedSnapshot.docs.forEach(doc => {
          allRuns.push({ id: doc.id, ...doc.data() } as LeaderboardEntry);
        });
      } catch (error2) {
        // Continue - non-admin users might not have permission
      }
    }
    
    console.log(`[AutoClaim] Searching ${allRuns.length} total runs for SRC username: ${searchUsername}`);
    
    // Find runs where srcPlayerName or srcPlayer2Name matches (case-insensitive)
    // Also check playerName/player2Name as fallback for older runs that might not have srcPlayerName set
    const runsToClaim = allRuns.filter(run => {
      // Must be imported from SRC
      if (!run.importedFromSRC) return false;
      
      // Must be unclaimed
      if (run.playerId && run.playerId.trim() !== "") return false;
      
      // Try srcPlayerName first, fallback to playerName if srcPlayerName doesn't exist
      const srcPlayer1 = run.srcPlayerName ? run.srcPlayerName.trim().toLowerCase() : 
                        (run.playerName ? run.playerName.trim().toLowerCase() : "");
      const srcPlayer2 = run.srcPlayer2Name ? run.srcPlayer2Name.trim().toLowerCase() : 
                        (run.player2Name ? run.player2Name.trim().toLowerCase() : "");
      
      return srcPlayer1 === searchUsername || srcPlayer2 === searchUsername;
    });
    
    console.log(`[AutoClaim] Found ${runsToClaim.length} matching unclaimed runs`);
    
    if (runsToClaim.length === 0) {
      return result;
    }
    
    // Batch update runs
    let batch = writeBatch(db);
    let batchCount = 0;
    const MAX_BATCH_SIZE = 500;
    
    for (const run of runsToClaim) {
      const runDocRef = doc(db, "leaderboardEntries", run.id);
      const updateData: Partial<LeaderboardEntry> = {};
      
      // Determine which player slot to assign
      // Use srcPlayerName if available, fallback to playerName
      const srcPlayer1 = run.srcPlayerName ? run.srcPlayerName.trim().toLowerCase() : 
                        (run.playerName ? run.playerName.trim().toLowerCase() : "");
      const srcPlayer2 = run.srcPlayer2Name ? run.srcPlayer2Name.trim().toLowerCase() : 
                        (run.player2Name ? run.player2Name.trim().toLowerCase() : "");
      const isCoOp = run.runType === 'co-op';
      
      if (srcPlayer1 === searchUsername) {
        updateData.playerId = userId;
        updateData.playerName = player.displayName;
      }
      
      if (srcPlayer2 === searchUsername && isCoOp) {
        updateData.player2Id = userId;
        updateData.player2Name = player.displayName;
      }
      
      batch.update(runDocRef, updateData);
      batchCount++;
      
      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        batchCount = 0;
        batch = writeBatch(db);
      }
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }
    
    // Calculate points for verified runs that need them
    for (const run of runsToClaim) {
      if (run.verified && (run.points === undefined || run.points === null)) {
        try {
          const verifiedBy = player.displayName || player.email || userId;
          await updateRunVerificationStatusFirestore(run.id, true, verifiedBy);
        } catch (error) {
          result.errors.push(`Failed to calculate points for run ${run.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    
    result.claimed = runsToClaim.length;
    
    // Recalculate points for the user
    if (runsToClaim.length > 0) {
      try {
        await recalculatePlayerPointsFirestore(userId);
      } catch (error) {
        result.errors.push(`Failed to recalculate points: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
};

export const updatePlayerProfileFirestore = async (uid: string, data: Partial<Player>): Promise<boolean> => {
  if (!db) return false;
  try {
    const playerDocRef = doc(db, "players", uid);
    const docSnap = await getDoc(playerDocRef);
    
    // Filter out undefined values and convert empty strings for bio/pronouns/twitchUsername/srcUsername to deleteField
    // profilePicture: empty string should delete the field, undefined should skip (no change)
    const updateData: UpdateData<DocumentData> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        // Skip undefined values (no change)
        continue;
      } else if ((key === 'bio' || key === 'pronouns' || key === 'twitchUsername' || key === 'srcUsername' || key === 'profilePicture') && value === '') {
        // Use deleteField to remove the field when it's an empty string
        updateData[key] = deleteField();
      } else {
        updateData[key] = value;
      }
    }
    
    if (docSnap.exists()) {
      await updateDoc(playerDocRef, updateData);
    } else {
      // Create a complete player document if it doesn't exist
      const today = new Date().toISOString().split('T')[0];
      // Build newPlayer object, only including bio/pronouns if they have values
      const newPlayer: Partial<Player> & DocumentData = {
        uid: uid,
        displayName: data.displayName || "",
        email: data.email || "",
        joinDate: today,
        totalRuns: 0,
        bestRank: null,
        favoriteCategory: null,
        favoritePlatform: null,
        nameColor: data.nameColor || "#cba6f7",
        isAdmin: false,
        totalPoints: 0,
      };
      
      // Only add bio/pronouns/twitchUsername/srcUsername if they have non-empty values
      if (data.bio && data.bio.trim()) {
        newPlayer.bio = data.bio.trim();
      }
      if (data.pronouns && data.pronouns.trim()) {
        newPlayer.pronouns = data.pronouns.trim();
      }
      if (data.twitchUsername && data.twitchUsername.trim()) {
        newPlayer.twitchUsername = data.twitchUsername.trim();
      }
      if (data.srcUsername && data.srcUsername.trim()) {
        newPlayer.srcUsername = data.srcUsername.trim();
      }
      if (data.profilePicture) {
        newPlayer.profilePicture = data.profilePicture;
      }
      
      await setDoc(playerDocRef, newPlayer);
    }
    
    // Check if SRC username is being updated
    const oldSRCUsername = docSnap.exists() ? (docSnap.data() as Player).srcUsername : null;
    const newSRCUsername = data.srcUsername?.trim();
    const srcUsernameChanged = newSRCUsername && newSRCUsername !== oldSRCUsername;
    
    // Automatically claim runs when SRC username is set or changed
    // Run synchronously to ensure it completes and we can see any errors
    if ((srcUsernameChanged && newSRCUsername) || (!docSnap.exists() && newSRCUsername)) {
      try {
        const claimResult = await autoClaimRunsBySRCUsernameFirestore(uid, newSRCUsername);
        if (claimResult.claimed > 0) {
          console.log(`[RunAssignment] Auto-claimed ${claimResult.claimed} runs for user ${uid} with SRC username ${newSRCUsername}`);
        }
        if (claimResult.errors.length > 0) {
          console.error(`[RunAssignment] Auto-claim errors for user ${uid}:`, claimResult.errors);
        }
      } catch (error) {
        console.error(`[RunAssignment] Failed to auto-claim runs for user ${uid}:`, error);
      }
    }
    
    return true;
  } catch (error) {
    
    return false;
  }
};

export const getRecentRunsFirestore = async (limitCount: number = 10): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  try {
    const fetchLimit = Math.min(limitCount + 20, 50);
    // Use orderBy instead of client-side sorting
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      orderBy("date", "desc"),
      firestoreLimit(fetchLimit)
    );
    
    const querySnapshot = await getDocs(q);
    
    let entries: LeaderboardEntry[] = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
      .filter(entry => !entry.isObsolete);
    
    entries = entries.slice(0, limitCount);

    // Batch fetch players instead of N+1 queries
    const playerIds = new Set<string>();
    const player2Names = new Set<string>();
    entries.forEach(entry => {
      playerIds.add(entry.playerId);
      if (entry.player2Name && entry.runType === 'co-op') {
        player2Names.add(entry.player2Name.trim().toLowerCase());
      }
    });

    const playerMap = new Map<string, Player>();
    if (playerIds.size > 0) {
      const playerPromises = Array.from(playerIds).map(id => getPlayerByUidFirestore(id));
      const players = await Promise.all(playerPromises);
      players.forEach(player => {
        if (player) {
          playerMap.set(player.uid, player);
          if (player.displayName) {
            playerMap.set(player.displayName.toLowerCase(), player);
          }
        }
      });
    }

    // Enrich entries with player data
    const enrichedEntries = entries.map(entry => {
      const player = playerMap.get(entry.playerId);
      if (player) {
        if (player.displayName) {
          entry.playerName = player.displayName;
        }
        if (player.nameColor) {
          entry.nameColor = player.nameColor;
        }
      }
      
      if (entry.player2Name && entry.runType === 'co-op') {
        const player2 = playerMap.get(entry.player2Name.trim().toLowerCase());
        if (player2) {
          entry.player2Name = player2.displayName || entry.player2Name;
          if (player2.nameColor) {
            entry.player2Color = player2.nameColor;
          }
        }
      }
      
      return entry;
    });

    return enrichedEntries;
  } catch (error) {
    
    return [];
  }
};

export const getPlayerRunsFirestore = async (playerId: string): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  try {
    let entries: LeaderboardEntry[] = [];
    let playerDisplayName: string | null = null;
    
    // Get player document to find display name
    const player = await getPlayerByUidFirestore(playerId);
    if (!player) {
      // No player found - return empty (no temporary profiles)
      return [];
    }
    
    if (player.displayName) {
      playerDisplayName = player.displayName.trim();
    }
    
    // Fetch runs by playerId (as player1) - increased limit to handle IL runs
    // IL runs can result in many runs per player, so we need a higher limit
    const q = query(
      collection(db, "leaderboardEntries"),
      where("playerId", "==", playerId),
      where("verified", "==", true),
      firestoreLimit(1000)
    );
    
    const querySnapshot = await getDocs(q);
    entries = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
      .filter(entry => !entry.isObsolete);
    
    // Also fetch co-op runs where this player is player2 (via player2Id)
    // Increased limit to handle players with many co-op IL runs
    const coOpQuery = query(
      collection(db, "leaderboardEntries"),
      where("player2Id", "==", playerId),
      where("verified", "==", true),
      where("runType", "==", "co-op"),
      firestoreLimit(1000)
    );
    
    const coOpSnapshot = await getDocs(coOpQuery);
    const coOpEntries = coOpSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
      .filter(entry => !entry.isObsolete);
    
    // Add co-op runs where player is player2 (avoid duplicates)
    const entryIds = new Set(entries.map(e => e.id));
    const additionalCoOpRuns = coOpEntries.filter(r => !entryIds.has(r.id));
    entries = [...entries, ...additionalCoOpRuns];

    if (entries.length === 0) {
      return [];
    }

    // Get unique leaderboardType/level/category/platform/runType combinations from player's runs
    // This ensures we calculate ranks correctly for regular, individual-level, and community-golds separately
    const combinations = new Set<string>();
    entries.forEach(entry => {
      const leaderboardType = entry.leaderboardType || 'regular';
      const level = entry.level || '';
      const key = `${leaderboardType}_${level}_${entry.category}_${entry.platform}_${entry.runType || 'solo'}`;
      combinations.add(key);
    });

    // Create a map to store ranks for each combination using calculateRanksForGroup
    const rankMap = new Map<string, Map<string, number>>(); // combination -> runId -> rank

    // Calculate ranks for each unique combination using the proper helper function
    for (const comboKey of combinations) {
      const parts = comboKey.split('_');
      const leaderboardType = parts[0] as 'regular' | 'individual-level' | 'community-golds';
      const level = parts[1] || undefined;
      const categoryId = parts[2]!;
      const platformId = parts[3]!;
      const runType = (parts[4] || 'solo') as 'solo' | 'co-op';
      
      // Use calculateRanksForGroup to get accurate ranks from all verified runs in this group
      const groupRankMap = await calculateRanksForGroup(
        leaderboardType,
        categoryId,
        platformId,
        runType,
        level
      );
      
      rankMap.set(comboKey, groupRankMap);
    }

    // Enrich with player display name and color
    const playerData = await getPlayerByUidFirestore(playerId);
    return entries.map(entry => {
      if (playerData) {
        if (playerData.displayName) {
          entry.playerName = playerData.displayName;
        }
        if (playerData.nameColor) {
          entry.nameColor = playerData.nameColor;
        }
      }
      
      // Assign rank based on the combination (including leaderboardType and level)
      const leaderboardType = entry.leaderboardType || 'regular';
      const level = entry.level || '';
      const comboKey = `${leaderboardType}_${level}_${entry.category}_${entry.platform}_${entry.runType || 'solo'}`;
      const comboRankMap = rankMap.get(comboKey);
      if (comboRankMap) {
        const calculatedRank = comboRankMap.get(entry.id);
        // Show all calculated ranks (not just 1-3) for display on player profiles
        // This ensures ranks match what's shown on leaderboards
        if (calculatedRank !== undefined && calculatedRank >= 1) {
          entry.rank = calculatedRank;
        } else {
          entry.rank = undefined;
        }
      }
      
      return entry;
    });
  } catch (error) {
    return [];
  }
};

export const getPlayerPendingRunsFirestore = async (playerId: string): Promise<LeaderboardEntry[]> => {
  if (!db) {
    
    return [];
  }
  if (!playerId) {
    
    return [];
  }
  try {
    const q = query(
      collection(db, "leaderboardEntries"),
      where("playerId", "==", playerId),
      where("verified", "==", false),
      firestoreLimit(100)
    );
    
    const querySnapshot = await getDocs(q);
    
    const entries = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
      .sort((a, b) => {
        // Sort by date descending (most recent first)
        const dateA = a.date || "";
        const dateB = b.date || "";
        return dateB.localeCompare(dateA);
      });

    

    // Enrich with player display name and color
    const player = await getPlayerByUidFirestore(playerId);
    return entries.map(entry => {
      if (player) {
        if (player.displayName) {
          entry.playerName = player.displayName;
        }
        if (player.nameColor) {
          entry.nameColor = player.nameColor;
        }
      }
      return entry;
    });
  } catch (error) {
    
    return [];
  }
};

export const getUnverifiedLeaderboardEntriesFirestore = async (): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  try {
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", false),
      firestoreLimit(100)
    );
    const querySnapshot = await getDocs(q);
    const entries = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
    
    // Enrich entries with player display names and colors
    const enrichedEntries = await Promise.all(entries.map(entry => enrichEntryWithPlayerData(entry)));

    return enrichedEntries;
  } catch (error) {
    return [];
  }
};

export const getLeaderboardEntryByIdFirestore = async (runId: string): Promise<LeaderboardEntry | null> => {
  if (!db) return null;
  try {
    const runDocRef = doc(db, "leaderboardEntries", runId);
    const runDocSnap = await getDoc(runDocRef);
    if (runDocSnap.exists()) {
      const entry = { id: runDocSnap.id, ...runDocSnap.data() } as LeaderboardEntry;
      
      // Calculate rank if the run is verified using calculateRanksForGroup for accuracy
      if (entry.verified && !entry.isObsolete) {
        try {
          const leaderboardType = entry.leaderboardType || 'regular';
          const rankMap = await calculateRanksForGroup(
            leaderboardType,
            entry.category,
            entry.platform,
            (entry.runType || 'solo') as 'solo' | 'co-op',
            entry.level,
            entry
          );
          
          const calculatedRank = rankMap.get(entry.id);
          // Show all calculated ranks (not just 1-3) for display on run pages
          // This ensures ranks match what's shown on leaderboards
          if (calculatedRank !== undefined && calculatedRank >= 1) {
            entry.rank = calculatedRank;
          } else {
            entry.rank = undefined;
          }
        } catch (error) {
          // Silent fail - rank will remain undefined
          
        }
      }
      
      // Enrich with player display names and colors
      try {
        return await enrichEntryWithPlayerData(entry);
      } catch (error) {
        // Silent fail - continue without enrichment
        return entry;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
};

export const updateLeaderboardEntryFirestore = async (runId: string, data: Partial<LeaderboardEntry>): Promise<boolean> => {
  if (!db) return false;
  try {
    const runDocRef = doc(db, "leaderboardEntries", runId);
    const runDocSnap = await getDoc(runDocRef);
    
    if (!runDocSnap.exists()) {
      return false;
    }
    
    // If time, category, or platform changed, recalculate points if verified
    const runData = runDocSnap.data() as LeaderboardEntry;
    const updateData: UpdateData<DocumentData> = {};
    
    // Filter out undefined values and convert null to deleteField for Firestore
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        // Skip undefined values
        continue;
      } else if (value === null) {
        // Use deleteField to remove the field
        updateData[key] = deleteField();
      } else {
        updateData[key] = value;
      }
    }
    
    if (runData.verified && (data.time || data.category || data.platform)) {
        // Get category and platform names for points calculation
        const newCategoryId = data.category || runData.category;
        const newPlatformId = data.platform || runData.platform;
        const newTime = data.time || runData.time;
        const newLeaderboardType = data.leaderboardType || runData.leaderboardType || 'regular';
        const newLevel = data.level !== undefined ? data.level : runData.level;
        
        // For imported runs, use SRC fallback names if IDs are empty
        let categoryName = runData.srcCategoryName || "Unknown";
        let platformName = runData.srcPlatformName || "Unknown";
        
        // Try to fetch category/platform by ID if they exist
        if (newCategoryId && newCategoryId.trim() !== "") {
          try {
            const categoryDocSnap = await getDoc(doc(db, "categories", newCategoryId));
            if (categoryDocSnap?.exists()) {
              categoryName = categoryDocSnap.data().name || categoryName;
            }
          } catch (error) {
            // Use SRC fallback if fetch fails
            
          }
        }
        
        if (newPlatformId && newPlatformId.trim() !== "") {
          try {
            const platformDocSnap = await getDoc(doc(db, "platforms", newPlatformId));
            if (platformDocSnap?.exists()) {
              platformName = platformDocSnap.data().name || platformName;
            }
          } catch (error) {
            // Use SRC fallback if fetch fails
            
          }
        }
      
      // Calculate rank using helper function
      const isObsolete = data.isObsolete !== undefined ? data.isObsolete : runData.isObsolete;
      const rankMap = await calculateRanksForGroup(
        newLeaderboardType,
        newCategoryId,
        newPlatformId,
        (data.runType || runData.runType || 'solo') as 'solo' | 'co-op',
        newLevel
      );
      
      // Find the rank of this run
      let rank: number | undefined = undefined;
      if (!isObsolete) {
        const calculatedRank = rankMap.get(runId);
        rank = normalizeRank(calculatedRank);
      }
      
      // Store rank in update data (only if rank is 1, 2, or 3 for bonus points)
      if (rank !== undefined) {
        updateData.rank = rank;
      } else {
        updateData.rank = deleteField(); // Remove rank if obsolete, not ranked, or rank > 3
      }
      
      // Calculate points with rank
      const points = calculatePoints(
        newTime, 
        categoryName, 
        platformName,
        newCategoryId,
        newPlatformId,
        rank,
        (data.runType || runData.runType || 'solo') as 'solo' | 'co-op' | undefined
      );
      updateData.points = points;
      
      // Recalculate points for affected players
      const playerIds: string[] = [];
      if (runData.playerId && runData.playerId !== "imported" && !runData.playerId.startsWith("unlinked_") && !runData.playerId.startsWith("unclaimed_")) {
        playerIds.push(runData.playerId);
      }
      await recalculatePointsForPlayers(playerIds, runData);
    }
    
    await updateDoc(runDocRef, updateData);
    return true;
  } catch (error) {
    
    // Re-throw the error so the caller can see what went wrong
    throw error;
  }
};

// Helper function to create player document for player2
async function createPlayerDocumentForPlayer2(name: string, uid: string, joinDate: string): Promise<void> {
  if (!db) return;
  const newPlayerData: Omit<Player, 'id'> = {
    uid: uid,
    displayName: name,
    email: "",
    joinDate: joinDate,
    totalRuns: 0,
    bestRank: null,
    favoriteCategory: null,
    favoritePlatform: null,
    nameColor: "#cba6f7",
    isAdmin: false,
    totalPoints: 0,
  };
  
  try {
    await createPlayerFirestore(newPlayerData);
  } catch (createError) {
    
    throw createError; // Re-throw so caller can handle
  }
}

export const updateRunVerificationStatusFirestore = async (runId: string, verified: boolean, verifiedBy?: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const runDocRef = doc(db, "leaderboardEntries", runId);
    const runDocSnap = await getDoc(runDocRef);
    
    if (!runDocSnap.exists()) {
      return false;
    }
    
    const runData = runDocSnap.data() as LeaderboardEntry;
    const updateData: { verified: boolean; verifiedBy?: string; points?: number } = { verified };
    
    // Calculate and store points when verifying OR if run is verified but doesn't have points yet
    // CRITICAL: Only calculate points for claimed runs (runs with a playerId)
    const isClaimed = runData.playerId && runData.playerId.trim() !== "";
    const needsPointsCalculation = verified && verifiedBy && isClaimed && (
      !runData.verified || // Run is being verified now
      (runData.verified && (runData.points === undefined || runData.points === null)) // Run is verified but missing points
    );
    
    if (needsPointsCalculation) {
      if (verifiedBy) {
        updateData.verifiedBy = verifiedBy;
      }
      
      // Calculate and store points (always recalculate to ensure accuracy)
      // Fetch category and platform names in parallel for better performance
      // For imported runs, use SRC fallback names if IDs are empty
      let categoryName = runData.srcCategoryName || "Unknown";
      let platformName = runData.srcPlatformName || "Unknown";
      
      // Try to fetch category/platform by ID if they exist
      if (runData.category && runData.category.trim() !== "") {
        try {
          const categoryDocSnap = await getDoc(doc(db, "categories", runData.category));
          if (categoryDocSnap?.exists()) {
            categoryName = categoryDocSnap.data().name || categoryName;
          }
        } catch (error) {
          // Use SRC fallback if fetch fails
          
        }
      }
      
      if (runData.platform && runData.platform.trim() !== "") {
        try {
          const platformDocSnap = await getDoc(doc(db, "platforms", runData.platform));
          if (platformDocSnap?.exists()) {
            platformName = platformDocSnap.data().name || platformName;
          }
        } catch (error) {
          // Use SRC fallback if fetch fails
          
        }
      }
        
      // Update the document first to mark it as verified
      // This ensures the run is included in rank calculations
      await updateDoc(runDocRef, { verified, verifiedBy });
      
      // Calculate rank using helper function
      // Include the current run in ranking to handle Firestore eventual consistency
      const leaderboardType = runData.leaderboardType || 'regular';
      const currentRunWithVerified: LeaderboardEntry = { ...runData, id: runId, verified: true };
      const rankMap = await calculateRanksForGroup(
        leaderboardType,
        runData.category,
        runData.platform,
        (runData.runType || 'solo') as 'solo' | 'co-op',
        runData.level,
        currentRunWithVerified
      );
      
      // Find the rank of this run
      let rank: number | undefined = undefined;
      if (!runData.isObsolete) {
        const calculatedRank = rankMap.get(runId);
        rank = normalizeRank(calculatedRank);
      }
      
      // Calculate points with rank (split for co-op runs)
      const points = calculatePoints(
        runData.time, 
        categoryName, 
        platformName,
        runData.category,
        runData.platform,
        rank,
        runData.runType as 'solo' | 'co-op' | undefined
      );
      
      // Update the document with calculated points and rank
      // Only store rank if it's 1, 2, or 3 (for bonus points)
      const updateFields: { points: number; rank?: number | ReturnType<typeof deleteField> } = { points };
      if (rank !== undefined) {
        updateFields.rank = rank;
      } else {
        // Remove rank field if obsolete, not ranked, or rank > 3
        updateFields.rank = deleteField();
      }
      await updateDoc(runDocRef, updateFields);
      
      // Recalculate points for affected players
      // CRITICAL: Only process claimed runs (non-empty playerId)
      const playerIds: string[] = [];
      if (runData.playerId && runData.playerId.trim() !== "") {
        playerIds.push(runData.playerId);
      }
      // Also check player2Id for co-op runs
      if (runData.runType === 'co-op' && runData.player2Id && runData.player2Id.trim() !== "") {
        playerIds.push(runData.player2Id);
      }
      await recalculatePointsForPlayers(playerIds, runData);
      
      return true;
    } else if (!verified && runData.verified) {
      await updateDoc(runDocRef, updateFields);
      
      // Recalculate points for affected players
      // CRITICAL: Only process claimed runs (non-empty playerId)
      const playerIds: string[] = [];
      if (runData.playerId && runData.playerId.trim() !== "") {
        playerIds.push(runData.playerId);
      }
      // Also check player2Id for co-op runs
      if (runData.runType === 'co-op' && runData.player2Id && runData.player2Id.trim() !== "") {
        playerIds.push(runData.player2Id);
      }
      await recalculatePointsForPlayers(playerIds, runData);
    } else {
      // If just changing verified status without recalculation, update the document
      await updateDoc(runDocRef, updateData);
    }
    
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Update a player's total points by adding the given points
 */
export const updatePlayerPointsFirestore = async (playerId: string, pointsToAdd: number): Promise<boolean> => {
  if (!db) return false;
  try {
    const playerDocRef = doc(db, "players", playerId);
    const playerDocSnap = await getDoc(playerDocRef);
    
    if (playerDocSnap.exists()) {
      const currentData = playerDocSnap.data() as Player;
      const currentPoints = currentData.totalPoints || 0;
      await updateDoc(playerDocRef, { totalPoints: currentPoints + pointsToAdd });
    } else {
      // If player doesn't exist, create with initial points
      await setDoc(playerDocRef, { totalPoints: pointsToAdd }, { merge: true });
    }
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Recalculate total points for a player based on all their verified runs
 * Includes both solo runs (where player is player1) and co-op runs (where player is player2)
 * Includes all leaderboard types: regular, individual-level, and community-golds
 */
export const recalculatePlayerPointsFirestore = async (playerId: string): Promise<boolean> => {
  if (!db) return false;
  
  // CRITICAL: Never create or update profiles for unclaimed runs
  // Only process real player accounts (non-empty playerId)
  if (!playerId || playerId.trim() === "") {
    return false;
  }
  
  try {
    const playerDocRef = doc(db, "players", playerId);
    let playerDocSnap = null;
    
    try {
      playerDocSnap = await getDoc(playerDocRef);
    } catch (error) {
      
      playerDocSnap = null;
    }
    
    // Get player document to find displayName
    const player = await getPlayerByUidFirestore(playerId);
    
    // CRITICAL: Only process if player exists - never create temporary profiles
    if (!player) {
      // Player doesn't exist - this is fine, just return false
      // Don't create a profile - profiles should only be created by AuthProvider on signup
      return false;
    }
    
    let playerDisplayName: string | null = null;
    if (player.displayName) {
      playerDisplayName = player.displayName.trim();
    }
    
    // Get all verified runs where this player is player1 (by playerId)
    // Increased limit to handle IL runs which can result in many runs per player
    const q = query(
      collection(db, "leaderboardEntries"),
      where("playerId", "==", playerId),
      where("verified", "==", true),
      firestoreLimit(1000)
    );
    const querySnapshot = await getDocs(q);
    
    // Also find runs by display name matching (case-insensitive)
    // This handles cases where runs haven't been auto-linked yet
    // IMPORTANT: Only count claimed runs for points - unclaimed runs don't contribute to points
    let runsByDisplayName: LeaderboardEntry[] = [];
    if (playerDisplayName) {
      const normalizedDisplayName = playerDisplayName.toLowerCase();
      
      // Get all verified runs and filter by display name match
      const allVerifiedQuery = query(
        collection(db, "leaderboardEntries"),
        where("verified", "==", true),
        firestoreLimit(1000)
      );
      const allVerifiedSnapshot = await getDocs(allVerifiedQuery);
      
      runsByDisplayName = allVerifiedSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
        .filter(run => {
          const runPlayerName = (run.playerName || "").trim().toLowerCase();
          const runPlayer2Name = (run.player2Name || "").trim().toLowerCase();
          
          // Match if playerName matches (case-insensitive)
          const nameMatches = runPlayerName === normalizedDisplayName;
          if (!nameMatches) return false;
          
          // Only include runs that are already linked to this player
          // Unclaimed runs (imported, unlinked_*, unclaimed_*) should NOT count for points
          const currentPlayerId = run.playerId || "";
          return currentPlayerId === playerId;
        });
    }
    
    // Combine runs by playerId and runs by display name (avoid duplicates)
    const runsById = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
    const runIds = new Set(runsById.map(r => r.id));
    const additionalRuns = runsByDisplayName.filter(r => !runIds.has(r.id));
    
    // Also check for co-op runs where this player is player2 (all leaderboard types)
    // IMPORTANT: Only count claimed runs for points - unclaimed runs don't contribute to points
    // Query directly by player2Id for efficiency (includes all leaderboard types: regular, IL, community-golds)
    let player2Runs: LeaderboardEntry[] = [];
    
    try {
      const coOpQueryById = query(
        collection(db, "leaderboardEntries"),
        where("player2Id", "==", playerId),
        where("verified", "==", true),
        where("runType", "==", "co-op"),
        firestoreLimit(1000)
      );
      const coOpSnapshotById = await getDocs(coOpQueryById);
      player2Runs = coOpSnapshotById.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
        .filter(entry => !entry.isObsolete);
    } catch (error) {
      // If query fails (e.g., no index), fall back to name-based matching
      if (playerDisplayName) {
        const normalizedDisplayName = playerDisplayName.toLowerCase();
        const coOpQuery = query(
          collection(db, "leaderboardEntries"),
          where("verified", "==", true),
          where("runType", "==", "co-op"),
          firestoreLimit(1000)
        );
        const coOpSnapshot = await getDocs(coOpQuery);
        player2Runs = coOpSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
          .filter(entry => {
            const entryPlayer2Name = (entry.player2Name || "").trim().toLowerCase();
            const nameMatches = entryPlayer2Name === normalizedDisplayName;
            if (!nameMatches) return false;
            
            // Only include runs that are already linked to this player
            // Unclaimed runs should NOT count for points
            const currentPlayerId = entry.playerId || "";
            return currentPlayerId === playerId;
          });
      }
    }
    
    // Get all categories and platforms for lookup
    const categories = await getCategoriesFirestore();
    const platforms = await getPlatformsFirestore();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));
    const platformMap = new Map(platforms.map(p => [p.id, p.name]));
    
    // To calculate ranks, we need to fetch all runs for each category/platform combination
    // Group runs by category + platform + runType to calculate ranks within each group
    const runsByGroup = new Map<string, LeaderboardEntry[]>();
    
    // Process all runs (solo and co-op) for this player
    // Include obsolete runs - they get base points but no top 3 bonus
    // Combine runs by playerId, runs by display name, and player2 runs
    const allRuns = [
      ...runsById,
      ...additionalRuns,
      ...player2Runs
    ];
    
    // Group runs by leaderboardType + level + category + platform + runType
    // For ranking: ILs and community golds are ranked within their level, regular runs are ranked globally
    for (const runData of allRuns) {
      const leaderboardType = runData.leaderboardType || 'regular';
      const level = runData.level || '';
      // For regular runs, group by category+platform+runType
      // For ILs and community golds, also include level in the group key
      const groupKey = leaderboardType === 'regular' 
        ? `${leaderboardType}_${runData.category}_${runData.platform}_${runData.runType || 'solo'}`
        : `${leaderboardType}_${level}_${runData.category}_${runData.platform}_${runData.runType || 'solo'}`;
      if (!runsByGroup.has(groupKey)) {
        runsByGroup.set(groupKey, []);
      }
      runsByGroup.get(groupKey)!.push(runData);
    }
    
    // For each group, fetch all runs to calculate ranks
    const allRunsWithRanks: Array<{ run: LeaderboardEntry; rank: number }> = [];
    
    for (const [groupKey, runs] of runsByGroup.entries()) {
      const parts = groupKey.split('_');
      const leaderboardType = parts[0] as 'regular' | 'individual-level' | 'community-golds';
      
      let categoryId: string;
      let platformId: string;
      let runType: string;
      let levelId: string | undefined;
      
      if (leaderboardType === 'regular') {
        // Format: regular_category_platform_runType
        categoryId = parts[1]!;
        platformId = parts[2]!;
        runType = parts[3] || 'solo';
      } else {
        // Format: leaderboardType_level_category_platform_runType
        levelId = parts[1];
        categoryId = parts[2]!;
        platformId = parts[3]!;
        runType = parts[4] || 'solo';
      }
      
      // Calculate ranks using helper function
      const rankMap = await calculateRanksForGroup(
        leaderboardType,
        categoryId,
        platformId,
        runType as 'solo' | 'co-op',
        levelId
      );
      
      // Process all player runs (including obsolete) - obsolete runs get base points only
      for (const playerRun of runs) {
        let rank: number | undefined = undefined;
        if (!playerRun.isObsolete) {
          // Try to get rank from the calculated rankMap first (most accurate)
          const calculatedRank = rankMap.get(playerRun.id);
          rank = normalizeRank(calculatedRank);
          
          // If not in rankMap, calculate rank from the group runs
          // This ensures all runs in the group get ranked correctly
          if (rank === undefined) {
            // Sort all non-obsolete runs in this group by time
            const nonObsoleteGroupRuns = runs
              .filter(r => !r.isObsolete)
              .sort((a, b) => {
                const timeA = parseTimeToSeconds(a.time);
                const timeB = parseTimeToSeconds(b.time);
                return timeA - timeB;
              });
            
            // Find the index (rank) of this run
            const runIndex = nonObsoleteGroupRuns.findIndex(r => r.id === playerRun.id);
            if (runIndex >= 0) {
              rank = normalizeRank(runIndex + 1); // 1-based rank
            }
          }
          
          // Last resort: check if run already has a stored rank (only if it's 1, 2, or 3)
          // This is a fallback for cases where the run might not be in the current group
          if (rank === undefined) {
            rank = normalizeRank(playerRun.rank);
          }
        }
        allRunsWithRanks.push({ run: playerRun, rank: rank });
      }
    }
    
    let totalPoints = 0;
    const runsToUpdate: { id: string; points: number; rank?: number }[] = [];
    
    // Calculate points with ranks - always recalculate to ensure accuracy with current ranks
    for (const { run: runData, rank } of allRunsWithRanks) {
      // Always recalculate points to ensure we use the latest rank
      const categoryName = categoryMap.get(runData.category) || "Unknown";
      const platformName = platformMap.get(runData.platform) || "Unknown";
      
      // Calculate points - CRITICAL: calculatePoints automatically splits for co-op runs
      // For co-op runs: points are divided by 2, so each player gets half
      // For solo runs: points are full value
      const points = calculatePoints(
        runData.time, 
        categoryName, 
        platformName,
        runData.category,
        runData.platform,
        rank,
        runData.runType as 'solo' | 'co-op' | undefined
      );
      
      // Always update the run with recalculated points and rank
      runsToUpdate.push({ id: runData.id, points, rank: rank });
      
      // IMPORTANT: Points are already split for co-op runs by calculatePoints
      // So for co-op runs, each player gets the calculated (split) points
      // For solo runs, player gets full points
      // This ensures both players in a co-op run get equal points
      totalPoints += points;
    }
    
    // Batch update runs with points and ranks (Firestore batch limit is 500)
    const MAX_BATCH_SIZE = 500;
    let batchCount = 0;
    let batch = writeBatch(db);
    
    for (const run of runsToUpdate) {
      const runDocRef = doc(db, "leaderboardEntries", run.id);
      const updateData: { points: number; rank?: number | ReturnType<typeof deleteField> } = { 
        points: run.points 
      };
      // Store rank if it's 1, 2, or 3 (for bonus points), otherwise remove it
      const normalizedRank = normalizeRank(run.rank);
      if (normalizedRank !== undefined) {
        updateData.rank = normalizedRank;
      } else {
        updateData.rank = deleteField();
      }
      batch.update(runDocRef, updateData);
      batchCount++;
      
      // Commit batch if it reaches the limit
      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        batchCount = 0;
        batch = writeBatch(db); // Create new batch for remaining updates
      }
    }
    
    // Commit remaining updates
    if (batchCount > 0) {
      await batch.commit();
    }
    
    // Calculate total verified runs (only claimed runs count)
    // Only count runs that are actually linked to this player (not unclaimed)
    const totalVerifiedRuns = allRuns.length; // allRuns already contains only claimed runs for this player
    
    // Update player's total points and total runs
    // CRITICAL: Only update if player exists - never create player documents here
    // Player documents should only be created by AuthProvider when users sign up
    if (playerDocSnap && playerDocSnap.exists()) {
      // Update both totalPoints and totalRuns
      try {
      await updateDoc(playerDocRef, { totalPoints, totalRuns: totalVerifiedRuns });
      } catch (error) {
        
        throw error; // Re-throw to be caught by outer catch
      }
    } else {
      // CRITICAL: Never create player documents here
      // Player documents should only be created by AuthProvider when users sign up
      // If a player doesn't exist, we can't recalculate their points
      // This prevents creating temporary profiles for unclaimed runs
      
      return false;
    }
    
    return true;
  } catch (error) {
    
    if (error?.code === 'permission-denied') {
      
    }
    return false;
  }
};

/**
 * Helper function to enrich a single entry with player data
 * Updates playerName, nameColor, player2Name, and player2Color from player documents
 */
async function enrichEntryWithPlayerData(entry: LeaderboardEntry, playerMap?: Map<string, Player>): Promise<LeaderboardEntry> {
  // Check if run is unclaimed - simply check if playerId is empty/null
  const isUnclaimed = !entry.playerId || entry.playerId.trim() === "";
  
  // Only enrich player data for claimed runs
  if (!isUnclaimed && entry.playerId) {
    let player: Player | null = null;
    
    // Use provided playerMap if available, otherwise fetch
    if (playerMap) {
      player = playerMap.get(entry.playerId) || null;
    } else {
      player = await getPlayerByUidFirestore(entry.playerId);
    }
    
    if (player) {
      if (player.displayName) {
        entry.playerName = player.displayName;
      }
      if (player.nameColor) {
        entry.nameColor = player.nameColor;
      }
    }
    
    // For co-op runs, look up player2
    if (entry.player2Name && entry.runType === 'co-op') {
      let player2: Player | null = null;
      
      if (playerMap) {
        player2 = playerMap.get(entry.player2Name.trim().toLowerCase()) || null;
      } else {
        player2 = await getPlayerByDisplayNameFirestore(entry.player2Name);
      }
      
      if (player2) {
        entry.player2Name = player2.displayName || entry.player2Name;
        if (player2.nameColor) {
          entry.player2Color = player2.nameColor;
        }
      }
    }
  } else {
    // For unclaimed imported runs, use SRC player names if available
    if (entry.srcPlayerName) {
      entry.playerName = entry.srcPlayerName;
    }
    if (entry.srcPlayer2Name && entry.runType === 'co-op') {
      entry.player2Name = entry.srcPlayer2Name;
    }
  }
  
  return entry;
}

/**
 * Helper function to validate and normalize rank values
 * Returns a valid number rank (1-3) or undefined
 */
function normalizeRank(rank: number | string | undefined | null): number | undefined {
  if (rank === undefined || rank === null) return undefined;
  
  let numericRank: number | undefined = undefined;
  if (typeof rank === 'number' && !isNaN(rank) && rank > 0) {
    numericRank = rank;
  } else {
    const parsed = Number(rank);
    if (!isNaN(parsed) && parsed > 0) {
      numericRank = parsed;
    }
  }
  
  // Only return ranks 1-3 (for bonus points)
  if (numericRank !== undefined && numericRank >= 1 && numericRank <= 3 && Number.isInteger(numericRank)) {
    return numericRank;
  }
  
  return undefined;
}

/**
 * Helper function to recalculate points for players affected by run changes
 * Handles both solo and co-op runs efficiently
 * @param playerIds - Array of player IDs to recalculate points for
 * @param runData - Optional run data to extract player2 info for co-op runs
 */
async function recalculatePointsForPlayers(
  playerIds: string[],
  runData?: LeaderboardEntry
): Promise<void> {
  if (!db || playerIds.length === 0) return;
  
  // CRITICAL: Filter out empty/null playerIds - never process unclaimed runs
  const validPlayerIds = playerIds.filter(id => id && id.trim() !== "");
  if (validPlayerIds.length === 0) return;
  
  // Use Set to deduplicate player IDs
  const uniquePlayerIds = new Set(validPlayerIds);
  
  // Add player2 if it's a co-op run
  // CRITICAL: Always use player2Id if available (more reliable than name lookup)
  if (runData?.runType === 'co-op') {
    // First try player2Id (most reliable)
    if (runData.player2Id && runData.player2Id.trim() !== "") {
      uniquePlayerIds.add(runData.player2Id.trim());
    } 
    // Fallback to player2Name lookup if player2Id not available
    else if (runData.player2Name) {
      try {
        const player2 = await getPlayerByDisplayNameFirestore(runData.player2Name.trim());
        if (player2?.uid && player2.uid.trim() !== "") {
          uniquePlayerIds.add(player2.uid);
        }
      } catch (error) {
        
      }
    }
  }
  
  // Recalculate points for all affected players in parallel (but limit concurrency)
  // Only process valid, non-empty player IDs
  const recalculationPromises = Array.from(uniquePlayerIds)
    .filter(playerId => playerId && playerId.trim() !== "")
    .map(async (playerId) => {
      try {
        await recalculatePlayerPointsFirestore(playerId);
      } catch (error) {
        
        // Don't throw - continue with other players
      }
    });
  
  // Wait for all recalculations to complete (with some parallelism)
  await Promise.all(recalculationPromises);
}

export const deleteLeaderboardEntryFirestore = async (runId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const runDocRef = doc(db, "leaderboardEntries", runId);
    const runDocSnap = await getDoc(runDocRef);
    
    if (!runDocSnap.exists()) {
      return false;
    }
    
    const runData = runDocSnap.data() as LeaderboardEntry;
    const playerIds: string[] = [];
    
    // Collect player IDs that need recalculation
    // CRITICAL: Only process claimed runs (non-empty playerId)
    if (runData.playerId && runData.playerId.trim() !== "" && runData.verified) {
      // Only recalculate if run was verified (verified runs count for points)
      playerIds.push(runData.playerId);
    }
    // Also check player2Id for co-op runs
    if (runData.runType === 'co-op' && runData.player2Id && runData.player2Id.trim() !== "" && runData.verified) {
      playerIds.push(runData.player2Id);
    }
    
    // Delete the run
    await deleteDoc(runDocRef);
    
    // Recalculate points for affected players
    if (playerIds.length > 0) {
      await recalculatePointsForPlayers(playerIds, runData);
    }
    
    return true;
  } catch (error) {
    // Provide more detailed error information
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || 'unknown';
    
    // Check if it's a permission error
    if (errorCode === 'permission-denied' || errorMessage.includes('permission')) {
      throw new Error("Permission denied. Please ensure your admin account has a player document with isAdmin: true set. You can set this in the Admin panel under 'Manage Admin Status'.");
    }
    
    
    throw error; // Re-throw to let caller handle it
  }
};

export const deleteAllLeaderboardEntriesFirestore = async (): Promise<{ deleted: number; errors: string[] }> => {
  if (!db) return { deleted: 0, errors: ["Firestore not initialized"] };
  
  const result = { deleted: 0, errors: [] as string[] };
  
  try {
    let hasMore = true;
    let batchCount = 0;
    const batchSize = 500;
    const MAX_BATCH_SIZE = 500; // Firestore batch limit
    
    while (hasMore) {
      const q = query(collection(db, "leaderboardEntries"), firestoreLimit(batchSize));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        hasMore = false;
        break;
      }
      
      // Use batch deletes for efficiency and to avoid permission issues
      let batch = writeBatch(db);
      let batchDeleteCount = 0;
      
      for (const docSnapshot of querySnapshot.docs) {
        if (batchDeleteCount < MAX_BATCH_SIZE) {
          batch.delete(docSnapshot.ref);
          batchDeleteCount++;
        }
        
        // Commit batch if it reaches the limit
        if (batchDeleteCount >= MAX_BATCH_SIZE) {
          try {
            await batch.commit();
            result.deleted += batchDeleteCount;
            batchDeleteCount = 0;
            batch = writeBatch(db); // Create new batch for remaining deletes
          } catch (batchError) {
            const errorMsg = batchError instanceof Error ? batchError.message : String(batchError);
            result.errors.push(`Failed to delete batch: ${errorMsg}`);
            // Continue with next batch
            batchDeleteCount = 0;
            batch = writeBatch(db);
          }
        }
      }
      
      // Commit remaining deletes in the batch
      if (batchDeleteCount > 0) {
        try {
          await batch.commit();
          result.deleted += batchDeleteCount;
        } catch (batchError) {
          const errorMsg = batchError instanceof Error ? batchError.message : String(batchError);
          result.errors.push(`Failed to delete final batch: ${errorMsg}`);
        }
      }
      
      if (querySnapshot.docs.length < batchSize) {
        hasMore = false;
      }
      
      batchCount++;
      if (batchCount > 100) {
        result.errors.push("Stopped after 100 batches to prevent infinite loop");
        break;
      }
    }
    
    return result;
  } catch (error) {
    result.errors.push(`Delete all error: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
};

/**
 * Wipe all leaderboards: Delete all runs and reset all player stats
 * This is a destructive operation that cannot be undone
 */
export const wipeLeaderboardsFirestore = async (): Promise<{ 
  runsDeleted: number; 
  playersReset: number; 
  errors: string[] 
}> => {
  if (!db) return { runsDeleted: 0, playersReset: 0, errors: ["Firestore not initialized"] };
  
  const result = { runsDeleted: 0, playersReset: 0, errors: [] as string[] };
  
  try {
    // Step 1: Delete all leaderboard entries
    const deleteResult = await deleteAllLeaderboardEntriesFirestore();
    result.runsDeleted = deleteResult.deleted;
    result.errors.push(...deleteResult.errors);
    
    // Step 2: Reset all player stats (totalPoints, totalRuns, bestRank)
    try {
      let hasMore = true;
      let batchCount = 0;
      const batchSize = 500;
      
      while (hasMore) {
        const playersQuery = query(collection(db, "players"), firestoreLimit(batchSize));
        const playersSnapshot = await getDocs(playersQuery);
        
        if (playersSnapshot.empty) {
          hasMore = false;
          break;
        }
        
        // Use batch writes for efficiency
        let batch = writeBatch(db);
        let batchWriteCount = 0;
        const MAX_BATCH_SIZE = 500;
        
        for (const playerDoc of playersSnapshot.docs) {
          // Reset stats but keep other player data (displayName, email, etc.)
          batch.update(playerDoc.ref, {
            totalPoints: 0,
            totalRuns: 0,
            bestRank: null,
          });
          batchWriteCount++;
          result.playersReset++;
          
          if (batchWriteCount >= MAX_BATCH_SIZE) {
            await batch.commit();
            batchWriteCount = 0;
            batch = writeBatch(db);
          }
        }
        
        // Commit remaining updates
        if (batchWriteCount > 0) {
          await batch.commit();
        }
        
        if (playersSnapshot.docs.length < batchSize) {
          hasMore = false;
        }
        
        batchCount++;
        if (batchCount > 100) {
          result.errors.push("Stopped resetting players after 100 batches to prevent infinite loop");
          break;
        }
      }
    } catch (error) {
      result.errors.push(`Error resetting player stats: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return result;
  } catch (error) {
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
};

export const updateRunObsoleteStatusFirestore = async (runId: string, isObsolete: boolean): Promise<boolean> => {
  if (!db) return false;
  try {
    const runDocRef = doc(db, "leaderboardEntries", runId);
    await updateDoc(runDocRef, { isObsolete });
    return true;
  } catch (error) {
    return false;
  }
};

export const getDownloadEntriesFirestore = async (): Promise<DownloadEntry[]> => {
  if (!db) return [];
  try {
    const q = query(collection(db, "downloads"), firestoreLimit(200));
    const querySnapshot = await getDocs(q);
    const entries: DownloadEntry[] = [];
    querySnapshot.forEach((doc) => {
      entries.push({ id: doc.id, ...doc.data() } as DownloadEntry);
    });
    // Sort by order (if present), then by name
    entries.sort((a, b) => {
      const orderA = a.order ?? 999;
      const orderB = b.order ?? 999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    });
    return entries;
  } catch (error) {
    return [];
  }
};

export const addDownloadEntryFirestore = async (entry: Omit<DownloadEntry, 'id' | 'dateAdded' | 'order'>, addedByUid: string): Promise<string | null> => {
  if (!db) return null;
  try {
    // Get existing downloads to determine next order
    const existingDownloads = await getDownloadEntriesFirestore();
    const maxOrder = existingDownloads.length > 0 
      ? Math.max(...existingDownloads.map(d => d.order ?? 0), 0)
      : -1;
    
    const newDocRef = doc(collection(db, "downloads"));
    const newEntry: DownloadEntry = { 
      ...entry, 
      id: newDocRef.id, 
      addedBy: addedByUid, 
      dateAdded: new Date().toISOString().split('T')[0],
      order: maxOrder + 1
    };
    await setDoc(newDocRef, newEntry);
    return newDocRef.id;
  } catch (error) {
    
    throw error; // Re-throw so the caller can see what went wrong
  }
};

export const deleteDownloadEntryFirestore = async (id: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const downloadDocRef = doc(db, "downloads", id);
    const downloadDoc = await getDoc(downloadDocRef);
    if (!downloadDoc.exists()) {
      return false;
    }
    await deleteDoc(downloadDocRef);
    return true;
  } catch (error) {
    return false;
  }
};

export const updateDownloadOrderFirestore = async (id: string, order: number): Promise<boolean> => {
  if (!db) return false;
  try {
    const downloadDocRef = doc(db, "downloads", id);
    await updateDoc(downloadDocRef, { order });
    return true;
  } catch (error) {
    return false;
  }
};

export const moveDownloadUpFirestore = async (downloadId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const downloads = await getDownloadEntriesFirestore();
    const currentIndex = downloads.findIndex(d => d.id === downloadId);
    if (currentIndex <= 0) return false;
    
    const currentDownload = downloads[currentIndex];
    const previousDownload = downloads[currentIndex - 1];
    
    const tempOrder = currentDownload.order ?? currentIndex;
    currentDownload.order = previousDownload.order ?? currentIndex - 1;
    previousDownload.order = tempOrder;
    
    await Promise.all([
      updateDownloadOrderFirestore(currentDownload.id, currentDownload.order),
      updateDownloadOrderFirestore(previousDownload.id, previousDownload.order)
    ]);
    
    return true;
  } catch (error) {
    return false;
  }
};

export const moveDownloadDownFirestore = async (downloadId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const downloads = await getDownloadEntriesFirestore();
    const currentIndex = downloads.findIndex(d => d.id === downloadId);
    if (currentIndex < 0 || currentIndex >= downloads.length - 1) return false;
    
    const currentDownload = downloads[currentIndex];
    const nextDownload = downloads[currentIndex + 1];
    
    const tempOrder = currentDownload.order ?? currentIndex;
    currentDownload.order = nextDownload.order ?? currentIndex + 1;
    nextDownload.order = tempOrder;
    
    await Promise.all([
      updateDownloadOrderFirestore(currentDownload.id, currentDownload.order),
      updateDownloadOrderFirestore(nextDownload.id, nextDownload.order)
    ]);
    
    return true;
  } catch (error) {
    return false;
  }
};

export const getCategoriesFirestore = async (leaderboardType?: 'regular' | 'individual-level' | 'community-golds'): Promise<Category[]> => {
  if (!db) return [];
  try {
    const q = query(collection(db, "categories"));
    const querySnapshot = await getDocs(q);
    let categories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category));
    
    // Filter by leaderboardType if specified
    if (leaderboardType) {
      categories = categories.filter(cat => {
        const catType = cat.leaderboardType || 'regular';
        return catType === leaderboardType;
      });
    }
    
    categories.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : Infinity;
      const orderB = b.order !== undefined ? b.order : Infinity;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
    
    return categories;
  } catch (error) {
    return [];
  }
};

export const addCategoryFirestore = async (name: string, leaderboardType?: 'regular' | 'individual-level' | 'community-golds'): Promise<string | null> => {
  if (!db) return null;
  try {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return null;
    }
    
    const q = query(collection(db, "categories"));
    const existingSnapshot = await getDocs(q);
    const typeToCheck = leaderboardType || 'regular';
    
    // Check for duplicate name within the same leaderboard type
    const existingCategory = existingSnapshot.docs.find(
      doc => {
        const data = doc.data();
        const catType = data.leaderboardType || 'regular';
        return data.name?.trim().toLowerCase() === trimmedName.toLowerCase() && catType === typeToCheck;
      }
    );
    
    if (existingCategory) {
      return null;
    }
    
    // Get max order for this leaderboard type
    const existingCategories = existingSnapshot.docs
      .map(doc => doc.data())
      .filter(cat => {
        const catType = cat.leaderboardType || 'regular';
        return catType === typeToCheck;
      });
    
    const maxOrder = existingCategories.reduce((max, cat) => {
      const order = cat.order !== undefined ? cat.order : -1;
      return Math.max(max, order);
    }, -1);
    const nextOrder = maxOrder + 1;
    
    const newDocRef = doc(collection(db, "categories"));
    await setDoc(newDocRef, { 
      name: trimmedName, 
      order: nextOrder,
      leaderboardType: typeToCheck
    });
    return newDocRef.id;
  } catch (error) {
    return null;
  }
};

export const updateCategoryFirestore = async (id: string, name: string, subcategories?: Array<{ id: string; name: string; order?: number; srcVariableId?: string; srcValueId?: string }>, srcCategoryId?: string | null, srcSubcategoryVariableName?: string | null): Promise<boolean> => {
  if (!db) return false;
  try {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return false;
    }
    
    const categoryDocRef = doc(db, "categories", id);
    const categoryDoc = await getDoc(categoryDocRef);
    
    if (!categoryDoc.exists()) {
      return false;
    }
    
    const currentData = categoryDoc.data();
    const currentName = currentData?.name?.trim() || "";
    
    const updateData: UpdateData<DocumentData> = {};
    let needsUpdate = false;
    
    if (currentName.toLowerCase() !== trimmedName.toLowerCase()) {
      const q = query(collection(db, "categories"));
      const existingSnapshot = await getDocs(q);
      const conflictingCategory = existingSnapshot.docs.find(
        d => {
          const otherId = d.id;
          const otherName = d.data().name?.trim() || "";
          return otherId !== id && otherName.toLowerCase() === trimmedName.toLowerCase();
        }
      );
      
      if (conflictingCategory) {
        return false;
      }
      
      updateData.name = trimmedName;
      needsUpdate = true;
    }
    
    // Update subcategories if provided
    if (subcategories !== undefined) {
      updateData.subcategories = subcategories;
      needsUpdate = true;
    }
    
    // Update srcCategoryId if provided
    if (srcCategoryId !== undefined) {
      const currentSrcCategoryId = currentData?.srcCategoryId || null;
      const trimmedSrcCategoryId = srcCategoryId?.trim() || null;
      if (currentSrcCategoryId !== trimmedSrcCategoryId) {
        updateData.srcCategoryId = trimmedSrcCategoryId;
        needsUpdate = true;
      }
    }
    
    // Update srcSubcategoryVariableName if provided
    if (srcSubcategoryVariableName !== undefined) {
      const currentVariableName = currentData?.srcSubcategoryVariableName || null;
      const trimmedVariableName = srcSubcategoryVariableName?.trim() || null;
      if (currentVariableName !== trimmedVariableName) {
        updateData.srcSubcategoryVariableName = trimmedVariableName;
        needsUpdate = true;
      }
    }
    
    if (needsUpdate) {
      await updateDoc(categoryDocRef, updateData);
    }
    return true;
  } catch (error) {
    return false;
  }
};

export const deleteCategoryFirestore = async (id: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const categoryDocRef = doc(db, "categories", id);
    const categoryDoc = await getDoc(categoryDocRef);
    if (!categoryDoc.exists()) {
      return false;
    }
    await deleteDoc(categoryDocRef);
    return true;
  } catch (error) {
    return false;
  }
};

export const updateCategoryOrderFirestore = async (id: string, order: number): Promise<boolean> => {
  if (!db) return false;
  try {
    const categoryDocRef = doc(db, "categories", id);
    await updateDoc(categoryDocRef, { order });
    return true;
  } catch (error) {
    return false;
  }
};

export const moveCategoryUpFirestore = async (categoryId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const categories = await getCategoriesFirestore();
    const currentIndex = categories.findIndex(c => c.id === categoryId);
    if (currentIndex <= 0) return false;
    
    const currentCategory = categories[currentIndex];
    const previousCategory = categories[currentIndex - 1];
    
    // Swap orders
    const tempOrder = currentCategory.order ?? currentIndex;
    currentCategory.order = previousCategory.order ?? currentIndex - 1;
    previousCategory.order = tempOrder;
    
    // Update both categories
    await Promise.all([
      updateCategoryOrderFirestore(currentCategory.id, currentCategory.order),
      updateCategoryOrderFirestore(previousCategory.id, previousCategory.order)
    ]);
    
    return true;
  } catch (error) {
    return false;
  }
};

export const moveCategoryDownFirestore = async (categoryId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const categories = await getCategoriesFirestore();
    const currentIndex = categories.findIndex(c => c.id === categoryId);
    if (currentIndex < 0 || currentIndex >= categories.length - 1) return false;
    
    const currentCategory = categories[currentIndex];
    const nextCategory = categories[currentIndex + 1];
    
    const tempOrder = currentCategory.order ?? currentIndex;
    currentCategory.order = nextCategory.order ?? currentIndex + 1;
    nextCategory.order = tempOrder;
    
    await Promise.all([
      updateCategoryOrderFirestore(currentCategory.id, currentCategory.order),
      updateCategoryOrderFirestore(nextCategory.id, nextCategory.order)
    ]);
    
    return true;
  } catch (error) {
    return false;
  }
};

export const getPlatformsFirestore = async (): Promise<Platform[]> => {
  if (!db) return [];
  try {
    const q = query(collection(db, "platforms"));
    const querySnapshot = await getDocs(q);
    const platforms = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Platform));
    
    platforms.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : Infinity;
      const orderB = b.order !== undefined ? b.order : Infinity;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
    
    return platforms;
  } catch (error) {
    return [];
  }
};

export const addPlatformFirestore = async (name: string): Promise<string | null> => {
  if (!db) return null;
  try {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return null;
    }
    
    const q = query(collection(db, "platforms"));
    const existingSnapshot = await getDocs(q);
    const existingPlatform = existingSnapshot.docs.find(
      doc => doc.data().name?.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (existingPlatform) {
      return null;
    }
    
    const existingPlatforms = existingSnapshot.docs.map(doc => doc.data());
    const maxOrder = existingPlatforms.reduce((max, plat) => {
      const order = plat.order !== undefined ? plat.order : -1;
      return Math.max(max, order);
    }, -1);
    const nextOrder = maxOrder + 1;
    
    const newDocRef = doc(collection(db, "platforms"));
    await setDoc(newDocRef, { name: trimmedName, order: nextOrder });
    return newDocRef.id;
  } catch (error) {
    return null;
  }
};

export const updatePlatformFirestore = async (id: string, name: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return false;
    }
    
    const platformDocRef = doc(db, "platforms", id);
    const platformDoc = await getDoc(platformDocRef);
    
    if (!platformDoc.exists()) {
      return false;
    }
    
    const currentData = platformDoc.data();
    const currentName = currentData?.name?.trim() || "";
    
    // If the name hasn't changed (case-insensitive), allow the update
    if (currentName.toLowerCase() === trimmedName.toLowerCase()) {
      return true;
    }
    
    // Check for conflicts
    const q = query(collection(db, "platforms"));
    const existingSnapshot = await getDocs(q);
    const conflictingPlatform = existingSnapshot.docs.find(
      d => d.id !== id && d.data().name?.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (conflictingPlatform) {
      return false; // Another platform with this name exists
    }
    
    await updateDoc(platformDocRef, { name: trimmedName });
    return true;
  } catch (error) {
    return false;
  }
};

export const deletePlatformFirestore = async (id: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const platformDocRef = doc(db, "platforms", id);
    const platformDoc = await getDoc(platformDocRef);
    if (!platformDoc.exists()) {
      return false;
    }
    await deleteDoc(platformDocRef);
    return true;
  } catch (error) {
    return false;
  }
};

export const updatePlatformOrderFirestore = async (id: string, order: number): Promise<boolean> => {
  if (!db) return false;
  try {
    const platformDocRef = doc(db, "platforms", id);
    await updateDoc(platformDocRef, { order });
    return true;
  } catch (error) {
    return false;
  }
};

export const movePlatformUpFirestore = async (platformId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const platforms = await getPlatformsFirestore();
    const currentIndex = platforms.findIndex(p => p.id === platformId);
    if (currentIndex <= 0) return false;
    
    const currentPlatform = platforms[currentIndex];
    const previousPlatform = platforms[currentIndex - 1];
    
    const tempOrder = currentPlatform.order ?? currentIndex;
    currentPlatform.order = previousPlatform.order ?? currentIndex - 1;
    previousPlatform.order = tempOrder;
    
    await Promise.all([
      updatePlatformOrderFirestore(currentPlatform.id, currentPlatform.order),
      updatePlatformOrderFirestore(previousPlatform.id, previousPlatform.order)
    ]);
    
    return true;
  } catch (error) {
    return false;
  }
};

export const movePlatformDownFirestore = async (platformId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const platforms = await getPlatformsFirestore();
    const currentIndex = platforms.findIndex(p => p.id === platformId);
    if (currentIndex < 0 || currentIndex >= platforms.length - 1) return false;
    
    const currentPlatform = platforms[currentIndex];
    const nextPlatform = platforms[currentIndex + 1];
    
    const tempOrder = currentPlatform.order ?? currentIndex;
    currentPlatform.order = nextPlatform.order ?? currentIndex + 1;
    nextPlatform.order = tempOrder;
    
    await Promise.all([
      updatePlatformOrderFirestore(currentPlatform.id, currentPlatform.order),
      updatePlatformOrderFirestore(nextPlatform.id, nextPlatform.order)
    ]);
    
    return true;
  } catch (error) {
    return false;
  }
};

export const getAllVerifiedRunsFirestore = async (): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  try {
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      firestoreLimit(1000)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
  } catch (error) {
    return [];
  }
};

/**
 * Find runs that have a level field but incorrect leaderboardType
 * These are IL runs that were incorrectly saved with leaderboardType='regular' or missing leaderboardType
 */
export const getIlRunsToFixFirestore = async (): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  try {
    // Fetch all verified runs with a level field
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      firestoreLimit(5000)
    );
    const querySnapshot = await getDocs(q);
    const allRuns = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
    
    // Filter for runs that have a level but wrong/missing leaderboardType
    const runsToFix = allRuns.filter(run => {
      const hasLevel = run.level && run.level.trim() !== '';
      const leaderboardType = run.leaderboardType || 'regular';
      // IL runs should have leaderboardType='individual-level' if they have a level
      return hasLevel && leaderboardType !== 'individual-level';
    });
    
    return runsToFix;
  } catch (error) {
    
    return [];
  }
};

/**
 * Get unassigned runs (runs that haven't been assigned to any user)
 * Only includes verified runs that are unclaimed
 * Excludes:
 * - Unverified manually submitted runs (those are in the unverified runs panel)
 * - Unverified imported runs (those are in the imported runs panel waiting to be verified)
 */
export const getUnassignedRunsFirestore = async (limit: number = 500): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  try {
    // Only get verified runs (imported runs waiting to be verified are excluded)
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      firestoreLimit(limit)
    );
    
    const verifiedSnapshot = await getDocs(q);
    const verifiedRuns = verifiedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
    
    // Filter for unassigned runs (only verified runs)
    const unassignedRuns = verifiedRuns.filter(run => {
      // Check if unassigned - simply check if playerId is empty/null
      const playerId = run.playerId || "";
      return !playerId || playerId.trim() === "";
    });
    
    return unassignedRuns;
  } catch (error) {
    
    return [];
  }
};

/**
 * Ultra-simplified: Get unclaimed runs that match user's SRC username
 * Just does direct case-insensitive string matching on all leaderboard entries
 */
export const getUnclaimedRunsBySRCUsernameFirestore = async (srcUsername: string, currentUserId?: string): Promise<LeaderboardEntry[]> => {
  if (!db || !srcUsername || !srcUsername.trim()) return [];
  try {
    const searchUsername = srcUsername.trim().toLowerCase();
    const allRuns: LeaderboardEntry[] = [];
    
    // Get verified runs
    try {
      const verifiedQuery = query(collection(db, "leaderboardEntries"), where("verified", "==", true), firestoreLimit(5000));
      const verifiedSnapshot = await getDocs(verifiedQuery);
      verifiedSnapshot.docs.forEach(doc => {
        allRuns.push({ id: doc.id, ...doc.data() } as LeaderboardEntry);
      });
    } catch (error) {
      // Continue
    }
    
    // Simple direct string matching (case-insensitive)
    // Also check playerName/player2Name as fallback for older runs
    const matchingRuns = allRuns.filter(run => {
      // Must be imported from SRC
      if (!run.importedFromSRC) return false;
      
      // Must be unclaimed
      const playerId = run.playerId || "";
      if (playerId && playerId.trim() !== "") return false;
      if (currentUserId && playerId === currentUserId) return false;
      
      // Try srcPlayerName first, fallback to playerName if srcPlayerName doesn't exist
      const srcPlayer1 = run.srcPlayerName ? run.srcPlayerName.trim().toLowerCase() : 
                        (run.playerName ? run.playerName.trim().toLowerCase() : "");
      const srcPlayer2 = run.srcPlayer2Name ? run.srcPlayer2Name.trim().toLowerCase() : 
                        (run.player2Name ? run.player2Name.trim().toLowerCase() : "");
      
      return srcPlayer1 === searchUsername || srcPlayer2 === searchUsername;
    });
    
    return matchingRuns;
  } catch (error) {
    return [];
  }
};

/**
 * Ultra-simplified claim: Just match SRC usernames directly (case-insensitive)
 * No normalization, just simple string comparison
 */
export const claimRunFirestore = async (runId: string, userId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const runDocRef = doc(db, "leaderboardEntries", runId);
    const runDoc = await getDoc(runDocRef);
    
    if (!runDoc.exists()) {
      throw new Error("Run not found");
    }
    
    const runData = runDoc.data() as LeaderboardEntry;
    
    // Get the user's player data
    const player = await getPlayerByUidFirestore(userId);
    if (!player) {
      throw new Error("Player profile not found");
    }
    
    // Only allow claiming runs imported from Speedrun.com
    if (!runData.importedFromSRC) {
      throw new Error("Only runs imported from Speedrun.com can be claimed. Manual runs are automatically assigned.");
    }
    
    // User must have SRC username set
    if (!player.srcUsername || !player.srcUsername.trim()) {
      throw new Error("Please set your Speedrun.com username in Settings to claim runs.");
    }
    
    // Check if run is already claimed
    if (runData.playerId && runData.playerId.trim() !== "") {
      throw new Error("This run is already claimed.");
    }
    
    // Simple case-insensitive string matching
    // Try srcPlayerName first, fallback to playerName if srcPlayerName doesn't exist
    const userSRC = player.srcUsername.trim().toLowerCase();
    const runSRC1 = runData.srcPlayerName ? runData.srcPlayerName.trim().toLowerCase() : 
                    (runData.playerName ? runData.playerName.trim().toLowerCase() : "");
    const runSRC2 = runData.srcPlayer2Name ? runData.srcPlayer2Name.trim().toLowerCase() : 
                    (runData.player2Name ? runData.player2Name.trim().toLowerCase() : "");
    
    const matchesPlayer1 = runSRC1 === userSRC;
    const matchesPlayer2 = runSRC2 === userSRC;
    
    if (!matchesPlayer1 && !matchesPlayer2) {
      throw new Error(`Your Speedrun.com username "${player.srcUsername}" does not match this run's player.`);
    }
    
    // Determine which player slot to assign
    const isCoOp = runData.runType === 'co-op';
    const updateData: Partial<LeaderboardEntry> = {};
    
    if (matchesPlayer1) {
      updateData.playerId = userId;
      updateData.playerName = player.displayName;
    }
    
    if (matchesPlayer2 && isCoOp) {
      updateData.player2Id = userId;
      updateData.player2Name = player.displayName;
    }
    
    // Update the run
    await updateDoc(runDocRef, updateData);
    
    // If run is not verified, verify it now
    if (!runData.verified) {
      const verifiedBy = player.displayName || player.email || userId;
      await updateRunVerificationStatusFirestore(runId, true, verifiedBy);
    } else {
      // Run is verified - ensure points are calculated
      const updatedRunDoc = await getDoc(runDocRef);
      if (updatedRunDoc.exists()) {
        const updatedRunData = updatedRunDoc.data() as LeaderboardEntry;
        if (updatedRunData.verified && (updatedRunData.points === undefined || updatedRunData.points === null)) {
          const verifiedBy = player.displayName || player.email || userId;
          await updateRunVerificationStatusFirestore(runId, true, verifiedBy);
        }
      }
    }
    
    // Recalculate points for the user
    await recalculatePointsForPlayers([userId], runData);
    
    return true;
  } catch (error) {
    // Re-throw errors so they can be displayed to the user
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to claim run. Please try again.");
  }
};

/**
 * Get all players sorted by total points (descending)
 * Uses stored totalPoints from player documents for fast querying with Firestore index
 * Falls back gracefully if index is not yet deployed
 * Also includes temporary profiles for players with unclaimed imported SRC runs
 */
/**
 * Get all players from Firestore
 * Returns all players sorted by joinDate (newest first) or by a specified field
 */
export const getAllPlayersFirestore = async (
  sortBy: 'joinDate' | 'displayName' | 'totalPoints' | 'totalRuns' = 'joinDate',
  sortOrder: 'asc' | 'desc' = 'desc',
  limit?: number
): Promise<Player[]> => {
  if (!db) return [];
  try {
    let playersQuery;
    const queryConstraints: any[] = [];
    
    if (sortBy === 'totalPoints' || sortBy === 'totalRuns') {
      // Use orderBy for numeric fields
      queryConstraints.push(orderBy(sortBy, sortOrder));
      if (limit) queryConstraints.push(firestoreLimit(limit));
      playersQuery = query(collection(db, "players"), ...queryConstraints);
    } else if (sortBy === 'displayName') {
      // Use orderBy for string fields
      queryConstraints.push(orderBy(sortBy, sortOrder));
      if (limit) queryConstraints.push(firestoreLimit(limit));
      playersQuery = query(collection(db, "players"), ...queryConstraints);
    } else {
      // For joinDate or default, use orderBy
      queryConstraints.push(orderBy("joinDate", sortOrder));
      if (limit) queryConstraints.push(firestoreLimit(limit));
      playersQuery = query(collection(db, "players"), ...queryConstraints);
    }
    
    const playersSnapshot = await getDocs(playersQuery);
    const players = playersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
    
    return players;
  } catch (error) {
    // If index doesn't exist, fall back to fetching all and sorting in memory
    if (error?.code === 'failed-precondition' || error?.code === 9) {
      try {
        const allPlayersQuery = query(
          collection(db, "players"),
          limit ? firestoreLimit(limit || 1000) : undefined
        );
        const allPlayersSnapshot = await getDocs(allPlayersQuery);
        const players = allPlayersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player));
        
        // Sort in memory
        players.sort((a, b) => {
          let aVal: string | number = a[sortBy as keyof Player] as string | number || 0;
          let bVal: string | number = b[sortBy as keyof Player] as string | number || 0;
          
          if (sortBy === 'displayName' || sortBy === 'joinDate') {
            aVal = String(aVal || '');
            bVal = String(bVal || '');
            return sortOrder === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
          } else {
            aVal = Number(aVal) || 0;
            bVal = Number(bVal) || 0;
            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
          }
        });
        
        return limit ? players.slice(0, limit) : players;
      } catch (fallbackError) {
        
        return [];
      }
    }
    
    
    return [];
  }
};

/**
 * Update a player's profile data
 */
export const updatePlayerFirestore = async (
  playerId: string,
  updates: Partial<Omit<Player, 'id' | 'uid'>>
): Promise<boolean> => {
  if (!db) return false;
  try {
    const playerDocRef = doc(db, "players", playerId);
    await updateDoc(playerDocRef, updates);
    return true;
  } catch (error) {
    
    return false;
  }
};

/**
 * Delete a player and optionally their runs
 * WARNING: This is a destructive operation
 */
export const deletePlayerFirestore = async (
  playerId: string,
  deleteRuns: boolean = false
): Promise<{ success: boolean; deletedRuns?: number; error?: string }> => {
  if (!db) return { success: false, error: "Database not initialized" };
  
  try {
    // Get player data first
    const playerDocRef = doc(db, "players", playerId);
    const playerDoc = await getDoc(playerDocRef);
    
    if (!playerDoc.exists()) {
      return { success: false, error: "Player not found" };
    }
    
    const playerData = playerDoc.data() as Player;
    const playerUid = playerData.uid;
    
    let deletedRunsCount = 0;
    
    // If deleteRuns is true, delete all runs associated with this player
    if (deleteRuns && playerUid) {
      const runsQuery = query(
        collection(db, "leaderboardEntries"),
        where("playerId", "==", playerUid)
      );
      const runsSnapshot = await getDocs(runsQuery);
      
      // Also check for player2Id in co-op runs
      const coOpRunsQuery = query(
        collection(db, "leaderboardEntries"),
        where("player2Id", "==", playerUid)
      );
      const coOpRunsSnapshot = await getDocs(coOpRunsQuery);
      
      const allRuns = [...runsSnapshot.docs, ...coOpRunsSnapshot.docs];
      deletedRunsCount = allRuns.length;
      
      // Delete runs in batches
      const batch = writeBatch(db);
      let batchCount = 0;
      const MAX_BATCH_SIZE = 500;
      
      for (const runDoc of allRuns) {
        batch.delete(runDoc.ref);
        batchCount++;
        
        if (batchCount >= MAX_BATCH_SIZE) {
          await batch.commit();
          batchCount = 0;
        }
      }
      
      if (batchCount > 0) {
        await batch.commit();
      }
    }
    
    // Delete the player document
    await deleteDoc(playerDocRef);
    
    return { success: true, deletedRuns: deletedRunsCount };
  } catch (error) {
    
    return { success: false, error: error.message || "Failed to delete player" };
  }
};

export const getPlayersByPointsFirestore = async (limit: number = 100): Promise<Player[]> => {
  if (!db) return [];
  try {
    // Use stored totalPoints from player documents for fast querying
    // Query players sorted by totalPoints descending
    const playersQuery = query(
      collection(db, "players"),
      orderBy("totalPoints", "desc"),
      firestoreLimit(limit * 2) // Fetch more to account for potential duplicates
    );
    
    try {
      const playersSnapshot = await getDocs(playersQuery);
      const allPlayers = playersSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Player))
        .filter(p => (p.totalPoints || 0) > 0); // Only include players with points
      
      // IMPORTANT: Unclaimed runs should NOT contribute to points leaderboard
      // Only players with actual accounts and claimed runs should appear
      // Removed temporary player creation for unclaimed runs
      
      const combinedPlayers = allPlayers;
      
      // Deduplicate by UID and displayName - keep the player with the highest totalPoints
      // Filter out any players with "Unknown" name or unclaimed UIDs
      const playerMap = new Map<string, Player>();
      const seenUIDs = new Set<string>();
      const seenNames = new Map<string, string>(); // name -> uid
      
      for (const player of combinedPlayers) {
        if (!player.uid) continue; // Skip players without UID
        
        // Skip players with "Unknown" name (no temporary UIDs to filter anymore)
        const displayNameLower = player.displayName?.toLowerCase().trim() || "";
        if (displayNameLower === "unknown") {
          continue;
        }
        
        // Check if we've seen this UID before
        if (seenUIDs.has(player.uid)) {
          const existing = playerMap.get(player.uid);
          if (existing) {
            // If we find a duplicate UID, keep the one with higher points
            const existingPoints = existing.totalPoints || 0;
            const currentPoints = player.totalPoints || 0;
            if (currentPoints > existingPoints) {
              playerMap.set(player.uid, player);
            }
          }
          continue;
        }
        
        // Check if we've seen this displayName before (case-insensitive)
        if (displayNameLower) {
          const existingUIDForName = seenNames.get(displayNameLower);
          if (existingUIDForName && existingUIDForName !== player.uid) {
            // Same name but different UID - treat as duplicate
            // Keep the one with higher points
            const existingPlayer = playerMap.get(existingUIDForName);
            if (existingPlayer) {
              const existingPoints = existingPlayer.totalPoints || 0;
              const currentPoints = player.totalPoints || 0;
              if (currentPoints > existingPoints) {
                // Replace with the new player
                playerMap.delete(existingUIDForName);
                playerMap.set(player.uid, player);
                seenNames.set(displayNameLower, player.uid);
              }
            }
            continue;
          }
        }
        
        // New unique player
        seenUIDs.add(player.uid);
        if (displayNameLower) {
          seenNames.set(displayNameLower, player.uid);
        }
        playerMap.set(player.uid, player);
      }
      
      // Convert map to array and sort by points (descending) again after deduplication
      const uniquePlayers = Array.from(playerMap.values())
        .filter(p => (p.totalPoints || 0) > 0) // Only include players with points
        .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
        .slice(0, limit); // Apply limit after deduplication
      
      return uniquePlayers;
    } catch (error) {
      // If index doesn't exist yet, return empty array and log warning
      // Admin should run recalculation to populate player totalPoints, then deploy index
      
      return [];
    }
  } catch (error) {
    
    return [];
  }
};

/**
 * Backfill points for all existing verified runs
 * Recalculates points for all verified runs using the current formula and updates player totals
 * Returns summary of the operation
 */
export const backfillPointsForAllRunsFirestore = async (): Promise<{
  runsUpdated: number;
  playersUpdated: number;
  errors: string[];
}> => {
  if (!db) {
    return { runsUpdated: 0, playersUpdated: 0, errors: ["Firestore not initialized"] };
  }

  const result = {
    runsUpdated: 0,
    playersUpdated: 0,
    errors: [] as string[],
  };

  try {
    // Get all categories and platforms for lookup (do this once at the start)
    const categories = await getCategoriesFirestore();
    const platforms = await getPlatformsFirestore();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));
    const platformMap = new Map(platforms.map(p => [p.id, p.name]));

    // Get all verified runs (all leaderboard types) - use a single query with high limit
    // IMPORTANT: Only process claimed runs - unclaimed runs should NOT contribute to points
    // Note: Firestore has a limit of 10,000 documents per query, but for most use cases this should be sufficient
    // If needed, we can implement pagination later for databases with >10k verified runs
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      firestoreLimit(10000)
    );
    const querySnapshot = await getDocs(q);
    const allRuns = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
      .filter(run => {
        // Only process claimed runs - exclude unclaimed runs
        const playerId = run.playerId || "";
        return playerId && 
               playerId !== "imported" && 
               !playerId.startsWith("unlinked_") && 
               !playerId.startsWith("unclaimed_");
      });
    
    if (querySnapshot.docs.length === 10000) {
      result.errors.push("Warning: Hit Firestore query limit of 10,000 runs. Some runs may not have been processed. Consider implementing pagination for databases with more than 10,000 verified runs.");
    }

    // Track unique player IDs (only for claimed runs)
    const playerIdsSet = new Set<string>();
    
    // Group runs by leaderboardType + level + category + platform + runType for proper ranking
    const runsByGroup = new Map<string, LeaderboardEntry[]>();
    
    for (const runData of allRuns) {
      if (!runData.playerId) {
        result.errors.push(`Run ${runData.id} has no playerId`);
        continue;
      }
      
      // Skip unclaimed runs
      if (runData.playerId === "imported" || 
          runData.playerId.startsWith("unlinked_") || 
          runData.playerId.startsWith("unclaimed_")) {
        continue;
      }

      // Group runs by leaderboardType + level + category + platform + runType
      const leaderboardType = runData.leaderboardType || 'regular';
      const level = runData.level || '';
      const groupKey = leaderboardType === 'regular' 
        ? `${leaderboardType}_${runData.category}_${runData.platform}_${runData.runType || 'solo'}`
        : `${leaderboardType}_${level}_${runData.category}_${runData.platform}_${runData.runType || 'solo'}`;
      if (!runsByGroup.has(groupKey)) {
        runsByGroup.set(groupKey, []);
      }
      runsByGroup.get(groupKey)!.push(runData);

      // Track player IDs for later recalculation (both solo and co-op runs)
      playerIdsSet.add(runData.playerId);
      
      // For co-op runs, also track player2 if they have a name
      // We'll need to look up their UID by displayName later
      if (runData.runType === 'co-op' && runData.player2Name) {
        // Store player2Name for batch lookup later
        // We'll add their UID to playerIdsSet after looking them up
      }
    }
    
    // Batch lookup player2 UIDs for co-op runs
    // Collect all unique player2 names from co-op runs
    const player2Names = new Set<string>();
    for (const runData of allRuns) {
      if (runData.runType === 'co-op' && runData.player2Name) {
        player2Names.add(runData.player2Name.trim());
      }
    }
    
    // Look up UIDs for all player2 names
    // Also create player documents for player2s who don't have one yet
    const player2NameToUidMap = new Map<string, string>();
    
    for (const player2Name of player2Names) {
      try {
        const player2 = await getPlayerByDisplayNameFirestore(player2Name);
        if (player2?.uid) {
          playerIdsSet.add(player2.uid);
          player2NameToUidMap.set(player2Name, player2.uid);
        } else {
          // Player2 doesn't have a player document yet
          // Check if they have any runs as player1 to get their UID
          const player1Query = query(
            collection(db, "leaderboardEntries"),
            where("playerName", "==", player2Name),
            where("verified", "==", true),
            firestoreLimit(1)
          );
          const player1Snapshot = await getDocs(player1Query);
          if (!player1Snapshot.empty) {
            const firstRun = player1Snapshot.docs[0].data() as LeaderboardEntry;
            if (firstRun.playerId && !firstRun.playerId.startsWith("unlinked_")) {
              playerIdsSet.add(firstRun.playerId);
              player2NameToUidMap.set(player2Name, firstRun.playerId);
            } else {
              // They have player1 runs but with unlinked UID - create a proper player document
              // Generate a consistent UID based on their name (for unlinked players)
              const nameHash = player2Name.toLowerCase().replace(/[^a-z0-9]/g, '_');
              const generatedUid = `player_${nameHash}`;
              playerIdsSet.add(generatedUid);
              player2NameToUidMap.set(player2Name, generatedUid);
            }
          } else {
            // Player2 has no player1 runs - they only exist as player2 in co-op runs
            // Generate a consistent UID based on their name so we can create their player document
            const nameHash = player2Name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const generatedUid = `player_${nameHash}`;
            playerIdsSet.add(generatedUid);
            player2NameToUidMap.set(player2Name, generatedUid);
          }
        }
      } catch (error) {
        // If lookup fails, continue - we'll try to create player document during recalculation
        result.errors.push(`Error looking up player2 "${player2Name}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Calculate ranks for each group and assign points
    const runsToUpdate: { id: string; points: number; rank?: number; playerId: string }[] = [];

    for (const [groupKey, runs] of runsByGroup.entries()) {
      try {
        const parts = groupKey.split('_');
        const leaderboardType = parts[0] as 'regular' | 'individual-level' | 'community-golds';
        
        let categoryId: string;
        let platformId: string;
        let runType: string;
        let levelId: string | undefined;
        
        if (leaderboardType === 'regular') {
          categoryId = parts[1]!;
          platformId = parts[2]!;
          runType = parts[3] || 'solo';
        } else {
          levelId = parts[1];
          categoryId = parts[2]!;
          platformId = parts[3]!;
          runType = parts[4] || 'solo';
        }
        
        // Calculate ranks using helper function
        // Note: calculateRanksForGroup fetches and ranks runs, but we need to ensure
        // all runs in this group are included in the ranking calculation
        const rankMap = await calculateRanksForGroup(
          leaderboardType,
          categoryId,
          platformId,
          runType as 'solo' | 'co-op',
          levelId
        );
        
        // Process all runs in this group (including obsolete) - obsolete runs get base points only
        for (const runData of runs) {
          try {
            let rank: number | undefined = undefined;
            if (!runData.isObsolete) {
              // First try to get rank from the calculated rankMap
              const calculatedRank = rankMap.get(runData.id);
              rank = normalizeRank(calculatedRank);
              
              // If run is not in rankMap, it might be beyond the fetch limit
              // However, if it's in our group, it should be ranked
              // Recalculate rank by comparing with other runs in the group
              if (rank === undefined) {
                // Sort all non-obsolete runs in this group by time
                const nonObsoleteGroupRuns = runs
                  .filter(r => !r.isObsolete)
                  .sort((a, b) => {
                    const timeA = parseTimeToSeconds(a.time);
                    const timeB = parseTimeToSeconds(b.time);
                    return timeA - timeB;
                  });
                
                // Find the index (rank) of this run
                const runIndex = nonObsoleteGroupRuns.findIndex(r => r.id === runData.id);
                if (runIndex >= 0) {
                  rank = normalizeRank(runIndex + 1); // 1-based rank
                }
              }
            }
            
            const categoryName = categoryMap.get(runData.category) || "Unknown";
            const platformName = platformMap.get(runData.platform) || "Unknown";
            
            // Calculate points - CRITICAL: calculatePoints automatically splits for co-op runs
            // For co-op runs: points are divided by 2, so each player gets half
            // For solo runs: points are full value
            const points = calculatePoints(
              runData.time, 
              categoryName, 
              platformName,
              runData.category,
              runData.platform,
              rank,
              runData.runType as 'solo' | 'co-op' | undefined
            );
            
            runsToUpdate.push({
              id: runData.id,
              points,
              rank: normalizeRank(rank), // Normalize rank to ensure it's 1-3 or undefined
              playerId: runData.playerId,
            });
          } catch (error) {
            result.errors.push(`Error processing run ${runData.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } catch (error) {
        result.errors.push(`Error processing group ${groupKey}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Update all runs in batches using Firestore batch writes (batch limit is 500)
    const MAX_BATCH_SIZE = 500;
    let batchCount = 0;
    let batch = writeBatch(db);
    
    for (const run of runsToUpdate) {
      try {
        const runDocRef = doc(db, "leaderboardEntries", run.id);
        const updateData: { points: number; rank?: number | ReturnType<typeof deleteField> } = { 
          points: run.points 
        };
        // Store rank if it's 1, 2, or 3 (for bonus points), otherwise remove it
        if (run.rank !== undefined && run.rank !== null && run.rank >= 1 && run.rank <= 3) {
          updateData.rank = run.rank;
        } else {
          updateData.rank = deleteField();
        }
        batch.update(runDocRef, updateData);
        batchCount++;
        
        // Commit batch if it reaches the limit
        if (batchCount >= MAX_BATCH_SIZE) {
          await batch.commit();
          result.runsUpdated += batchCount;
          batchCount = 0;
          batch = writeBatch(db); // Create new batch for remaining updates
        }
      } catch (error) {
        result.errors.push(`Error preparing run ${run.id} for batch: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Commit remaining updates
    if (batchCount > 0) {
      await batch.commit();
      result.runsUpdated += batchCount;
    }

    // Wait a moment for Firestore to propagate the run updates
    // This helps ensure consistency when recalculating player totals
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Recalculate total points for each player from all their verified runs
    // Process in batches to avoid overwhelming the system
    const playerIdsArray = Array.from(playerIdsSet);
    const batchSize = 10;
    for (let i = 0; i < playerIdsArray.length; i += batchSize) {
      const batch = playerIdsArray.slice(i, i + batchSize);
      await Promise.all(batch.map(async (playerId) => {
        try {
          const success = await recalculatePlayerPointsFirestore(playerId);
          if (success) {
            result.playersUpdated++;
          } else {
            result.errors.push(`Failed to recalculate points for player ${playerId}`);
          }
        } catch (error) {
          result.errors.push(`Error recalculating player ${playerId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }));
    }

    return result;
  } catch (error) {
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
};

// Level management functions
export const getLevelsFirestore = async (): Promise<Level[]> => {
  if (!db) return [];
  try {
    const q = query(collection(db, "levels"));
    const querySnapshot = await getDocs(q);
    const levels = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Level));
    
    levels.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : Infinity;
      const orderB = b.order !== undefined ? b.order : Infinity;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
    
    return levels;
  } catch (error) {
    return [];
  }
};

export const addLevelFirestore = async (name: string): Promise<string | null> => {
  if (!db) return null;
  try {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return null;
    }
    
    const q = query(collection(db, "levels"));
    const existingSnapshot = await getDocs(q);
    const existingLevel = existingSnapshot.docs.find(
      doc => doc.data().name?.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (existingLevel) {
      return null;
    }
    
    const existingLevels = existingSnapshot.docs.map(doc => doc.data());
    const maxOrder = existingLevels.reduce((max, level) => {
      const order = level.order !== undefined ? level.order : -1;
      return Math.max(max, order);
    }, -1);
    const nextOrder = maxOrder + 1;
    
    const newDocRef = doc(collection(db, "levels"));
    await setDoc(newDocRef, { name: trimmedName, order: nextOrder });
    return newDocRef.id;
  } catch (error) {
    return null;
  }
};

export const updateLevelFirestore = async (id: string, name: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return false;
    }
    
    const q = query(collection(db, "levels"));
    const existingSnapshot = await getDocs(q);
    const existingLevel = existingSnapshot.docs.find(
      doc => doc.id !== id && doc.data().name?.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (existingLevel) {
      return false;
    }
    
    const levelDocRef = doc(db, "levels", id);
    await updateDoc(levelDocRef, { name: trimmedName });
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Update the disabled state of a level for a specific category
 */
export const updateLevelCategoryDisabledFirestore = async (
  levelId: string,
  categoryId: string,
  disabled: boolean
): Promise<boolean> => {
  if (!db) return false;
  try {
    const levelDocRef = doc(db, "levels", levelId);
    const levelDoc = await getDoc(levelDocRef);
    
    if (!levelDoc.exists()) {
      return false;
    }
    
    const currentData = levelDoc.data();
    const disabledCategories = currentData.disabledCategories || {};
    
    if (disabled) {
      disabledCategories[categoryId] = true;
    } else {
      delete disabledCategories[categoryId];
    }
    
    await updateDoc(levelDocRef, { disabledCategories });
    return true;
  } catch (error) {
    
    return false;
  }
};

export const deleteLevelFirestore = async (id: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const levelDocRef = doc(db, "levels", id);
    await deleteDoc(levelDocRef);
    return true;
  } catch (error) {
    return false;
  }
};

export const moveLevelUpFirestore = async (id: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const q = query(collection(db, "levels"));
    const querySnapshot = await getDocs(q);
    const levels = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Level));
    
    levels.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : Infinity;
      const orderB = b.order !== undefined ? b.order : Infinity;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
    
    const currentIndex = levels.findIndex(l => l.id === id);
    if (currentIndex <= 0) return false;
    
    const currentLevel = levels[currentIndex];
    const previousLevel = levels[currentIndex - 1];
    
    const currentOrder = currentLevel.order !== undefined ? currentLevel.order : currentIndex;
    const previousOrder = previousLevel.order !== undefined ? previousLevel.order : currentIndex - 1;
    
    await Promise.all([
      updateDoc(doc(db, "levels", currentLevel.id), { order: previousOrder }),
      updateDoc(doc(db, "levels", previousLevel.id), { order: currentOrder })
    ]);
    
    return true;
  } catch (error) {
    return false;
  }
};

export const moveLevelDownFirestore = async (id: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const q = query(collection(db, "levels"));
    const querySnapshot = await getDocs(q);
    const levels = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Level));
    
    levels.sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : Infinity;
      const orderB = b.order !== undefined ? b.order : Infinity;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return (a.name || "").localeCompare(b.name || "");
    });
    
    const currentIndex = levels.findIndex(l => l.id === id);
    if (currentIndex < 0 || currentIndex >= levels.length - 1) return false;
    
    const currentLevel = levels[currentIndex];
    const nextLevel = levels[currentIndex + 1];
    
    const currentOrder = currentLevel.order !== undefined ? currentLevel.order : currentIndex;
    const nextOrder = nextLevel.order !== undefined ? nextLevel.order : currentIndex + 1;
    
    await Promise.all([
      updateDoc(doc(db, "levels", currentLevel.id), { order: nextOrder }),
      updateDoc(doc(db, "levels", nextLevel.id), { order: currentOrder })
    ]);
    
    return true;
  } catch (error) {
    return false;
  }
};

// Download Categories Management (stored in Firestore for dynamic management)
export interface DownloadCategory {
  id: string;
  name: string;
  order?: number;
}

const DEFAULT_DOWNLOAD_CATEGORIES: Omit<DownloadCategory, 'id'>[] = [
  { name: "Tools", order: 1 },
  { name: "Guides", order: 2 },
  { name: "Save Files", order: 3 },
  { name: "Other", order: 4 },
];

export const getDownloadCategoriesFirestore = async (): Promise<DownloadCategory[]> => {
  if (!db) {
    // Return defaults if db is not initialized
    return DEFAULT_DOWNLOAD_CATEGORIES.map((cat, index) => ({ id: cat.name.toLowerCase().replace(/\s+/g, '_'), ...cat }));
  }
  try {
    const categoriesSnapshot = await getDocs(collection(db, "downloadCategories"));
    
    if (categoriesSnapshot.empty) {
      // Initialize with defaults if none exist
      const batch = writeBatch(db);
      DEFAULT_DOWNLOAD_CATEGORIES.forEach((cat) => {
        const categoryId = cat.name.toLowerCase().replace(/\s+/g, '_');
        const categoryRef = doc(db, "downloadCategories", categoryId);
        batch.set(categoryRef, { ...cat });
      });
      await batch.commit();
      
      // Return defaults after initialization
      return DEFAULT_DOWNLOAD_CATEGORIES.map((cat) => ({ id: cat.name.toLowerCase().replace(/\s+/g, '_'), ...cat }));
    }
    
    const categories = categoriesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as DownloadCategory));
    
    // Sort by order
    categories.sort((a, b) => {
      const orderA = a.order ?? Infinity;
      const orderB = b.order ?? Infinity;
      return orderA - orderB;
    });
    
    return categories;
  } catch (error) {
    
    // Return defaults on error
    return DEFAULT_DOWNLOAD_CATEGORIES.map((cat) => ({ id: cat.name.toLowerCase().replace(/\s+/g, '_'), ...cat }));
  }
};

export const addDownloadCategoryFirestore = async (name: string, order?: number): Promise<string | null> => {
  if (!db) return null;
  try {
    const categoryId = name.toLowerCase().replace(/\s+/g, '_');
    const categoryRef = doc(db, "downloadCategories", categoryId);
    const categorySnap = await getDoc(categoryRef);
    
    if (categorySnap.exists()) {
      return null; // Category already exists
    }
    
    const maxOrder = order ?? (await getDownloadCategoriesFirestore()).length + 1;
    await setDoc(categoryRef, { name, order: maxOrder });
    
    return categoryId;
  } catch (error) {
    
    return null;
  }
};

export const updateDownloadCategoryFirestore = async (categoryId: string, name?: string, order?: number): Promise<boolean> => {
  if (!db) return false;
  try {
    const categoryRef = doc(db, "downloadCategories", categoryId);
    const updateData: UpdateData<DocumentData> = {};
    
    if (name !== undefined) updateData.name = name;
    if (order !== undefined) updateData.order = order;
    
    await updateDoc(categoryRef, updateData);
    return true;
  } catch (error) {
    
    return false;
  }
};

export const deleteDownloadCategoryFirestore = async (categoryId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const categoryRef = doc(db, "downloadCategories", categoryId);
    await deleteDoc(categoryRef);
    return true;
  } catch (error) {
    
    return false;
  }
};

/**
 * Check if a run with the same srcRunId already exists
 * Uses indexed query for srcRunId
 */
export const checkSRCRunExistsFirestore = async (srcRunId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const q = query(
      collection(db, "leaderboardEntries"),
      where("srcRunId", "==", srcRunId),
      firestoreLimit(1)
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    
    return false;
  }
};

/**
 * Get all existing srcRunIds for duplicate checking
 * More efficient than fetching all runs
 * Checks both verified and unverified entries to prevent duplicate imports
 * Note: Firestore doesn't support != queries with other filters without composite index
 * So we fetch entries and filter client-side
 */
export const getExistingSRCRunIdsFirestore = async (): Promise<Set<string>> => {
  if (!db) return new Set();
  try {
    const srcRunIds = new Set<string>();
    
    // Query verified entries (anyone can read)
    try {
      const verifiedQuery = query(
        collection(db, "leaderboardEntries"),
        where("verified", "==", true),
        firestoreLimit(5000)
      );
      const verifiedSnapshot = await getDocs(verifiedQuery);
      verifiedSnapshot.docs.forEach(doc => {
        const data = doc.data();
        // Filter client-side for entries with srcRunId
        if (data.srcRunId && data.srcRunId.trim() !== "") {
          srcRunIds.add(data.srcRunId);
        }
      });
    } catch (error) {
      
      // Continue with unverified check
    }
    
    // Query unverified entries (admin-only, but try anyway - will fail gracefully if not admin)
    try {
      const unverifiedQuery = query(
        collection(db, "leaderboardEntries"),
        where("verified", "==", false),
        firestoreLimit(5000)
      );
      const unverifiedSnapshot = await getDocs(unverifiedQuery);
      unverifiedSnapshot.docs.forEach(doc => {
        const data = doc.data();
        // Filter client-side for entries with srcRunId
        if (data.srcRunId && data.srcRunId.trim() !== "") {
          srcRunIds.add(data.srcRunId);
        }
      });
    } catch (error: any) {
      // If permission denied, that's okay - we'll just use verified entries
      // This function is typically called by admins during import, but might be called elsewhere
      const errorCode = error?.code || error?.message || '';
      const isPermissionError = errorCode === 'permission-denied' || 
                                errorCode === 'missing-or-insufficient-permissions' ||
                                (typeof errorCode === 'string' && errorCode.toLowerCase().includes('permission'));
      
      if (!isPermissionError) {
        
      }
      // Silently continue - we have verified entries at least
    }
    
    return srcRunIds;
  } catch (error) {
    
    // Return empty set on error - import will still work, just might import duplicates
    return new Set();
  }
};

/**
 * Get all runs that were imported from speedrun.com
 * Simple query - just fetch unverified imported runs
 */
export const getImportedSRCRunsFirestore = async (): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  
  try {
    // Simple query: unverified imported runs, ordered by date
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", false),
      where("importedFromSRC", "==", true),
      orderBy("date", "desc"),
      firestoreLimit(500)
    );
    
    const querySnapshot = await getDocs(q);
    
    // Simple mapping - just return the data
    return querySnapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data() 
    } as LeaderboardEntry));
  } catch (error) {
    
    return [];
  }
};

/**
 * Get all verified runs to check for duplicates when importing
 * Only fetches verified runs for duplicate checking (more efficient)
 */
export const getAllRunsForDuplicateCheckFirestore = async (): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  try {
    // Only get verified runs for duplicate checking (unverified runs can be duplicates during import)
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      firestoreLimit(5000)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ 
      id: doc.id, 
      ...doc.data() 
    } as LeaderboardEntry));
  } catch (error) {
    
    return [];
  }
};

/**
 * Get verified runs that have missing or invalid data (won't appear on leaderboards)
 * These are runs where category, platform, or level IDs don't match existing records
 */
export const getVerifiedRunsWithInvalidDataFirestore = async (): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  try {
    // Get all verified runs
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      firestoreLimit(1000)
    );
    const querySnapshot = await getDocs(q);
    const runs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
    
    // Get all categories, platforms, and levels
    const [categoriesSnapshot, platformsSnapshot, levelsSnapshot] = await Promise.all([
      getDocs(collection(db, "categories")),
      getDocs(collection(db, "platforms")),
      getDocs(collection(db, "levels"))
    ]);
    
    const categoryIds = new Set(categoriesSnapshot.docs.map(doc => doc.id));
    const platformIds = new Set(platformsSnapshot.docs.map(doc => doc.id));
    const levelIds = new Set(levelsSnapshot.docs.map(doc => doc.id));
    
    // Filter runs with invalid data
    // For imported runs with SRC fallback names, empty IDs are acceptable
    const invalidRuns = runs.filter(run => {
      const isImportedWithSRCFallback = run.importedFromSRC && (run.srcCategoryName || run.srcPlatformName);
      
      // Check if category is missing or invalid
      // For imported runs, allow empty category if SRC name exists
      if (!run.category || (!categoryIds.has(run.category) && run.category.trim() !== "")) {
        if (!isImportedWithSRCFallback || !run.srcCategoryName) {
          return true;
        }
      }
      
      // Check if platform is missing or invalid
      // For imported runs, allow empty platform if SRC name exists
      if (!run.platform || (!platformIds.has(run.platform) && run.platform.trim() !== "")) {
        if (!isImportedWithSRCFallback || !run.srcPlatformName) {
          return true;
        }
      }
      
      // Check if level is required but missing or invalid (for ILs and Community Golds)
      // For imported runs, allow empty level if SRC name exists
      if (run.leaderboardType === 'individual-level' || run.leaderboardType === 'community-golds') {
        if (!run.level || (!levelIds.has(run.level) && run.level.trim() !== "")) {
          if (!isImportedWithSRCFallback || !run.srcLevelName) {
            return true;
          }
        }
      }
      
      // Check if required fields are missing
      if (!run.playerName || !run.time || !run.date || !run.runType) {
        return true;
      }
      
      return false;
    });
    
    return invalidRuns;
  } catch (error) {
    
    return [];
  }
};

/**
 * Find duplicate runs in the database
 * Returns groups of duplicate runs, where each group contains runs that are considered duplicates
 */
export const findDuplicateRunsFirestore = async (): Promise<Array<{ runs: LeaderboardEntry[]; key: string }>> => {
  if (!db) return [];
  
  try {
    // Import normalizeSRCUsername for consistent normalization
    const { normalizeSRCUsername } = await import("@/lib/speedruncom");
    
    // Get all runs
    const queries = [
      query(collection(db, "leaderboardEntries"), where("verified", "==", true), firestoreLimit(2000)),
      query(collection(db, "leaderboardEntries"), where("verified", "==", false), firestoreLimit(2000))
    ];
    
    const [verifiedSnapshot, unverifiedSnapshot] = await Promise.all([
      getDocs(queries[0]),
      getDocs(queries[1])
    ]);
    
    const allRuns: LeaderboardEntry[] = [
      ...verifiedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry)),
      ...unverifiedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
    ];
    
    // Pre-fetch all unique player IDs to batch lookups
    const uniquePlayerIds = new Set<string>();
    for (const run of allRuns) {
      if (run.playerId && run.playerId.trim()) {
        uniquePlayerIds.add(run.playerId);
      }
      if (run.player2Id && run.player2Id.trim()) {
        uniquePlayerIds.add(run.player2Id);
      }
    }
    
    // Batch fetch all players
    const playerMap = new Map<string, Player>();
    if (uniquePlayerIds.size > 0) {
      const playerPromises = Array.from(uniquePlayerIds).map(id => getPlayerByUidFirestore(id));
      const players = await Promise.all(playerPromises);
      players.forEach(player => {
        if (player) {
          playerMap.set(player.uid, player);
        }
      });
    }
    
    // Group runs by their duplicate key
    // Use normalized player identifiers (display name first, then SRC username)
    const runGroups = new Map<string, LeaderboardEntry[]>();
    
    for (const run of allRuns) {
      // Get normalized player identifiers (display name first, then SRC username)
      // Use cached player data if available
      let player1Id: string;
      let player2Id: string = "";
      
      // Player 1 identifier
      const player1 = run.playerId ? playerMap.get(run.playerId) : null;
      if (player1) {
        // Use display name first, then SRC username
        if (player1.displayName && player1.displayName.trim()) {
          player1Id = player1.displayName.trim().toLowerCase();
        } else if (player1.srcUsername) {
          player1Id = normalizeSRCUsername(player1.srcUsername);
        } else {
          player1Id = (run.playerName || "").trim().toLowerCase();
        }
      } else {
        // Fallback: use display name from run, then SRC username
        if (run.playerName && run.playerName.trim()) {
          player1Id = run.playerName.trim().toLowerCase();
        } else if (run.srcPlayerName) {
          player1Id = normalizeSRCUsername(run.srcPlayerName);
        } else {
          player1Id = "";
        }
      }
      
      // Player 2 identifier (for co-op runs)
      if (run.runType === 'co-op') {
        const player2 = run.player2Id ? playerMap.get(run.player2Id) : null;
        if (player2) {
          // Use display name first, then SRC username
          if (player2.displayName && player2.displayName.trim()) {
            player2Id = player2.displayName.trim().toLowerCase();
          } else if (player2.srcUsername) {
            player2Id = normalizeSRCUsername(player2.srcUsername);
          } else {
            player2Id = (run.player2Name || "").trim().toLowerCase();
          }
        } else {
          // Fallback: use display name from run, then SRC username
          if (run.player2Name && run.player2Name.trim()) {
            player2Id = run.player2Name.trim().toLowerCase();
          } else if (run.srcPlayer2Name) {
            player2Id = normalizeSRCUsername(run.srcPlayer2Name);
          } else {
            player2Id = "";
          }
        }
      }
      
      // Create run key: player1|player2|category|platform|runType|time|leaderboardType|level
      // For co-op runs, normalize order (alphabetically sort player identifiers)
      let key: string;
      if (run.runType === 'co-op' && player2Id) {
        const [p1, p2] = [player1Id, player2Id].sort();
        key = `${p1}|${p2}|${run.category || ''}|${run.platform || ''}|${run.runType || 'solo'}|${run.time || ''}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
      } else {
        key = `${player1Id}|${player2Id}|${run.category || ''}|${run.platform || ''}|${run.runType || 'solo'}|${run.time || ''}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
      }
      
      if (!runGroups.has(key)) {
        runGroups.set(key, []);
      }
      runGroups.get(key)!.push(run);
    }
    
    // Filter to only groups with duplicates (more than 1 run)
    const duplicateGroups: Array<{ runs: LeaderboardEntry[]; key: string }> = [];
    for (const [key, runs] of runGroups.entries()) {
      if (runs.length > 1) {
        duplicateGroups.push({ runs, key });
      }
    }
    
    return duplicateGroups;
  } catch (error) {
    
    return [];
  }
};

/**
 * Remove duplicate runs, keeping the best one based on priority:
 * 1. Verified runs over unverified
 * 2. Older submission date (earlier date = better)
 * 3. If same date, keep the one with lower ID (arbitrary but consistent)
 */
export const removeDuplicateRunsFirestore = async (duplicateGroups: Array<{ runs: LeaderboardEntry[]; key: string }>): Promise<{ removed: number; errors: string[] }> => {
  if (!db) return { removed: 0, errors: [] };
  
  const result = { removed: 0, errors: [] as string[] };
  
  try {
    let batch = writeBatch(db);
    let batchCount = 0;
    const MAX_BATCH_SIZE = 500;
    
    for (const group of duplicateGroups) {
      const runs = group.runs;
      
      // Sort runs to determine which to keep
      // Priority: verified > unverified, then older date, then lower ID
      runs.sort((a, b) => {
        // Verified runs first
        if (a.verified && !b.verified) return -1;
        if (!a.verified && b.verified) return 1;
        
        // Then by date (older = better)
        if (a.date && b.date) {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
        }
        
        // Finally by ID (lower = better, arbitrary but consistent)
        return a.id.localeCompare(b.id);
      });
      
      // Keep the first run (best one), remove the rest
      const runsToRemove = runs.slice(1);
      
      for (const run of runsToRemove) {
        const runDocRef = doc(db, "leaderboardEntries", run.id);
        batch.delete(runDocRef);
        batchCount++;
        result.removed++;
        
        if (batchCount >= MAX_BATCH_SIZE) {
          await batch.commit();
          batchCount = 0;
          batch = writeBatch(db);
        }
      }
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }
    
    // Recalculate points for affected players
    const affectedPlayerIds = new Set<string>();
    for (const group of duplicateGroups) {
      for (const run of group.runs) {
        if (run.playerId && run.playerId !== "imported" && !run.playerId.startsWith("unlinked_") && !run.playerId.startsWith("unclaimed_")) {
          affectedPlayerIds.add(run.playerId);
        }
      }
    }
    
    // Recalculate points for all affected players using helper function
    const affectedPlayerIdsArray = Array.from(affectedPlayerIds);
    if (affectedPlayerIdsArray.length > 0) {
      // Process in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < affectedPlayerIdsArray.length; i += batchSize) {
        const batch = affectedPlayerIdsArray.slice(i, i + batchSize);
        await Promise.all(batch.map(playerId => 
          recalculatePlayerPointsFirestore(playerId).catch(error => {
            
            result.errors.push(`Failed to recalculate points for player ${playerId}`);
          })
        ));
      }
    }
    
    return result;
  } catch (error) {
    
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
};

/**
 * Delete all imported runs from speedrun.com
 * Simple purge - deletes all unverified imported runs
 */
export const deleteAllImportedSRCRunsFirestore = async (): Promise<{ deleted: number; errors: string[] }> => {
  if (!db) return { deleted: 0, errors: ["Firestore not initialized"] };
  
  const result = { deleted: 0, errors: [] as string[] };
  
  try {
    // Simple query: get all unverified imported runs
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", false),
      where("importedFromSRC", "==", true),
      firestoreLimit(500)
    );
    
    let hasMore = true;
    
    // Delete in batches until no more runs
    while (hasMore) {
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        hasMore = false;
        break;
      }
      
      // Delete in batches (Firestore limit is 500 per batch)
      const batch = writeBatch(db);
      let batchSize = 0;
      
      querySnapshot.docs.forEach((docSnapshot) => {
        if (batchSize < 500) {
          batch.delete(docSnapshot.ref);
          batchSize++;
        }
      });
      
      if (batchSize > 0) {
        try {
          await batch.commit();
          result.deleted += batchSize;
        } catch (batchError) {
          const errorMsg = batchError instanceof Error ? batchError.message : String(batchError);
          result.errors.push(`Failed to delete batch: ${errorMsg}`);
        }
        
        // Check if we've processed all documents
        if (querySnapshot.docs.length < 500) {
          hasMore = false;
        }
      }
    }
    
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Delete error: ${errorMsg}`);
    return result;
  }
};

/**
 * Get unclaimed imported runs (runs with importedFromSRC === true but missing playerId)
 * These are runs that were imported but haven't been claimed by a user yet
 */
export const getUnclaimedImportedRunsFirestore = async (): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  
  try {
    // Query for verified imported runs (unclaimed verified runs)
    const verifiedQuery = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      where("importedFromSRC", "==", true),
      firestoreLimit(5000)
    );
    
    // Query for unverified imported runs (all unverified imported runs are unclaimed)
    const unverifiedQuery = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", false),
      where("importedFromSRC", "==", true),
      firestoreLimit(5000)
    );
    
    // Fetch both queries in parallel
    const [verifiedSnapshot, unverifiedSnapshot] = await Promise.all([
      getDocs(verifiedQuery),
      getDocs(unverifiedQuery)
    ]);
    
    // Combine all imported runs
    const allImportedRuns = [
      ...verifiedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry)),
      ...unverifiedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
    ];
    
    // Filter for runs that are missing playerId (unclaimed)
    const unclaimedRuns = allImportedRuns.filter(run => {
      const playerId = run.playerId || "";
      return !playerId || playerId.trim() === "";
    });
    
    return unclaimedRuns;
  } catch (error) {
    
    return [];
  }
};

/**
 * Delete all unclaimed imported runs (runs with importedFromSRC === true but missing playerId)
 */
export const deleteAllUnclaimedImportedRunsFirestore = async (onProgress?: (deleted: number) => void): Promise<{ deleted: number; errors: string[] }> => {
  if (!db) return { deleted: 0, errors: ["Firestore not initialized"] };
  
  const result = { deleted: 0, errors: [] as string[] };
  
  // Helper function to delete unclaimed runs from a query
  const deleteUnclaimedFromQuery = async (
    baseConstraints: QueryConstraint[],
    description: string
  ): Promise<number> => {
    let lastDoc: any = null;
    let totalDeleted = 0;
    const batchSize = 500;
    
    while (true) {
      // Build query with pagination
      const constraints: QueryConstraint[] = [...baseConstraints];
      
      // Add cursor for pagination if we have a last document
      if (lastDoc) {
        constraints.push(startAfter(lastDoc));
      }
      
      const q = query(collection(db, "leaderboardEntries"), ...constraints);
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        break; // No more documents
      }
      
      // Filter for runs without playerId (unclaimed)
      const unclaimedDocs = querySnapshot.docs.filter(docSnapshot => {
        const data = docSnapshot.data() as LeaderboardEntry;
        const playerId = data.playerId || "";
        return !playerId || playerId.trim() === "";
      });
      
      if (unclaimedDocs.length === 0) {
        // No unclaimed runs in this batch, but continue to next batch
        lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
        if (querySnapshot.docs.length < batchSize) {
          break;
        }
        continue;
      }
      
      // Delete in batches (Firestore limit is 500 per batch)
      const batch = writeBatch(db);
      let currentBatchSize = 0;
      
      unclaimedDocs.forEach((docSnapshot) => {
        if (currentBatchSize < batchSize) {
          batch.delete(docSnapshot.ref);
          currentBatchSize++;
        }
      });
      
      if (currentBatchSize > 0) {
        try {
          await batch.commit();
          totalDeleted += currentBatchSize;
          result.deleted += currentBatchSize;
          onProgress?.(result.deleted);
        } catch (batchError) {
          const errorMsg = batchError instanceof Error ? batchError.message : String(batchError);
          result.errors.push(`Failed to delete ${description} batch: ${errorMsg}`);
        }
      }
      
      // Set last document for next iteration
      lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
      
      // If we got fewer documents than the limit, we're done
      if (querySnapshot.docs.length < batchSize) {
        break;
      }
    }
    
    return totalDeleted;
  };
  
  try {
    // Delete unclaimed verified imported runs
    await deleteUnclaimedFromQuery(
      [
        where("verified", "==", true),
        where("importedFromSRC", "==", true),
        orderBy("__name__"),
        firestoreLimit(500)
      ],
      "verified"
    );
    
    // Delete unclaimed unverified imported runs
    await deleteUnclaimedFromQuery(
      [
        where("verified", "==", false),
        where("importedFromSRC", "==", true),
        orderBy("__name__"),
        firestoreLimit(500)
      ],
      "unverified"
    );
    
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Delete error: ${errorMsg}`);
    return result;
  }
};

/**
 * Delete ALL imported runs from speedrun.com (both verified and unverified)
 * This will delete all runs with importedFromSRC === true from the leaderboards
 */
export const wipeAllImportedSRCRunsFirestore = async (onProgress?: (deleted: number) => void): Promise<{ deleted: number; errors: string[] }> => {
  if (!db) return { deleted: 0, errors: ["Firestore not initialized"] };
  
  const result = { deleted: 0, errors: [] as string[] };
  
  try {
    // Query: get ALL imported runs (both verified and unverified)
    // Use cursor-based pagination to fetch all batches
    let lastDoc: any = null;
    let totalDeleted = 0;
    const batchSize = 500;
    
    // Delete in batches until no more runs
    while (true) {
      // Build query with pagination
      const constraints: QueryConstraint[] = [
        where("importedFromSRC", "==", true),
        orderBy("__name__"), // Order by document ID for consistent pagination
        firestoreLimit(batchSize)
      ];
      
      // Add cursor for pagination if we have a last document
      if (lastDoc) {
        constraints.push(startAfter(lastDoc));
      }
      
      const q = query(collection(db, "leaderboardEntries"), ...constraints);
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        break; // No more documents
      }
      
      // Delete in batches (Firestore limit is 500 per batch)
      const batch = writeBatch(db);
      let currentBatchSize = 0;
      
      querySnapshot.docs.forEach((docSnapshot) => {
        if (currentBatchSize < batchSize) {
          batch.delete(docSnapshot.ref);
          currentBatchSize++;
        }
      });
      
      if (currentBatchSize > 0) {
        try {
          await batch.commit();
          totalDeleted += currentBatchSize;
          result.deleted += currentBatchSize;
          onProgress?.(totalDeleted);
        } catch (batchError) {
          const errorMsg = batchError instanceof Error ? batchError.message : String(batchError);
          result.errors.push(`Failed to delete batch: ${errorMsg}`);
        }
        
        // Set last document for next iteration (use the last document from this batch)
        lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
        
        // If we got fewer documents than the limit, we're done
        if (querySnapshot.docs.length < batchSize) {
          break;
        }
      } else {
        break; // No documents to delete
      }
    }
    
    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`Delete error: ${errorMsg}`);
    return result;
  }
};
