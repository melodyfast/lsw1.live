export interface LeaderboardEntry {
  id: string;
  playerId: string;
  playerName: string;
  player2Name?: string; // New optional field for the second player's name
  category: string;
  platform: string;
  runType: 'solo' | 'co-op'; // New field for run type
  leaderboardType?: 'regular' | 'individual-level' | 'community-golds'; // Type of leaderboard
  level?: string; // Level name for Individual Level and Community Gold runs
  time: string; // Format: HH:MM:SS
  date: string; // Format: YYYY-MM-DD
  videoUrl?: string;
  comment?: string; // Optional comment from the runner
  verified: boolean;
  verifiedBy?: string; // UID or name of who verified the run
  rank?: number;
  isObsolete?: boolean; // New field to mark runs as obsolete
  nameColor?: string; // Player's name color
  player2Color?: string; // Player 2's name color (for co-op)
  points?: number; // Points awarded for this run
}

export interface Player {
  id: string;
  uid: string; // Firebase user ID
  displayName: string;
  email: string;
  joinDate: string; // Format: YYYY-MM-DD
  totalRuns: number;
  bestRank: number | null;
  favoriteCategory: string | null;
  favoritePlatform: string | null;
  nameColor?: string; // New field for player's name color
  isAdmin?: boolean; // New field to identify admin users
  totalPoints?: number; // Total points accumulated from all verified runs
  profilePicture?: string; // URL to the player's profile picture
  bio?: string; // Bio/description for the player
  pronouns?: string; // Pronouns for the player
  twitchUsername?: string; // Twitch username for the player
}

export interface Category {
  id: string;
  name: string;
  order?: number; // Order for displaying categories (lower numbers appear first)
  leaderboardType?: 'regular' | 'individual-level' | 'community-golds'; // Type of leaderboard this category belongs to
}

export interface Level {
  id: string;
  name: string;
  order?: number; // Order for displaying levels (lower numbers appear first)
}

export interface Platform {
  id: string;
  name: string;
  order?: number; // Order for displaying platforms (lower numbers appear first)
}

export interface RunType { // New interface for RunType
  id: 'solo' | 'co-op';
  name: string;
}

export interface DownloadEntry { // New interface for download entries
  id: string;
  name: string;
  description: string;
  url?: string; // Optional URL for external links
  fileUrl?: string; // Optional file URL for uploaded files
  category: string; // e.g., "Tools", "Guides", "Save Files"
  addedBy: string; // Player ID or Admin ID
  dateAdded: string; // YYYY-MM-DD
  order?: number; // Order for displaying downloads (lower numbers appear first)
}

// Define a custom user type that extends Firebase's User and adds isAdmin
import { User as FirebaseAuthUser } from "firebase/auth";
export interface CustomUser extends FirebaseAuthUser {
  isAdmin?: boolean;
}