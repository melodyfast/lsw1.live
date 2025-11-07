import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { User, Users, ExternalLink, Trophy, Clock, MapPin, Check } from "lucide-react";
import { LeaderboardEntry } from "@/types/database";
import LegoStudIcon from "@/components/icons/LegoStudIcon";
import { formatTime } from "@/lib/utils";
import { getPlatformName, getLevelName } from "@/lib/dataValidation";

interface LeaderboardTableProps {
  data: LeaderboardEntry[];
  platforms?: { id: string; name: string }[];
  categories?: { id: string; name: string }[];
  levels?: { id: string; name: string }[];
  leaderboardType?: 'regular' | 'individual-level' | 'community-golds';
}

export function LeaderboardTable({ data, platforms = [], categories = [], levels = [], leaderboardType }: LeaderboardTableProps) {
  // Determine if we should show level column (for IL and Community Golds)
  const showLevelColumn = leaderboardType === 'individual-level' || leaderboardType === 'community-golds';
  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="h-12 w-12 mx-auto mb-3 text-ctp-overlay0 opacity-50" />
        <p className="text-base text-ctp-overlay0">No runs found for these filters</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-custom">
      <Table>
        <TableHeader>
          <TableRow className="border-b border-ctp-surface1/50 hover:bg-transparent bg-ctp-surface0/50">
            <TableHead className="py-3 pl-3 pr-1 text-left text-sm font-semibold text-ctp-text whitespace-nowrap w-16">Rank</TableHead>
            <TableHead className="py-3 pl-1 pr-2 text-left text-sm font-semibold text-ctp-text min-w-[200px]">Player</TableHead>
            {showLevelColumn && (
              <TableHead className="py-3 px-2 text-left text-sm font-semibold text-ctp-text hidden md:table-cell whitespace-nowrap w-32">Level</TableHead>
            )}
            <TableHead className="py-3 px-2 text-left text-sm font-semibold text-ctp-text hidden sm:table-cell whitespace-nowrap w-24">Time</TableHead>
            <TableHead className="py-3 px-2 text-left text-sm font-semibold text-ctp-text hidden md:table-cell whitespace-nowrap w-28">Date</TableHead>
            <TableHead className="py-3 px-2 text-left text-sm font-semibold text-ctp-text hidden lg:table-cell whitespace-nowrap w-32">Platform</TableHead>
            <TableHead className="py-3 px-2 text-left text-sm font-semibold text-ctp-text hidden lg:table-cell whitespace-nowrap w-24">Type</TableHead>
            <TableHead className="py-3 px-2 text-left text-sm font-semibold text-ctp-text whitespace-nowrap w-20">Video</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((entry) => {
            // Use data validation utility for platform name with SRC fallback
            const platformName = getPlatformName(
              entry.platform,
              platforms,
              entry.srcPlatformName
            );
            
            // Get level name for IL/Community Gold runs
            const levelName = showLevelColumn && entry.level
              ? getLevelName(entry.level, levels, entry.srcLevelName)
              : undefined;
            
            return (
            <TableRow 
              key={entry.id} 
              className={`border-b border-ctp-surface1/20 hover:bg-ctp-surface0 hover:brightness-125 transition-all duration-150 cursor-pointer ${entry.isObsolete ? 'opacity-60 italic' : ''}`}
            >
              <TableCell className="py-2.5 pl-3 pr-1">
                <Link to={`/run/${entry.id}`} className="block">
                  <div className="flex items-center gap-1.5">
                    {entry.rank === 1 ? (
                      <LegoStudIcon size={28} color="#0055BF" />
                    ) : entry.rank === 2 ? (
                      <LegoStudIcon size={28} color="#FFD700" />
                    ) : entry.rank === 3 ? (
                      <LegoStudIcon size={28} color="#C0C0C0" />
                    ) : (
                      <span className="font-semibold text-sm text-ctp-text w-7 h-7 flex items-center justify-center">
                        #{entry.rank}
                      </span>
                    )}
                    {entry.isObsolete && (
                      <Badge variant="destructive" className="bg-red-800/50 text-red-200 text-xs px-1.5 py-0.5 border border-red-700/30">
                        Obsolete
                      </Badge>
                    )}
                  </div>
                </Link>
              </TableCell>
              <TableCell className="py-2.5 pl-1 pr-2 min-w-[200px]">
                <div className="flex items-center gap-1.5 flex-wrap">
                {(() => {
                  // Check if run is unclaimed - simply check if playerId is empty/null
                  const isUnclaimed = !entry.playerId || entry.playerId.trim() === "";
                  
                  if (isUnclaimed) {
                    // For unclaimed runs, show name without link
                    return (
                      <>
                        <span className="font-semibold text-sm whitespace-nowrap text-ctp-text">{entry.playerName}</span>
                        {entry.player2Name && (
                          <>
                            <span className="text-ctp-overlay0 text-sm"> & </span>
                            <span className="font-semibold text-sm whitespace-nowrap text-ctp-text">
                              {entry.player2Name}
                            </span>
                          </>
                        )}
                        {entry.rank === 1 && !entry.isObsolete && (
                          <Badge className="bg-gradient-to-r from-[#0055BF] to-[#0070f3] text-white text-xs px-1.5 py-0.5 border border-[#0055BF]/50 flex items-center gap-1 font-semibold">
                            <Trophy className="h-2.5 w-2.5" />
                            <span className="hidden sm:inline">World Record</span>
                            <span className="sm:hidden">WR</span>
                          </Badge>
                        )}
                      </>
                    );
                  } else {
                    // For claimed runs, show with link and check icon
                    return (
                      <>
                        <Link 
                          to={`/player/${entry.playerId}`} 
                          className="hover:opacity-80 inline-block"
                          style={{ color: entry.nameColor || '#cba6f7' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="font-semibold text-sm whitespace-nowrap">{entry.playerName}</span>
                        </Link>
                        {entry.player2Name && (
                          <>
                            <span className="text-ctp-overlay0 text-sm"> & </span>
                            {entry.player2Id && entry.player2Id.trim() !== "" ? (
                              <Link 
                                to={`/player/${entry.player2Id}`} 
                                className="hover:opacity-80 inline-block"
                                style={{ color: entry.player2Color || '#cba6f7' }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="font-semibold text-sm whitespace-nowrap">{entry.player2Name}</span>
                              </Link>
                            ) : (
                              <span className="font-semibold text-sm whitespace-nowrap text-ctp-text">{entry.player2Name}</span>
                            )}
                          </>
                        )}
                        <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        {entry.rank === 1 && !entry.isObsolete && (
                          <Badge className="bg-gradient-to-r from-[#0055BF] to-[#0070f3] text-white text-xs px-1.5 py-0.5 border border-[#0055BF]/50 flex items-center gap-1 font-semibold">
                            <Trophy className="h-2.5 w-2.5" />
                            <span className="hidden sm:inline">World Record</span>
                            <span className="sm:hidden">WR</span>
                          </Badge>
                        )}
                      </>
                    );
                  }
                })()}
                </div>
                <div className="sm:hidden mt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ctp-text">{formatTime(entry.time)}</span>
                    <Badge variant="outline" className="border-ctp-surface1 bg-ctp-surface0 text-ctp-text text-xs px-1.5 py-0.5">
                      {platformName}
                    </Badge>
                    <Badge variant="outline" className="border-ctp-surface1 bg-ctp-surface0 text-ctp-text flex items-center gap-1 w-fit text-xs px-1.5 py-0.5">
                      {entry.runType === 'solo' ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                      {entry.runType.charAt(0).toUpperCase() + entry.runType.slice(1)}
                    </Badge>
                  </div>
                </div>
              </TableCell>
              {showLevelColumn && (
                <TableCell className="py-2.5 px-2 hidden md:table-cell">
                  <Link to={`/run/${entry.id}`} className="hover:text-[#cba6f7] flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-ctp-overlay0" />
                    <span className="text-sm text-ctp-subtext1">
                      {levelName || entry.srcLevelName || 'Unknown Level'}
                    </span>
                  </Link>
                </TableCell>
              )}
              <TableCell className="py-2.5 px-2 hidden sm:table-cell">
                <Link to={`/run/${entry.id}`} className="hover:text-[#cba6f7]">
                  <span className="text-sm font-semibold text-ctp-text">
                    {formatTime(entry.time)}
                  </span>
                </Link>
              </TableCell>
              <TableCell className="py-2.5 px-2 hidden md:table-cell">
                <Link to={`/run/${entry.id}`} className="hover:text-[#cba6f7] flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-ctp-overlay0" />
                  <span className="text-sm text-ctp-subtext1">{entry.date}</span>
                </Link>
              </TableCell>
              <TableCell className="py-2.5 px-2 hidden lg:table-cell">
                <Link to={`/run/${entry.id}`} className="block">
                  <Badge variant="outline" className="border-ctp-surface1/50 bg-ctp-surface0/50 text-ctp-text text-xs px-1.5 py-0.5">
                    {platformName}
                  </Badge>
                </Link>
              </TableCell>
              <TableCell className="py-2.5 px-2 hidden lg:table-cell">
                <Link to={`/run/${entry.id}`} className="block">
                  <Badge variant="outline" className="border-ctp-surface1/50 bg-ctp-surface0/50 text-ctp-text flex items-center gap-1 w-fit text-xs px-1.5 py-0.5">
                    {entry.runType === 'solo' ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                    {entry.runType.charAt(0).toUpperCase() + entry.runType.slice(1)}
                  </Badge>
                </Link>
              </TableCell>
              <TableCell className="py-2.5 px-2">
                {entry.videoUrl && (
                  <a 
                    href={entry.videoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#cba6f7] hover:text-[#f5c2e7] flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="text-xs">Watch</span>
                  </a>
                )}
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}