import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, Timer, Calendar, Gamepad2 } from "lucide-react";

interface PlayerStats {
  totalRuns: number;
  bestRank: number;
  favoriteCategory: string;
  favoritePlatform: string;
}

interface PlayerProfileProps {
  playerName: string;
  joinDate: string;
  stats: PlayerStats;
  nameColor?: string; // Added nameColor prop
  profilePicture?: string; // URL to the player's profile picture
}

export function PlayerProfile({ playerName, joinDate, stats, nameColor, profilePicture }: PlayerProfileProps) {
  return (
    <Card className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={profilePicture || `https://api.dicebear.com/7.x/lorelei-neutral/svg?seed=${playerName}`} />
            <AvatarFallback>{playerName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-2xl" style={{ color: nameColor || 'inherit' }}>{playerName}</h2> {/* Apply nameColor */}
            <p className="text-sm text-[hsl(222,15%,60%)] flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Joined {joinDate}
            </p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* The stats cards have been removed from here */}
      </CardContent>
    </Card>
  );
}