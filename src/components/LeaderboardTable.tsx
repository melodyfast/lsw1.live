import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { User, Users, ExternalLink, Trophy, Clock } from "lucide-react";
import { LeaderboardEntry } from "@/types/database";
import LegoStudIcon from "@/components/icons/LegoStudIcon";
import { formatTime } from "@/lib/utils";
import { getPlatformName } from "@/lib/dataValidation";

interface LeaderboardTableProps {
  data: LeaderboardEntry[];
  platforms?: { id: string; name: string }[];
  categories?: { id: string; name: string }[];
}

export function LeaderboardTable({ data, platforms = [], categories = [] }: LeaderboardTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="h-12 w-12 mx-auto mb-3 text-ctp-overlay0 opacity-50" />
        <p className="text-base text-ctp-overlay0">No runs found for these filters</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-2 sm:mx-0">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2 border-[hsl(235,13%,30%)] hover:bg-transparent">
            <TableHead className="py-2 sm:py-3 px-2 sm:px-4 text-left text-xs sm:text-base font-semibold text-ctp-text">Rank</TableHead>
            <TableHead className="py-2 sm:py-3 px-2 sm:px-4 text-left text-xs sm:text-base font-semibold text-ctp-text min-w-[200px] sm:min-w-[280px] w-[20%]">Player</TableHead>
            <TableHead className="py-2 sm:py-3 px-2 sm:px-4 text-left text-xs sm:text-base font-semibold text-ctp-text hidden sm:table-cell">Time</TableHead>
            <TableHead className="py-2 sm:py-3 px-2 sm:px-4 text-left text-xs sm:text-base font-semibold text-ctp-text hidden md:table-cell">Date</TableHead>
            <TableHead className="py-2 sm:py-3 px-2 sm:px-4 text-left text-xs sm:text-base font-semibold text-ctp-text hidden lg:table-cell">Platform</TableHead>
            <TableHead className="py-2 sm:py-3 px-2 sm:px-4 text-left text-xs sm:text-base font-semibold text-ctp-text hidden lg:table-cell">Type</TableHead>
            <TableHead className="py-2 sm:py-3 px-2 sm:px-4 text-left text-xs sm:text-base font-semibold text-ctp-text">Video</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((entry, index) => {
            // Use data validation utility for platform name with SRC fallback
            const platformName = getPlatformName(
              entry.platform,
              platforms,
              entry.srcPlatformName
            );
            
            return (
            <TableRow 
              key={entry.id} 
              className={`group border-b border-[hsl(235,13%,30%)] hover:bg-gradient-to-r hover:from-[hsl(240,21%,18%)] hover:to-[hsl(235,19%,15%)] transition-all duration-300 cursor-pointer animate-fade-in ${entry.isObsolete ? 'opacity-60 italic' : ''}`}
              style={{ animationDelay: `${index * 0.03}s` }}
            >
              <TableCell className="py-2 sm:py-3 px-2 sm:px-4">
                <Link to={`/run/${entry.id}`} className="block">
                  <div className="flex items-center gap-1 sm:gap-2">
                    {entry.rank === 1 ? (
                      <LegoStudIcon size={28} className="sm:w-9 sm:h-9" color="#0055BF" />
                    ) : entry.rank === 2 ? (
                      <LegoStudIcon size={28} className="sm:w-9 sm:h-9" color="#FFD700" />
                    ) : entry.rank === 3 ? (
                      <LegoStudIcon size={28} className="sm:w-9 sm:h-9" color="#C0C0C0" />
                    ) : (
                      <span className="font-bold text-sm sm:text-base text-ctp-text w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center">
                        #{entry.rank}
                      </span>
                    )}
                    {entry.isObsolete && (
                      <Badge variant="destructive" className="bg-red-800/50 text-red-200 text-xs px-1.5 sm:px-2 py-0.5">
                        Obsolete
                      </Badge>
                    )}
                  </div>
                </Link>
              </TableCell>
              <TableCell className="py-2 sm:py-3 px-2 sm:px-4 min-w-[200px] sm:min-w-[280px]">
                <div className="flex flex-wrap items-center gap-x-1 sm:gap-x-2 gap-y-1">
                {(() => {
                  const isUnclaimed = entry.playerId === "imported" || entry.importedFromSRC === true;
                  
                  if (isUnclaimed) {
                    // For unclaimed runs, show name without link
                    return (
                      <>
                        <span className="font-semibold text-sm sm:text-base whitespace-nowrap text-ctp-text">{entry.playerName}</span>
                        {entry.player2Name && (
                          <>
                            <span className="text-ctp-overlay0 text-xs sm:text-sm"> & </span>
                            <span className="font-semibold text-sm sm:text-base whitespace-nowrap text-ctp-text">
                              {entry.player2Name}
                            </span>
                          </>
                        )}
                      </>
                    );
                  } else {
                    // For claimed runs, show with link
                    return (
                      <>
                        <Link 
                          to={`/player/${entry.playerId}`} 
                          className="hover:opacity-80 transition-all group-hover:scale-105 inline-block"
                          style={{ color: entry.nameColor || '#cba6f7' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="font-semibold text-sm sm:text-base whitespace-nowrap">{entry.playerName}</span>
                        </Link>
                        {entry.player2Name && (
                          <>
                            <span className="text-ctp-overlay0 text-xs sm:text-sm"> & </span>
                            <span 
                              className="font-semibold text-sm sm:text-base whitespace-nowrap"
                              style={{ color: entry.player2Color || '#cba6f7' }}
                            >
                              {entry.player2Name}
                            </span>
                          </>
                        )}
                      </>
                    );
                  }
                })()}
                </div>
                <div className="sm:hidden mt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-ctp-text">{formatTime(entry.time)}</span>
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
              <TableCell className="py-2 sm:py-3 px-2 sm:px-4 hidden sm:table-cell">
                <Link to={`/run/${entry.id}`} className="hover:text-[#cba6f7] transition-colors">
                  <p className="text-sm sm:text-base font-semibold text-ctp-text">
                    {formatTime(entry.time)}
                  </p>
                </Link>
              </TableCell>
              <TableCell className="py-2 sm:py-3 px-2 sm:px-4 hidden md:table-cell">
                <Link to={`/run/${entry.id}`} className="hover:text-[#cba6f7] transition-colors flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-ctp-overlay0" />
                  <span className="text-xs sm:text-sm text-ctp-subtext1">{entry.date}</span>
                </Link>
              </TableCell>
              <TableCell className="py-2 sm:py-3 px-2 sm:px-4 hidden lg:table-cell">
                <Link to={`/run/${entry.id}`} className="block">
                  <Badge variant="outline" className="border-ctp-surface1 bg-ctp-surface0 text-ctp-text text-xs sm:text-sm px-2 py-1">
                    {platformName}
                  </Badge>
                </Link>
              </TableCell>
              <TableCell className="py-2 sm:py-3 px-2 sm:px-4 hidden lg:table-cell">
                <Link to={`/run/${entry.id}`} className="block">
                  <Badge variant="outline" className="border-ctp-surface1 bg-ctp-surface0 text-ctp-text flex items-center gap-1.5 w-fit text-xs sm:text-sm px-2 py-1">
                    {entry.runType === 'solo' ? <User className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                    {entry.runType.charAt(0).toUpperCase() + entry.runType.slice(1)}
                  </Badge>
                </Link>
              </TableCell>
              <TableCell className="py-2 sm:py-3 px-2 sm:px-4">
                {entry.videoUrl && (
                  <a 
                    href={entry.videoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#cba6f7] hover:text-[#f5c2e7] transition-colors flex items-center gap-1 sm:gap-1.5 group/link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover/link:scale-110 transition-transform" />
                    <span className="text-xs sm:text-sm">Watch</span>
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