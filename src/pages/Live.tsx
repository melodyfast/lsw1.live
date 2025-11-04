"use client";

import React, { useState, useEffect } from 'react';
import { Radio } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const Live = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [parentDomain, setParentDomain] = useState<string>('localhost');
  const [isLive, setIsLive] = useState<boolean | null>(null);
  const channel = 'lsw1live';

  useEffect(() => {
    // Get the current hostname for the 'parent' parameter required by Twitch embeds
    // Twitch requires the parent parameter to match the domain where the embed is hosted
    if (typeof window !== 'undefined') {
      setParentDomain(window.location.hostname);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    // Check if stream is live
    const checkStreamStatus = async () => {
      try {
        // Use decapi.me status endpoint which returns "live" or "offline"
        const response = await fetch(`https://decapi.me/twitch/status/${channel}`);
        
        if (!response.ok) {
          setIsLive(false);
          return;
        }
        
        const data = await response.text();
        const trimmedData = data.trim().toLowerCase();
        
        // The status endpoint should return "live" or "offline"
        if (trimmedData === 'live') {
          setIsLive(true);
        } else if (trimmedData === 'offline') {
          setIsLive(false);
        } else {
          // If response is unexpected, default to offline for safety
          console.warn('Unexpected stream status response:', trimmedData);
          setIsLive(false);
        }
      } catch (error) {
        console.error('Error checking stream status:', error);
        // Default to offline on error
        setIsLive(false);
      }
    };

    // Check immediately
    checkStreamStatus();

    // Check every 30 seconds
    const interval = setInterval(checkStreamStatus, 30000);

    return () => clearInterval(interval);
  }, [channel]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Stream and Chat Container */}
        <div className={`grid grid-cols-1 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_320px] gap-6 items-stretch transition-all duration-1000 delay-500 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* Stream Player */}
          <div className="w-full">
            <div className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border border-[hsl(235,13%,30%)] rounded-lg overflow-hidden shadow-2xl relative" style={{ paddingBottom: '56.25%' /* 16:9 Aspect Ratio */ }}>
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
            
            {/* Title below player */}
            <div className={`text-center mt-4 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
              <div className="flex items-center justify-center gap-2">
                <Radio className="h-4 w-4 text-[#89b4fa]" />
                <span className={`text-base font-medium transition-colors duration-300 ${
                  isLive === null 
                    ? 'text-[hsl(222,15%,70%)]' 
                    : isLive 
                    ? 'text-[#89b4fa]' 
                    : 'text-[hsl(222,15%,60%)]'
                }`}>
                  {isLive === null ? 'Checking...' : isLive ? 'Live' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Chat */}
          <div className="w-full hidden lg:block" style={{ height: '100%' }}>
            <div className="bg-gradient-to-br from-[hsl(240,21%,16%)] to-[hsl(235,19%,13%)] border border-[hsl(235,13%,30%)] rounded-lg overflow-hidden shadow-2xl relative h-full">
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
