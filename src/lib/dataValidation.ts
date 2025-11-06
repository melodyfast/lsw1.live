import { LeaderboardEntry } from "@/types/database";

/**
 * Normalize category ID to string
 */
export function normalizeCategoryId(category: string | undefined | null): string {
  if (!category) return "";
  return String(category).trim();
}

/**
 * Normalize platform ID to string
 */
export function normalizePlatformId(platform: string | undefined | null): string {
  if (!platform) return "";
  return String(platform).trim();
}

/**
 * Normalize level ID to string
 */
export function normalizeLevelId(level: string | undefined | null): string | undefined {
  if (!level) return undefined;
  const normalized = String(level).trim();
  return normalized || undefined;
}

/**
 * Normalize player name to string
 */
export function normalizePlayerName(name: string | undefined | null): string {
  if (!name) return "Unknown";
  const normalized = String(name).trim();
  return normalized || "Unknown";
}

/**
 * Normalize time string format
 */
export function normalizeTime(time: string | undefined | null): string {
  if (!time) return "00:00:00";
  const normalized = String(time).trim();
  // Validate format (HH:MM:SS or H:MM:SS)
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }
  return "00:00:00";
}

/**
 * Normalize date string format (YYYY-MM-DD)
 */
export function normalizeDate(date: string | undefined | null): string {
  if (!date) return new Date().toISOString().split('T')[0];
  const normalized = String(date).trim();
  // Extract date part from ISO string if needed
  if (normalized.includes('T')) {
    return normalized.split('T')[0];
  }
  // Validate format
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }
  return new Date().toISOString().split('T')[0];
}

/**
 * Normalize leaderboard type
 */
export function normalizeLeaderboardType(
  type: 'regular' | 'individual-level' | 'community-golds' | string | undefined | null
): 'regular' | 'individual-level' | 'community-golds' {
  if (!type) return 'regular';
  const normalized = String(type).toLowerCase().trim();
  if (normalized === 'individual-level' || normalized === 'individuallevel') {
    return 'individual-level';
  }
  if (normalized === 'community-golds' || normalized === 'communitygolds') {
    return 'community-golds';
  }
  return 'regular';
}

/**
 * Normalize run type
 */
export function normalizeRunType(type: 'solo' | 'co-op' | string | undefined | null): 'solo' | 'co-op' {
  if (!type) return 'solo';
  const normalized = String(type).toLowerCase().trim();
  if (normalized === 'co-op' || normalized === 'coop' || normalized === 'co-op') {
    return 'co-op';
  }
  return 'solo';
}

/**
 * Validate and normalize a leaderboard entry
 */
export function normalizeLeaderboardEntry(entry: Partial<LeaderboardEntry>): Partial<LeaderboardEntry> {
  return {
    ...entry,
    playerName: normalizePlayerName(entry.playerName),
    player2Name: entry.player2Name ? normalizePlayerName(entry.player2Name) : undefined,
    category: normalizeCategoryId(entry.category),
    platform: normalizePlatformId(entry.platform),
    level: normalizeLevelId(entry.level),
    time: normalizeTime(entry.time),
    date: normalizeDate(entry.date),
    runType: normalizeRunType(entry.runType),
    leaderboardType: normalizeLeaderboardType(entry.leaderboardType),
    verified: Boolean(entry.verified),
    importedFromSRC: entry.importedFromSRC !== undefined ? Boolean(entry.importedFromSRC) : undefined,
    // Preserve SRC fallback names and srcRunId (don't normalize them, just trim)
    srcCategoryName: entry.srcCategoryName ? String(entry.srcCategoryName).trim() : undefined,
    srcPlatformName: entry.srcPlatformName ? String(entry.srcPlatformName).trim() : undefined,
    srcLevelName: entry.srcLevelName ? String(entry.srcLevelName).trim() : undefined,
    srcRunId: entry.srcRunId ? String(entry.srcRunId).trim() : undefined,
  };
}

/**
 * Get category name from ID, with fallback
 * For imported runs, uses srcCategoryName if ID lookup fails
 */
export function getCategoryName(
  categoryId: string | undefined | null,
  categories: Array<{ id: string; name: string }>,
  srcCategoryName?: string | null
): string {
  const normalizedId = normalizeCategoryId(categoryId);
  if (!normalizedId) {
    // If we have a SRC category name, use it
    if (srcCategoryName) return String(srcCategoryName);
    return "Unknown Category";
  }
  const category = categories.find(c => c.id === normalizedId);
  if (category) return category.name;
  // If ID lookup failed but we have SRC name, use it
  if (srcCategoryName) return String(srcCategoryName);
  return normalizedId;
}

/**
 * Get platform name from ID, with fallback
 * For imported runs, uses srcPlatformName if ID lookup fails
 */
export function getPlatformName(
  platformId: string | undefined | null,
  platforms: Array<{ id: string; name: string }>,
  srcPlatformName?: string | null
): string {
  const normalizedId = normalizePlatformId(platformId);
  if (!normalizedId) {
    // If we have a SRC platform name, use it
    if (srcPlatformName) return String(srcPlatformName);
    return "Unknown Platform";
  }
  const platform = platforms.find(p => p.id === normalizedId);
  if (platform) return platform.name;
  // If ID lookup failed but we have SRC name, use it
  if (srcPlatformName) return String(srcPlatformName);
  return normalizedId;
}

/**
 * Get level name from ID, with fallback
 * For imported runs, uses srcLevelName if ID lookup fails
 */
export function getLevelName(
  levelId: string | undefined | null,
  levels: Array<{ id: string; name: string }>,
  srcLevelName?: string | null
): string {
  const normalizedId = normalizeLevelId(levelId);
  if (!normalizedId) {
    // If we have a SRC level name, use it
    if (srcLevelName) return String(srcLevelName);
    return "Unknown Level";
  }
  const level = levels.find(l => l.id === normalizedId);
  if (level) return level.name;
  // If ID lookup failed but we have SRC name, use it
  if (srcLevelName) return String(srcLevelName);
  return normalizedId || "Unknown Level";
}

/**
 * Validate that a leaderboard entry has required fields
 * For imported runs, allows empty category/platform if SRC names are provided
 */
export function validateLeaderboardEntry(entry: Partial<LeaderboardEntry>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!entry.playerName || entry.playerName.trim() === "") {
    errors.push("Player name is required");
  }
  
  // Category validation: required unless this is an imported run with SRC category name
  const hasCategory = entry.category && entry.category.trim() !== "";
  const isImported = entry.importedFromSRC === true;
  const hasSRCCategoryName = isImported && entry.srcCategoryName && entry.srcCategoryName.trim() !== "";
  if (!hasCategory && !hasSRCCategoryName) {
    errors.push(`Category is required (hasCategory: ${hasCategory}, isImported: ${isImported}, hasSRCCategoryName: ${hasSRCCategoryName})`);
  }
  
  // Platform validation: required unless this is an imported run with SRC platform name
  const hasPlatform = entry.platform && entry.platform.trim() !== "";
  const hasSRCPlatformName = isImported && entry.srcPlatformName && entry.srcPlatformName.trim() !== "";
  if (!hasPlatform && !hasSRCPlatformName) {
    errors.push(`Platform is required (hasPlatform: ${hasPlatform}, isImported: ${isImported}, hasSRCPlatformName: ${hasSRCPlatformName})`);
  }
  
  if (!entry.time || entry.time.trim() === "") {
    errors.push("Time is required");
  }
  
  if (!entry.date || entry.date.trim() === "") {
    errors.push("Date is required");
  }
  
  if (entry.runType && entry.runType !== 'solo' && entry.runType !== 'co-op') {
    errors.push("Run type must be 'solo' or 'co-op'");
  }
  
  if (entry.leaderboardType && 
      entry.leaderboardType !== 'regular' && 
      entry.leaderboardType !== 'individual-level' && 
      entry.leaderboardType !== 'community-golds') {
    errors.push("Leaderboard type must be 'regular', 'individual-level', or 'community-golds'");
  }
  
  // Validate time format
  if (entry.time && !/^\d{1,2}:\d{2}:\d{2}$/.test(entry.time)) {
    errors.push("Time must be in format HH:MM:SS");
  }
  
  // Validate date format
  if (entry.date && !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    errors.push("Date must be in format YYYY-MM-DD");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

