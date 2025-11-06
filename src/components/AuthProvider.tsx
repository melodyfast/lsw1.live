"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { auth } from "@/lib/firebase";
import { getPlayerByUid, createPlayer } from "@/lib/db";
import { CustomUser } from "@/types/database";

interface AuthContextType {
  currentUser: CustomUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ currentUser: null, loading: true });

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const refreshPlayerData = async (user: any) => {
    try {
      const playerData = await getPlayerByUid(user.uid);
      if (playerData) {
        const isAdmin = Boolean(playerData.isAdmin);
        setCurrentUser(prev => {
          if (prev && prev.uid === user.uid && prev.isAdmin === isAdmin) {
            return prev;
          }
          return {
            ...user,
            isAdmin: isAdmin,
            displayName: playerData.displayName || user.displayName || "",
            email: playerData.email || user.email || "",
          };
        });
      }
    } catch (error) {
      // Silent fail
    }
  };

  useEffect(() => {
    if (!auth || typeof auth.onAuthStateChanged !== 'function') {
      setLoading(false);
      return;
    }

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }

      if (user) {
        const customUser: CustomUser = {
          ...user,
          isAdmin: false,
          displayName: user.displayName,
          email: user.email,
        };
        setCurrentUser(customUser);
        setLoading(false);
        
        // Fetch player data asynchronously without blocking
        (async () => {
          try {
            const playerData = await getPlayerByUid(user.uid);
            if (playerData) {
              const isAdmin = Boolean(playerData.isAdmin);
              
              setCurrentUser(prev => {
                if (!prev || prev.uid !== user.uid) return prev;
                return {
                  ...user,
                  isAdmin: isAdmin,
                  displayName: playerData.displayName || user.displayName || "",
                  email: playerData.email || user.email || "",
                };
              });
            } else {
              const today = new Date().toISOString().split('T')[0];
              
              // Check localStorage for display name and SRC username (set during signup)
              const storedDisplayName = localStorage.getItem(`displayName_${user.uid}`);
              const storedSRCUsername = localStorage.getItem(`srcUsername_${user.uid}`);
              
              // Use stored display name if available, otherwise fall back to Firebase Auth or email
              const finalDisplayName = storedDisplayName || user.displayName || user.email?.split('@')[0] || "Player";
              const srcUsername = storedSRCUsername || "";
              
              // Clear localStorage after reading
              if (storedDisplayName) {
                localStorage.removeItem(`displayName_${user.uid}`);
              }
              if (storedSRCUsername) {
                localStorage.removeItem(`srcUsername_${user.uid}`);
              }
              
              const newPlayer = {
                uid: user.uid,
                displayName: finalDisplayName,
                email: user.email || "",
                joinDate: today,
                totalRuns: 0,
                bestRank: null,
                favoriteCategory: null,
                favoritePlatform: null,
                nameColor: "#cba6f7",
                isAdmin: false,
                srcUsername: srcUsername || undefined,
              };
              createPlayer(newPlayer).catch(() => {});
            }
          } catch (error) {
            // Silent fail - user is already logged in
          }
          
          // Start refresh interval after initial data fetch
          if (refreshIntervalRef.current) {
            clearInterval(refreshIntervalRef.current);
          }
          refreshIntervalRef.current = setInterval(() => {
            refreshPlayerData(user);
          }, 3000);
        })();
      } else {
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

  const value = {
    currentUser,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};