import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import {
  getLeaderboardEntriesFirestore,
  getLeaderboardEntryByIdFirestore,
  addLeaderboardEntryFirestore,
  getPlayerByUidFirestore,
  getPlayerByDisplayNameFirestore,
  createPlayerFirestore,
  updatePlayerProfileFirestore,
  getRecentRunsFirestore,
  getPlayerRunsFirestore,
  getUnverifiedLeaderboardEntriesFirestore,
  updateRunVerificationStatusFirestore,
  deleteLeaderboardEntryFirestore,
  deleteAllLeaderboardEntriesFirestore,
  updateRunObsoleteStatusFirestore,
  getDownloadEntriesFirestore,
  addDownloadEntryFirestore,
  deleteDownloadEntryFirestore,
  updateDownloadOrderFirestore,
  moveDownloadUpFirestore,
  moveDownloadDownFirestore,
  getCategoriesFirestore,
  addCategoryFirestore,
  updateCategoryFirestore,
  deleteCategoryFirestore,
  moveCategoryUpFirestore,
  moveCategoryDownFirestore,
  getPlatformsFirestore,
  addPlatformFirestore,
  updatePlatformFirestore,
  deletePlatformFirestore,
  movePlatformUpFirestore,
  movePlatformDownFirestore,
  getUnclaimedRunsByUsernameFirestore,
  claimRunFirestore,
  getAllVerifiedRunsFirestore,
  getPlayersByPointsFirestore,
} from "./data/firestore";

const defaultCategories = [
  { name: "Any%" },
  { name: "Free Play" },
  { name: "All Minikits" },
  { name: "100%" },
];

export const initializeDefaultCategories = async (): Promise<void> => {
  try {
    const existingCategories = await getCategoriesFirestore();
    if (existingCategories.length === 0) {
      for (let i = 0; i < defaultCategories.length; i++) {
        await addCategoryFirestore(defaultCategories[i].name);
      }
    }
  } catch (error) {
    // Silent fail
  }
};

export const getCategories = async (): Promise<{ id: string; name: string }[]> => {
  try {
    let firestoreCategories = await getCategoriesFirestore();
    
    if (firestoreCategories.length === 0) {
      await initializeDefaultCategories();
      firestoreCategories = await getCategoriesFirestore();
    }
    
    return firestoreCategories;
  } catch (error) {
    return [];
  }
};

export const categories: { id: string; name: string }[] = [];

const defaultPlatforms = [
  { name: "PC" },
  { name: "PS2" },
  { name: "Xbox" },
  { name: "GameCube" },
];

export const initializeDefaultPlatforms = async (): Promise<void> => {
  try {
    const existingPlatforms = await getPlatformsFirestore();
    if (existingPlatforms.length === 0) {
      for (let i = 0; i < defaultPlatforms.length; i++) {
        await addPlatformFirestore(defaultPlatforms[i].name);
      }
    }
  } catch (error) {
    // Silent fail
  }
};

export const getPlatforms = async (): Promise<{ id: string; name: string }[]> => {
  try {
    let firestorePlatforms = await getPlatformsFirestore();
    
    if (firestorePlatforms.length === 0) {
      await initializeDefaultPlatforms();
      firestorePlatforms = await getPlatformsFirestore();
    }
    
    return firestorePlatforms;
  } catch (error) {
    return [];
  }
};

export const platforms: { id: string; name: string }[] = [];

export const runTypes = [
  { id: "solo", name: "Solo" },
  { id: "co-op", name: "Co-op" },
];

export const getLeaderboardEntries = getLeaderboardEntriesFirestore;
export const getLeaderboardEntryById = getLeaderboardEntryByIdFirestore;
export const addLeaderboardEntry = addLeaderboardEntryFirestore;
export const getPlayerByUid = getPlayerByUidFirestore;
export const getPlayerByDisplayName = getPlayerByDisplayNameFirestore;
export const createPlayer = createPlayerFirestore;
export const updatePlayerProfile = updatePlayerProfileFirestore;
export const getRecentRuns = getRecentRunsFirestore;
export const getPlayerRuns = getPlayerRunsFirestore;
export const getUnverifiedLeaderboardEntries = getUnverifiedLeaderboardEntriesFirestore;
export const updateLeaderboardEntry = async (runId: string, data: Partial<LeaderboardEntry>): Promise<boolean> => {
  const { updateLeaderboardEntryFirestore } = await import("./data/firestore");
  try {
    return await updateLeaderboardEntryFirestore(runId, data);
  } catch (error: any) {
    // Re-throw with more context
    throw new Error(error.message || error.code || "Failed to update run");
  }
};
export const updateRunVerificationStatus = updateRunVerificationStatusFirestore;
export const deleteLeaderboardEntry = deleteLeaderboardEntryFirestore;
export const deleteAllLeaderboardEntries = deleteAllLeaderboardEntriesFirestore;
export const updateRunObsoleteStatus = updateRunObsoleteStatusFirestore;

export const getDownloadEntries = getDownloadEntriesFirestore;
export const addDownloadEntry = addDownloadEntryFirestore;
export const deleteDownloadEntry = deleteDownloadEntryFirestore;
export const updateDownloadOrder = updateDownloadOrderFirestore;
export const moveDownloadUp = moveDownloadUpFirestore;
export const moveDownloadDown = moveDownloadDownFirestore;

export const getCategoriesFromFirestore = getCategoriesFirestore;
export const addCategory = addCategoryFirestore;
export const updateCategory = updateCategoryFirestore;
export const deleteCategory = deleteCategoryFirestore;
export const moveCategoryUp = moveCategoryUpFirestore;
export const moveCategoryDown = moveCategoryDownFirestore;

export const getPlatformsFromFirestore = getPlatformsFirestore;
export const addPlatform = addPlatformFirestore;
export const updatePlatform = updatePlatformFirestore;
export const deletePlatform = deletePlatformFirestore;
export const movePlatformUp = movePlatformUpFirestore;
export const movePlatformDown = movePlatformDownFirestore;

export const getUnclaimedRunsByUsername = getUnclaimedRunsByUsernameFirestore;
export const claimRun = claimRunFirestore;

export const getAllVerifiedRuns = getAllVerifiedRunsFirestore;

export const getPlayersByPoints = getPlayersByPointsFirestore;

export const backfillPointsForAllRuns = async () => {
  const { backfillPointsForAllRunsFirestore } = await import("./data/firestore");
  return backfillPointsForAllRunsFirestore();
};

/**
 * Set admin status for a player
 * Creates player document if it doesn't exist
 */
export const setPlayerAdminStatus = async (uid: string, isAdmin: boolean): Promise<boolean> => {
  try {
    const existingPlayer = await getPlayerByUid(uid);
    
    if (!existingPlayer) {
      const today = new Date().toISOString().split('T')[0];
      const newPlayer = {
        uid: uid,
        displayName: "",
        email: "",
        joinDate: today,
        totalRuns: 0,
        bestRank: null,
        favoriteCategory: null,
        favoritePlatform: null,
        nameColor: "#cba6f7",
        isAdmin: isAdmin,
      };
      const result = await createPlayer(newPlayer);
      return result !== null;
    } else {
      const playerDocRef = doc(db, "players", uid);
      const docSnap = await getDoc(playerDocRef);
      
      if (docSnap.exists()) {
        try {
          await updateDoc(playerDocRef, { isAdmin });
          return true;
        } catch (updateError: any) {
          // Try alternative method if permission denied
          if (updateError?.code === 'permission-denied') {
            try {
              await setDoc(playerDocRef, { uid, isAdmin }, { merge: true });
              return true;
            } catch {
              return false;
            }
          }
          return false;
        }
      } else {
        await setDoc(playerDocRef, { uid, isAdmin }, { merge: true });
        return true;
      }
    }
  } catch {
    return false;
  }
};