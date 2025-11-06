"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Settings, User, Mail, Lock, Palette, Trophy, CheckCircle, Upload, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { updatePlayerProfile, getPlayerByUid, getUnclaimedRunsByUsername, getUnclaimedRunsBySRCUsername, claimRun, getCategories, getPlatforms } from "@/lib/db";
import { updateEmail, updatePassword, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useNavigate, Link } from "react-router-dom";
import { Player, LeaderboardEntry } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatTime } from "@/lib/utils";
import { useUploadThing } from "@/lib/uploadthing";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const UserSettings = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nameColor, setNameColor] = useState("#cba6f7"); // Default color
  const [profilePicture, setProfilePicture] = useState<string>("");
  const [bio, setBio] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [twitchUsername, setTwitchUsername] = useState("");
  const [srcUsername, setSrcUsername] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [unclaimedRuns, setUnclaimedRuns] = useState<LeaderboardEntry[]>([]);
  const [unclaimedSRCRuns, setUnclaimedSRCRuns] = useState<LeaderboardEntry[]>([]);
  const [loadingUnclaimed, setLoadingUnclaimed] = useState(false);
  const [loadingSRCUnclaimed, setLoadingSRCUnclaimed] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [platforms, setPlatforms] = useState<{ id: string; name: string }[]>([]);
  const { startUpload, isUploading } = useUploadThing("profilePicture");

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
          // Fetch categories and platforms for displaying unclaimed runs
          const [fetchedCategories, fetchedPlatforms] = await Promise.all([
            getCategories(),
            getPlatforms(),
          ]);
          setCategories(fetchedCategories);
          setPlatforms(fetchedPlatforms);

          const player = await getPlayerByUid(currentUser.uid);
          if (player) {
            setDisplayName(player.displayName || currentUser.displayName || "");
            setEmail(player.email || currentUser.email || "");
            setNameColor(player.nameColor || "#cba6f7");
            setProfilePicture(player.profilePicture || "");
            setBio(player.bio || "");
            setPronouns(player.pronouns || "");
            setTwitchUsername(player.twitchUsername || "");
            setSrcUsername(player.srcUsername || "");
            // Check for unclaimed runs after loading player data
            if (player.displayName) {
              fetchUnclaimedRuns(player.displayName);
            }
            if (player.srcUsername) {
              fetchUnclaimedSRCRuns(player.srcUsername);
            }
          } else {
            // If player doesn't exist in DB, use Firebase auth data
            setDisplayName(currentUser.displayName || "");
            setEmail(currentUser.email || "");
            setProfilePicture("");
            setBio("");
            setPronouns("");
            setTwitchUsername("");
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
      // Pass currentUserId to filter out already claimed runs
      // This now includes all runs (verified, unverified, manual, imported) that match the username
      const runs = await getUnclaimedRunsByUsername(username, currentUser.uid);
      // Additional client-side filter as backup (though it should already be filtered)
      const trulyUnclaimed = runs.filter(run => run.playerId !== currentUser.uid);
      setUnclaimedRuns(trulyUnclaimed);
    } catch (error) {
      // Silent fail
    } finally {
      setLoadingUnclaimed(false);
    }
  };

  const fetchUnclaimedSRCRuns = async (srcUsername: string) => {
    if (!srcUsername || !currentUser) return;
    setLoadingSRCUnclaimed(true);
    try {
      const runs = await getUnclaimedRunsBySRCUsername(srcUsername, currentUser.uid);
      const trulyUnclaimed = runs.filter(run => run.playerId !== currentUser.uid);
      setUnclaimedSRCRuns(trulyUnclaimed);
    } catch (error) {
      // Silent fail
    } finally {
      setLoadingSRCUnclaimed(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    // Validate displayName
    if (!displayName || !displayName.trim()) {
      toast({
        title: "Invalid Display Name",
        description: "Please enter a display name.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Update Firebase Auth profile if displayName changed
      // Use auth.currentUser instead of currentUser from context to ensure we have the actual Firebase User object
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error("No authenticated user found.");
      }
      
      const newDisplayName = displayName.trim();
      const currentDisplayName = currentUser.displayName || "";
      
      if (newDisplayName !== currentDisplayName) {
        await updateProfile(firebaseUser, { displayName: newDisplayName });
        // Reload the user to refresh auth state
        await firebaseUser.reload();
      }

      // Update Firestore player profile (creates document if it doesn't exist)
      // profilePicture: pass the value directly (empty string will delete, undefined will skip, URL will save)
      const profileData: any = {
        displayName: newDisplayName, 
        nameColor,
        email: currentUser.email || email || "",
        bio: bio.trim() || "",
        pronouns: pronouns.trim() || "",
        twitchUsername: twitchUsername.trim() || "",
        srcUsername: srcUsername.trim() || ""
      };
      
      // Only include profilePicture if it has a value (empty string will delete it)
      if (profilePicture !== undefined) {
        profileData.profilePicture = profilePicture;
      }
      
      const success = await updatePlayerProfile(currentUser.uid, profileData);
      
      // Also update Firebase Auth profile picture if it exists
      if (profilePicture && auth.currentUser) {
        try {
          await updateProfile(auth.currentUser, {
            photoURL: profilePicture
          });
        } catch (error) {
          console.error("Failed to update Firebase Auth photoURL:", error);
          // Don't fail the whole update if this fails
        }
      }

      if (!success) {
        throw new Error("Failed to save profile to database.");
      }

      // Refresh the page data to show updated info immediately
      // Fetch updated player data from Firestore
      const player = await getPlayerByUid(currentUser.uid);
      if (player) {
        // Update local state with the saved data
        setDisplayName(player.displayName || newDisplayName);
        setNameColor(player.nameColor || nameColor);
        setProfilePicture(player.profilePicture || "");
        setBio(player.bio || "");
        setPronouns(player.pronouns || "");
        setTwitchUsername(player.twitchUsername || "");
      } else {
        // Fallback to the new display name if player fetch fails
        setDisplayName(newDisplayName);
      }

      toast({
        title: "Profile Updated",
          description: "Your profile information has been saved.",
        });
      
      // Refresh the auth context by manually triggering a refresh
      // The AuthProvider's refresh interval (every 3 seconds) will pick up the changes,
      // but we can also force an immediate refresh by reloading the page after a short delay
      // to ensure all components (like the header) show the updated display name
      setTimeout(() => {
        window.location.reload();
      }, 1000);

      if (newDisplayName) {
        fetchUnclaimedRuns(newDisplayName);
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
      // Use auth.currentUser instead of currentUser from context
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error("No authenticated user found.");
      }
      
      await updateEmail(firebaseUser, email);
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
      // Use auth.currentUser instead of currentUser from context
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error("No authenticated user found.");
      }
      
      await updatePassword(firebaseUser, newPassword);
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
        // Refresh unclaimed runs lists
        if (displayName) {
          fetchUnclaimedRuns(displayName);
        }
        if (srcUsername) {
          fetchUnclaimedSRCRuns(srcUsername);
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
      <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-ctp-text flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#cba6f7]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e1e2e] text-ctp-text py-8 overflow-x-hidden">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 w-full">
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
            <CardTitle className="flex items-center gap-2 text-ctp-text">
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <Label>Profile Picture</Label>
                <div className="flex items-center gap-4 mb-2">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={profilePicture || `https://api.dicebear.com/7.x/lorelei-neutral/svg?seed=${displayName}`} />
                    <AvatarFallback>{displayName.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;
                          
                          // Validate file size (4MB max)
                          if (file.size > 4 * 1024 * 1024) {
                            toast({
                              title: "File Too Large",
                              description: "Profile picture must be less than 4MB.",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          // Validate file type
                          if (!file.type.startsWith('image/')) {
                            toast({
                              title: "Invalid File Type",
                              description: "Please upload an image file.",
                              variant: "destructive",
                            });
                            return;
                          }
                          
                          try {
                            const uploadedFiles = await startUpload([file]);
                            if (uploadedFiles && uploadedFiles.length > 0) {
                              const fileUrl = uploadedFiles[0]?.url;
                              if (fileUrl) {
                                setProfilePicture(fileUrl);
                                toast({
                                  title: "Profile Picture Uploaded",
                                  description: "Click 'Save Profile' to save your changes.",
                                });
                              }
                            }
                          } catch (error) {
                            toast({
                              title: "Upload Failed",
                              description: "Failed to upload profile picture. Please try again.",
                              variant: "destructive",
                            });
                          }
                        };
                        input.click();
                      }}
                      disabled={isUploading}
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] hover:bg-[hsl(234,14%,29%)]"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {isUploading ? "Uploading..." : "Upload Picture"}
                    </Button>
                    {profilePicture && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setProfilePicture("");
                          toast({
                            title: "Profile Picture Removed",
                            description: "Click 'Save Profile' to save your changes.",
                          });
                        }}
                        className="ml-2 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-ctp-overlay0 mt-1">
                  Upload a profile picture (max 4MB). Click "Save Profile" to apply changes.
                </p>
              </div>
              <div>
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                  required
                />
                <p className="text-sm text-ctp-overlay0 mt-1">
                  Choose a display name that will be displayed on leaderboards and your profile.
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
                <p className="text-sm text-ctp-overlay0 mt-1">
                  This color will be used for your name on leaderboards.
                </p>
              </div>
              <div>
                <Label htmlFor="pronouns">Pronouns</Label>
                <Input
                  id="pronouns"
                  type="text"
                  value={pronouns}
                  onChange={(e) => setPronouns(e.target.value)}
                  placeholder="e.g., they/them, he/him, she/her"
                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                  maxLength={50}
                />
                <p className="text-sm text-ctp-overlay0 mt-1">
                  Your pronouns will be displayed next to your name on your profile.
                </p>
              </div>
              <div>
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] min-h-[100px]"
                  maxLength={500}
                />
                <p className="text-sm text-ctp-overlay0 mt-1">
                  {bio.length}/500 characters. Your bio will be displayed on your profile.
                </p>
              </div>
              <div>
                <Label htmlFor="twitchUsername">Twitch Username</Label>
                <Input
                  id="twitchUsername"
                  type="text"
                  value={twitchUsername}
                  onChange={(e) => setTwitchUsername(e.target.value)}
                  placeholder="e.g., lsw1live"
                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                  maxLength={50}
                />
                <p className="text-sm text-ctp-overlay0 mt-1">
                  Your Twitch username (without @). If you're streaming, you'll appear on the live page when the official stream is offline.
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
            <CardTitle className="flex items-center gap-2 text-ctp-text">
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
            <CardTitle className="flex items-center gap-2 text-ctp-text">
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
            <CardTitle className="flex items-center gap-2 text-ctp-text">
              Claim Your Runs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[hsl(222,15%,60%)] mb-4">
              If runs were added manually with your username before you created an account, or imported from Speedrun.com, you can claim them here to link them to your profile.
            </p>
            
            {/* Display Name Runs */}
            {displayName && (
              <>
                <h3 className="text-sm font-semibold text-ctp-text mb-2 mt-4">Runs matching your display name ({displayName})</h3>
                {loadingUnclaimed ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#cba6f7] mx-auto"></div>
                  </div>
                ) : unclaimedRuns.length === 0 ? (
                  <p className="text-[hsl(222,15%,60%)] text-center py-4">
                    No unclaimed runs found for your display name.
                  </p>
                ) : (
                  <div className="space-y-3 mb-6">
                    {unclaimedRuns.map((run) => (
                      <div
                        key={run.id}
                        className="flex items-center justify-between p-4 bg-[hsl(234,14%,29%)] rounded-lg border border-[hsl(235,13%,30%)]"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-base font-semibold text-[#cba6f7]">
                              {formatTime(run.time)}
                            </span>
                            <Badge variant="outline" className="border-[hsl(235,13%,30%)]">
                              {categories?.find(c => c.id === run.category)?.name || run.category || "Unknown"}
                            </Badge>
                            <Badge variant="outline" className="border-[hsl(235,13%,30%)]">
                              {platforms?.find(p => p.id === run.platform)?.name || run.platform || "Unknown"}
                            </Badge>
                            {run.rank && (
                              <Badge variant={run.rank <= 3 ? "default" : "secondary"}>
                                #{run.rank}
                              </Badge>
                            )}
                            {run.importedFromSRC && (
                              <Badge variant="outline" className="border-[hsl(235,13%,30%)] text-xs">
                                From SRC
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
              </>
            )}
            
            {/* SRC Username Runs */}
            {srcUsername && (
              <>
                <h3 className="text-sm font-semibold text-ctp-text mb-2 mt-4">Runs imported from Speedrun.com ({srcUsername})</h3>
                {loadingSRCUnclaimed ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#cba6f7] mx-auto"></div>
                  </div>
                ) : unclaimedSRCRuns.length === 0 ? (
                  <p className="text-[hsl(222,15%,60%)] text-center py-4">
                    No unclaimed runs found for your SRC username. Make sure you've entered your exact Speedrun.com username above.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {unclaimedSRCRuns.map((run) => (
                      <div
                        key={run.id}
                        className="flex items-center justify-between p-4 bg-[hsl(234,14%,29%)] rounded-lg border border-[hsl(235,13%,30%)]"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-base font-semibold text-[#cba6f7]">
                              {formatTime(run.time)}
                            </span>
                            <Badge variant="outline" className="border-[hsl(235,13%,30%)]">
                              {categories?.find(c => c.id === run.category)?.name || run.srcCategoryName || run.category || "Unknown"}
                            </Badge>
                            <Badge variant="outline" className="border-[hsl(235,13%,30%)]">
                              {platforms?.find(p => p.id === run.platform)?.name || run.srcPlatformName || run.platform || "Unknown"}
                            </Badge>
                            {run.rank && (
                              <Badge variant={run.rank <= 3 ? "default" : "secondary"}>
                                #{run.rank}
                              </Badge>
                            )}
                            <Badge variant="outline" className="border-[hsl(235,13%,30%)] text-xs">
                              From SRC
                            </Badge>
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
              </>
            )}
            
            {!displayName && !srcUsername && (
              <p className="text-[hsl(222,15%,60%)] text-center py-4">
                Set your display name or Speedrun.com username above to find unclaimed runs.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserSettings;