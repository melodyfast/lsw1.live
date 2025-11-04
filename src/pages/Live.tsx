"use client";

import React, { useState, useEffect } from 'react';
import { Radio, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const Live = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [parentDomain, setParentDomain] = useState<string>('localhost');
  const channel = 'lsw1live';

  useEffect(() => {
    // Get the current hostname for the 'parent' parameter required by Twitch embeds
    // Twitch requires the parent parameter to match the domain where the embed is hosted
    if (typeof window !== 'undefined') {
      setParentDomain(window.location.hostname);
    }
    setIsLoaded(true);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Animated Header */}
        <div className={`text-center mb-6 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className={`p-2 rounded-xl bg-gradient-to-br from-[#89b4fa] to-[#74c7ec] shadow-lg transition-all duration-1000 ${isLoaded ? 'rotate-0 scale-100' : 'rotate-180 scale-0'}`}>
              <Radio className="h-6 w-6 text-[hsl(240,21%,15%)]" />
            </div>
            <h1 className={`text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#89b4fa] via-[#74c7ec] to-[#89dceb] bg-clip-text text-transparent transition-all duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
              Live Stream
            </h1>
          </div>
          <div className={`flex items-center justify-center gap-2 text-lg text-[hsl(222,15%,70%)] transition-all duration-1000 delay-300 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="relative">
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
            </div>
            <span className="font-semibold text-[#89b4fa]">LIVE</span>
            <span>•</span>
            <span>Watch live speedrun attempts and community runs</span>
          </div>
        </div>

        {/* Stream and Chat Container */}
        <div className={`grid grid-cols-1 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_320px] gap-6 items-stretch transition-all duration-1000 delay-500 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Stream Player */}
          <div className="w-full">
            <div className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border border-[hsl(235,13%,30%)] rounded-lg overflow-hidden shadow-2xl relative" style={{ paddingBottom: '56.25%' /* 16:9 Aspect Ratio */ }}>
              {/* Streaming indicator */}
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5 border border-[#89b4fa]/30 pointer-events-none">
                <div className="relative">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <div className="absolute top-0 left-0 w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                </div>
                <span className="text-xs font-semibold text-white">LIVE</span>
              </div>

              {parentDomain && (
                <iframe
                  src={`https://player.twitch.tv/?channel=${channel}&parent=${parentDomain}&autoplay=false&muted=false`}
                  className="absolute top-0 left-0 w-full h-full"
                  title={`${channel} Twitch Stream`}
                  style={{ border: 'none' }}
                  allowFullScreen
                  allow="autoplay; fullscreen"
                />
              )}
            </div>
          </div>

          {/* Chat */}
          <div className="w-full hidden lg:block" style={{ height: '100%' }}>
            <div className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border border-[hsl(235,13%,30%)] rounded-lg overflow-hidden shadow-2xl relative h-full">
              {/* Chat header indicator */}
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-3 py-1.5 border border-[#74c7ec]/30 pointer-events-none">
                <Users className="h-4 w-4 text-[#74c7ec]" />
                <span className="text-xs font-semibold text-white">Chat</span>
              </div>

              {parentDomain && (
                <iframe
                  src={`https://www.twitch.tv/embed/${channel}/chat?parent=${parentDomain}&darkpopout`}
                  className="absolute top-0 left-0 w-full h-full"
                  title={`${channel} Twitch Chat`}
                  style={{ border: 'none' }}
                  allow="autoplay; fullscreen"
                />
              )}
            </div>
          </div>

          {/* Mobile Chat Indicator */}
          <div className="lg:hidden w-full">
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardContent className="p-6 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-[#74c7ec]" />
                <p className="text-[hsl(222,15%,70%)]">
                  Chat is available on larger screens. View the stream on desktop to see the chat!
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Live;
