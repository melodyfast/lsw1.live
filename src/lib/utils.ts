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
 * Calculate points for a run using simple flat rates
 * Points are awarded for:
 * - All verified runs (full game, individual levels, and community golds)
 * - All platforms
 * - All categories
 * - Both solo and co-op runs are eligible
 * 
 * Points calculation:
 * - Base points: 10 points for all verified runs
 * - Top 3 bonus: additional bonus points for runs ranked 1st, 2nd, or 3rd
 * 
 * Solo runs:
 * - Rank 1: 10 + 50 = 60 points
 * - Rank 2: 10 + 30 = 40 points
 * - Rank 3: 10 + 20 = 30 points
 * - All others: 10 points
 * 
 * Co-op runs:
 * - Points are split equally between both players
 * - Rank 1: (10 + 50) / 2 = 30 points per player
 * - Rank 2: (10 + 30) / 2 = 20 points per player
 * - Rank 3: (10 + 20) / 2 = 15 points per player
 * - All others: 10 / 2 = 5 points per player
 * 
 * @param timeString - Time string in HH:MM:SS format (not used but kept for compatibility)
 * @param categoryName - Name of the category (not used but kept for compatibility)
 * @param platformName - Name of the platform (not used but kept for compatibility)
 * @param categoryId - Optional category ID (not used but kept for compatibility)
 * @param platformId - Optional platform ID (not used but kept for compatibility)
 * @param rank - Optional rank of the run in its category (1-3 for bonus points)
 * @param runType - Optional run type ('solo' or 'co-op'). If 'co-op', points are split in half
 * @returns Points awarded for the run (already split for co-op runs)
 */
export function calculatePoints(
  timeString: string, 
  categoryName: string, 
  platformName?: string,
  categoryId?: string,
  platformId?: string,
  rank?: number,
  runType?: 'solo' | 'co-op'
): number {
  // Base points for all verified runs
  const basePoints = 10;
  
  // Ensure rank is a number for comparison
  // Handle null, undefined, and non-number values
  let numericRank: number | undefined = undefined;
  if (rank !== undefined && rank !== null) {
    if (typeof rank === 'number' && !isNaN(rank)) {
      numericRank = rank;
    } else {
      const parsed = Number(rank);
      if (!isNaN(parsed) && parsed > 0) {
        numericRank = parsed;
      }
    }
  }
  
  // Start with base points
  let points = basePoints;

  // Add top 3 bonus if applicable
  // Only apply bonus if rank is exactly 1, 2, or 3
  if (numericRank !== undefined && numericRank >= 1 && numericRank <= 3 && Number.isInteger(numericRank)) {
    if (numericRank === 1) {
      points += 50; // 1st place bonus
    } else if (numericRank === 2) {
      points += 30; // 2nd place bonus
    } else if (numericRank === 3) {
      points += 20; // 3rd place bonus
    }
  }

  // For co-op runs, split points equally between both players
  if (runType === 'co-op') {
    points = points / 2;
  }

  return Math.round(points);
}
