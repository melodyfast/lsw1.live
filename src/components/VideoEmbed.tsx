import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface VideoEmbedProps {
  url: string;
  title?: string;
}

/**
 * Converts YouTube and Twitch URLs to embeddable formats
 */
const getEmbedUrl = (url: string): string | null => {
  // YouTube URL patterns
  // https://www.youtube.com/watch?v=VIDEO_ID
  // https://youtu.be/VIDEO_ID
  // https://www.youtube.com/embed/VIDEO_ID
  const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/;
  const youtubeMatch = url.match(youtubeRegex);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }

  // Twitch URL patterns
  // https://www.twitch.tv/videos/VIDEO_ID
  // https://twitch.tv/videos/VIDEO_ID
  const twitchVideoRegex = /twitch\.tv\/videos\/(\d+)/;
  const twitchVideoMatch = url.match(twitchVideoRegex);
  if (twitchVideoMatch) {
    const parentDomain = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `https://player.twitch.tv/?video=${twitchVideoMatch[1]}&parent=${parentDomain}`;
  }

  // Twitch clip patterns
  // https://www.twitch.tv/CHANNEL/clip/CLIP_ID
  const twitchClipRegex = /twitch\.tv\/\w+\/clip\/([a-zA-Z0-9_-]+)/;
  const twitchClipMatch = url.match(twitchClipRegex);
  if (twitchClipMatch) {
    const parentDomain = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `https://clips.twitch.tv/embed?clip=${twitchClipMatch[1]}&parent=${parentDomain}`;
  }

  // If it's already an embed URL, return as is
  if (url.includes('/embed') || url.includes('player.twitch.tv')) {
    return url;
  }

  return null;
};

export const VideoEmbed: React.FC<VideoEmbedProps> = ({ url, title }) => {
  const embedUrl = getEmbedUrl(url);

  if (!embedUrl) {
    // If we can't convert to embed, show as a link
    return (
      <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
        <CardContent className="p-6 text-center">
          <p className="text-[hsl(222,15%,70%)] mb-4">Unable to embed this video URL</p>
          <Button 
            asChild
            variant="outline"
            className="border-[hsl(235,13%,30%)] hover:bg-[#cba6f7]/10 hover:border-[#cba6f7] transition-all duration-300"
          >
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <span>View video on original site</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full">
      <div className="relative" style={{ paddingBottom: '56.25%' /* 16:9 Aspect Ratio */ }}>
        <iframe
          src={embedUrl}
          height="100%"
          width="100%"
          allowFullScreen
          className="absolute top-0 left-0 w-full h-full"
          title={title || "Video Embed"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        ></iframe>
      </div>
    </div>
  );
};

