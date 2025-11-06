import { db } from "@/lib/firebase";
import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy, limit as firestoreLimit, deleteField, writeBatch, getDocsFromCache, getDocsFromServer } from "firebase/firestore";
import { Player, LeaderboardEntry, DownloadEntry, Category, Platform, Level } from "@/types/database";
import { calculatePoints, parseTimeToSeconds } from "@/lib/utils";

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
  
  const constraints: any[] = [
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
  let nonObsoleteRuns = rankSnapshot.docs
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
  
  // Sort by time
  nonObsoleteRuns.sort((a, b) => {
    const timeA = parseTimeToSeconds(a.time);
    const timeB = parseTimeToSeconds(b.time);
    return timeA - timeB;
  });
  
  // Create rank map (1-based)
  const rankMap = new Map<string, number>();
  nonObsoleteRuns.forEach((run, index) => {
    rankMap.set(run.id, index + 1);
  });
  
  return rankMap;
}

export const getLeaderboardEntriesFirestore = async (
  categoryId?: string,
  platformId?: string,
  runType?: 'solo' | 'co-op',
  includeObsolete?: boolean,
  leaderboardType?: 'regular' | 'individual-level' | 'community-golds',
  levelId?: string
): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  
  try {
    // Build query constraints dynamically based on filters
    const constraints: any[] = [
      where("verified", "==", true),
    ];

    // Add leaderboardType filter - use where clause for non-regular types
    if (leaderboardType && leaderboardType !== 'regular') {
      constraints.push(where("leaderboardType", "==", leaderboardType));
    }

    // Add category filter
    if (categoryId && categoryId !== "all") {
      constraints.push(where("category", "==", categoryId));
    }

    // Add platform filter
    if (platformId && platformId !== "all") {
      constraints.push(where("platform", "==", platformId));
    }

    // Add runType filter
    if (runType && (runType === "solo" || runType === "co-op")) {
      constraints.push(where("runType", "==", runType));
    }

    // Add level filter for ILs and Community Golds
    if (levelId && levelId !== "all") {
      constraints.push(where("level", "==", levelId));
    }

    // Add isObsolete filter if not including obsolete runs
    // Note: Firestore doesn't support filtering by isObsolete == false directly
    // We'll fetch all and filter client-side, but use index for better performance
    constraints.push(firestoreLimit(200));
    
    const q = query(collection(db, "leaderboardEntries"), ...constraints);
    const querySnapshot = await getDocs(q);
    
    // Process entries - ensure isObsolete is properly set (default to false if undefined)
    let entries: LeaderboardEntry[] = querySnapshot.docs
      .map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          isObsolete: data.isObsolete === true // Explicitly set to false if not true
        } as LeaderboardEntry;
      })
      .filter(entry => {
        // Filter obsolete entries if not including them
        // Treat undefined/null as false (non-obsolete)
        if (!includeObsolete && entry.isObsolete === true) return false;
        
        // Filter out non-regular entries when querying for regular leaderboard type
        if (!leaderboardType || leaderboardType === 'regular') {
          const entryLeaderboardType = entry.leaderboardType || 'regular';
          if (entryLeaderboardType !== 'regular') return false;
        }
        
        return true;
      });

    // Sort by time in ascending order (fastest times first)
    // Separate obsolete and non-obsolete runs for proper ranking
    const nonObsoleteEntries = entries.filter(e => !e.isObsolete || e.isObsolete === undefined);
    const obsoleteEntries = entries.filter(e => e.isObsolete === true);
    
    // Sort both groups
    const sortByTime = (entries: LeaderboardEntry[]) => {
      return entries.map(entry => {
        const parts = entry.time.split(':').map(Number);
        let totalSeconds = 0;
        if (parts.length === 3) {
          totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          totalSeconds = parts[0] * 60 + parts[1];
        } else {
          totalSeconds = Infinity;
        }
        return { entry, totalSeconds };
      }).sort((a, b) => a.totalSeconds - b.totalSeconds).map(item => item.entry);
    };
    
    const sortedNonObsolete = sortByTime(nonObsoleteEntries);
    const sortedObsolete = sortByTime(obsoleteEntries);
    
    // Assign ranks: non-obsolete runs get sequential ranks starting from 1
    // Obsolete runs get ranks that continue from non-obsolete runs
    sortedNonObsolete.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    
    sortedObsolete.forEach((entry, index) => {
      entry.rank = sortedNonObsolete.length + index + 1;
    });
    
    // Combine: non-obsolete first, then obsolete, limit to 100
    entries = [...sortedNonObsolete, ...sortedObsolete].slice(0, 100);

    // Batch fetch all unique player IDs to avoid N+1 queries
    const playerIds = new Set<string>();
    const player2Names = new Set<string>();
    entries.forEach(entry => {
      playerIds.add(entry.playerId);
      if (entry.player2Name && entry.runType === 'co-op') {
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

    // Enrich entries with player data from the map
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
      
      // For co-op runs, look up player2
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
    console.error("Error fetching leaderboard entries:", error);
    return [];
  }
};

export const addLeaderboardEntryFirestore = async (entry: Omit<LeaderboardEntry, 'id' | 'rank' | 'isObsolete'> & { verified?: boolean }): Promise<string | null> => {
  if (!db) return null;
  try {
    const newDocRef = doc(collection(db, "leaderboardEntries"));
    const newEntry: any = { 
      id: newDocRef.id, 
      playerId: entry.playerId,
      playerName: entry.playerName,
      category: entry.category,
      platform: entry.platform,
      runType: entry.runType,
      leaderboardType: entry.leaderboardType || 'regular', // Default to 'regular' if not specified
      time: entry.time,
      date: entry.date || new Date().toISOString().split('T')[0],
      verified: entry.verified ?? false, 
      isObsolete: false,
    };
    
    // Only include optional fields if they have values
    if (entry.player2Name) {
      newEntry.player2Name = entry.player2Name;
    }
    if (entry.level) {
      newEntry.level = entry.level;
    }
    if (entry.videoUrl) {
      newEntry.videoUrl = entry.videoUrl;
    }
    if (entry.comment) {
      newEntry.comment = entry.comment;
    }
    
    await setDoc(newDocRef, newEntry);
    return newDocRef.id;
  } catch (error: any) {
    console.error("Error adding leaderboard entry:", error);
    // Re-throw the error so the caller can see what went wrong
    throw error;
  }
};

export const getPlayerByUidFirestore = async (uid: string): Promise<Player | null> => {
  if (!db) return null;
  try {
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
    console.error("Error fetching player by display name:", error);
    return null;
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
    console.error("Error fetching players with Twitch usernames:", error);
    return [];
  }
};

export const createPlayerFirestore = async (player: Omit<Player, 'id'>): Promise<string | null> => {
  if (!db) return null;
  try {
    const playerDocRef = doc(db, "players", player.uid);
    await setDoc(playerDocRef, player);
    return player.uid;
  } catch (error: any) {
    console.error("createPlayerFirestore error:", error);
    return null;
  }
};

export const updatePlayerProfileFirestore = async (uid: string, data: Partial<Player>): Promise<boolean> => {
  if (!db) return false;
  try {
    const playerDocRef = doc(db, "players", uid);
    const docSnap = await getDoc(playerDocRef);
    
    // Filter out undefined values and convert empty strings for bio/pronouns/twitchUsername to deleteField
    // profilePicture: empty string should delete the field, undefined should skip (no change)
    const updateData: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        // Skip undefined values (no change)
        continue;
      } else if ((key === 'bio' || key === 'pronouns' || key === 'twitchUsername' || key === 'profilePicture') && value === '') {
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
      const newPlayer: any = {
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
      
      // Only add bio/pronouns/twitchUsername if they have non-empty values
      if (data.bio && data.bio.trim()) {
        newPlayer.bio = data.bio.trim();
      }
      if (data.pronouns && data.pronouns.trim()) {
        newPlayer.pronouns = data.pronouns.trim();
      }
      if (data.twitchUsername && data.twitchUsername.trim()) {
        newPlayer.twitchUsername = data.twitchUsername.trim();
      }
      if (data.profilePicture) {
        newPlayer.profilePicture = data.profilePicture;
    }
      
      await setDoc(playerDocRef, newPlayer);
    }
    
    return true;
  } catch (error: any) {
    console.error("updatePlayerProfileFirestore error:", error?.code, error?.message);
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
    console.error("Error fetching recent runs:", error);
    return [];
  }
};

export const getPlayerRunsFirestore = async (playerId: string): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  try {
    // Fetch player's runs
    const q = query(
      collection(db, "leaderboardEntries"),
      where("playerId", "==", playerId),
      where("verified", "==", true),
      firestoreLimit(200)
    );
    
    const querySnapshot = await getDocs(q);
    
    const entries = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
      .filter(entry => !entry.isObsolete);

    if (entries.length === 0) {
      return [];
    }

    // Get unique category/platform/runType combinations from player's runs
    const combinations = new Set<string>();
    entries.forEach(entry => {
      const key = `${entry.category}_${entry.platform}_${entry.runType || 'solo'}`;
      combinations.add(key);
    });

    // Fetch verified entries for only the relevant combinations to reduce data transfer
    const allEntries: LeaderboardEntry[] = [];
    for (const combinationKey of combinations) {
      const [categoryId, platformId, runType] = combinationKey.split('_');
      const comboQuery = query(
        collection(db, "leaderboardEntries"),
        where("verified", "==", true),
        where("category", "==", categoryId),
        where("platform", "==", platformId),
        where("runType", "==", runType),
        firestoreLimit(200)
      );
      const comboSnapshot = await getDocs(comboQuery);
      const comboEntries = comboSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
        .filter(entry => !entry.isObsolete);
      allEntries.push(...comboEntries);
    }

    // Create a map to store ranks for each combination
    const rankMap = new Map<string, Map<string, number>>(); // combination -> runId -> rank

    // Calculate ranks for each unique combination
    for (const comboKey of combinations) {
      const [category, platform, runType] = comboKey.split('_');
      
      // Filter entries for this combination
      const comboEntries = allEntries.filter(entry => 
        entry.category === category &&
        entry.platform === platform &&
        (entry.runType || 'solo') === runType
      );

      // Parse and sort by time
      const entriesWithTime = comboEntries.map(entry => {
        const parts = entry.time.split(':').map(Number);
        let totalSeconds = 0;
        if (parts.length === 3) {
          totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          totalSeconds = parts[0] * 60 + parts[1];
        } else {
          totalSeconds = Infinity;
        }
        return { entry, totalSeconds };
      });

      // Sort by time (fastest first)
      entriesWithTime.sort((a, b) => a.totalSeconds - b.totalSeconds);

      // Assign ranks
      const comboRankMap = new Map<string, number>();
      entriesWithTime.forEach((item, index) => {
        comboRankMap.set(item.entry.id, index + 1);
      });
      
      rankMap.set(comboKey, comboRankMap);
    }

    // Enrich with player display name and color, and assign ranks
    const player = await getPlayerByUidFirestore(playerId);
    return entries.map(entry => {
      if (player) {
        // Use displayName from player document if available
        if (player.displayName) {
          entry.playerName = player.displayName;
        }
        if (player.nameColor) {
        entry.nameColor = player.nameColor;
      }
      }
      
      // Assign rank based on the combination
      const comboKey = `${entry.category}_${entry.platform}_${entry.runType || 'solo'}`;
      const comboRankMap = rankMap.get(comboKey);
      if (comboRankMap) {
        entry.rank = comboRankMap.get(entry.id);
      }
      
      return entry;
    });
  } catch (error) {
    return [];
  }
};

export const getPlayerPendingRunsFirestore = async (playerId: string): Promise<LeaderboardEntry[]> => {
  if (!db) {
    console.error("getPlayerPendingRunsFirestore: Database not initialized");
    return [];
  }
  if (!playerId) {
    console.error("getPlayerPendingRunsFirestore: playerId is required");
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

    console.log(`getPlayerPendingRunsFirestore: Found ${entries.length} pending runs for player ${playerId}`);

    // Enrich with player display name and color
    const player = await getPlayerByUidFirestore(playerId);
    return entries.map(entry => {
      if (player) {
        // Use displayName from player document if available
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
    console.error("getPlayerPendingRunsFirestore error:", error);
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
    const enrichedEntries = await Promise.all(entries.map(async (entry) => {
      try {
        const player = await getPlayerByUidFirestore(entry.playerId);
        if (player) {
          // Use displayName from player document if available
          if (player.displayName) {
            entry.playerName = player.displayName;
          }
          if (player.nameColor) {
          entry.nameColor = player.nameColor;
        }
        }
        // For co-op runs, also fetch player2 display name and color
        if (entry.player2Name && entry.runType === 'co-op') {
          const player2 = await getPlayerByDisplayNameFirestore(entry.player2Name);
          if (player2) {
            // Update player2Name to use displayName from player document
            entry.player2Name = player2.displayName;
            if (player2.nameColor) {
            entry.player2Color = player2.nameColor;
            }
          }
        }
      } catch (error) {
        // Silent fail - continue without enrichment
      }
      return entry;
    }));

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
      
      // Calculate rank if the run is verified
      if (entry.verified && !entry.isObsolete) {
        try {
          // Build query constraints to get all verified entries for this run's category/platform/runType/leaderboardType/level
          const constraints: any[] = [
            where("verified", "==", true),
            where("category", "==", entry.category),
            where("platform", "==", entry.platform),
            where("runType", "==", entry.runType || 'solo'),
          ];

          // Add leaderboardType filter
          const leaderboardType = entry.leaderboardType || 'regular';
          if (leaderboardType !== 'regular') {
            constraints.push(where("leaderboardType", "==", leaderboardType));
          }

          // Add level filter for ILs and Community Golds
          if (entry.level) {
            constraints.push(where("level", "==", entry.level));
          }

          constraints.push(firestoreLimit(200));
          
          const q = query(collection(db, "leaderboardEntries"), ...constraints);
          const querySnapshot = await getDocs(q);
          
          let entries: LeaderboardEntry[] = querySnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
            .filter(e => !e.isObsolete && (e.leaderboardType || 'regular') === leaderboardType);

          // Sort by time in ascending order (fastest times first)
          const entriesWithTime = entries.map(e => {
            const parts = e.time.split(':').map(Number);
            let totalSeconds = 0;
            if (parts.length === 3) {
              totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) {
              totalSeconds = parts[0] * 60 + parts[1];
            } else {
              totalSeconds = Infinity;
            }
            return { entry: e, totalSeconds };
          });
          entriesWithTime.sort((a, b) => a.totalSeconds - b.totalSeconds);
          
          // Find the rank of the current entry
          const currentTimeParts = entry.time.split(':').map(Number);
          let currentTotalSeconds = 0;
          if (currentTimeParts.length === 3) {
            currentTotalSeconds = currentTimeParts[0] * 3600 + currentTimeParts[1] * 60 + currentTimeParts[2];
          } else if (currentTimeParts.length === 2) {
            currentTotalSeconds = currentTimeParts[0] * 60 + currentTimeParts[1];
          }
          
          // Find the rank (1-based index)
          const rankIndex = entriesWithTime.findIndex(e => e.entry.id === entry.id);
          if (rankIndex !== -1) {
            entry.rank = rankIndex + 1;
          } else {
            // If not found in sorted list, calculate rank based on time
            const fasterCount = entriesWithTime.filter(e => e.totalSeconds < currentTotalSeconds).length;
            entry.rank = fasterCount + 1;
          }
        } catch (error) {
          // Silent fail - rank will remain undefined
          console.error("Error calculating rank:", error);
        }
      }
      
      // Enrich with player display names and colors
      try {
        const player = await getPlayerByUidFirestore(entry.playerId);
        if (player) {
          // Use displayName from player document if available
          if (player.displayName) {
            entry.playerName = player.displayName;
          }
          if (player.nameColor) {
          entry.nameColor = player.nameColor;
        }
        }
        // For co-op runs, also fetch player2 display name and color
        if (entry.player2Name && entry.runType === 'co-op') {
          const player2 = await getPlayerByDisplayNameFirestore(entry.player2Name);
          if (player2) {
            // Update player2Name to use displayName from player document
            entry.player2Name = player2.displayName;
            if (player2.nameColor) {
            entry.player2Color = player2.nameColor;
            }
          }
        }
      } catch (error) {
        // Silent fail - continue without enrichment
      }
      
      return entry;
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
    const updateData: any = {};
    
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
        
        let categoryName = "Unknown";
        let platformName = "Unknown";
        
        // Fetch category and platform in parallel for better performance
        const [categoryDocSnap, platformDocSnap] = await Promise.all([
          getDoc(doc(db, "categories", newCategoryId)).catch(() => null),
          getDoc(doc(db, "platforms", newPlatformId)).catch(() => null)
        ]);
        
        if (categoryDocSnap?.exists()) {
          categoryName = categoryDocSnap.data().name || "Unknown";
        }
        if (platformDocSnap?.exists()) {
          platformName = platformDocSnap.data().name || "Unknown";
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
        if (calculatedRank !== undefined) {
          // Ensure rank is a valid number
          if (typeof calculatedRank === 'number' && !isNaN(calculatedRank) && calculatedRank > 0) {
            rank = calculatedRank;
          } else {
            const parsed = Number(calculatedRank);
            if (!isNaN(parsed) && parsed > 0) {
              rank = parsed;
            }
          }
        }
      }
      
      // Store rank in update data (only if rank is 1, 2, or 3 for bonus points)
      if (rank !== undefined && rank !== null && rank >= 1 && rank <= 3) {
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
        rank
      );
      updateData.points = points;
      
      // Recalculate player's total points
      await recalculatePlayerPointsFirestore(runData.playerId);
      if (runData.player2Name && runData.runType === 'co-op') {
        const player2 = await getPlayerByDisplayNameFirestore(runData.player2Name);
        if (player2) {
          await recalculatePlayerPointsFirestore(player2.uid);
        }
      }
    }
    
    await updateDoc(runDocRef, updateData);
    return true;
  } catch (error: any) {
    console.error("Error updating leaderboard entry:", error);
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
    console.error("Error creating player2 document:", createError);
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
    
    if (verified && verifiedBy) {
      updateData.verifiedBy = verifiedBy;
      
      // Calculate and store points when verifying (always recalculate to ensure accuracy)
      // Fetch category and platform names in parallel for better performance
      let categoryName = "Unknown";
      let platformName = "Unknown";
      
      const [categoryDocSnap, platformDocSnap] = await Promise.all([
        getDoc(doc(db, "categories", runData.category)).catch(() => null),
        getDoc(doc(db, "platforms", runData.platform)).catch(() => null)
      ]);
      
      if (categoryDocSnap?.exists()) {
        categoryName = categoryDocSnap.data().name || "Unknown";
      }
      if (platformDocSnap?.exists()) {
        platformName = platformDocSnap.data().name || "Unknown";
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
        if (calculatedRank !== undefined) {
          // Ensure rank is a valid number
          if (typeof calculatedRank === 'number' && !isNaN(calculatedRank) && calculatedRank > 0) {
            rank = calculatedRank;
          } else {
            const parsed = Number(calculatedRank);
            if (!isNaN(parsed) && parsed > 0) {
              rank = parsed;
            }
          }
        }
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
      if (rank !== undefined && rank !== null && rank >= 1 && rank <= 3) {
        updateFields.rank = rank;
      } else {
        // Remove rank field if obsolete, not ranked, or rank > 3
        updateFields.rank = deleteField();
      }
      await updateDoc(runDocRef, updateFields);
      
      // Always recalculate player points to ensure accuracy (handles re-verification correctly)
      // Now that the run is verified, it will be included in the recalculation
      try {
        await recalculatePlayerPointsFirestore(runData.playerId);
        
        // For co-op runs, also recalculate player2's points
        if (runData.runType === 'co-op' && runData.player2Name) {
          try {
            const player2NameTrimmed = runData.player2Name.trim();
            let player2 = await getPlayerByDisplayNameFirestore(player2NameTrimmed);
            
            // If player2 doesn't have a player document, check if they have player1 runs to get their UID
            if (!player2) {
              const player1Query = query(
                collection(db, "leaderboardEntries"),
                where("playerName", "==", player2NameTrimmed),
                where("verified", "==", true),
                firestoreLimit(1)
              );
              const player1Snapshot = await getDocs(player1Query);
              if (!player1Snapshot.empty) {
                const firstRun = player1Snapshot.docs[0].data() as LeaderboardEntry;
                if (firstRun.playerId && !firstRun.playerId.startsWith("unlinked_")) {
                  // Player2 has player1 runs - recalculate their points using that UID
                  await recalculatePlayerPointsFirestore(firstRun.playerId);
                } else {
                  // Player2 has player1 runs but with unlinked UID - create proper player document
                  const nameHash = player2NameTrimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
                  const generatedUid = `player_${nameHash}`;
                  await createPlayerDocumentForPlayer2(player2NameTrimmed, generatedUid, firstRun.date);
                  await recalculatePlayerPointsFirestore(generatedUid);
                }
              } else {
                // Player2 has no player document and no player1 runs - create one
                // Generate a consistent UID based on their name
                const nameHash = player2NameTrimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const generatedUid = `player_${nameHash}`;
                
                // Find their earliest co-op run date for joinDate
                const coOpQuery = query(
                  collection(db, "leaderboardEntries"),
                  where("verified", "==", true),
                  where("runType", "==", "co-op"),
                  where("player2Name", "==", player2NameTrimmed),
                  orderBy("date", "asc"),
                  firestoreLimit(1)
                );
                let joinDate = new Date().toISOString().split('T')[0];
                try {
                  const coOpSnapshot = await getDocs(coOpQuery);
                  if (!coOpSnapshot.empty) {
                    const firstCoOpRun = coOpSnapshot.docs[0].data() as LeaderboardEntry;
                    if (firstCoOpRun.date) {
                      joinDate = firstCoOpRun.date;
                    }
                  }
                } catch (error) {
                  // If orderBy fails, use current date
                }
                
                await createPlayerDocumentForPlayer2(player2NameTrimmed, generatedUid, joinDate);
                await recalculatePlayerPointsFirestore(generatedUid);
              }
            } else {
              // Player2 has a document - recalculate their points
              await recalculatePlayerPointsFirestore(player2.uid);
            }
          } catch (error) {
            console.error("Error recalculating player2 points on verify:", error);
          }
        }
      } catch (error) {
        console.error("Error recalculating player points on verify:", error);
        // Don't fail verification if points recalculation fails
      }
      
      return true;
    } else if (!verified && runData.verified) {
      // When unverifying, update the document first, then recalculate points
      // This ensures the run is marked as unverified before recalculation
    await updateDoc(runDocRef, updateData);
      
      // Recalculate points for all affected players
      // This will subtract the points since the run is no longer verified
      try {
        await recalculatePlayerPointsFirestore(runData.playerId);
        if (runData.runType === 'co-op' && runData.player2Name) {
          try {
            const player2NameTrimmed = runData.player2Name.trim();
            const player2 = await getPlayerByDisplayNameFirestore(player2NameTrimmed);
            if (player2) {
              await recalculatePlayerPointsFirestore(player2.uid);
            }
          } catch (error) {
            console.error("Error recalculating player2 points on unverify:", error);
          }
        }
      } catch (error) {
        console.error("Error recalculating player points on unverify:", error);
      }
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
  try {
    const playerDocRef = doc(db, "players", playerId);
    let playerDocSnap = null;
    
    try {
      playerDocSnap = await getDoc(playerDocRef);
    } catch (error) {
      console.error(`Error reading player document ${playerId}:`, error);
      playerDocSnap = null;
    }
    
    // Get all verified runs where this player is player1 (all leaderboard types)
    const q = query(
      collection(db, "leaderboardEntries"),
      where("playerId", "==", playerId),
      where("verified", "==", true),
      firestoreLimit(500) // Increased limit to include all run types
    );
    const querySnapshot = await getDocs(q);
    
    // Also check for co-op runs where this player is player2 (all leaderboard types)
    let player2Runs: LeaderboardEntry[] = [];
    let playerDisplayName: string | null = null;
    
    // Try to get player document to find displayName
    const player = await getPlayerByUidFirestore(playerId);
    if (player?.displayName) {
      playerDisplayName = player.displayName;
    } else {
      // If player doesn't exist yet, try to find their displayName from player1 runs
      if (querySnapshot.docs.length > 0) {
        const firstRun = querySnapshot.docs[0].data() as LeaderboardEntry;
        if (firstRun.playerName) {
          playerDisplayName = firstRun.playerName;
        }
      }
      
      // If still no displayName, try to find it from player2 runs
      // This handles cases where a player only has co-op runs as player2
      if (!playerDisplayName) {
        // Search all co-op runs and find ones where this playerId might be player2
        // We'll need to check player2Name matches - but we don't know the name yet
        // So we'll search broadly and filter later
        const coOpQuery = query(
          collection(db, "leaderboardEntries"),
          where("verified", "==", true),
          where("runType", "==", "co-op"),
          firestoreLimit(500)
        );
        const coOpSnapshot = await getDocs(coOpQuery);
        const allCoOpRuns = coOpSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
        
        // Try to find a pattern - if playerId starts with "player_", extract the name
        // Otherwise, we'll need to search by trying to match playerId with player2Name
        // For now, let's try to get displayName from any co-op run where player2Name might match
        // Actually, this is tricky - we need the name to search, but we're trying to find the name
        
        // Alternative: if playerId format suggests it's a generated UID, extract name from it
        if (playerId.startsWith("player_")) {
          const nameFromUid = playerId.replace("player_", "").replace(/_/g, " ");
          // Try to find a co-op run with a player2Name that matches this pattern
          for (const run of allCoOpRuns) {
            if (run.player2Name) {
              const normalizedRunName = run.player2Name.toLowerCase().replace(/[^a-z0-9]/g, '_');
              if (normalizedRunName === nameFromUid.replace(/ /g, '_')) {
                playerDisplayName = run.player2Name;
                break;
              }
            }
          }
        }
      }
    }
    
    // If we have a displayName, search for co-op runs where this player is player2
    if (playerDisplayName) {
      const coOpQuery = query(
        collection(db, "leaderboardEntries"),
        where("verified", "==", true),
        where("runType", "==", "co-op"),
        firestoreLimit(500) // Increased limit to include all run types
      );
      const coOpSnapshot = await getDocs(coOpQuery);
      player2Runs = coOpSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
        .filter(entry => 
          entry.player2Name?.trim().toLowerCase() === playerDisplayName!.trim().toLowerCase()
        );
    } else {
      // Last resort: search all co-op runs and try to find any where player2Name might match
      // This is a fallback for edge cases
      const coOpQuery = query(
        collection(db, "leaderboardEntries"),
        where("verified", "==", true),
        where("runType", "==", "co-op"),
        firestoreLimit(500)
      );
      const coOpSnapshot = await getDocs(coOpQuery);
      // For now, we'll skip player2 runs if we can't determine the displayName
      // The backfill function will handle creating player documents for player2s
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
    const allRuns = [
      ...querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry)),
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
          if (calculatedRank !== undefined) {
            // Ensure it's a valid number
            if (typeof calculatedRank === 'number' && !isNaN(calculatedRank) && calculatedRank > 0) {
              rank = calculatedRank;
            } else {
              const parsed = Number(calculatedRank);
              if (!isNaN(parsed) && parsed > 0) {
                rank = parsed;
              }
            }
          }
          
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
              rank = runIndex + 1; // 1-based rank
            }
          }
          
          // Last resort: check if run already has a stored rank (only if it's 1, 2, or 3)
          // This is a fallback for cases where the run might not be in the current group
          if (rank === undefined && playerRun.rank !== undefined && playerRun.rank !== null) {
            const storedRank = typeof playerRun.rank === 'number' ? playerRun.rank : Number(playerRun.rank);
            if (!isNaN(storedRank) && storedRank >= 1 && storedRank <= 3) {
              rank = storedRank;
            }
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
      
      // Ensure rank is a valid number if provided
      let numericRank: number | undefined = undefined;
      if (rank !== undefined && rank !== null) {
        if (typeof rank === 'number' && !isNaN(rank) && rank > 0) {
          numericRank = rank;
        } else {
          const parsed = Number(rank);
          if (!isNaN(parsed) && parsed > 0) {
            numericRank = parsed;
          }
        }
      }
      
      // Calculate points (already split for co-op runs)
      const points = calculatePoints(
        runData.time, 
        categoryName, 
        platformName,
        runData.category,
        runData.platform,
        numericRank,
        runData.runType as 'solo' | 'co-op' | undefined
      );
      
      // Always update the run with recalculated points and rank
      runsToUpdate.push({ id: runData.id, points, rank: numericRank });
      
      // For co-op runs, points are already split, so each player gets the calculated points
      // For solo runs, player gets full points
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
        batchCount = 0;
        batch = writeBatch(db); // Create new batch for remaining updates
      }
    }
    
    // Commit remaining updates
    if (batchCount > 0) {
      await batch.commit();
    }
    
    // Calculate total verified runs (including both player1 and player2 runs)
    const totalVerifiedRuns = querySnapshot.docs.length + player2Runs.length;
    
    // Update or create player's total points and total runs
    if (playerDocSnap && playerDocSnap.exists()) {
      // Update both totalPoints and totalRuns
      try {
      await updateDoc(playerDocRef, { totalPoints, totalRuns: totalVerifiedRuns });
      } catch (error: any) {
        console.error(`Error updating player ${playerId} totalPoints and totalRuns:`, error?.code, error?.message);
        throw error; // Re-throw to be caught by outer catch
      }
    } else {
      // Create player document if it doesn't exist
      // Get player info from first run if available (try player1 runs first, then player2 runs)
      const firstRun = querySnapshot.docs[0]?.data() as LeaderboardEntry | undefined;
      const firstPlayer2Run = player2Runs[0];
      
      // Determine displayName - use playerName from player1 runs, or player2Name from player2 runs
      let displayName = "Unknown Player";
      if (firstRun?.playerName) {
        displayName = firstRun.playerName;
      } else if (firstPlayer2Run?.player2Name) {
        displayName = firstPlayer2Run.player2Name;
      } else if (player?.displayName) {
        displayName = player.displayName;
      }
      
      // Determine joinDate - use date from first available run
      let joinDate = new Date().toISOString().split('T')[0];
      if (firstRun?.date) {
        joinDate = firstRun.date;
      } else if (firstPlayer2Run?.date) {
        joinDate = firstPlayer2Run.date;
      }
      
      const playerData: Omit<Player, 'id'> = {
        uid: playerId,
        displayName: displayName,
        email: "",
        joinDate: joinDate,
        totalRuns: totalVerifiedRuns,
        bestRank: null,
        favoriteCategory: null,
        favoritePlatform: null,
        nameColor: "#cba6f7",
        isAdmin: false, // Explicitly set to false for new players
        totalPoints,
      };
      try {
      await setDoc(playerDocRef, playerData);
      } catch (error: any) {
        console.error(`Error creating player document ${playerId}:`, error?.code, error?.message);
        throw error; // Re-throw to be caught by outer catch
      }
    }
    
    return true;
  } catch (error: any) {
    console.error(`Error recalculating points for player ${playerId}:`, error?.code, error?.message);
    if (error?.code === 'permission-denied') {
      console.error(`Permission denied. Make sure you are logged in as an admin and your admin status is set correctly in Firestore.`);
    }
    return false;
  }
};

export const deleteLeaderboardEntryFirestore = async (runId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const runDocRef = doc(db, "leaderboardEntries", runId);
    await deleteDoc(runDocRef);
    return true;
  } catch (error) {
    return false;
  }
};

export const deleteAllLeaderboardEntriesFirestore = async (): Promise<{ deleted: number; errors: string[] }> => {
  if (!db) return { deleted: 0, errors: ["Firestore not initialized"] };
  
  const result = { deleted: 0, errors: [] as string[] };
  
  try {
    let hasMore = true;
    let batchCount = 0;
    const batchSize = 500;
    
    while (hasMore) {
      const q = query(collection(db, "leaderboardEntries"), firestoreLimit(batchSize));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        hasMore = false;
        break;
      }
      
      const deletePromises = querySnapshot.docs.map(async (docSnapshot) => {
        try {
          await deleteDoc(docSnapshot.ref);
          return true;
        } catch (error) {
          result.errors.push(`Failed to delete ${docSnapshot.id}: ${error instanceof Error ? error.message : String(error)}`);
          return false;
        }
      });
      
      const deleteResults = await Promise.all(deletePromises);
      result.deleted += deleteResults.filter(r => r).length;
      
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
  } catch (error: any) {
    console.error("Error adding download entry:", error);
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
    let q = query(collection(db, "categories"));
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

export const updateCategoryFirestore = async (id: string, name: string): Promise<boolean> => {
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
    
    if (currentName.toLowerCase() === trimmedName.toLowerCase()) {
      return true;
    }
    
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
    
    await updateDoc(categoryDocRef, { name: trimmedName });
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
    let q = query(collection(db, "platforms"));
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

export const getUnclaimedRunsByUsernameFirestore = async (username: string): Promise<LeaderboardEntry[]> => {
  if (!db) return [];
  try {
    // Get all verified runs
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      firestoreLimit(500)
    );
    const querySnapshot = await getDocs(q);
    
    const normalizedUsername = username.trim().toLowerCase();
    
    const unclaimedRuns = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
      .filter(entry => {
        const entryPlayerName = (entry.playerName || "").trim().toLowerCase();
        return entryPlayerName === normalizedUsername;
      });
    
    return unclaimedRuns;
  } catch (error) {
    return [];
  }
};

export const claimRunFirestore = async (runId: string, userId: string): Promise<boolean> => {
  if (!db) return false;
  try {
    const runDocRef = doc(db, "leaderboardEntries", runId);
    const runDoc = await getDoc(runDocRef);
    
    if (!runDoc.exists()) {
      return false;
    }
    
    const runData = runDoc.data() as LeaderboardEntry;
    const oldPlayerId = runData.playerId;
    
    // Update the run with the new playerId
    await updateDoc(runDocRef, { playerId: userId });
    
    // Recalculate points for the new player (the one claiming the run)
    // Only recalculate if the run is verified (verified runs count for points)
    if (runData.verified) {
      try {
        await recalculatePlayerPointsFirestore(userId);
        // For co-op runs, also recalculate player2's points
        if (runData.runType === 'co-op' && runData.player2Name) {
          const player2 = await getPlayerByDisplayNameFirestore(runData.player2Name);
          if (player2) {
            await recalculatePlayerPointsFirestore(player2.uid);
          }
        }
      } catch (error) {
        console.error(`Error recalculating points for new player ${userId}:`, error);
        // Don't fail the claim if points recalculation fails
      }
    }
    
    // Recalculate points for the old player (if they had an account)
    // This removes the run from their points if they were a linked player
    if (oldPlayerId && oldPlayerId !== userId && !oldPlayerId.startsWith("unlinked_")) {
      try {
        await recalculatePlayerPointsFirestore(oldPlayerId);
      } catch (error) {
        console.error(`Error recalculating points for old player ${oldPlayerId}:`, error);
        // Don't fail the claim if points recalculation fails
      }
    }
    
    return true;
  } catch (error) {
    console.error("Error claiming run:", error);
    return false;
  }
};

/**
 * Get all players sorted by total points (descending)
 * Uses stored totalPoints from player documents for fast querying with Firestore index
 * Falls back gracefully if index is not yet deployed
 */
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
      
      // Deduplicate by UID and displayName - keep the player with the highest totalPoints
      // If points are equal, keep the first one encountered
      const playerMap = new Map<string, Player>();
      const seenUIDs = new Set<string>();
      const seenNames = new Map<string, string>(); // name -> uid
      
      for (const player of allPlayers) {
        if (!player.uid) continue; // Skip players without UID
        
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
        const nameLower = player.displayName?.toLowerCase().trim();
        if (nameLower) {
          const existingUIDForName = seenNames.get(nameLower);
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
                seenNames.set(nameLower, player.uid);
              }
            }
            continue;
          }
        }
        
        // New unique player
        seenUIDs.add(player.uid);
        if (nameLower) {
          seenNames.set(nameLower, player.uid);
        }
        playerMap.set(player.uid, player);
      }
      
      // Convert map to array and sort by points (descending) again after deduplication
      const uniquePlayers = Array.from(playerMap.values())
        .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
        .slice(0, limit); // Apply limit after deduplication
      
      return uniquePlayers;
    } catch (error: any) {
      // If index doesn't exist yet, return empty array and log warning
      // Admin should run recalculation to populate player totalPoints, then deploy index
      console.warn("Points index not available. Please deploy firestore.indexes.json and run recalculation:", error);
      return [];
    }
  } catch (error) {
    console.error("Error getting players by points:", error);
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
    // Note: Firestore has a limit of 10,000 documents per query, but for most use cases this should be sufficient
    // If needed, we can implement pagination later for databases with >10k verified runs
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      firestoreLimit(10000)
    );
    const querySnapshot = await getDocs(q);
    const allRuns = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
    
    if (querySnapshot.docs.length === 10000) {
      result.errors.push("Warning: Hit Firestore query limit of 10,000 runs. Some runs may not have been processed. Consider implementing pagination for databases with more than 10,000 verified runs.");
    }

    // Track unique player IDs
    const playerIdsSet = new Set<string>();

    // Group runs by leaderboardType + level + category + platform + runType for proper ranking
    const runsByGroup = new Map<string, LeaderboardEntry[]>();
    
    for (const runData of allRuns) {
      if (!runData.playerId) {
        result.errors.push(`Run ${runData.id} has no playerId`);
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
              if (calculatedRank !== undefined) {
                // Ensure rank is a valid number
                if (typeof calculatedRank === 'number' && !isNaN(calculatedRank) && calculatedRank > 0) {
                  rank = calculatedRank;
                } else {
                  const parsed = Number(calculatedRank);
                  if (!isNaN(parsed) && parsed > 0) {
                    rank = parsed;
                  }
                }
              } else {
                // If run is not in rankMap, it might be beyond the fetch limit
                // However, if it's in our group, it should be ranked
                // Recalculate rank by comparing with other runs in the group
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
                  rank = runIndex + 1; // 1-based rank
                }
              }
            }
            
            const categoryName = categoryMap.get(runData.category) || "Unknown";
            const platformName = platformMap.get(runData.platform) || "Unknown";
            
            // Calculate points (already split for co-op runs)
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
              rank,
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
    // This ensures accuracy even if we missed some runs due to pagination
    const playerIdsArray = Array.from(playerIdsSet);
    for (const playerId of playerIdsArray) {
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
    let q = query(collection(db, "levels"));
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
    console.error("Error fetching download categories:", error);
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
    console.error("Error adding download category:", error);
    return null;
  }
};

export const updateDownloadCategoryFirestore = async (categoryId: string, name?: string, order?: number): Promise<boolean> => {
  if (!db) return false;
  try {
    const categoryRef = doc(db, "downloadCategories", categoryId);
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name;
    if (order !== undefined) updateData.order = order;
    
    await updateDoc(categoryRef, updateData);
    return true;
  } catch (error) {
    console.error("Error updating download category:", error);
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
    console.error("Error deleting download category:", error);
    return false;
  }
};
