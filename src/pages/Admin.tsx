"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, ShieldAlert, ExternalLink, Download, PlusCircle, Trash2, Wrench, Edit2, FolderTree, Play, ArrowUp, ArrowDown, Gamepad2, UserPlus, UserMinus, Trophy, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { 
  getUnverifiedLeaderboardEntries, 
  updateRunVerificationStatus, 
  deleteLeaderboardEntry,
  addLeaderboardEntry,
  getPlayerByDisplayName,
  getPlayerByUid,
  setPlayerAdminStatus,
  getDownloadEntries,
  addDownloadEntry,
  deleteDownloadEntry as deleteDownloadEntryDb,
  moveDownloadUp,
  moveDownloadDown,
  getCategoriesFromFirestore,
  addCategory,
  updateCategory,
  deleteCategory,
  moveCategoryUp,
  moveCategoryDown,
  getPlatformsFromFirestore,
  addPlatform,
  updatePlatform,
  deletePlatform,
  movePlatformUp,
  movePlatformDown,
  backfillPointsForAllRuns,
} from "@/lib/db";
import { useUploadThing } from "@/lib/uploadthing";
import { LeaderboardEntry, DownloadEntry } from "@/types/database";
import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { formatTime } from "@/lib/utils";

const downloadCategories = [
  { id: "tools", name: "Tools" },
  { id: "guides", name: "Guides" },
  { id: "save_files", name: "Save Files" },
  { id: "other", name: "Other" },
];

const Admin = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [unverifiedRuns, setUnverifiedRuns] = useState<LeaderboardEntry[]>([]);
  const [downloadEntries, setDownloadEntries] = useState<DownloadEntry[]>([]);
  const [pageLoading, setLoading] = useState(true);
  const [newDownload, setNewDownload] = useState({
    name: "",
    description: "",
    url: "",
    fileUrl: "",
    fileName: "", // Store the selected file name
    category: downloadCategories[0].id,
    useFileUpload: false, // Toggle between URL and file upload
  });
  const [addingDownload, setAddingDownload] = useState(false);
  const [reorderingDownload, setReorderingDownload] = useState<string | null>(null);
  const { startUpload, isUploading } = useUploadThing("downloadFile");
  
  const [firestoreCategories, setFirestoreCategories] = useState<{ id: string; name: string }[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [updatingCategory, setUpdatingCategory] = useState(false);
  const [reorderingCategory, setReorderingCategory] = useState<string | null>(null);
  
  const [firestorePlatforms, setFirestorePlatforms] = useState<{ id: string; name: string }[]>([]);
  const [newPlatformName, setNewPlatformName] = useState("");
  const [editingPlatform, setEditingPlatform] = useState<{ id: string; name: string } | null>(null);
  const [editingPlatformName, setEditingPlatformName] = useState("");
  const [addingPlatform, setAddingPlatform] = useState(false);
  const [updatingPlatform, setUpdatingPlatform] = useState(false);
  const [reorderingPlatform, setReorderingPlatform] = useState<string | null>(null);
  
  const [manualRun, setManualRun] = useState({
    playerName: "",
    playerUsername: "",
    player2Name: "",
    category: "",
    platform: "",
    runType: "solo" as 'solo' | 'co-op',
    time: "",
    date: new Date().toISOString().split('T')[0],
    videoUrl: "",
    comment: "",
    verified: true,
    verifiedBy: "",
  });
  const [addingManualRun, setAddingManualRun] = useState(false);
  const [hasFetchedData, setHasFetchedData] = useState(false);
  
  const [adminUserInput, setAdminUserInput] = useState("");
  const [adminSearchType, setAdminSearchType] = useState<"displayName" | "uid">("displayName");
  const [settingAdmin, setSettingAdmin] = useState(false);
  const [foundPlayer, setFoundPlayer] = useState<{ uid: string; displayName: string; email: string; isAdmin: boolean } | null>(null);
  const [searchingPlayer, setSearchingPlayer] = useState(false);
  const [backfillingPoints, setBackfillingPoints] = useState(false);
  const [activeTab, setActiveTab] = useState("runs");

  useEffect(() => {
    fetchPlatforms();
  }, []);

  useEffect(() => {
    if (firestorePlatforms.length > 0 && !manualRun.platform) {
      setManualRun(prev => ({ ...prev, platform: firestorePlatforms[0].id }));
    }
  }, [firestorePlatforms]);

  const fetchAllData = async () => {
    if (hasFetchedData) return;
    setLoading(true);
    try {
      const [unverifiedData, downloadData, categoriesData] = await Promise.all([
        getUnverifiedLeaderboardEntries(),
        getDownloadEntries(),
        getCategoriesFromFirestore()
      ]);
      setUnverifiedRuns(unverifiedData);
      setDownloadEntries(downloadData);
      setFirestoreCategories(categoriesData);
      setHasFetchedData(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const fetchCategories = async () => {
    try {
      const categoriesData = await getCategoriesFromFirestore();
      setFirestoreCategories(categoriesData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load categories.",
        variant: "destructive",
      });
    }
  };

  const fetchPlatforms = async () => {
    try {
      const platformsData = await getPlatformsFromFirestore();
      setFirestorePlatforms(platformsData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load platforms.",
        variant: "destructive",
      });
    }
  };

  const fetchUnverifiedRuns = async () => {
    try {
      const data = await getUnverifiedLeaderboardEntries();
      setUnverifiedRuns(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load unverified runs.",
        variant: "destructive",
      });
    }
  };

  const fetchDownloadEntries = async () => {
    try {
      const data = await getDownloadEntries();
      setDownloadEntries(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load download entries.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!currentUser) {
        toast({
          title: "Access Denied",
          description: "You must be logged in to view this page.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }
      
      if (!currentUser.isAdmin) {
        toast({
          title: "Access Denied",
          description: "You do not have permission to view this page. Admin status required.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }
      
      if (!hasFetchedData) {
        fetchAllData();
      }
    }
  }, [currentUser?.uid, currentUser?.isAdmin, authLoading]);
  

  const handleVerify = async (runId: string) => {
    if (!currentUser) return;
    try {
      const verifiedBy = currentUser.displayName || currentUser.email || currentUser.uid;
      const success = await updateRunVerificationStatus(runId, true, verifiedBy);
      if (success) {
        toast({
          title: "Run Verified",
          description: "The run has been successfully verified.",
        });
        fetchUnverifiedRuns();
      } else {
        throw new Error("Failed to update verification status.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to verify run.",
        variant: "destructive",
      });
    }
  };

  const handleReject = async (runId: string) => {
    try {
      const success = await deleteLeaderboardEntry(runId);
      if (success) {
        toast({
          title: "Run Rejected and Removed",
          description: "The run has been completely removed.",
        });
        fetchUnverifiedRuns();
      } else {
        throw new Error("Failed to delete run.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject and remove run.",
        variant: "destructive",
      });
    }
  };

  const handleAddDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.uid) {
      toast({
        title: "Error",
        description: "You must be logged in as an admin to add downloads.",
        variant: "destructive",
      });
      return;
    }
    
    // Validate based on upload type
    if (!newDownload.name || !newDownload.description || !newDownload.category) {
      toast({
        title: "Missing Information",
        description: "Please fill in name, description, and category.",
        variant: "destructive",
      });
      return;
    }
    
    if (newDownload.useFileUpload && !newDownload.fileUrl) {
      toast({
        title: "Missing File",
        description: "Please upload a file or provide a URL.",
        variant: "destructive",
      });
      return;
    }
    
    if (!newDownload.useFileUpload && !newDownload.url) {
      toast({
        title: "Missing URL",
        description: "Please provide a URL or upload a file.",
        variant: "destructive",
      });
      return;
    }

    setAddingDownload(true);
    try {
      // Log current state for debugging
      console.log("Current newDownload state:", newDownload);
      
      const downloadEntry: Omit<DownloadEntry, 'id' | 'dateAdded' | 'order'> = {
        name: newDownload.name,
        description: newDownload.description,
        category: newDownload.category,
        ...(newDownload.useFileUpload && newDownload.fileUrl
          ? { fileUrl: newDownload.fileUrl } 
          : newDownload.url
          ? { url: newDownload.url }
          : {}
        ),
      };
      
      console.log("Download entry being saved:", downloadEntry);
      
      const success = await addDownloadEntry(downloadEntry, currentUser.uid);
      if (success) {
        toast({
          title: "Download Added",
          description: "New download entry has been added.",
        });
        setNewDownload({ 
          name: "", 
          description: "", 
          url: "", 
          fileUrl: "",
          fileName: "",
          category: downloadCategories[0].id,
          useFileUpload: false,
        });
        fetchDownloadEntries();
      } else {
        throw new Error("Failed to add download entry.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add download.",
        variant: "destructive",
      });
    } finally {
      setAddingDownload(false);
    }
  };

  const handleDeleteDownload = async (downloadId: string) => {
    if (!window.confirm("Are you sure you want to delete this download entry?")) {
      return;
    }
    try {
      const success = await deleteDownloadEntryDb(downloadId);
      if (success) {
        toast({
          title: "Download Deleted",
          description: "The download entry has been removed.",
        });
        fetchDownloadEntries();
      } else {
        throw new Error("Failed to delete download entry.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete download.",
        variant: "destructive",
      });
    }
  };

  const handleMoveDownloadUp = async (downloadId: string) => {
    if (reorderingDownload) return;
    setReorderingDownload(downloadId);
    try {
      const success = await moveDownloadUp(downloadId);
      if (success) {
        await fetchDownloadEntries();
      } else {
        toast({
          title: "Error",
          description: "Failed to move download up. It may already be at the top.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reorder download.",
        variant: "destructive",
      });
    } finally {
      setReorderingDownload(null);
    }
  };

  const handleMoveDownloadDown = async (downloadId: string) => {
    if (reorderingDownload) return;
    setReorderingDownload(downloadId);
    try {
      const success = await moveDownloadDown(downloadId);
      if (success) {
        await fetchDownloadEntries();
      } else {
        toast({
          title: "Error",
          description: "Failed to move download down. It may already be at the bottom.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reorder download.",
        variant: "destructive",
      });
    } finally {
      setReorderingDownload(null);
    }
  };
  
  // Category management handlers
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      toast({
        title: "Error",
        description: "Category name cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    
    setAddingCategory(true);
    try {
      const result = await addCategory(newCategoryName.trim());
      if (result) {
        toast({
          title: "Category Added",
          description: "New category has been added.",
        });
        setNewCategoryName("");
        fetchCategories();
      } else {
        throw new Error("Category with this name already exists.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add category.",
        variant: "destructive",
      });
    } finally {
      setAddingCategory(false);
    }
  };
  
  const handleStartEditCategory = (category: { id: string; name: string }) => {
    setEditingCategory(category);
    setEditingCategoryName(category.name);
  };
  
  const handleCancelEditCategory = () => {
    setEditingCategory(null);
    setEditingCategoryName("");
  };
  
  const handleSaveEditCategory = async () => {
    if (!editingCategory || !editingCategoryName.trim()) {
      return;
    }
    
    setUpdatingCategory(true);
    try {
      const success = await updateCategory(editingCategory.id, editingCategoryName.trim());
      if (success) {
        toast({
          title: "Category Updated",
          description: "Category has been updated.",
        });
        setEditingCategory(null);
        setEditingCategoryName("");
        fetchCategories();
      } else {
        throw new Error("Another category with this name already exists.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update category.",
        variant: "destructive",
      });
    } finally {
      setUpdatingCategory(false);
    }
  };
  
  const handleDeleteCategory = async (categoryId: string) => {
    if (!window.confirm("Are you sure you want to delete this category? This may affect existing runs.")) {
      return;
    }
    try {
      const success = await deleteCategory(categoryId);
      if (success) {
        toast({
          title: "Category Deleted",
          description: "Category has been removed.",
        });
        await fetchCategories();
      } else {
        throw new Error("Failed to delete category. It may not exist or you may not have permission.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete category.",
        variant: "destructive",
      });
    }
  };

  const handleMoveCategoryUp = async (categoryId: string) => {
    setReorderingCategory(categoryId);
    try {
      const success = await moveCategoryUp(categoryId);
      if (success) {
        await fetchCategories();
      } else {
        toast({
          title: "Cannot Move",
          description: "Category is already at the top.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to move category.",
        variant: "destructive",
      });
    } finally {
      setReorderingCategory(null);
    }
  };

  const handleMoveCategoryDown = async (categoryId: string) => {
    setReorderingCategory(categoryId);
    try {
      const success = await moveCategoryDown(categoryId);
      if (success) {
        await fetchCategories();
      } else {
        toast({
          title: "Cannot Move",
          description: "Category is already at the bottom.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to move category.",
        variant: "destructive",
      });
    } finally {
      setReorderingCategory(null);
    }
  };

  // Platform management handlers
  const handleAddPlatform = async () => {
    if (!newPlatformName.trim()) {
      return;
    }
    setAddingPlatform(true);
    try {
      const platformId = await addPlatform(newPlatformName.trim());
      if (platformId) {
        toast({
          title: "Platform Added",
          description: "Platform has been added.",
        });
        setNewPlatformName("");
        fetchPlatforms();
      } else {
        throw new Error("Another platform with this name already exists.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add platform.",
        variant: "destructive",
      });
    } finally {
      setAddingPlatform(false);
    }
  };

  const handleStartEditPlatform = (platform: { id: string; name: string }) => {
    setEditingPlatform(platform);
    setEditingPlatformName(platform.name);
  };

  const handleCancelEditPlatform = () => {
    setEditingPlatform(null);
    setEditingPlatformName("");
  };

  const handleSaveEditPlatform = async () => {
    if (!editingPlatform || !editingPlatformName.trim()) {
      return;
    }
    
    setUpdatingPlatform(true);
    try {
      const success = await updatePlatform(editingPlatform.id, editingPlatformName.trim());
      if (success) {
        toast({
          title: "Platform Updated",
          description: "Platform has been updated.",
        });
        setEditingPlatform(null);
        setEditingPlatformName("");
        fetchPlatforms();
      } else {
        throw new Error("Another platform with this name already exists.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update platform.",
        variant: "destructive",
      });
    } finally {
      setUpdatingPlatform(false);
    }
  };

  const handleDeletePlatform = async (platformId: string) => {
    if (!window.confirm("Are you sure you want to delete this platform? This may affect existing runs.")) {
      return;
    }
    try {
      const success = await deletePlatform(platformId);
      if (success) {
        toast({
          title: "Platform Deleted",
          description: "Platform has been removed.",
        });
        await fetchPlatforms();
      } else {
        throw new Error("Failed to delete platform. It may not exist or you may not have permission.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete platform.",
        variant: "destructive",
      });
    }
  };

  const handleMovePlatformUp = async (platformId: string) => {
    setReorderingPlatform(platformId);
    try {
      const success = await movePlatformUp(platformId);
      if (success) {
        await fetchPlatforms();
      } else {
        toast({
          title: "Cannot Move",
          description: "Platform is already at the top.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to move platform.",
        variant: "destructive",
      });
    } finally {
      setReorderingPlatform(null);
    }
  };

  const handleMovePlatformDown = async (platformId: string) => {
    setReorderingPlatform(platformId);
    try {
      const success = await movePlatformDown(platformId);
      if (success) {
        await fetchPlatforms();
      } else {
        toast({
          title: "Cannot Move",
          description: "Platform is already at the bottom.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to move platform.",
        variant: "destructive",
      });
    } finally {
      setReorderingPlatform(null);
    }
  };
  
  // Manual run input handler
  const handleSearchPlayer = async () => {
    if (!adminUserInput.trim()) {
      toast({
        title: "Error",
        description: "Please enter a display name or UID.",
        variant: "destructive",
      });
      return;
    }

    setSearchingPlayer(true);
    setFoundPlayer(null);

    try {
      let player = null;
      if (adminSearchType === "displayName") {
        player = await getPlayerByDisplayName(adminUserInput.trim());
      } else {
        player = await getPlayerByUid(adminUserInput.trim());
      }

      if (player) {
        setFoundPlayer({
          uid: player.uid,
          displayName: player.displayName || "",
          email: player.email || "",
          isAdmin: Boolean(player.isAdmin),
        });
      } else {
        toast({
          title: "Player Not Found",
          description: `No player found with ${adminSearchType === "displayName" ? "display name" : "UID"}: ${adminUserInput.trim()}`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to search for player.",
        variant: "destructive",
      });
    } finally {
      setSearchingPlayer(false);
    }
  };

  const handleSetAdminStatus = async (uid: string, isAdmin: boolean) => {
    setSettingAdmin(true);
    try {
      const success = await setPlayerAdminStatus(uid, isAdmin);
      if (success) {
        toast({
          title: "Success",
          description: `Admin status ${isAdmin ? "granted" : "revoked"} successfully.`,
        });
        // Update found player state
        if (foundPlayer && foundPlayer.uid === uid) {
          setFoundPlayer({ ...foundPlayer, isAdmin });
        }
      } else {
        throw new Error("Failed to update admin status.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update admin status.",
        variant: "destructive",
      });
    } finally {
      setSettingAdmin(false);
    }
  };

  const handleAddManualRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?.uid) return;
    
    if (!manualRun.playerName || !manualRun.category || !manualRun.platform || !manualRun.time || !manualRun.date) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    if (manualRun.runType === 'co-op' && !manualRun.player2Name) {
      toast({
        title: "Missing Information",
        description: "Please enter Player 2 name for co-op runs.",
        variant: "destructive",
      });
      return;
    }
    
    setAddingManualRun(true);
    try {
      // Look up the player by display name (if provided) or by playerName
      let playerId: string | null = null;
      
      // Try to find player by display name first (if provided)
      if (manualRun.playerUsername.trim()) {
        const player = await getPlayerByDisplayName(manualRun.playerUsername.trim());
        if (player) {
          playerId = player.uid;
          // Use the player's displayName from database if found
          if (player.displayName && player.displayName !== manualRun.playerName) {
            toast({
              title: "Player Found",
              description: `Using player account: ${player.displayName}`,
            });
          }
        }
      }
      
      // If not found by display name, try to find by playerName
      if (!playerId && manualRun.playerName.trim()) {
        const player = await getPlayerByDisplayName(manualRun.playerName.trim());
        if (player) {
          playerId = player.uid;
        }
      }
      
      // If player still not found, use a generated ID based on player name
      // This ensures runs for non-existent players don't get assigned to admin's account
      if (!playerId) {
        // Generate a unique ID based on player name that won't conflict with real UIDs
        // Real Firebase UIDs are 28 characters, so we'll use a different format
        const nameHash = manualRun.playerName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
        playerId = `unlinked_${nameHash}_${Date.now()}`;
        
        toast({
          title: "Player Not Found",
          description: `Player "${manualRun.playerName}" does not have an account. Run will be submitted but won't be linked to any player profile.`,
          variant: "default",
        });
      }
      
      const entry: any = {
        playerId: playerId,
        playerName: manualRun.playerName,
        category: manualRun.category,
        platform: manualRun.platform,
        runType: manualRun.runType,
        time: manualRun.time,
        date: manualRun.date,
        verified: manualRun.verified,
      };
      
      // Only include optional fields if they have values
      if (manualRun.runType === 'co-op' && manualRun.player2Name && manualRun.player2Name.trim()) {
        entry.player2Name = manualRun.player2Name.trim();
      }
      if (manualRun.videoUrl && manualRun.videoUrl.trim()) {
        entry.videoUrl = manualRun.videoUrl.trim();
      }
      if (manualRun.comment && manualRun.comment.trim()) {
        entry.comment = manualRun.comment.trim();
      }
      if (manualRun.verified) {
        // Use provided verifier or default to current admin
        if (manualRun.verifiedBy && manualRun.verifiedBy.trim()) {
          entry.verifiedBy = manualRun.verifiedBy.trim();
        } else if (currentUser) {
          entry.verifiedBy = currentUser.displayName || currentUser.email || currentUser.uid;
        }
      }
      
      const result = await addLeaderboardEntry(entry);
      if (result) {
        toast({
          title: "Run Added",
          description: "Manual run has been added successfully.",
        });
                        setManualRun({
                          playerName: "",
                          playerUsername: "",
                          player2Name: "",
                          category: "",
                          platform: firestorePlatforms[0]?.id || "",
                          runType: "solo",
                          time: "",
                          date: new Date().toISOString().split('T')[0],
                          videoUrl: "",
                          comment: "",
                          verified: true,
                          verifiedBy: "",
                        });
        fetchUnverifiedRuns();
      } else {
        throw new Error("Failed to add run.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add manual run.",
        variant: "destructive",
      });
    } finally {
      setAddingManualRun(false);
    }
  };

  if (authLoading || pageLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] flex items-center justify-center">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (!currentUser || !currentUser.isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(240,21%,15%)] to-[hsl(235,19%,13%)] text-[hsl(220,17%,92%)] py-6">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-[#cba6f7]/20 blur-3xl rounded-full animate-pulse"></div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2] shadow-lg relative z-10">
                <ShieldAlert className="h-8 w-8 text-[hsl(240,21%,15%)]" />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-[#cba6f7] via-[#f38ba8] to-[#cba6f7] bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">
              Admin Panel
            </h1>
          </div>
          <p className="text-[hsl(222,15%,70%)] max-w-2xl mx-auto text-base animate-fade-in-delay">
            Review and manage submitted speedruns and site resources.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6 bg-[hsl(240,21%,18%)] border border-[hsl(235,13%,30%)] rounded-lg p-1 shadow-lg">
            <TabsTrigger 
              value="runs" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#cba6f7] data-[state=active]:to-[#b4a0e2] data-[state=active]:text-[hsl(240,21%,15%)] data-[state=active]:shadow-lg transition-all duration-300 rounded-md font-medium hover:bg-[hsl(240,21%,20%)]"
            >
              Unverified Runs
            </TabsTrigger>
            <TabsTrigger 
              value="categories" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#cba6f7] data-[state=active]:to-[#b4a0e2] data-[state=active]:text-[hsl(240,21%,15%)] data-[state=active]:shadow-lg transition-all duration-300 rounded-md font-medium hover:bg-[hsl(240,21%,20%)]"
            >
              Categories
            </TabsTrigger>
            <TabsTrigger 
              value="platforms" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#cba6f7] data-[state=active]:to-[#b4a0e2] data-[state=active]:text-[hsl(240,21%,15%)] data-[state=active]:shadow-lg transition-all duration-300 rounded-md font-medium hover:bg-[hsl(240,21%,20%)]"
            >
              Platforms
            </TabsTrigger>
            <TabsTrigger 
              value="downloads" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#cba6f7] data-[state=active]:to-[#b4a0e2] data-[state=active]:text-[hsl(240,21%,15%)] data-[state=active]:shadow-lg transition-all duration-300 rounded-md font-medium hover:bg-[hsl(240,21%,20%)]"
            >
              Downloads
            </TabsTrigger>
            <TabsTrigger 
              value="tools" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#cba6f7] data-[state=active]:to-[#b4a0e2] data-[state=active]:text-[hsl(240,21%,15%)] data-[state=active]:shadow-lg transition-all duration-300 rounded-md font-medium hover:bg-[hsl(240,21%,20%)]"
            >
              Tools
            </TabsTrigger>
          </TabsList>

          {/* Tools Section */}
          <TabsContent value="tools" className="space-y-4 animate-fade-in">
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-[#cba6f7]/20 hover:border-[#cba6f7]/50">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
                    <Wrench className="h-5 w-5 text-[hsl(240,21%,15%)]" />
                  </div>
                  <span className="bg-gradient-to-r from-[#cba6f7] to-[#f38ba8] bg-clip-text text-transparent">
                    System Tools
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-5 bg-gradient-to-br from-[hsl(235,19%,18%)] to-[hsl(235,19%,16%)] rounded-lg border border-[hsl(235,13%,30%)] transition-all duration-300 hover:border-[#FFD700]/50 hover:shadow-lg hover:shadow-[#FFD700]/10">
                    <div className="flex flex-col gap-4">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2 mb-2 text-lg">
                          <div className="p-1 rounded bg-gradient-to-br from-[#FFD700] to-[#FFA500]">
                            <Trophy className="h-4 w-4 text-black" />
                          </div>
                          <span className="bg-gradient-to-r from-[#FFD700] to-[#FFA500] bg-clip-text text-transparent">
                            Backfill Points for All Runs
                          </span>
                        </h3>
                        <p className="text-sm text-[hsl(222,15%,70%)] leading-relaxed">
                          Recalculate and update points for all verified runs using the current points formula. This will also recalculate all players' total points based on their verified runs. Obsolete runs will be excluded.
                        </p>
                        {backfillingPoints && (
                          <p className="text-xs text-[hsl(222,15%,60%)] mt-2 italic flex items-center gap-2">
                            <span className="animate-pulse">●</span>
                            This may take a while depending on the number of runs...
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={async () => {
                          if (!currentUser) return;
                          
                          // Confirmation dialog
                          if (!window.confirm(
                            "This will recalculate points for ALL verified runs and update all player totals. " +
                            "This operation cannot be undone and may take several minutes. Continue?"
                          )) {
                            return;
                          }
                          
                          setBackfillingPoints(true);
                          try {
                            const result = await backfillPointsForAllRuns();
                            if (result.errors.length > 0) {
                              toast({
                                title: "Backfill Complete with Errors",
                                description: `Updated ${result.runsUpdated} runs and ${result.playersUpdated} players. ${result.errors.length} error(s) occurred.`,
                                variant: "destructive",
                              });
                            } else {
                              toast({
                                title: "Backfill Complete",
                                description: `Successfully recalculated points for ${result.runsUpdated} runs and updated ${result.playersUpdated} players.`,
                              });
                            }
                          } catch (error: any) {
                            toast({
                              title: "Error",
                              description: error.message || "Failed to backfill points.",
                              variant: "destructive",
                            });
                          } finally {
                            setBackfillingPoints(false);
                          }
                        }}
                        disabled={backfillingPoints}
                        className="bg-gradient-to-r from-[#FFD700] to-[#FFA500] hover:from-[#FFA500] hover:to-[#FFD700] text-black font-semibold w-full sm:w-auto transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-[#FFD700]/50"
                      >
                        {backfillingPoints ? (
                          <>
                            <LoadingSpinner size="sm" className="mr-2" />
                            Processing Points...
                          </>
                        ) : (
                          <>
                            <Trophy className="h-4 w-4 mr-2" />
                            Recalculate All Points
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Manual Run Input Section */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-[#cba6f7]/20 hover:border-[#cba6f7]/50">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
                    <Play className="h-5 w-5 text-[hsl(240,21%,15%)]" />
                  </div>
                  <span className="bg-gradient-to-r from-[#cba6f7] to-[#f38ba8] bg-clip-text text-transparent">
                    Manually Add Run
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddManualRun} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="manualPlayerName">Player 1 Name *</Label>
                      <Input
                        id="manualPlayerName"
                        type="text"
                        value={manualRun.playerName}
                        onChange={(e) => setManualRun({ ...manualRun, playerName: e.target.value })}
                        placeholder="Player name"
                        required
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      />
                    </div>
                    <div>
                      <Label htmlFor="manualPlayerUsername">Player Username (Optional)</Label>
                      <Input
                        id="manualPlayerUsername"
                        type="text"
                        value={manualRun.playerUsername}
                        onChange={(e) => setManualRun({ ...manualRun, playerUsername: e.target.value })}
                        placeholder="Enter username to link run to account"
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      />
                      <p className="text-sm text-[hsl(222,15%,60%)] mt-1">
                        If provided, the run will be linked to this player's account. If not found, the run will still be added with the provided player name.
                      </p>
                    </div>
                  </div>
                  {manualRun.runType === 'co-op' && (
                    <div>
                      <Label htmlFor="manualPlayer2Name">Player 2 Name *</Label>
                      <Input
                        id="manualPlayer2Name"
                        type="text"
                        value={manualRun.player2Name}
                        onChange={(e) => setManualRun({ ...manualRun, player2Name: e.target.value })}
                        placeholder="Second player name"
                        required={manualRun.runType === 'co-op'}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="manualTime">Completion Time *</Label>
                      <Input
                        id="manualTime"
                        type="text"
                        value={manualRun.time}
                        onChange={(e) => setManualRun({ ...manualRun, time: e.target.value })}
                        placeholder="HH:MM:SS"
                        required
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      />
                    </div>
                    <div>
                      <Label htmlFor="manualDate">Date *</Label>
                      <Input
                        id="manualDate"
                        type="date"
                        value={manualRun.date}
                        onChange={(e) => setManualRun({ ...manualRun, date: e.target.value })}
                        required
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="manualCategory">Category *</Label>
                      <Select
                        value={manualRun.category}
                        onValueChange={(value) => setManualRun({ ...manualRun, category: value })}
                      >
                        <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {firestoreCategories.map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="manualPlatform">Platform *</Label>
                      <Select
                        value={manualRun.platform}
                        onValueChange={(value) => setManualRun({ ...manualRun, platform: value })}
                      >
                        <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                          <SelectValue placeholder="Select platform" />
                        </SelectTrigger>
                        <SelectContent>
                          {firestorePlatforms.map((platform) => (
                            <SelectItem key={platform.id} value={platform.id}>
                              {platform.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="manualRunType">Run Type *</Label>
                      <Select
                        value={manualRun.runType}
                        onValueChange={(value) => setManualRun({ ...manualRun, runType: value as 'solo' | 'co-op' })}
                      >
                        <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                          <SelectValue placeholder="Select run type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="solo">Solo</SelectItem>
                          <SelectItem value="co-op">Co-op</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="manualVideoUrl">Video URL (Optional)</Label>
                    <Input
                      id="manualVideoUrl"
                      type="url"
                      value={manualRun.videoUrl}
                      onChange={(e) => setManualRun({ ...manualRun, videoUrl: e.target.value })}
                      placeholder="https://youtube.com/watch?v=..."
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                    />
                  </div>

                  <div>
                    <Label htmlFor="manualComment">Comment (Optional)</Label>
                    <Textarea
                      id="manualComment"
                      value={manualRun.comment}
                      onChange={(e) => setManualRun({ ...manualRun, comment: e.target.value })}
                      placeholder="Add a comment about the run..."
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="manualVerified"
                      checked={manualRun.verified}
                      onChange={(e) => setManualRun({ ...manualRun, verified: e.target.checked })}
                      className="w-4 h-4 rounded border-[hsl(235,13%,30%)] bg-[hsl(240,21%,15%)]"
                    />
                    <Label htmlFor="manualVerified" className="cursor-pointer">
                      Mark as verified
                    </Label>
                  </div>

                  {manualRun.verified && (
                    <div>
                      <Label htmlFor="manualVerifiedBy">Verifier (Optional)</Label>
                      <Input
                        id="manualVerifiedBy"
                        type="text"
                        value={manualRun.verifiedBy}
                        onChange={(e) => setManualRun({ ...manualRun, verifiedBy: e.target.value })}
                        placeholder="Enter verifier name or UID (defaults to current admin if empty)"
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      />
                      <p className="text-sm text-[hsl(222,15%,60%)] mt-1">
                        Leave empty to use your admin account as the verifier. Enter a name or UID to specify a different verifier.
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={addingManualRun}
                    className="w-full bg-gradient-to-r from-[#cba6f7] via-[#f5c2e7] to-[#cba6f7] hover:from-[#f5c2e7] hover:via-[#cba6f7] hover:to-[#f5c2e7] text-[hsl(240,21%,15%)] font-bold flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-[#cba6f7]/50 animate-gradient bg-[length:200%_auto]"
                  >
                    <PlusCircle className="h-4 w-4" />
                    {addingManualRun ? "Adding..." : "Add Run"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Admin Management Section */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-[#cba6f7]/20 hover:border-[#cba6f7]/50">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
                    <ShieldAlert className="h-5 w-5 text-[hsl(240,21%,15%)]" />
                  </div>
                  <span className="bg-gradient-to-r from-[#cba6f7] to-[#f38ba8] bg-clip-text text-transparent">
                    Manage Admin Status
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex gap-4 items-end">
                    <div className="flex-1">
                      <Label htmlFor="adminSearchType">Search By</Label>
                      <Select value={adminSearchType} onValueChange={(value: "displayName" | "uid") => {
                        setAdminSearchType(value);
                        setFoundPlayer(null);
                        setAdminUserInput("");
                      }}>
                        <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="displayName">Display Name</SelectItem>
                          <SelectItem value="uid">UID</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label htmlFor="adminUserInput">{adminSearchType === "displayName" ? "Display Name" : "UID"}</Label>
                      <Input
                        id="adminUserInput"
                        value={adminUserInput}
                        onChange={(e) => setAdminUserInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSearchPlayer();
                          }
                        }}
                        placeholder={adminSearchType === "displayName" ? "Enter display name" : "Enter UID"}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      />
                    </div>
                    <Button
                      onClick={handleSearchPlayer}
                      disabled={searchingPlayer || !adminUserInput.trim()}
                      className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] hover:from-[#b4a0e2] hover:to-[#cba6f7] text-[hsl(240,21%,15%)] font-bold transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    >
                      {searchingPlayer ? "Searching..." : "Search"}
                    </Button>
                  </div>

                  {foundPlayer && (
                    <div className="bg-gradient-to-br from-[hsl(235,19%,13%)] to-[hsl(235,19%,11%)] border border-[hsl(235,13%,30%)] rounded-lg p-5 space-y-4 shadow-lg transition-all duration-300 animate-fade-in hover:border-[#cba6f7]/50 hover:shadow-xl hover:shadow-[#cba6f7]/10">
                      <div>
                        <h4 className="font-semibold mb-3 text-lg flex items-center gap-2">
                          <div className="p-1 rounded bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
                            <CheckCircle className="h-4 w-4 text-[hsl(240,21%,15%)]" />
                          </div>
                          <span className="bg-gradient-to-r from-[#cba6f7] to-[#f38ba8] bg-clip-text text-transparent">
                            Player Found
                          </span>
                        </h4>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-[hsl(222,15%,60%)]">UID:</span> <code className="text-[#cba6f7]">{foundPlayer.uid}</code></p>
                          <p><span className="text-[hsl(222,15%,60%)]">Display Name:</span> {foundPlayer.displayName || "Not set"}</p>
                          <p><span className="text-[hsl(222,15%,60%)]">Email:</span> {foundPlayer.email || "Not set"}</p>
                          <p>
                            <span className="text-[hsl(222,15%,60%)]">Admin Status:</span>{" "}
                            <Badge variant={foundPlayer.isAdmin ? "default" : "secondary"}>
                              {foundPlayer.isAdmin ? "Admin" : "Not Admin"}
                            </Badge>
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleSetAdminStatus(foundPlayer.uid, true)}
                          disabled={settingAdmin || foundPlayer.isAdmin}
                          className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-600 text-white flex items-center gap-2 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                        >
                          <UserPlus className="h-4 w-4" />
                          Grant Admin
                        </Button>
                        <Button
                          onClick={() => handleSetAdminStatus(foundPlayer.uid, false)}
                          disabled={settingAdmin || !foundPlayer.isAdmin}
                          variant="destructive"
                          className="flex items-center gap-2 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                        >
                          <UserMinus className="h-4 w-4" />
                          Revoke Admin
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Unverified Runs Section */}
          <TabsContent value="runs" className="space-y-4 animate-fade-in">
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-[#cba6f7]/20 hover:border-[#cba6f7]/50">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="text-xl bg-gradient-to-r from-[#cba6f7] to-[#f38ba8] bg-clip-text text-transparent">
                  Unverified Runs
                </CardTitle>
              </CardHeader>
          <CardContent>
            {unverifiedRuns.length === 0 ? (
              <p className="text-[hsl(222,15%,60%)] text-center py-8">No runs awaiting verification.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[hsl(235,13%,30%)] hover:bg-transparent">
                      <TableHead className="py-3 px-4 text-left">Player(s)</TableHead>
                      <TableHead className="py-3 px-4 text-left">Category</TableHead>
                      <TableHead className="py-3 px-4 text-left">Time</TableHead>
                      <TableHead className="py-3 px-4 text-left">Platform</TableHead>
                      <TableHead className="py-3 px-4 text-left">Type</TableHead>
                      <TableHead className="py-3 px-4 text-left">Video</TableHead>
                      <TableHead className="py-3 px-4 text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unverifiedRuns.map((run) => (
                      <TableRow key={run.id} className="border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)] transition-all duration-200 hover:shadow-md">
                        <TableCell className="py-3 px-4 font-medium">
                          <span style={{ color: run.nameColor || 'inherit' }}>{run.playerName}</span>
                          {run.player2Name && (
                            <>
                              <span className="text-muted-foreground"> & </span>
                              <span style={{ color: run.player2Color || 'inherit' }}>{run.player2Name}</span>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="py-3 px-4">{firestoreCategories.find(c => c.id === run.category)?.name || run.category}</TableCell>
                        <TableCell className="py-3 px-4 font-mono">{formatTime(run.time)}</TableCell>
                        <TableCell className="py-3 px-4">{firestorePlatforms.find(p => p.id === run.platform)?.name || run.platform}</TableCell>
                        <TableCell className="py-3 px-4">{run.runType.charAt(0).toUpperCase() + run.runType.slice(1)}</TableCell>
                        <TableCell className="py-3 px-4">
                          {run.videoUrl && (
                            <a href={run.videoUrl} target="_blank" rel="noopener noreferrer" className="text-[#cba6f7] hover:underline flex items-center gap-1">
                              Watch <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-center space-x-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleVerify(run.id)}
                            className="text-green-500 hover:bg-green-900/20 transition-all duration-300 hover:scale-110 hover:shadow-md"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleReject(run.id)}
                            className="text-red-500 hover:bg-red-900/20 transition-all duration-300 hover:scale-110 hover:shadow-md"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

          </TabsContent>

          {/* Category Management Section */}
          <TabsContent value="categories" className="space-y-4 animate-fade-in">
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-[#cba6f7]/20 hover:border-[#cba6f7]/50">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
                    <FolderTree className="h-5 w-5 text-[hsl(240,21%,15%)]" />
                  </div>
                  <span className="bg-gradient-to-r from-[#cba6f7] to-[#f38ba8] bg-clip-text text-transparent">
                    Manage Categories
                  </span>
                </CardTitle>
              </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h3 className="text-base font-semibold mb-3">Add New Category</h3>
                <form onSubmit={handleAddCategory} className="space-y-3">
                  <div>
                    <Label htmlFor="categoryName" className="text-sm">Category Name</Label>
                    <Input
                      id="categoryName"
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g., 100% Glitchless"
                      required
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] h-9 text-sm"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={addingCategory}
                    size="sm"
                    className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] hover:from-[#b4a0e2] hover:to-[#cba6f7] text-[hsl(240,21%,15%)] font-bold flex items-center gap-2 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                  >
                    <PlusCircle className="h-3 w-3" />
                    {addingCategory ? "Adding..." : "Add Category"}
                  </Button>
                </form>
              </div>
              <div>
                <h3 className="text-base font-semibold mb-3">Existing Categories</h3>
                {firestoreCategories.length === 0 ? (
                  <p className="text-[hsl(222,15%,60%)] text-center py-4 text-sm">No categories found. Using default categories.</p>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-[hsl(235,13%,30%)] hover:bg-transparent">
                          <TableHead className="py-2 px-3 text-left text-xs">Name</TableHead>
                          <TableHead className="py-2 px-3 text-center text-xs">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {firestoreCategories.map((category, index) => (
                          <TableRow key={category.id} className="border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)] transition-all duration-200 hover:shadow-sm">
                            <TableCell className="py-2 px-3 font-medium text-sm">
                              {editingCategory?.id === category.id ? (
                                <Input
                                  value={editingCategoryName}
                                  onChange={(e) => setEditingCategoryName(e.target.value)}
                                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] h-8 text-sm"
                                  autoFocus
                                />
                              ) : (
                                category.name
                              )}
                            </TableCell>
                            <TableCell className="py-2 px-3 text-center space-x-1">
                          {editingCategory?.id === category.id ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleSaveEditCategory}
                                disabled={updatingCategory}
                                className="text-green-500 hover:bg-green-900/20"
                              >
                                Save
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancelEditCategory}
                                disabled={updatingCategory}
                                className="text-gray-500 hover:bg-gray-900/20"
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMoveCategoryUp(category.id)}
                              disabled={reorderingCategory === category.id || index === 0}
                              className="text-purple-500 hover:bg-purple-900/20 disabled:opacity-50 h-7 w-7 p-0 transition-all duration-200 hover:scale-110"
                              title="Move up"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMoveCategoryDown(category.id)}
                              disabled={reorderingCategory === category.id || index === firestoreCategories.length - 1}
                              className="text-purple-500 hover:bg-purple-900/20 disabled:opacity-50 h-7 w-7 p-0 transition-all duration-200 hover:scale-110"
                              title="Move down"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStartEditCategory(category)}
                              className="text-blue-500 hover:bg-blue-900/20 h-7 w-7 p-0 transition-all duration-200 hover:scale-110"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteCategory(category.id)}
                              className="text-red-500 hover:bg-red-900/20 h-7 w-7 p-0 transition-all duration-200 hover:scale-110"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          {/* Platform Management Section */}
          <TabsContent value="platforms" className="space-y-4 animate-fade-in">
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-[#cba6f7]/20 hover:border-[#cba6f7]/50">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
                    <Gamepad2 className="h-5 w-5 text-[hsl(240,21%,15%)]" />
                  </div>
                  <span className="bg-gradient-to-r from-[#cba6f7] to-[#f38ba8] bg-clip-text text-transparent">
                    Manage Platforms
                  </span>
                </CardTitle>
              </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h3 className="text-base font-semibold mb-3">Add New Platform</h3>
                <form onSubmit={(e) => { e.preventDefault(); handleAddPlatform(); }} className="space-y-3">
                  <div>
                    <Label htmlFor="platformName" className="text-sm">Platform Name</Label>
                    <Input
                      id="platformName"
                      type="text"
                      value={newPlatformName}
                      onChange={(e) => setNewPlatformName(e.target.value)}
                      placeholder="e.g., Nintendo Switch"
                      required
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] h-9 text-sm"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    disabled={addingPlatform}
                    size="sm"
                    className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] hover:from-[#b4a0e2] hover:to-[#cba6f7] text-[hsl(240,21%,15%)] font-bold flex items-center gap-2 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                  >
                    <PlusCircle className="h-3 w-3" />
                    {addingPlatform ? "Adding..." : "Add Platform"}
                  </Button>
                </form>
              </div>
              <div>
                <h3 className="text-base font-semibold mb-3">Existing Platforms</h3>
                {firestorePlatforms.length === 0 ? (
                  <p className="text-[hsl(222,15%,60%)] text-center py-4 text-sm">No platforms found.</p>
                ) : (
                  <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b border-[hsl(235,13%,30%)] hover:bg-transparent">
                          <TableHead className="py-2 px-3 text-left text-xs">Name</TableHead>
                          <TableHead className="py-2 px-3 text-center text-xs">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {firestorePlatforms.map((platform, index) => (
                          <TableRow key={platform.id} className="border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)] transition-all duration-200 hover:shadow-sm">
                            <TableCell className="py-2 px-3 font-medium text-sm">
                              {editingPlatform?.id === platform.id ? (
                                <Input
                                  value={editingPlatformName}
                                  onChange={(e) => setEditingPlatformName(e.target.value)}
                                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] h-8 text-sm"
                                  autoFocus
                                />
                              ) : (
                                platform.name
                              )}
                            </TableCell>
                            <TableCell className="py-2 px-3 text-center space-x-1">
                              {editingPlatform?.id === platform.id ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSaveEditPlatform}
                                    disabled={updatingPlatform}
                                    className="text-green-500 hover:bg-green-900/20 h-7"
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleCancelEditPlatform}
                                    disabled={updatingPlatform}
                                    className="text-gray-500 hover:bg-gray-900/20 h-7"
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleMovePlatformUp(platform.id)}
                                    disabled={reorderingPlatform === platform.id || index === 0}
                                    className="text-purple-500 hover:bg-purple-900/20 disabled:opacity-50 h-7 w-7 p-0 transition-all duration-200 hover:scale-110"
                                    title="Move up"
                                  >
                                    <ArrowUp className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleMovePlatformDown(platform.id)}
                                    disabled={reorderingPlatform === platform.id || index === firestorePlatforms.length - 1}
                                    className="text-purple-500 hover:bg-purple-900/20 disabled:opacity-50 h-7 w-7 p-0 transition-all duration-200 hover:scale-110"
                                    title="Move down"
                                  >
                                    <ArrowDown className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleStartEditPlatform(platform)}
                                    className="text-blue-500 hover:bg-blue-900/20 h-7 w-7 p-0 transition-all duration-200 hover:scale-110"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeletePlatform(platform.id)}
                                    className="text-red-500 hover:bg-red-900/20 h-7 w-7 p-0 transition-all duration-200 hover:scale-110"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

          </TabsContent>

          {/* Manage Downloads Section */}
          <TabsContent value="downloads" className="space-y-4 animate-fade-in">
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-[#cba6f7]/20 hover:border-[#cba6f7]/50">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-[#cba6f7] to-[#b4a0e2]">
                    <Wrench className="h-5 w-5 text-[hsl(240,21%,15%)]" />
                  </div>
                  <span className="bg-gradient-to-r from-[#cba6f7] to-[#f38ba8] bg-clip-text text-transparent">
                    Manage Downloads
                  </span>
                </CardTitle>
              </CardHeader>
          <CardContent>
            <h3 className="text-xl font-semibold mb-4">Add New Download</h3>
            <form onSubmit={handleAddDownload} className="space-y-4 mb-8">
              <div>
                <Label htmlFor="downloadName">Name</Label>
                <Input
                  id="downloadName"
                  type="text"
                  value={newDownload.name}
                  onChange={(e) => setNewDownload({ ...newDownload, name: e.target.value })}
                  required
                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                />
              </div>
              <div>
                <Label htmlFor="downloadDescription">Description</Label>
                <Textarea
                  id="downloadDescription"
                  value={newDownload.description}
                  onChange={(e) => setNewDownload({ ...newDownload, description: e.target.value })}
                  required
                  className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                  rows={3}
                />
              </div>
              <div>
                <Label>Upload Type</Label>
                <div className="flex gap-4 mb-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!newDownload.useFileUpload}
                      onChange={() => setNewDownload((prev) => ({ ...prev, useFileUpload: false, fileUrl: "", fileName: "" }))}
                      className="w-4 h-4"
                    />
                    <span>External URL</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={newDownload.useFileUpload}
                      onChange={() => setNewDownload((prev) => ({ ...prev, useFileUpload: true, url: "" }))}
                      className="w-4 h-4"
                    />
                    <span>Upload File</span>
                  </label>
                </div>
                {newDownload.useFileUpload ? (
                  <div className="space-y-2">
                    <Label htmlFor="fileUpload">File</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          onClick={async () => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.onchange = async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (!file) return;
                            
                            // Store file name immediately when selected
                            setNewDownload((prev) => ({
                              ...prev,
                              fileName: file.name,
                              useFileUpload: true,
                            }));
                            
                            try {
                              console.log("Starting upload for:", file.name, "Size:", file.size);
                              const uploadedFiles = await startUpload([file]);
                              console.log("Upload result (full):", JSON.stringify(uploadedFiles, null, 2));
                              console.log("Upload result type:", typeof uploadedFiles);
                              console.log("Is array?", Array.isArray(uploadedFiles));
                              
                              // Handle different response structures
                              let fileUrl: string | null = null;
                              
                              if (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
                                // Standard array response
                                fileUrl = uploadedFiles[0]?.url || uploadedFiles[0]?.serverData?.url || null;
                                console.log("File URL from array:", fileUrl);
                              } else if (uploadedFiles && typeof uploadedFiles === 'object') {
                                // Object response - try different possible properties
                                fileUrl = (uploadedFiles as any).url || 
                                         (uploadedFiles as any).fileUrl || 
                                         (uploadedFiles as any)[0]?.url ||
                                         null;
                                console.log("File URL from object:", fileUrl);
                              }
                              
                              if (fileUrl) {
                                console.log("Got fileUrl:", fileUrl);
                                // Use functional update to ensure we have the latest state
                                setNewDownload((prev) => {
                                  const updated = { 
                                    ...prev, 
                                    fileUrl: fileUrl!,
                                    fileName: file.name, // Keep file name
                                    useFileUpload: true // Ensure this is set to true
                                  };
                                  console.log("Updated state:", updated);
                                  return updated;
                                });
                                toast({
                                  title: "File Uploaded",
                                  description: "File uploaded successfully. You can now click 'Add Download' to save it.",
                                });
                              } else {
                                console.error("No file URL found in response:", uploadedFiles);
                                throw new Error("Upload completed but no file URL found in response. Check console for details.");
                              }
                            } catch (error: any) {
                              console.error("Upload error:", error);
                              console.error("Error details:", {
                                message: error.message,
                                stack: error.stack,
                                name: error.name,
                              });
                              toast({
                                title: "Upload Failed",
                                description: error.message || "Failed to upload file. Check console for details.",
                                variant: "destructive",
                              });
                            }
                          };
                          input.click();
                        }}
                          disabled={isUploading}
                          className="bg-[#cba6f7] hover:bg-[#b4a0e2] text-[hsl(240,21%,15%)] font-bold flex items-center gap-2"
                        >
                          <Upload className="h-4 w-4" />
                          {isUploading ? "Uploading..." : "Choose File"}
                        </Button>
                        {newDownload.fileName && (
                          <span className="text-sm text-[hsl(222,15%,70%)] flex items-center gap-2">
                            {newDownload.fileUrl ? (
                              <>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="font-medium">{newDownload.fileName}</span>
                                <span className="text-xs text-[hsl(222,15%,60%)]">(uploaded)</span>
                              </>
                            ) : (
                              <>
                                <span className="font-medium">{newDownload.fileName}</span>
                                <span className="text-xs text-[hsl(222,15%,60%)]">(selected)</span>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    {newDownload.fileUrl && (
                      <p className="text-xs text-[hsl(222,15%,60%)] mt-2 break-all">
                        File URL: {newDownload.fileUrl}
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="downloadUrl">URL</Label>
                    <Input
                      id="downloadUrl"
                      type="url"
                      value={newDownload.url}
                      onChange={(e) => setNewDownload({ ...newDownload, url: e.target.value })}
                      required={!newDownload.useFileUpload}
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                    />
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="downloadCategory">Category</Label>
                <Select value={newDownload.category} onValueChange={(value) => setNewDownload({ ...newDownload, category: value })}>
                  <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {downloadCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button 
                type="submit" 
                disabled={addingDownload}
                className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] hover:from-[#b4a0e2] hover:to-[#cba6f7] text-[hsl(240,21%,15%)] font-bold flex items-center gap-2 transition-all duration-300 hover:scale-105 hover:shadow-lg"
              >
                <PlusCircle className="h-4 w-4" />
                {addingDownload ? "Adding..." : "Add Download"}
              </Button>
            </form>

            <h3 className="text-xl font-semibold mb-4">Existing Downloads</h3>
            {downloadEntries.length === 0 ? (
              <p className="text-[hsl(222,15%,60%)] text-center py-4">No download entries added yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[hsl(235,13%,30%)] hover:bg-transparent">
                      <TableHead className="py-3 px-4 text-left">Order</TableHead>
                      <TableHead className="py-3 px-4 text-left">Name</TableHead>
                      <TableHead className="py-3 px-4 text-left">Category</TableHead>
                      <TableHead className="py-3 px-4 text-left">URL</TableHead>
                      <TableHead className="py-3 px-4 text-left">Added By</TableHead>
                      <TableHead className="py-3 px-4 text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {downloadEntries.map((entry, index) => (
                      <TableRow key={entry.id} className="border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)] transition-all duration-200 hover:shadow-sm">
                        <TableCell className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMoveDownloadUp(entry.id)}
                              disabled={reorderingDownload !== null || index === 0}
                              className="h-8 w-8 p-0 transition-all duration-200 hover:scale-110 hover:bg-purple-900/20 text-purple-500"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleMoveDownloadDown(entry.id)}
                              disabled={reorderingDownload !== null || index === downloadEntries.length - 1}
                              className="h-8 w-8 p-0 transition-all duration-200 hover:scale-110 hover:bg-purple-900/20 text-purple-500"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 px-4 font-medium">{entry.name}</TableCell>
                        <TableCell className="py-3 px-4">{downloadCategories.find(c => c.id === entry.category)?.name || entry.category}</TableCell>
                        <TableCell className="py-3 px-4">
                          {entry.fileUrl ? (
                            <a href={entry.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[#cba6f7] hover:underline flex items-center gap-1">
                              File <Download className="h-4 w-4" />
                            </a>
                          ) : entry.url ? (
                            <a href={entry.url} target="_blank" rel="noopener noreferrer" className="text-[#cba6f7] hover:underline flex items-center gap-1">
                              Link <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="text-[hsl(222,15%,60%)]">No link</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 px-4 text-[hsl(222,15%,60%)]">{entry.addedBy}</TableCell>
                        <TableCell className="py-3 px-4 text-center">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDeleteDownload(entry.id)}
                            className="text-red-500 hover:bg-red-900/20 transition-all duration-200 hover:scale-110"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes gradient {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        
        .animate-fade-in {
          animation: fadeIn 0.6s ease-out forwards;
        }
        
        .animate-fade-in-delay {
          animation: fadeIn 0.8s ease-out 0.2s forwards;
          opacity: 0;
        }
        
        .animate-gradient {
          background-size: 200% auto;
          animation: gradient 3s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default Admin;