"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, User, Mail, Lock, Palette, Trophy, CheckCircle } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { updatePlayerProfile, getPlayerByUid, getUnclaimedRunsByUsername, claimRun } from "@/lib/db";
import { updateEmail, updatePassword, updateProfile } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import { Player, LeaderboardEntry } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { categories, platforms } from "@/lib/db";

const UserSettings = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nameColor, setNameColor] = useState("#cba6f7"); // Default color
  const [pageLoading, setPageLoading] = useState(true);
  const [unclaimedRuns, setUnclaimedRuns] = useState<LeaderboardEntry[]>([]);
  const [loadingUnclaimed, setLoadingUnclaimed] = useState(false);

  useEffect(() => {
    if (!authLoading) {
      if (!currentUser) {
        toast({
          title: "Authentication Required",
          description: "Please log in to view your settings.",
          variant: "destructive",
        });
        navigate("/"); // Redirect to home or login
        return;
      }

      const fetchPlayerData = async () => {
        setPageLoading(true);
        try {
          const player = await getPlayerByUid(currentUser.uid);
          if (player) {
            setDisplayName(player.displayName || currentUser.displayName || "");
            setEmail(player.email || currentUser.email || "");
            setNameColor(player.nameColor || "#cba6f7");
            // Check for unclaimed runs after loading player data
            if (player.displayName) {
              fetchUnclaimedRuns(player.displayName);
            }
          } else {
            // If player doesn't exist in DB, use Firebase auth data
            setDisplayName(currentUser.displayName || "");
            setEmail(currentUser.email || "");
            // Still check for unclaimed runs using displayName
            if (currentUser.displayName) {
              fetchUnclaimedRuns(currentUser.displayName);
            }
          }
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to load user data.",
            variant: "destructive",
          });
        } finally {
          setPageLoading(false);
        }
      };
      fetchPlayerData();
    }
  }, [currentUser, authLoading, navigate, toast]);

  const fetchUnclaimedRuns = async (username: string) => {
    if (!username || !currentUser) return;
    setLoadingUnclaimed(true);
    try {
      const runs = await getUnclaimedRunsByUsername(username);
      const trulyUnclaimed = runs.filter(run => run.playerId !== currentUser.uid);
      setUnclaimedRuns(trulyUnclaimed);
    } catch (error) {
      // Silent fail
    } finally {
      setLoadingUnclaimed(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    // Validate displayName
    if (!displayName || !displayName.trim()) {
      toast({
        title: "Invalid Username",
        description: "Please enter a username.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Update Firebase Auth profile if displayName changed
      if (displayName.trim() !== (currentUser.displayName || "")) {
        await updateProfile(currentUser, { displayName: displayName.trim() });
      }

      // Update Firestore player profile (creates document if it doesn't exist)
      const success = await updatePlayerProfile(currentUser.uid, { 
        displayName: displayName.trim(), 
        nameColor,
        email: currentUser.email || email || ""
      });

      if (!success) {
        throw new Error("Failed to save profile to database.");
      }

      toast({
        title: "Profile Updated",
        description: "Your profile information has been saved.",
      });
      
      // Refresh the page data to show updated info
      const player = await getPlayerByUid(currentUser.uid);
      if (player) {
        setDisplayName(player.displayName || displayName.trim());
        setNameColor(player.nameColor || nameColor);
      }

      if (displayName.trim()) {
        fetchUnclaimedRuns(displayName.trim());
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (email === currentUser.email) {
      toast({
        title: "No Change",
        description: "The email address is already the same.",
      });
      return;
    }

    try {
      await updateEmail(currentUser, email);
      await updatePlayerProfile(currentUser.uid, { email }); // Update in Firestore as well
      toast({
        title: "Email Updated",
        description: "Your email address has been updated. You may need to re-authenticate.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update email. Please log out and log in again to re-authenticate.",
        variant: "destructive",
      });
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (newPassword !== confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "New password and confirm password do not match.",
        variant: "destructive",
      });
      return;
    }

    // Enhanced password validation
    if (newPassword.length < 8) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      toast({
        title: "Password Requirements Not Met",
        description: "Password must contain at least one uppercase letter.",
        variant: "destructive",
      });
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      toast({
        title: "Password Requirements Not Met",
        description: "Password must contain at least one lowercase letter.",
        variant: "destructive",
      });
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      toast({
        title: "Password Requirements Not Met",
        description: "Password must contain at least one number.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updatePassword(currentUser, newPassword);
      toast({
        title: "Password Updated",
        description: "Your password has been changed successfully.",
      });
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update password. Please log out and log in again to re-authenticate.",
        variant: "destructive",
      });
    }
  };

  const handleClaimRun = async (runId: string) => {
    if (!currentUser?.uid) return;
    
    try {
      const success = await claimRun(runId, currentUser.uid);
      if (success) {
        toast({
          title: "Run Claimed",
          description: "This run has been linked to your account.",
        });
        // Refresh unclaimed runs list
        if (displayName) {
          fetchUnclaimedRuns(displayName);
        }
      } else {
        throw new Error("Failed to claim run.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to claim run.",
        variant: "destructive",
      });
    }
  };

  if (authLoading || pageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#cba6f7]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-4 flex items-center justify-center gap-2">
            <Settings className="h-8 w-8 text-[#cba6f7]" />
            User Settings
          </h1>
          <p className="text-[hsl(222,15%,60%)] max-w-2xl mx-auto">
            Manage your profile, account details, and preferences.
          </p>
        </div>

        {/* Profile Settings */}
        <Card className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <Label htmlFor="displayName">Username</Label>
                <Input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your username"
                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                  required
                />
                <p className="text-sm text-[hsl(222,15%,60%)] mt-1">
                  Choose a username that will be displayed on leaderboards and your profile.
                </p>
              </div>
              <div>
                <Label htmlFor="nameColor">Name Color (Hex Code)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="nameColor"
                    type="color"
                    value={nameColor}
                    onChange={(e) => setNameColor(e.target.value)}
                    className="h-10 w-10 p-0 border-none cursor-pointer"
                    title="Choose your name color"
                  />
                  <Input
                    type="text"
                    value={nameColor}
                    onChange={(e) => setNameColor(e.target.value)}
                    placeholder="#cba6f7"
                    className="flex-grow bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                  />
                </div>
                <p className="text-sm text-[hsl(222,15%,60%)] mt-1">
                  This color will be used for your name on leaderboards.
                </p>
              </div>
              <Button type="submit" className="bg-[#cba6f7] hover:bg-[#b4a0e2] text-[hsl(240,21%,15%)] font-bold">
                Save Profile
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Email Settings */}
        <Card className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Change Email
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateEmail} className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                />
              </div>
              <Button type="submit" className="bg-[#cba6f7] hover:bg-[#b4a0e2] text-[hsl(240,21%,15%)] font-bold">
                Update Email
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Password Settings */}
        <Card className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                />
                <p className="text-xs text-[hsl(222,15%,60%)] mt-1">
                  Password must be at least 8 characters with uppercase, lowercase, and a number.
                </p>
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                />
              </div>
              <Button type="submit" className="bg-[#cba6f7] hover:bg-[#b4a0e2] text-[hsl(240,21%,15%)] font-bold">
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Claim Runs */}
        <Card className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Claim Your Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[hsl(222,15%,60%)] mb-4">
              If runs were added manually with your username before you created an account, you can claim them here to link them to your profile.
            </p>
            {loadingUnclaimed ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#cba6f7] mx-auto"></div>
              </div>
            ) : unclaimedRuns.length === 0 ? (
              <p className="text-[hsl(222,15%,60%)] text-center py-4">
                No unclaimed runs found for your username.
              </p>
            ) : (
              <div className="space-y-3">
                {unclaimedRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between p-4 bg-[hsl(234,14%,29%)] rounded-lg border border-[hsl(235,13%,30%)]"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-lg font-bold text-[#cba6f7]">
                          {run.time}
                        </span>
                        <Badge variant="outline" className="border-[hsl(235,13%,30%)]">
                          {categories.find(c => c.id === run.category)?.name || run.category}
                        </Badge>
                        <Badge variant="outline" className="border-[hsl(235,13%,30%)]">
                          {platforms.find(p => p.id === run.platform)?.name || run.platform}
                        </Badge>
                        {run.rank && (
                          <Badge variant={run.rank <= 3 ? "default" : "secondary"}>
                            #{run.rank}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-[hsl(222,15%,60%)]">
                        {formatDate(run.date)} • {run.runType === 'solo' ? 'Solo' : 'Co-op'}
                        {run.videoUrl && (
                          <Link
                            to={`/run/${run.id}`}
                            className="ml-2 text-[#cba6f7] hover:underline"
                          >
                            View Run
                          </Link>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleClaimRun(run.id)}
                      size="sm"
                      className="bg-[#cba6f7] hover:bg-[#b4a0e2] text-[hsl(240,21%,15%)] font-bold ml-4"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Claim
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserSettings;