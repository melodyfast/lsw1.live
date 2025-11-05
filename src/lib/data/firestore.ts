import { db } from "@/lib/firebase";
import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy, limit as firestoreLimit, deleteField, startAfter, and } from "firebase/firestore";
import { Player, LeaderboardEntry, DownloadEntry, Category, Platform, Level, PointsConfig } from "@/types/database";
import { calculatePoints } from "@/lib/utils";

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
    // Note: For regular type, we don't add a where clause for leaderboardType
    // This allows us to get both entries with leaderboardType='regular' and legacy entries without the field
    // We'll filter client-side to ensure we only get regular entries

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

    // Set limit - fetch more than needed since we'll filter client-side for some edge cases
    constraints.push(firestoreLimit(200));
    
    const q = query(collection(db, "leaderboardEntries"), ...constraints);
    const querySnapshot = await getDocs(q);
    
    let entries: LeaderboardEntry[] = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
      .filter(entry => {
        // Filter obsolete entries if not including them
        if (!includeObsolete && entry.isObsolete) return false;
        
        // Handle regular leaderboardType - filter out non-regular entries
        // (Firestore 'in' query includes both 'regular' and null, so filter null/undefined)
        if (!leaderboardType || leaderboardType === 'regular') {
          const entryLeaderboardType = entry.leaderboardType || 'regular';
          if (entryLeaderboardType !== 'regular') return false;
        }
        
          return true;
        });

    // Sort by time in ascending order (fastest times first)
    const entriesWithTime = entries.map(entry => {
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
    entriesWithTime.sort((a, b) => a.totalSeconds - b.totalSeconds);
    entries = entriesWithTime.map(item => item.entry);
    entries = entries.slice(0, 100);

    // Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

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
    // Try to find by displayName first (if indexed)
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
    
    // Fallback: search by email prefix (if displayName search didn't find anything)
    // Note: This still requires fetching all players, but only as fallback
    // Consider adding a displayName index if this becomes a bottleneck
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

    // Fetch all verified entries once (with higher limit to ensure we get all relevant entries)
    const allEntriesQuery = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      firestoreLimit(500)
    );
    
    const allEntriesSnapshot = await getDocs(allEntriesQuery);
    const allEntries = allEntriesSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry))
      .filter(entry => !entry.isObsolete);

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
      let categoryName = "Unknown";
      let platformName = "Unknown";
      
      const newCategoryId = data.category || runData.category;
      const newPlatformId = data.platform || runData.platform;
      const newTime = data.time || runData.time;
      
      try {
        const categoryDocRef = doc(db, "categories", newCategoryId);
        const categoryDocSnap = await getDoc(categoryDocRef);
        if (categoryDocSnap.exists()) {
          categoryName = categoryDocSnap.data().name || "Unknown";
        }
      } catch (error) {
        // Silent fail - use default
      }
      try {
        const platformDocRef = doc(db, "platforms", newPlatformId);
        const platformDocSnap = await getDoc(platformDocRef);
        if (platformDocSnap.exists()) {
          platformName = platformDocSnap.data().name || "Unknown";
        }
      } catch (error) {
        // Silent fail - use default
      }
      
      // Get points config and recalculate points
      const pointsConfig = await getPointsConfigFirestore();
      const points = calculatePoints(
        newTime, 
        categoryName, 
        platformName,
        newCategoryId,
        newPlatformId,
        pointsConfig
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
        // Get category and platform names
        let categoryName = "Unknown";
        let platformName = "Unknown";
        try {
          const categoryDocRef = doc(db, "categories", runData.category);
          const categoryDocSnap = await getDoc(categoryDocRef);
          if (categoryDocSnap.exists()) {
            categoryName = categoryDocSnap.data().name || "Unknown";
          }
        } catch (error) {
        console.error("Error fetching category:", error);
          // Silent fail - use default
        }
        try {
          const platformDocRef = doc(db, "platforms", runData.platform);
          const platformDocSnap = await getDoc(platformDocRef);
          if (platformDocSnap.exists()) {
            platformName = platformDocSnap.data().name || "Unknown";
          }
        } catch (error) {
        console.error("Error fetching platform:", error);
          // Silent fail - use default
        }
        
      // Get points config and calculate points
      const pointsConfig = await getPointsConfigFirestore();
      const points = calculatePoints(
        runData.time, 
        categoryName, 
        platformName,
        runData.category,
        runData.platform,
        pointsConfig
      );
        updateData.points = points;
        
      // Update the document first to mark it as verified, then recalculate points
      // This ensures the newly verified run is included in the recalculation
      await updateDoc(runDocRef, updateData);
      
      // Always recalculate player points to ensure accuracy (handles re-verification correctly)
      // Now that the run is verified, it will be included in the recalculation
      try {
        await recalculatePlayerPointsFirestore(runData.playerId);
        
        // For co-op runs, also recalculate player2's points
        if (runData.runType === 'co-op' && runData.player2Name) {
          try {
            const player2NameTrimmed = runData.player2Name.trim();
            console.log(`Looking up player2 for co-op run ${runId}: "${player2NameTrimmed}"`);
            const player2 = await getPlayerByDisplayNameFirestore(player2NameTrimmed);
            if (player2) {
              console.log(`Found player2 "${player2.displayName}" (UID: ${player2.uid}), recalculating points...`);
              await recalculatePlayerPointsFirestore(player2.uid);
              console.log(`Successfully recalculated points for player2 "${player2.displayName}"`);
            } else {
              console.warn(`Player2 "${player2NameTrimmed}" not found for co-op run ${runId}. Points will only be awarded to player1.`);
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
            } else {
              console.warn(`Player2 "${player2NameTrimmed}" not found for co-op run ${runId} during unverify`);
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
 * Recalculate total points for a player based on all their verified solo runs
 * Co-op runs do not award points
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
    
    // Get all verified solo runs where this player is player1
    // Co-op runs are excluded from points
    const q = query(
      collection(db, "leaderboardEntries"),
      where("playerId", "==", playerId),
      where("verified", "==", true)
    );
    const querySnapshot = await getDocs(q);
    
    // Get all categories and platforms for lookup
    const categories = await getCategoriesFirestore();
    const platforms = await getPlatformsFirestore();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));
    const platformMap = new Map(platforms.map(p => [p.id, p.name]));
    
    let totalPoints = 0;
    const runsToUpdate: { id: string; points: number }[] = [];
    
    // Calculate points only for solo runs (co-op runs are skipped)
    for (const runDoc of querySnapshot.docs) {
      const runData = runDoc.data() as LeaderboardEntry;
      
      // Skip obsolete runs - they don't count for points
      if (runData.isObsolete) {
        continue;
      }
      
      // Skip co-op runs - they don't award points
      if (runData.runType === 'co-op') {
        continue;
      }
      
      const categoryName = categoryMap.get(runData.category) || "Unknown";
      const platformName = platformMap.get(runData.platform) || "Unknown";
      
      // Get points config for calculation
      const pointsConfig = await getPointsConfigFirestore();
      
      // Recalculate points for all solo runs with the new formula
      const points = calculatePoints(
        runData.time, 
        categoryName, 
        platformName,
        runData.category,
        runData.platform,
        pointsConfig
      );
      runsToUpdate.push({ id: runDoc.id, points });
      totalPoints += points;
    }
    
    // Update runs that didn't have points
    for (const run of runsToUpdate) {
      try {
        const runDocRef = doc(db, "leaderboardEntries", run.id);
        await updateDoc(runDocRef, { points: run.points });
      } catch (error) {
        // Continue even if individual run update fails
        console.error(`Failed to update run ${run.id}:`, error);
      }
    }
    
    // Update or create player's total points
    if (playerDocSnap && playerDocSnap.exists()) {
      // Only update totalPoints to avoid permission issues
      try {
      await updateDoc(playerDocRef, { totalPoints });
      } catch (error: any) {
        console.error(`Error updating player ${playerId} totalPoints:`, error?.code, error?.message);
        throw error; // Re-throw to be caught by outer catch
      }
    } else {
      // Create player document if it doesn't exist
      // Get player info from first run if available
      const firstRun = querySnapshot.docs[0]?.data() as LeaderboardEntry | undefined;
      const playerData: Omit<Player, 'id'> = {
        uid: playerId,
        displayName: firstRun?.playerName || "Unknown Player",
        email: "",
        joinDate: firstRun?.date || new Date().toISOString().split('T')[0],
        totalRuns: querySnapshot.docs.length,
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
 * This function queries verified runs and aggregates points by player for reliability
 */
export const getPlayersByPointsFirestore = async (limit: number = 100): Promise<Player[]> => {
  if (!db) return [];
  try {
    // Get all verified full game runs
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      where("leaderboardType", "==", "regular"), // Only full game runs
      firestoreLimit(2000)
    );
    const runsSnapshot = await getDocs(q);

    // Get all categories and platforms for lookup
    const categories = await getCategoriesFirestore();
    const platforms = await getPlatformsFirestore();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));
    const platformMap = new Map(platforms.map(p => [p.id, p.name]));

    // Aggregate runs by player
    // For unlinked players (without accounts), we aggregate by playerName
    // For players with accounts, we aggregate by playerId
    const playerMap = new Map<string, {
      playerId: string;
      playerName: string;
      totalPoints: number;
      totalRuns: number;
      firstRunDate?: string;
      isUnlinked: boolean;
    }>();

    // Get points config once for all calculations
    const pointsConfig = await getPointsConfigFirestore();

    // Process each run (both solo and co-op runs count for points)
    for (const runDoc of runsSnapshot.docs) {
      const runData = runDoc.data() as LeaderboardEntry;
      
      if (!runData.playerId || runData.isObsolete) continue;

      // Only process full game runs (not ILs or community golds)
      if (runData.leaderboardType && runData.leaderboardType !== 'regular') {
        continue;
      }

      // Recalculate points for all eligible runs
      const categoryName = categoryMap.get(runData.category) || "Unknown";
      const platformName = platformMap.get(runData.platform) || "Unknown";
      const points = calculatePoints(
        runData.time, 
        categoryName, 
        platformName,
        runData.category,
        runData.platform,
        pointsConfig
      );
      
      // Update the run with recalculated points (async, don't wait)
      try {
        const runDocRef = doc(db, "leaderboardEntries", runDoc.id);
        updateDoc(runDocRef, { points }).catch(() => {}); // Fire and forget
      } catch {}

      // Determine aggregation key: use playerName for unlinked players, playerId for others
      const isUnlinked = runData.playerId.startsWith("unlinked_");
      const aggregationKey = isUnlinked 
        ? `unlinked_${runData.playerName.trim().toLowerCase()}` // Group by name for unlinked
        : runData.playerId; // Use playerId for real accounts

      // Get or create player entry
      const existing = playerMap.get(aggregationKey);
      if (existing) {
        existing.totalPoints += points;
        existing.totalRuns += 1;
        if (runData.date && (!existing.firstRunDate || runData.date < existing.firstRunDate)) {
          existing.firstRunDate = runData.date;
        }
        // Update playerId to use the first one encountered (for display purposes)
        // This ensures we can still track which playerId was used
        if (isUnlinked && !existing.playerId.startsWith("unlinked_")) {
          // Keep existing playerId if it's from a real account
        } else if (isUnlinked) {
          // For unlinked players, use the first playerId encountered (doesn't matter which one)
          existing.playerId = runData.playerId;
        }
      } else {
        playerMap.set(aggregationKey, {
          playerId: runData.playerId,
          playerName: runData.playerName || "Unknown Player",
          totalPoints: points,
          totalRuns: 1,
          firstRunDate: runData.date,
          isUnlinked: isUnlinked,
        });
      }
    }

    // Convert to Player array and fetch additional player data
    const playersList = Array.from(playerMap.values())
      .filter(p => p.totalPoints > 0)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, limit);

    // Fetch player documents for additional info (name color, etc.)
    const players: Player[] = await Promise.all(
      playersList.map(async (p) => {
        // Skip fetching player doc for unlinked players - they don't have accounts
        if (p.isUnlinked) {
          return {
            id: p.playerId,
            uid: p.playerId,
            displayName: p.playerName,
            email: "",
            joinDate: p.firstRunDate || "",
            totalRuns: p.totalRuns,
            bestRank: null,
            favoriteCategory: null,
            favoritePlatform: null,
            nameColor: undefined,
            isAdmin: false,
            totalPoints: p.totalPoints,
          } as Player;
        }

        try {
          const playerDocRef = doc(db, "players", p.playerId);
          const playerDocSnap = await getDoc(playerDocRef);
          
          if (playerDocSnap.exists()) {
            const playerData = playerDocSnap.data() as Player;
            return {
              id: p.playerId,
              uid: p.playerId,
              displayName: playerData.displayName || p.playerName,
              email: playerData.email || "",
              joinDate: playerData.joinDate || p.firstRunDate || "",
              totalRuns: p.totalRuns,
              bestRank: playerData.bestRank || null,
              favoriteCategory: playerData.favoriteCategory || null,
              favoritePlatform: playerData.favoritePlatform || null,
              nameColor: playerData.nameColor,
              isAdmin: playerData.isAdmin || false,
              totalPoints: p.totalPoints,
            } as Player;
          } else {
            // Player doesn't exist in players collection, use run data
            return {
              id: p.playerId,
              uid: p.playerId,
              displayName: p.playerName,
              email: "",
              joinDate: p.firstRunDate || "",
              totalRuns: p.totalRuns,
              bestRank: null,
              favoriteCategory: null,
              favoritePlatform: null,
              nameColor: undefined,
              isAdmin: false,
              totalPoints: p.totalPoints,
            } as Player;
          }
        } catch (error) {
          // Fallback if player fetch fails
          return {
            id: p.playerId,
            uid: p.playerId,
            displayName: p.playerName,
            email: "",
            joinDate: p.firstRunDate || "",
            totalRuns: p.totalRuns,
            bestRank: null,
            favoriteCategory: null,
            favoritePlatform: null,
            nameColor: undefined,
            isAdmin: false,
            totalPoints: p.totalPoints,
          } as Player;
        }
      })
    );

    return players;
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

    // Get all verified full game runs - use a single query with high limit
    // Note: Firestore has a limit of 10,000 documents per query, but for most use cases this should be sufficient
    // If needed, we can implement pagination later for databases with >10k verified runs
    const q = query(
      collection(db, "leaderboardEntries"),
      where("verified", "==", true),
      where("leaderboardType", "==", "regular"), // Only full game runs
      firestoreLimit(10000)
    );
    const querySnapshot = await getDocs(q);
    const allRuns = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaderboardEntry));
    
    if (querySnapshot.docs.length === 10000) {
      result.errors.push("Warning: Hit Firestore query limit of 10,000 runs. Some runs may not have been processed. Consider implementing pagination for databases with more than 10,000 verified runs.");
    }

    // Get points config once for all calculations
    const pointsConfig = await getPointsConfigFirestore();

    // Track unique player IDs
    const playerIdsSet = new Set<string>();

    // Process each run - recalculate ALL runs (even ones with existing points)
    const runsToUpdate: { id: string; points: number; playerId: string }[] = [];

    for (const runData of allRuns) {
      try {
        // Skip obsolete runs - they don't count for points
        if (runData.isObsolete) {
          continue;
        }

        if (!runData.playerId) {
          result.errors.push(`Run ${runData.id} has no playerId`);
          continue;
        }

        // Recalculate points for all runs with the current formula
        const categoryName = categoryMap.get(runData.category) || "Unknown";
        const platformName = platformMap.get(runData.platform) || "Unknown";
        const points = calculatePoints(
          runData.time, 
          categoryName, 
          platformName,
          runData.category,
          runData.platform,
          pointsConfig
        );
        
        runsToUpdate.push({
          id: runData.id,
          points,
          playerId: runData.playerId,
        });

        // Track player IDs for later recalculation (both solo and co-op runs)
        playerIdsSet.add(runData.playerId);
        // For co-op runs, also track player2 if they exist
        if (runData.runType === 'co-op' && runData.player2Name) {
          // Try to find player2 by name to get their ID
          const player2 = await getPlayerByDisplayNameFirestore(runData.player2Name);
          if (player2) {
            playerIdsSet.add(player2.uid);
          }
        }
      } catch (error) {
        result.errors.push(`Error processing run ${runData.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Update all runs in batches to avoid overwhelming Firestore
    const batchSize = 100;
    for (let i = 0; i < runsToUpdate.length; i += batchSize) {
      const batch = runsToUpdate.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (run) => {
          try {
            const runDocRef = doc(db, "leaderboardEntries", run.id);
            await updateDoc(runDocRef, { points: run.points });
            result.runsUpdated++;
          } catch (error) {
            result.errors.push(`Error updating run ${run.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        })
      );
    }

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
    console.error("Backfill fatal error:", error);
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

// Points Configuration Management
const DEFAULT_POINTS_CONFIG: Omit<PointsConfig, 'id'> = {
  baseMultiplier: 800,
  anyPercentThreshold: 3300, // 55 minutes in seconds
  nocutsNoshipsThreshold: 1740, // 29 minutes in seconds
  enabled: true,
};

export const getPointsConfigFirestore = async (): Promise<PointsConfig> => {
  if (!db) {
    // Return default config if db is not initialized
    return { id: "default", ...DEFAULT_POINTS_CONFIG };
  }
  try {
    const configDocRef = doc(db, "pointsConfig", "default");
    const configDocSnap = await getDoc(configDocRef);
    
    if (configDocSnap.exists()) {
      const data = configDocSnap.data();
      // Migrate old config format to new simplified format
      let anyPercentThreshold = data.anyPercentThreshold ?? DEFAULT_POINTS_CONFIG.anyPercentThreshold;
      let nocutsNoshipsThreshold = data.nocutsNoshipsThreshold ?? DEFAULT_POINTS_CONFIG.nocutsNoshipsThreshold;
      
      // Migration: If old format exists, extract threshold times
      if (data.categoryMilestones) {
        // Try to find Any% and Nocuts thresholds from old milestone config
        Object.entries(data.categoryMilestones).forEach(([catId, milestone]: [string, any]) => {
          const catLower = catId.toLowerCase();
          if (catLower.includes("any%") || catLower === "any%") {
            anyPercentThreshold = milestone.thresholdSeconds ?? anyPercentThreshold;
          } else if (catLower.includes("nocuts") || catLower.includes("noships")) {
            nocutsNoshipsThreshold = milestone.thresholdSeconds ?? nocutsNoshipsThreshold;
          }
        });
      }
      
      // Also check categoryMinTimes for migration
      if (data.categoryMinTimes) {
        Object.entries(data.categoryMinTimes).forEach(([catId, time]: [string, any]) => {
          const catLower = catId.toLowerCase();
          if (catLower.includes("any%") || catLower === "any%") {
            anyPercentThreshold = time ?? anyPercentThreshold;
          } else if (catLower.includes("nocuts") || catLower.includes("noships")) {
            nocutsNoshipsThreshold = time ?? nocutsNoshipsThreshold;
          }
        });
      }
      
      return {
        id: configDocSnap.id,
        baseMultiplier: data.baseMultiplier ?? DEFAULT_POINTS_CONFIG.baseMultiplier,
        anyPercentThreshold: anyPercentThreshold,
        nocutsNoshipsThreshold: nocutsNoshipsThreshold,
        enabled: data.enabled !== undefined ? data.enabled : DEFAULT_POINTS_CONFIG.enabled,
      } as PointsConfig;
    }
    
    // Return default config if none exists
    return { id: "default", ...DEFAULT_POINTS_CONFIG };
  } catch (error) {
    console.error("Error fetching points config:", error);
    // Return default config on error instead of null
    return { id: "default", ...DEFAULT_POINTS_CONFIG };
  }
};

export const updatePointsConfigFirestore = async (config: Partial<PointsConfig>): Promise<boolean> => {
  if (!db) return false;
  try {
    const configDocRef = doc(db, "pointsConfig", "default");
    const configDocSnap = await getDoc(configDocRef);
    
    if (configDocSnap.exists()) {
      await updateDoc(configDocRef, config);
    } else {
      await setDoc(configDocRef, { id: "default", ...DEFAULT_POINTS_CONFIG, ...config });
    }
    
    return true;
  } catch (error) {
    console.error("Error updating points config:", error);
    return false;
  }
};
