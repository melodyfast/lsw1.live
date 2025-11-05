"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Wrench, Book, Save } from "lucide-react";
import { getDownloadEntries } from "@/lib/db";
import { DownloadEntry } from "@/types/database";
import { LoadingSpinner } from "@/components/LoadingSpinner";

const Downloads = () => {
  const [downloadEntries, setDownloadEntries] = useState<DownloadEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await getDownloadEntries();
        setDownloadEntries(data);
      } catch (error) {
        // Error fetching download entries
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case "tools":
        return <Wrench className="h-5 w-5 text-ctp-crust" />;
      case "guides":
        return <Book className="h-5 w-5 text-ctp-crust" />;
      case "save files":
        return <Save className="h-5 w-5 text-ctp-crust" />;
      default:
        return <Download className="h-5 w-5 text-ctp-crust" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#1e1e2e] text-[hsl(220,17%,92%)] py-8">
      <div className="max-w-5xl mx-auto px-4">
        {/* Animated Header */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Download className="h-6 w-6 text-[#cba6f7]" />
            <h1 className="text-3xl md:text-4xl font-bold text-[#cba6f7]">
            Downloads & Resources
          </h1>
          </div>
          <p className="text-base text-ctp-subtext1 max-w-3xl mx-auto animate-fade-in-delay">
            Find useful tools, guides, and save files to help with your speedrunning journey.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-16">
            <LoadingSpinner size="md" />
          </div>
        ) : downloadEntries.length === 0 ? (
          <Card className="bg-gradient-to-br from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] animate-fade-in">
            <CardContent className="p-12 text-center">
              <Download className="h-16 w-16 text-[#cba6f7]/30 mx-auto mb-4" />
              <p className="text-[hsl(222,15%,60%)] text-lg">No download entries available yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {downloadEntries.map((entry, index) => (
              <Card
                key={entry.id}
                className="group relative overflow-hidden bg-gradient-to-br from-[hsl(240,21%,15%)] to-[hsl(235,19%,14%)] border-[hsl(235,13%,30%)] hover:border-[#cba6f7]/50 transition-all duration-500 hover:scale-[1.03] hover:shadow-2xl hover:shadow-[#cba6f7]/20 animate-fade-in"
                style={{ 
                  animationDelay: `${index * 0.1}s`,
                  opacity: 0 
                }}
              >
                {/* Animated background gradient on hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#cba6f7]/0 via-[#cba6f7]/5 to-[#cba6f7]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                {/* Shine effect on hover */}
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                
                <CardContent className="relative pt-6 pb-6">
                  <CardTitle className="text-xl font-semibold flex items-center gap-3 mb-3 text-[#cba6f7] transition-colors duration-300">
                    <span>
                    {entry.name}
                    </span>
                  </CardTitle>
                  <p className="text-[hsl(222,15%,60%)] text-sm mb-6 leading-relaxed group-hover:text-[hsl(222,15%,70%)] transition-colors duration-300">
                    {entry.description}
                  </p>
                  <Button 
                    asChild 
                    className="w-full bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] hover:from-[#b4a0e2] hover:to-[#cba6f7] text-[hsl(240,21%,15%)] font-bold shadow-lg hover:shadow-xl hover:shadow-[#cba6f7]/30 transition-all duration-300 hover:scale-105"
                  >
                    <a 
                      href={entry.fileUrl || entry.url || "#"} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center justify-center gap-2"
                    >
                      <span>{entry.fileUrl ? "Download" : "View"}</span>
                      {entry.fileUrl ? (
                        <Download className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-1" />
                      ) : (
                        <ExternalLink className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
                      )}
                    </a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes bounce-slow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        
        .animate-fade-in {
          animation: fadeIn 0.8s ease-out forwards;
        }
        
        .animate-fade-in-delay {
          animation: fadeIn 1s ease-out 0.3s forwards;
          opacity: 0;
        }
        
        .animate-bounce-slow {
          animation: bounce-slow 3s ease-in-out infinite;
        }
        
        .animate-gradient {
          background-size: 200% auto;
          animation: gradient 3s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default Downloads;