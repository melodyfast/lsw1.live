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
 * @returns Points awarded for the run (0 for non-supported categories or platforms)
 */
export function calculatePoints(timeString: string, categoryName: string, platformName?: string): number {
  const totalSeconds = parseTimeToSeconds(timeString);
  if (totalSeconds <= 0) return 0;

  // Normalize platform name for comparison
  const normalizedPlatform = platformName?.toLowerCase().trim() || "";
  const isGameCube = normalizedPlatform === "gamecube" || normalizedPlatform === "game cube";
  
  // Only GameCube runs earn points
  if (!isGameCube) {
    return 0;
  }

  // Normalize category name for comparison
  const normalizedCategory = categoryName.toLowerCase().trim();
  
  // Category classification
  const isAnyPercent = normalizedCategory === "any%";
  const isNocutsNoships = normalizedCategory === "nocuts noships" || normalizedCategory === "nocutsnoships";
  const isPremiumCategory = isAnyPercent || isNocutsNoships;
  
  // Return 0 points for non-premium categories (including Free Play)
  if (!isPremiumCategory) {
    return 0;
  }
  
  // Base points calculation using exponential decay
  // Faster times = exponentially more points
  // Formula: basePoints = base * e^(-time/scaleFactor)
  // Use category-specific scale factors to balance point ranges
  const baseMultiplier = 800;
  
  // Scale factors adjusted per category to balance point ranges
  // Any% uses a larger scale factor (2400s = 40min) for 50-60 minute runs
  // Nocuts Noships uses a smaller scale factor (1400s = 23.3min) for 25-30 minute runs
  // This ensures similar point ranges for equivalent relative performance
  const scaleFactor = isNocutsNoships ? 1400 : 2400;
  
  const basePoints = baseMultiplier * Math.exp(-totalSeconds / scaleFactor);

  // Minimum points floor (even very slow runs get some points)
  const minPoints = 10;

  // Calculate base points (no category penalty - balanced via scale factors)
  let points = Math.max(basePoints, minPoints);

  // Special bonuses for premium categories
  if (isAnyPercent) {
    // Bonus for Any% runs under 55 minutes (3300 seconds) - realistic threshold
    const fiftyFiveMinutesInSeconds = 3300;
    if (totalSeconds < fiftyFiveMinutesInSeconds) {
      // Exponential bonus: the faster the sub-55-minute time, the bigger the bonus
      // Bonus ranges from 1.2x to 2.0x based on how much under 55 minutes
      const timeRemaining = fiftyFiveMinutesInSeconds - totalSeconds;
      const bonusMultiplier = 1.2 + (timeRemaining / fiftyFiveMinutesInSeconds) * 0.8; // 1.2x to 2.0x multiplier
      points *= bonusMultiplier;
    }
  }

  if (isNocutsNoships) {
    // Bonus for Nocuts Noships runs under 29 minutes (1740 seconds) - realistic threshold
    const twentyNineMinutesInSeconds = 1740;
    if (totalSeconds < twentyNineMinutesInSeconds) {
      // Exponential bonus: the faster the sub-29-minute time, the bigger the bonus
      // Bonus ranges from 1.3x to 2.2x based on how much under 29 minutes
      const timeRemaining = twentyNineMinutesInSeconds - totalSeconds;
      const bonusMultiplier = 1.3 + (timeRemaining / twentyNineMinutesInSeconds) * 0.9; // 1.3x to 2.2x multiplier
      points *= bonusMultiplier;
    }
  }

  // Round to nearest integer
  return Math.round(points);
}
