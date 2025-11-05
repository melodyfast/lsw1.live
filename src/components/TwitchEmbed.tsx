"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

interface TwitchEmbedProps {
  channel: string;
}

const TwitchEmbed: React.FC<TwitchEmbedProps> = ({ channel }) => {
  // Get the current hostname for the 'parent' parameter required by Twitch embeds
  const parentDomain = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  return (
    <Card className="w-full bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl overflow-hidden">
      <div className="relative" style={{ paddingBottom: '56.25%' /* 16:9 Aspect Ratio */ }}>
        <iframe
          src={`https://player.twitch.tv/?channel=${channel}&parent=${parentDomain}&autoplay=false&muted=true`}
          height="100%"
          width="100%"
          allowFullScreen
          className="absolute top-0 left-0 w-full h-full"
          title={`${channel} Twitch Stream`}
        ></iframe>
      </div>
      <CardContent className="p-6 text-center space-y-3">
        <div className="flex items-center justify-center gap-2 flex-wrap">
        <p className="text-lg font-semibold text-[hsl(220,17%,92%)]">
            Watch <span className="text-[#cba6f7]">{channel}</span> live on Twitch!
          </p>
          <Badge variant="outline" className="border-[#9147ff] bg-[#9147ff]/10 text-[#9147ff]">
            <ExternalLink className="h-3 w-3 mr-1" />
            <a href={`https://twitch.tv/${channel}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
              View on Twitch
            </a>
          </Badge>
        </div>
        <p className="text-sm text-[hsl(222,15%,60%)]">
          (Stream is muted by default. Click the player to unmute.)
        </p>
      </CardContent>
    </Card>
  );
};

export default TwitchEmbed;