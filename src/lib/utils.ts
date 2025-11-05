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
export function calculatePoints(
  timeString: string, 
  categoryName: string, 
  platformName?: string,
  categoryId?: string,
  platformId?: string,
  pointsConfig?: { 
    baseMultiplier?: number;
    minPoints?: number;
    eligiblePlatforms?: string[];
    eligibleCategories?: string[];
    categoryMinTimes?: Record<string, number>;
    minTimePointRatio?: number;
    categoryMilestones?: Record<string, { thresholdSeconds: number; minMultiplier: number; maxMultiplier: number }>;
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
  const minPoints = config.minPoints ?? 10;

  // Check platform eligibility
  const normalizedPlatform = platformName?.toLowerCase().trim() || "";
  const platformIdLower = platformId?.toLowerCase().trim() || "";
  
  if (config.eligiblePlatforms && config.eligiblePlatforms.length > 0) {
    // Check if platform ID or name matches eligible platforms
    const isEligible = config.eligiblePlatforms.some(eligible => {
      const eligibleLower = eligible.toLowerCase().trim();
      return eligibleLower === normalizedPlatform || 
             eligibleLower === platformIdLower ||
             (eligibleLower === "gamecube" && (normalizedPlatform === "gamecube" || normalizedPlatform === "game cube"));
    });
    
    if (!isEligible) {
      return 0;
    }
  } else {
    // Fallback to old behavior: only GameCube
    const isGameCube = normalizedPlatform === "gamecube" || normalizedPlatform === "game cube";
    if (!isGameCube) {
      return 0;
    }
  }

  // Check category eligibility
  const normalizedCategory = categoryName.toLowerCase().trim();
  const categoryIdLower = categoryId?.toLowerCase().trim() || "";
  
  let isEligibleCategory = false;
  let categoryKey = categoryId || categoryName; // Use ID if available, otherwise name
  
  if (config.eligibleCategories && config.eligibleCategories.length > 0) {
    isEligibleCategory = config.eligibleCategories.some(eligible => {
      const eligibleLower = eligible.toLowerCase().trim();
      return eligibleLower === normalizedCategory || 
             eligibleLower === categoryIdLower ||
             (eligibleLower === "any%" && normalizedCategory === "any%") ||
             (eligibleLower.includes("nocuts") && (normalizedCategory === "nocuts noships" || normalizedCategory === "nocutsnoships"));
    });
    
    // Find matching category key for config lookup
    if (isEligibleCategory) {
      const matchingEligible = config.eligibleCategories.find(eligible => {
        const eligibleLower = eligible.toLowerCase().trim();
        return eligibleLower === normalizedCategory || 
               eligibleLower === categoryIdLower ||
               (eligibleLower === "any%" && normalizedCategory === "any%") ||
               (eligibleLower.includes("nocuts") && (normalizedCategory === "nocuts noships" || normalizedCategory === "nocutsnoships"));
      });
      if (matchingEligible) {
        categoryKey = matchingEligible;
      }
    }
  } else {
    // Fallback to old behavior: Any% and Nocuts Noships
  const isAnyPercent = normalizedCategory === "any%";
  const isNocutsNoships = normalizedCategory === "nocuts noships" || normalizedCategory === "nocutsnoships";
    isEligibleCategory = isAnyPercent || isNocutsNoships;
  }
  
  if (!isEligibleCategory) {
    return 0;
  }

  // Get scale factor for this category from minimum time
  // If categoryMinTimes is set, calculate scale factor from it
  // Formula: at minTimeSeconds, points should be baseMultiplier * minTimePointRatio
  // baseMultiplier * minTimePointRatio = baseMultiplier * e^(-minTimeSeconds/scaleFactor)
  // minTimePointRatio = e^(-minTimeSeconds/scaleFactor)
  // ln(minTimePointRatio) = -minTimeSeconds/scaleFactor
  // scaleFactor = -minTimeSeconds / ln(minTimePointRatio)
  let scaleFactor: number;
  const minTimePointRatio = config.minTimePointRatio ?? 0.5;
  
  if (config.categoryMinTimes && categoryKey && config.categoryMinTimes[categoryKey]) {
    const minTimeSeconds = config.categoryMinTimes[categoryKey];
    if (minTimePointRatio > 0 && minTimePointRatio < 1 && minTimeSeconds > 0) {
      scaleFactor = -minTimeSeconds / Math.log(minTimePointRatio);
    } else {
      // Fallback if invalid ratio or time
      const isNocutsNoships = normalizedCategory === "nocuts noships" || normalizedCategory === "nocutsnoships";
      scaleFactor = isNocutsNoships ? 1400 : 2400;
    }
  } else {
    // Fallback to old defaults (convert old scale factors if needed, or use defaults)
    const isNocutsNoships = normalizedCategory === "nocuts noships" || normalizedCategory === "nocutsnoships";
    scaleFactor = isNocutsNoships ? 1400 : 2400;
  }
  
  // Base points calculation using exponential decay
  // Formula: basePoints = base * e^(-time/scaleFactor)
  const basePoints = baseMultiplier * Math.exp(-totalSeconds / scaleFactor);
  let points = Math.max(basePoints, minPoints);

  // Apply milestone bonuses if configured
  if (config.categoryMilestones && categoryKey && config.categoryMilestones[categoryKey]) {
    const milestone = config.categoryMilestones[categoryKey];
    if (totalSeconds < milestone.thresholdSeconds) {
      const timeRemaining = milestone.thresholdSeconds - totalSeconds;
      const bonusMultiplier = milestone.minMultiplier + 
        (timeRemaining / milestone.thresholdSeconds) * (milestone.maxMultiplier - milestone.minMultiplier);
      points *= bonusMultiplier;
    }
  } else {
    // Fallback to old milestone bonuses
    const isAnyPercent = normalizedCategory === "any%";
    const isNocutsNoships = normalizedCategory === "nocuts noships" || normalizedCategory === "nocutsnoships";
    
    if (isAnyPercent) {
      const fiftyFiveMinutesInSeconds = 3300;
      if (totalSeconds < fiftyFiveMinutesInSeconds) {
        const timeRemaining = fiftyFiveMinutesInSeconds - totalSeconds;
        const bonusMultiplier = 1.2 + (timeRemaining / fiftyFiveMinutesInSeconds) * 0.8;
        points *= bonusMultiplier;
      }
    }
    
    if (isNocutsNoships) {
      const twentyNineMinutesInSeconds = 1740;
      if (totalSeconds < twentyNineMinutesInSeconds) {
        const timeRemaining = twentyNineMinutesInSeconds - totalSeconds;
        const bonusMultiplier = 1.3 + (timeRemaining / twentyNineMinutesInSeconds) * 0.9;
        points *= bonusMultiplier;
      }
    }
  }

  // Round to nearest integer
  return Math.round(points);
}
