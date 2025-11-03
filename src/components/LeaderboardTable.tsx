import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "react-router-dom";
import { User, Users, ExternalLink, Trophy, Clock } from "lucide-react";
import { LeaderboardEntry } from "@/types/database";
import LegoStudIcon from "@/components/icons/LegoStudIcon";

interface LeaderboardTableProps {
  data: LeaderboardEntry[];
  platforms?: { id: string; name: string }[];
  categories?: { id: string; name: string }[];
}

export function LeaderboardTable({ data, platforms = [], categories = [] }: LeaderboardTableProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-16">
        <Trophy className="h-16 w-16 mx-auto mb-4 text-[hsl(222,15%,60%)] opacity-50" />
        <p className="text-xl text-[hsl(222,15%,60%)]">No runs found for these filters</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-b-2 border-[hsl(235,13%,30%)] hover:bg-transparent">
            <TableHead className="py-5 px-6 text-left text-lg font-semibold text-[hsl(220,17%,92%)]">Rank</TableHead>
            <TableHead className="py-5 px-6 text-left text-lg font-semibold text-[hsl(220,17%,92%)] min-w-[280px] w-[20%]">Player</TableHead>
            <TableHead className="py-5 px-6 text-left text-lg font-semibold text-[hsl(220,17%,92%)]">Time</TableHead>
            <TableHead className="py-5 px-6 text-left text-lg font-semibold text-[hsl(220,17%,92%)]">Date</TableHead>
            <TableHead className="py-5 px-6 text-left text-lg font-semibold text-[hsl(220,17%,92%)]">Platform</TableHead>
            <TableHead className="py-5 px-6 text-left text-lg font-semibold text-[hsl(220,17%,92%)]">Type</TableHead>
            <TableHead className="py-5 px-6 text-left text-lg font-semibold text-[hsl(220,17%,92%)]">Video</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((entry, index) => {
            const platformName = platforms.find(p => p.id === entry.platform)?.name || entry.platform;
            
            return (
            <TableRow 
              key={entry.id} 
              className={`group border-b border-[hsl(235,13%,30%)] hover:bg-gradient-to-r hover:from-[hsl(240,21%,18%)] hover:to-[hsl(235,19%,15%)] transition-all duration-300 cursor-pointer animate-fade-in ${entry.isObsolete ? 'opacity-60 italic' : ''}`}
              style={{ animationDelay: `${index * 0.03}s` }}
            >
              <TableCell className="py-5 px-6">
                <Link to={`/run/${entry.id}`} className="block">
                  <div className="flex items-center gap-3">
                    {entry.rank === 1 ? (
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-[hsl(220,17%,92%)] min-w-[2rem]">
                          #{entry.rank}
                        </span>
                        <LegoStudIcon size={48} color="#0055BF" />
                      </div>
                    ) : entry.rank === 2 ? (
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-[hsl(220,17%,92%)] min-w-[2rem]">
                          #{entry.rank}
                        </span>
                        <LegoStudIcon size={48} color="#FFD700" />
                      </div>
                    ) : entry.rank === 3 ? (
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-lg text-[hsl(220,17%,92%)] min-w-[2rem]">
                          #{entry.rank}
                        </span>
                        <LegoStudIcon size={48} color="#C0C0C0" />
                      </div>
                    ) : (
                      <Badge 
                        variant="secondary" 
                        className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold bg-[hsl(235,13%,25%)] text-[hsl(222,15%,70%)] border-[hsl(235,13%,30%)]"
                      >
                        #{entry.rank}
                      </Badge>
                    )}
                    {entry.isObsolete && (
                      <Badge variant="destructive" className="bg-red-800/50 text-red-200 text-sm px-3 py-1">
                        Obsolete
                      </Badge>
                    )}
                  </div>
                </Link>
              </TableCell>
              <TableCell className="py-5 px-6 min-w-[280px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link 
                    to={`/player/${entry.playerId}`} 
                    className="hover:opacity-80 transition-all group-hover:scale-105 inline-block"
                    style={{ color: entry.nameColor || '#cba6f7' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="font-semibold text-lg whitespace-nowrap">{entry.playerName}</span>
                  </Link>
                  {entry.player2Name && (
                    <>
                      <span className="text-[hsl(222,15%,60%)] text-base"> & </span>
                      <span 
                        className="font-semibold text-lg whitespace-nowrap"
                        style={{ color: entry.player2Color || '#cba6f7' }}
                      >
                        {entry.player2Name}
                      </span>
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-5 px-6">
                <Link to={`/run/${entry.id}`} className="hover:text-[#cba6f7] transition-all group-hover:scale-105 inline-block">
                  <p className="font-mono text-xl font-bold bg-gradient-to-r from-[#cdd6f4] to-[#cba6f7] bg-clip-text text-transparent">
                    {entry.time}
                  </p>
                </Link>
              </TableCell>
              <TableCell className="py-5 px-6">
                <Link to={`/run/${entry.id}`} className="hover:text-[#cba6f7] transition-colors flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[hsl(222,15%,60%)]" />
                  <span className="text-base text-[hsl(222,15%,70%)]">{entry.date}</span>
                </Link>
              </TableCell>
              <TableCell className="py-5 px-6">
                <Link to={`/run/${entry.id}`} className="block">
                  <Badge variant="outline" className="border-[hsl(235,13%,30%)] bg-[hsl(240,21%,18%)] text-[hsl(220,17%,92%)] text-base px-3 py-1.5">
                    {platformName}
                  </Badge>
                </Link>
              </TableCell>
              <TableCell className="py-5 px-6">
                <Link to={`/run/${entry.id}`} className="block">
                  <Badge variant="outline" className="border-[hsl(235,13%,30%)] bg-[hsl(240,21%,18%)] text-[hsl(220,17%,92%)] flex items-center gap-2 w-fit text-base px-3 py-1.5">
                    {entry.runType === 'solo' ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                    {entry.runType.charAt(0).toUpperCase() + entry.runType.slice(1)}
                  </Badge>
                </Link>
              </TableCell>
              <TableCell className="py-5 px-6">
                {entry.videoUrl && (
                  <a 
                    href={entry.videoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[#cba6f7] hover:text-[#f5c2e7] transition-colors flex items-center gap-2 group/link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-5 w-5 group-hover/link:scale-110 transition-transform" />
                    <span className="text-base">Watch</span>
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