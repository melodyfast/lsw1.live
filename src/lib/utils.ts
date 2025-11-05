import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date string to a localized date format
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

/**
 * Parse a time string (HH:MM:SS) to total seconds
 * @param timeString - Time string in HH:MM:SS format
 * @returns Total seconds
 */
export function parseTimeToSeconds(timeString: string): number {
  const parts = timeString.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

/**
 * Format total seconds to HH:MM:SS format
 * @param totalSeconds - Total seconds
 * @returns Time string in HH:MM:SS format
 */
export function formatSecondsToTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Format a time string to display without hours if under 1 hour
 * @param timeString - Time string in HH:MM:SS format
 * @returns Formatted time string (MM:SS if under 1 hour, otherwise HH:MM:SS)
 */
export function formatTime(timeString: string): string {
  if (!timeString) return timeString;
  
  // Trim whitespace
  const trimmed = timeString.trim();
  
  // Handle different time formats
  const parts = trimmed.split(':');
  
  // If it's already in MM:SS format (2 parts), return as-is
  if (parts.length === 2) {
    return trimmed;
  }
  
  // If it's in HH:MM:SS format (3 parts)
  if (parts.length === 3) {
    const hoursStr = parts[0].trim();
    const hours = parseInt(hoursStr, 10);
    
    // If hours is 0, "00", or NaN, return MM:SS format
    if (isNaN(hours) || hours === 0 || hoursStr === '00' || hoursStr === '0') {
      // Ensure minutes and seconds are properly formatted
      const minutes = (parts[1] || '00').trim();
      const seconds = (parts[2] || '00').trim();
      return `${minutes}:${seconds}`;
    }
    
    // If hours is 1-9, remove leading zero and return H:MM:SS
    // If hours is 10+, keep as is (though this won't happen in practice)
    if (hours >= 1 && hours < 10) {
      const minutes = (parts[1] || '00').trim();
      const seconds = (parts[2] || '00').trim();
      return `${hours}:${minutes}:${seconds}`;
    }
  }
  
  // Otherwise return as-is (for 10+ hours, though this won't happen)
  return trimmed;
}

/**
 * Calculate points for a run based on time, category, and platform
 * Uses exponential scaling - faster times earn exponentially more points
 * Premium categories (Any%, Nocuts Noships) get full points
 * All other categories (including Free Play) get 0 points
 * Only GameCube platform runs earn points
 * Special bonuses for category milestones
 * 
 * @param timeString - Time string in HH:MM:SS format
 * @param categoryName - Name of the category (e.g., "Any%")
 * @param platformName - Name of the platform (e.g., "GameCube")
 * @param categoryId - Optional category ID for config lookup
 * @param platformId - Optional platform ID for config lookup
 * @param pointsConfig - Optional points configuration, if not provided will use defaults
 * @returns Points awarded for the run (0 for non-supported categories or platforms)
 */
/**
 * Calculate points for a run
 * Points are ONLY awarded for:
 * - Full game runs (not ILs or community golds)
 * - GameCube platform
 * - Any% or Nocuts Noships categories
 * - Runs UNDER the threshold time for that category
 * - Both solo and co-op runs are eligible
 * 
 * Points are calculated exponentially: faster times get exponentially more points
 */
export function calculatePoints(
  timeString: string, 
  categoryName: string, 
  platformName?: string,
  categoryId?: string,
  platformId?: string,
  pointsConfig?: { 
    baseMultiplier?: number;
    anyPercentThreshold?: number;
    nocutsNoshipsThreshold?: number;
    enabled?: boolean;
  }
): number {
  const totalSeconds = parseTimeToSeconds(timeString);
  if (totalSeconds <= 0) return 0;

  // Use config values or defaults
  const config = pointsConfig || {};
  const enabled = config.enabled !== false; // Default to true if not specified
  if (!enabled) return 0;

  const baseMultiplier = config.baseMultiplier ?? 800;

  // Hardcoded: Only GameCube platform is eligible
  const normalizedPlatform = platformName?.toLowerCase().trim() || "";
  const platformIdLower = platformId?.toLowerCase().trim() || "";
  const isGameCube = normalizedPlatform === "gamecube" || 
                     normalizedPlatform === "game cube" ||
                     platformIdLower === "gamecube" ||
                     platformIdLower === "game cube";
  
  if (!isGameCube) {
    return 0;
  }

  // Hardcoded: Only Any% and Nocuts Noships categories are eligible
  const normalizedCategory = categoryName.toLowerCase().trim();
  const categoryIdLower = categoryId?.toLowerCase().trim() || "";
  const isAnyPercent = normalizedCategory === "any%" || 
                       categoryIdLower === "any%" ||
                       categoryIdLower.includes("any%");
  const isNocutsNoships = normalizedCategory === "nocuts noships" || 
                          normalizedCategory === "nocutsnoships" ||
                          categoryIdLower.includes("nocuts") ||
                          categoryIdLower.includes("noships");
  
  if (!isAnyPercent && !isNocutsNoships) {
    return 0;
  }

  // Get threshold time for this category
  let thresholdSeconds: number;
  if (isAnyPercent) {
    thresholdSeconds = config.anyPercentThreshold ?? 3300; // 55 minutes default
  } else {
    thresholdSeconds = config.nocutsNoshipsThreshold ?? 1740; // 29 minutes default
  }

  // Only award points if run is UNDER the threshold time
  if (totalSeconds >= thresholdSeconds) {
    return 0;
  }

  // Calculate points exponentially
  // Formula: points = baseMultiplier * e^(-time/scaleFactor)
  // We want points to scale exponentially, with faster times getting much more points
  // Scale factor determines how fast the exponential decay is
  // Using a scale factor that makes the exponential curve work well
  const scaleFactor = thresholdSeconds / 2; // Half the threshold time as scale factor for good curve
  const points = baseMultiplier * Math.exp(-totalSeconds / scaleFactor);

  // Round to nearest integer
  return Math.round(points);
}
