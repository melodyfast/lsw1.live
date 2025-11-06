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
import { CheckCircle, XCircle, ShieldAlert, ExternalLink, Download, PlusCircle, Trash2, Wrench, Edit2, FolderTree, Play, ArrowUp, ArrowDown, Gamepad2, UserPlus, UserMinus, Trophy, Upload, Star, Gem, RefreshCw, X, AlertTriangle, Users, Search, Save } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pagination } from "@/components/Pagination";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { 
  getUnverifiedLeaderboardEntries, 
  updateRunVerificationStatus, 
  deleteLeaderboardEntry,
  addLeaderboardEntry,
  updateLeaderboardEntry,
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
  getLevels,
  addLevel,
  updateLevel,
  deleteLevel,
  moveLevelUp,
  moveLevelDown,
  backfillPointsForAllRuns,
  getDownloadCategories,
  getImportedSRCRuns,
  checkSRCRunExists,
  getAllRunsForDuplicateCheck,
  deleteAllImportedSRCRuns,
  getCategories,
  getVerifiedRunsWithInvalidData,
  updateLevelCategoryDisabled,
  getUnassignedRuns,
  findDuplicateRuns,
  removeDuplicateRuns,
  claimRun,
  getRecentRuns,
  getAllPlayers,
  updatePlayer,
  deletePlayer,
} from "@/lib/db";
import { importSRCRuns, type ImportResult } from "@/lib/speedruncom/importService";
import { useUploadThing } from "@/lib/uploadthing";
import { LeaderboardEntry, DownloadEntry, Category, Level } from "@/types/database";
import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { formatTime } from "@/lib/utils";
import { getCategoryName, getPlatformName, getLevelName, normalizeCategoryId, normalizePlatformId, normalizeLevelId } from "@/lib/dataValidation";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, limit as firestoreLimit } from "firebase/firestore";
import { Player } from "@/types/database";

const Admin = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [unverifiedRuns, setUnverifiedRuns] = useState<LeaderboardEntry[]>([]);
  const [importedSRCRuns, setImportedSRCRuns] = useState<LeaderboardEntry[]>([]);
  const [verifiedRunsWithInvalidData, setVerifiedRunsWithInvalidData] = useState<LeaderboardEntry[]>([]);
  const [unassignedRuns, setUnassignedRuns] = useState<LeaderboardEntry[]>([]);
  const [loadingUnassignedRuns, setLoadingUnassignedRuns] = useState(false);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [importingRuns, setImportingRuns] = useState(false);
  const [importProgress, setImportProgress] = useState({ total: 0, imported: 0, skipped: 0 });
  const [editingImportedRun, setEditingImportedRun] = useState<LeaderboardEntry | null>(null);
  const [editingImportedRunForm, setEditingImportedRunForm] = useState<Partial<LeaderboardEntry>>({});
  const [savingImportedRun, setSavingImportedRun] = useState(false);
  const [verifyingRun, setVerifyingRun] = useState<LeaderboardEntry | null>(null);
  const [verifyingRunCategory, setVerifyingRunCategory] = useState<string>("");
  const [verifyingRunPlatform, setVerifyingRunPlatform] = useState<string>("");
  const [verifyingRunLevel, setVerifyingRunLevel] = useState<string>("");
  const [unverifiedPage, setUnverifiedPage] = useState(1);
  const [importedPage, setImportedPage] = useState(1);
  const [clearingImportedRuns, setClearingImportedRuns] = useState(false);
  const [clearingUnverifiedRuns, setClearingUnverifiedRuns] = useState(false);
  const [showConfirmClearUnverifiedDialog, setShowConfirmClearUnverifiedDialog] = useState(false);
  const [batchVerifying, setBatchVerifying] = useState(false);
  const [batchVerifyingAll, setBatchVerifyingAll] = useState(false);
  const [recentRuns, setRecentRuns] = useState<LeaderboardEntry[]>([]);
  const [loadingRecentRuns, setLoadingRecentRuns] = useState(false);
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const itemsPerPage = 25;
  // Filters for imported runs
  const [importedRunsLeaderboardType, setImportedRunsLeaderboardType] = useState<'regular' | 'individual-level'>('regular');
  const [importedRunsCategory, setImportedRunsCategory] = useState("__all__"); // "__all__" = All Categories
  const [importedRunsPlatform, setImportedRunsPlatform] = useState("__all__"); // "__all__" = All Platforms
  const [importedRunsLevel, setImportedRunsLevel] = useState("__all__"); // "__all__" = All Levels
  const [importedRunsRunType, setImportedRunsRunType] = useState<"__all__" | "solo" | "co-op">("__all__"); // "__all__" = All Run Types
  const [importedRunsCategories, setImportedRunsCategories] = useState<{ id: string; name: string }[]>([]);
  const [downloadEntries, setDownloadEntries] = useState<DownloadEntry[]>([]);
  const [pageLoading, setLoading] = useState(true);
  const [newDownload, setNewDownload] = useState({
    name: "",
    description: "",
    url: "",
    fileUrl: "",
    fileName: "", // Store the selected file name
    category: "",
    useFileUpload: false, // Toggle between URL and file upload
  });
  const [addingDownload, setAddingDownload] = useState(false);
  const [reorderingDownload, setReorderingDownload] = useState<string | null>(null);
  const [downloadCategories, setDownloadCategories] = useState<{ id: string; name: string }[]>([]);
  const { startUpload, isUploading } = useUploadThing("downloadFile");
  
  const [firestoreCategories, setFirestoreCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryLeaderboardType, setCategoryLeaderboardType] = useState<'regular' | 'individual-level' | 'community-golds'>('regular');
  const [levelLeaderboardType, setLevelLeaderboardType] = useState<'individual-level' | 'community-golds'>('individual-level');
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
  
  const [newLevelName, setNewLevelName] = useState("");
  const [editingLevel, setEditingLevel] = useState<{ id: string; name: string } | null>(null);
  const [editingLevelName, setEditingLevelName] = useState("");
  const [addingLevel, setAddingLevel] = useState(false);
  const [updatingLevel, setUpdatingLevel] = useState(false);
  const [reorderingLevel, setReorderingLevel] = useState<string | null>(null);
  
  const [manualRunLeaderboardType, setManualRunLeaderboardType] = useState<'regular' | 'individual-level' | 'community-golds'>('regular');
  const [availableLevels, setAvailableLevels] = useState<{ id: string; name: string }[]>([]);
  const [manualRun, setManualRun] = useState({
    playerName: "",
    playerUsername: "",
    player2Name: "",
    category: "",
    level: "",
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
  const [duplicateRuns, setDuplicateRuns] = useState<Array<{ runs: LeaderboardEntry[]; key: string }>>([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [removingDuplicates, setRemovingDuplicates] = useState(false);
  const [activeTab, setActiveTab] = useState("runs");
  
  // User management state
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [playersPage, setPlayersPage] = useState(1);
  const [playersSearchQuery, setPlayersSearchQuery] = useState("");
  const [playersSortBy, setPlayersSortBy] = useState<'joinDate' | 'displayName' | 'totalPoints' | 'totalRuns'>('joinDate');
  const [playersSortOrder, setPlayersSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [editingPlayerForm, setEditingPlayerForm] = useState<Partial<Player>>({});
  const [savingPlayer, setSavingPlayer] = useState(false);
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);
  const [showDeletePlayerDialog, setShowDeletePlayerDialog] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<{ id: string; displayName: string } | null>(null);
  const [deletePlayerRuns, setDeletePlayerRuns] = useState(false);

  useEffect(() => {
    fetchPlatforms();
    fetchCategories('regular'); // Load regular categories by default
    fetchLevels();
    fetchDownloadCategories();
    // Load initial categories for imported runs filter
    const initImportedRunsCategories = async () => {
      try {
        const categoriesData = await getCategories('regular');
        setImportedRunsCategories(categoriesData);
        // Start with "All Categories" selected
        setImportedRunsCategory("__all__");
      } catch (error) {
        // Silent fail
      }
    };
    initImportedRunsCategories();
    // Load initial categories for level management (should match levelLeaderboardType initial state)
    const initLevelCategories = async () => {
      try {
        const categoriesData = await getCategories('individual-level');
        setFirestoreCategories(categoriesData);
      } catch (error) {
        // Silent fail
      }
    };
    initLevelCategories();
  }, []);

  // Fetch categories for imported runs filter when leaderboard type changes
  useEffect(() => {
    const fetchData = async () => {
      try {
        const categoriesData = await getCategories(importedRunsLeaderboardType);
        setImportedRunsCategories(categoriesData);
        // Reset to "All Categories" when switching types
        setImportedRunsCategory("__all__");
        setImportedRunsLevel("__all__"); // Reset level filter
        setImportedPage(1); // Reset to first page
      } catch (error) {
        // Silent fail
      }
    };
    fetchData();
  }, [importedRunsLeaderboardType]);

  // Fetch categories for level management when levelLeaderboardType changes
  useEffect(() => {
    const fetchLevelCategories = async () => {
      try {
        // For community-golds, use community-golds categories (now configurable)
        // For individual-level, use individual-level categories
        const categoriesData = await getCategories(levelLeaderboardType);
        setFirestoreCategories(categoriesData);
      } catch (error) {
        // Silent fail
      }
    };
    fetchLevelCategories();
  }, [levelLeaderboardType]);

  const fetchImportedRunsCategories = async (leaderboardType: 'regular' | 'individual-level') => {
    try {
      const categoriesData = await getCategories(leaderboardType);
      setImportedRunsCategories(categoriesData);
    } catch (error) {
      // Silent fail
    }
  };

  const fetchDownloadCategories = async () => {
    try {
      const categoriesData = await getDownloadCategories();
      setDownloadCategories(categoriesData);
      // Update newDownload category if empty
      if (categoriesData.length > 0 && !newDownload.category) {
        setNewDownload(prev => ({ ...prev, category: categoriesData[0].id }));
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load download categories.",
        variant: "destructive",
      });
    }
  };

  const fetchLevels = async () => {
    try {
      const levelsData = await getLevels();
      setAvailableLevels(levelsData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load levels.",
        variant: "destructive",
      });
    }
  };

  const fetchCategories = async (leaderboardType?: 'regular' | 'individual-level' | 'community-golds') => {
    try {
      const type = leaderboardType || categoryLeaderboardType;
      const categoriesData = await getCategoriesFromFirestore(type);
      setFirestoreCategories(categoriesData);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load categories.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (firestorePlatforms.length > 0 && !manualRun.platform) {
      setManualRun(prev => ({ ...prev, platform: firestorePlatforms[0].id }));
    }
  }, [firestorePlatforms]);

  useEffect(() => {
    if (editingImportedRun) {
      // Initialize form with current values when opening dialog
      // This will only run when editingImportedRun changes (when opening dialog)
      let initialPlatform = editingImportedRun.platform;
      
      // If platform is empty but we have SRC platform name, try to auto-match
      if ((!initialPlatform || initialPlatform.trim() === '') && editingImportedRun.srcPlatformName && firestorePlatforms.length > 0) {
        const matchingPlatform = firestorePlatforms.find(p => 
          p.name.toLowerCase().trim() === editingImportedRun.srcPlatformName!.toLowerCase().trim()
        );
        if (matchingPlatform) {
          initialPlatform = matchingPlatform.id;
        }
      }
      
      // Also try to match category if empty
      let initialCategory = editingImportedRun.category;
      if ((!initialCategory || initialCategory.trim() === '') && editingImportedRun.srcCategoryName && firestoreCategories.length > 0) {
        const categoryType = editingImportedRun.leaderboardType || 'regular';
        const categoriesForType = firestoreCategories.filter(c => {
          const catType = (c as Category).leaderboardType || 'regular';
          return catType === categoryType;
        });
        const matchingCategory = categoriesForType.find(c => 
          c.name.toLowerCase().trim() === editingImportedRun.srcCategoryName!.toLowerCase().trim()
        );
        if (matchingCategory) {
          initialCategory = matchingCategory.id;
        }
      }
      
      // Also try to match level if empty
      let initialLevel = editingImportedRun.level;
      if ((!initialLevel || initialLevel.trim() === '') && editingImportedRun.srcLevelName && availableLevels.length > 0) {
        const matchingLevel = availableLevels.find(l => 
          l.name.toLowerCase().trim() === editingImportedRun.srcLevelName!.toLowerCase().trim()
        );
        if (matchingLevel) {
          initialLevel = matchingLevel.id;
        }
      }
      
      setEditingImportedRunForm({
        playerName: editingImportedRun.playerName,
        player2Name: editingImportedRun.player2Name,
        category: initialCategory,
        platform: initialPlatform,
        runType: editingImportedRun.runType,
        leaderboardType: editingImportedRun.leaderboardType,
        level: initialLevel,
        time: editingImportedRun.time,
        date: editingImportedRun.date,
        videoUrl: editingImportedRun.videoUrl,
        comment: editingImportedRun.comment,
      });

      // Fetch categories for the run's leaderboard type
      const categoryType = editingImportedRun.leaderboardType || 'regular';
      fetchCategories(categoryType);
    } else {
      // Clear form when dialog is closed
      setEditingImportedRunForm({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingImportedRun?.id]); // Only re-initialize when the run ID changes (opening different run)

  useEffect(() => {
    if (verifyingRun) {
      // Start with run's current values
      let initialCategory = verifyingRun.category || "";
      let initialPlatform = verifyingRun.platform || "";
      let initialLevel = verifyingRun.level || "";
      
      // Try to match category by SRC name if we don't have a category ID
      if (!initialCategory && verifyingRun.srcCategoryName) {
        const matchingCategory = firestoreCategories.find(cat => {
          const runLeaderboardType = verifyingRun.leaderboardType || 'regular';
          const catType = (cat as Category).leaderboardType || 'regular';
          return catType === runLeaderboardType && 
                 cat.name.toLowerCase().trim() === verifyingRun.srcCategoryName!.toLowerCase().trim();
        });
        if (matchingCategory) {
          initialCategory = matchingCategory.id;
        }
      }
      
      // Try to match platform by SRC name if we don't have a platform ID
      if (!initialPlatform && verifyingRun.srcPlatformName) {
        const matchingPlatform = firestorePlatforms.find(platform => 
          platform.name.toLowerCase().trim() === verifyingRun.srcPlatformName!.toLowerCase().trim()
        );
        if (matchingPlatform) {
          initialPlatform = matchingPlatform.id;
        }
      }
      
      // Try to match level by SRC name if we don't have a level ID
      if (!initialLevel && verifyingRun.srcLevelName) {
        const matchingLevel = availableLevels.find(level => 
          level.name.toLowerCase().trim() === verifyingRun.srcLevelName!.toLowerCase().trim()
        );
        if (matchingLevel) {
          initialLevel = matchingLevel.id;
        }
      }
      
      setVerifyingRunCategory(initialCategory);
      setVerifyingRunPlatform(initialPlatform);
      setVerifyingRunLevel(initialLevel);
      
      // Fetch categories for the run's leaderboard type
      const categoryType = verifyingRun.leaderboardType || 'regular';
      fetchCategories(categoryType);
    }
  }, [verifyingRun, firestoreCategories, firestorePlatforms, availableLevels]);

  useEffect(() => {
    // Fetch categories when leaderboard type changes for manual run
    // For community-golds, use community-golds categories (now configurable)
    const categoryType = manualRunLeaderboardType;
    fetchCategories(categoryType);
    setManualRun(prev => ({ ...prev, category: "", level: "" })); // Reset category and level when type changes
  }, [manualRunLeaderboardType]);

  const fetchAllData = async () => {
    if (hasFetchedData) return;
    setLoading(true);
    try {
      const [unverifiedData, importedData, downloadData, categoriesData, invalidVerifiedData, unassignedData] = await Promise.all([
        getUnverifiedLeaderboardEntries(),
        getImportedSRCRuns(),
        getDownloadEntries(),
        getCategoriesFromFirestore('regular'),
        getVerifiedRunsWithInvalidData(),
        getUnassignedRuns()
      ]);
      setUnverifiedRuns(unverifiedData.filter(run => !run.importedFromSRC));
      setImportedSRCRuns(importedData);
      setVerifiedRunsWithInvalidData(invalidVerifiedData);
      setUnassignedRuns(unassignedData);
      setDownloadEntries(downloadData);
      setFirestoreCategories(categoriesData);
      setHasFetchedData(true);
    } catch (error) {
      console.error("Error in fetchAllData:", error);
      toast({
        title: "Error",
        description: "Failed to load data.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to refresh all run data
  const refreshAllRunData = async () => {
    try {
      const [unverifiedData, importedData, invalidVerifiedData, unassignedData] = await Promise.all([
        getUnverifiedLeaderboardEntries(),
        getImportedSRCRuns(),
        getVerifiedRunsWithInvalidData(),
        getUnassignedRuns()
      ]);
      // Only include manually submitted runs in unverified runs tab
      // Imported runs stay in their own tab unless they're edited and ready for verification
      setUnverifiedRuns(unverifiedData.filter(run => !run.importedFromSRC));
      setImportedSRCRuns(importedData);
      setVerifiedRunsWithInvalidData(invalidVerifiedData);
      setUnassignedRuns(unassignedData);
      // Also refresh recent runs
      await fetchRecentRuns();
    } catch (error) {
      console.error("Error refreshing run data:", error);
    }
  };

  const fetchUnassignedRuns = async () => {
    setLoadingUnassignedRuns(true);
    try {
      const data = await getUnassignedRuns();
      setUnassignedRuns(data);
      setUnassignedPage(1);
    } catch (error) {
      console.error("Error fetching unassigned runs:", error);
      toast({
        title: "Error",
        description: "Failed to load unassigned runs.",
        variant: "destructive",
      });
    } finally {
      setLoadingUnassignedRuns(false);
    }
  };

  const fetchRecentRuns = async () => {
    setLoadingRecentRuns(true);
    try {
      const data = await getRecentRuns(50); // Fetch 50 most recent runs
      setRecentRuns(data);
    } catch (error) {
      console.error("Error fetching recent runs:", error);
      toast({
        title: "Error",
        description: "Failed to load recent runs.",
        variant: "destructive",
      });
    } finally {
      setLoadingRecentRuns(false);
    }
  };

  const handleDeleteRecentRun = async (runId: string) => {
    if (!window.confirm("Are you sure you want to delete this run? This action cannot be undone.")) {
      return;
    }
    
    setDeletingRunId(runId);
    try {
      const success = await deleteLeaderboardEntry(runId);
      if (success) {
        toast({
          title: "Run Deleted",
          description: "The run has been successfully deleted.",
        });
        // Remove from local state and refresh
        setRecentRuns(prev => prev.filter(run => run.id !== runId));
        await refreshAllRunData();
      } else {
        throw new Error("Failed to delete run.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete run.",
        variant: "destructive",
      });
    } finally {
      setDeletingRunId(null);
    }
  };

  // Fetch recent runs on mount
  useEffect(() => {
    fetchRecentRuns();
  }, []);

  // Fetch data on mount
  useEffect(() => {
    if (!authLoading && currentUser) {
      fetchAllData();
    }
  }, [authLoading, currentUser]);

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
      // Only include manually submitted runs in unverified runs tab
      // Imported runs stay in their own tab
      setUnverifiedRuns(data.filter(run => !run.importedFromSRC));
      setUnverifiedPage(1); // Reset to first page when data changes
      
      try {
        const importedData = await getImportedSRCRuns();
        setImportedSRCRuns(importedData);
        setImportedPage(1); // Reset to first page when data changes
      } catch (importError) {
        console.error("Error fetching imported runs:", importError);
        toast({
          title: "Warning",
          description: "Failed to load imported runs. They may still be processing.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error fetching unverified runs:", error);
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
    // Find the run to verify
    const runToVerify = [...unverifiedRuns, ...importedSRCRuns].find(r => r.id === runId);
    if (!runToVerify) {
      toast({
        title: "Error",
        description: "Run not found.",
        variant: "destructive",
      });
      return;
    }

    // For imported runs or runs missing category/platform, show dialog to select them
    // For complete manual runs, verify directly
    const needsCategory = !runToVerify.category || !runToVerify.platform;
    const isImported = runToVerify.importedFromSRC === true;
    
    if (needsCategory || isImported) {
      setVerifyingRun(runToVerify);
      setVerifyingRunCategory(runToVerify.category || "");
      setVerifyingRunPlatform(runToVerify.platform || "");
      setVerifyingRunLevel(runToVerify.level || "");
      
      // Fetch categories for the run's leaderboard type
      const categoryType = runToVerify.leaderboardType || 'regular';
      fetchCategories(categoryType);
    } else {
      // For complete runs, verify directly
      await verifyRunDirectly(runId, runToVerify);
    }
  };

  const verifyRunDirectly = async (runId: string, run?: LeaderboardEntry) => {
    if (!currentUser) return;
    
    const runToVerify = run || [...unverifiedRuns, ...importedSRCRuns].find(r => r.id === runId);
    if (!runToVerify) return;

    try {
      const verifiedBy = currentUser.displayName || currentUser.email || currentUser.uid;
      
      // Collect all updates needed (category/platform/level from dialog or existing values)
      const updateData: Partial<LeaderboardEntry> = {};
      
      // Use dialog values if set, otherwise use existing run values
      const newCategory = verifyingRunCategory || runToVerify.category;
      const newPlatform = verifyingRunPlatform || runToVerify.platform;
      const newLevel = verifyingRunLevel || runToVerify.level;
      
      // Only update if values changed
      if (newCategory && newCategory !== runToVerify.category) {
        updateData.category = newCategory;
      }
      if (newPlatform && newPlatform !== runToVerify.platform) {
        updateData.platform = newPlatform;
      }
      if ((runToVerify.leaderboardType === 'individual-level' || runToVerify.leaderboardType === 'community-golds') && newLevel && newLevel !== runToVerify.level) {
        updateData.level = newLevel;
      }

      // Don't assign runs to users - they must be claimed first
      // Runs will remain unclaimed until a user claims them

      // Update run data if needed (including player assignment), then verify
      if (Object.keys(updateData).length > 0) {
        await updateLeaderboardEntry(runId, updateData);
      }

      // Verify the run
      const success = await updateRunVerificationStatus(runId, true, verifiedBy);
      if (success) {
        toast({
          title: "Run Verified",
          description: "The run has been successfully verified.",
        });
        setVerifyingRun(null);
        setVerifyingRunCategory("");
        setVerifyingRunPlatform("");
        setVerifyingRunLevel("");
        await refreshAllRunData();
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

  const handleImportFromSRC = async () => {
    if (importingRuns) return;
    
    setImportingRuns(true);
    setImportProgress({ total: 0, imported: 0, skipped: 0 });
    
    try {
      toast({
        title: "Starting Import",
        description: "Fetching runs from speedrun.com...",
      });

      // Use the new import service
      const result: ImportResult = await importSRCRuns((progress) => {
        setImportProgress(progress);
      });
      
      // Show summary with unmatched player warnings
      const unmatchedCount = result.unmatchedPlayers.size;
      if (result.errors.length > 0) {
        // Show first 3 errors in toast, log all errors to console
        const errorPreview = result.errors.slice(0, 3).join('; ');
        const remainingErrors = result.errors.length - 3;
        console.error(`[Import] ${result.errors.length} errors occurred:`, result.errors);
        
        toast({
          title: "Import Complete with Errors",
          description: `Imported ${result.imported} runs, skipped ${result.skipped} runs. ${result.errors.length} error(s) occurred.${remainingErrors > 0 ? ` (Showing first 3, check console for all)` : ''} ${errorPreview}`,
          variant: "destructive",
        });
      } else if (unmatchedCount > 0) {
        toast({
          title: "Import Complete",
          description: `Imported ${result.imported} runs, skipped ${result.skipped} duplicates or invalid runs. ${unmatchedCount} run(s) have player names that don't match any players on the site.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Import Complete",
          description: `Imported ${result.imported} runs, skipped ${result.skipped} duplicates or invalid runs.`,
        });
      }

      // Refresh the runs list
      await refreshAllRunData();
    } catch (error: any) {
      console.error("Error importing from SRC:", error);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import runs from speedrun.com.",
        variant: "destructive",
      });
    } finally {
      setImportingRuns(false);
    }
  };

  const handleClearImportedRuns = async () => {
    if (!window.confirm("Are you sure you want to delete all imported runs from speedrun.com? This action cannot be undone.")) {
      return;
    }

    setClearingImportedRuns(true);
    try {
      const result = await deleteAllImportedSRCRuns();
      
      if (result.errors.length > 0) {
        // Check if there are permission errors
        const hasPermissionError = result.errors.some(err => 
          err.toLowerCase().includes('permission') || 
          err.toLowerCase().includes('insufficient') ||
          err.toLowerCase().includes('missing')
        );
        
        if (hasPermissionError && result.deleted === 0) {
          toast({
            title: "Permission Error",
            description: "You don't have permission to delete imported runs. Please check your admin status.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Some Errors Occurred",
            description: `${result.deleted} runs deleted, but some errors occurred: ${result.errors.slice(0, 3).join('; ')}${result.errors.length > 3 ? '...' : ''}`,
            variant: "destructive",
          });
        }
      }
      
      if (result.deleted > 0) {
        toast({
          title: "Imported Runs Cleared",
          description: `Successfully deleted ${result.deleted} imported runs.`,
        });
        
        // Refresh the runs list
        await fetchUnverifiedRuns();
      } else if (result.errors.length === 0) {
        toast({
          title: "No Runs to Delete",
          description: "No imported runs were found to delete.",
        });
      }
    } catch (error: any) {
      console.error("Error clearing imported runs:", error);
      const errorMsg = error.message || String(error);
      const isPermissionError = errorMsg.toLowerCase().includes('permission') || 
                                errorMsg.toLowerCase().includes('insufficient') ||
                                errorMsg.toLowerCase().includes('missing');
      
      toast({
        title: isPermissionError ? "Permission Error" : "Error",
        description: isPermissionError 
          ? "You don't have permission to delete imported runs. Please ensure you are logged in as an admin."
          : (errorMsg || "Failed to clear imported runs."),
        variant: "destructive",
      });
    } finally {
      setClearingImportedRuns(false);
    }
  };

  const handleBatchVerify = async () => {
    if (!currentUser) return;
    
    // Get the 10 most recent unverified imported runs for the current tab
    let unverifiedImported = importedSRCRuns.filter(r => r.verified !== true);
    
    // Filter by the current tab (Full Game vs Individual Levels)
    unverifiedImported = unverifiedImported.filter(run => {
      const runLeaderboardType = run.leaderboardType || 'regular';
      return runLeaderboardType === importedRunsLeaderboardType;
    });
    
    // Sort by date (most recent first) and take top 10
    unverifiedImported = unverifiedImported
      .sort((a, b) => {
        // Sort by date (most recent first)
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date.localeCompare(a.date);
      })
      .slice(0, 10);

    if (unverifiedImported.length === 0) {
      const tabName = importedRunsLeaderboardType === 'regular' ? 'Full Game' : 'Individual Levels';
      toast({
        title: "No Runs to Verify",
        description: `There are no unverified imported ${tabName} runs to verify.`,
        variant: "default",
      });
      return;
    }

    setBatchVerifying(true);
    const verifiedBy = currentUser.displayName || currentUser.email || currentUser.uid;
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      for (const run of unverifiedImported) {
        try {
          if (!run.id) {
            errors.push(`Run missing ID: ${run.playerName || 'Unknown'}`);
            errorCount++;
            continue;
          }

          // Don't assign runs to users - they must be claimed first
          // Just verify the run without assigning playerId/player2Id

          // Verify the run
          const success = await updateRunVerificationStatus(run.id, true, verifiedBy);
          if (success) {
            successCount++;
          } else {
            errors.push(`Failed to verify run: ${run.playerName || 'Unknown'}`);
            errorCount++;
          }
        } catch (error: any) {
          errors.push(`Error verifying ${run.playerName || 'Unknown'}: ${error.message || String(error)}`);
          errorCount++;
        }
      }

      // Show summary toast
      if (successCount > 0 && errorCount === 0) {
        toast({
          title: "Batch Verification Complete",
          description: `Successfully verified ${successCount} run(s).`,
        });
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: "Batch Verification Partial Success",
          description: `Verified ${successCount} run(s), ${errorCount} error(s). Check console for details.`,
          variant: "default",
        });
        console.error("Batch verify errors:", errors);
      } else {
        toast({
          title: "Batch Verification Failed",
          description: `Failed to verify all runs. Check console for details.`,
          variant: "destructive",
        });
        console.error("Batch verify errors:", errors);
      }

      // Refresh the runs list
      await refreshAllRunData();
    } catch (error: any) {
      console.error("Error in batch verify:", error);
      toast({
        title: "Batch Verification Error",
        description: error.message || "An error occurred during batch verification.",
        variant: "destructive",
      });
    } finally {
      setBatchVerifying(false);
    }
  };

  const handleBatchVerifyAll = async () => {
    if (!currentUser) return;
    
    // Apply the same filtering logic as the table
    let unverifiedImported = importedSRCRuns.filter(r => r.verified !== true);
    
    // Apply leaderboardType filter
    unverifiedImported = unverifiedImported.filter(run => {
      const runLeaderboardType = run.leaderboardType || 'regular';
      return runLeaderboardType === importedRunsLeaderboardType;
    });
    
    // Apply category filter (only if a category is selected)
    if (importedRunsCategory && importedRunsCategory !== '__all__') {
      unverifiedImported = unverifiedImported.filter(run => {
        const runCategory = normalizeCategoryId(run.category);
        return runCategory === importedRunsCategory;
      });
    }
    
    // Apply platform filter (only if a platform is selected)
    if (importedRunsPlatform && importedRunsPlatform !== '__all__') {
      unverifiedImported = unverifiedImported.filter(run => {
        const runPlatform = normalizePlatformId(run.platform);
        return runPlatform === importedRunsPlatform;
      });
    }
    
    // Apply level filter for ILs (only if a level is selected)
    if (importedRunsLeaderboardType === 'individual-level' && importedRunsLevel && importedRunsLevel !== '__all__') {
      unverifiedImported = unverifiedImported.filter(run => {
        const runLevel = normalizeLevelId(run.level);
        return runLevel === importedRunsLevel;
      });
    }
    
    // Apply run type filter (solo/co-op)
    if (importedRunsRunType && importedRunsRunType !== '__all__') {
      unverifiedImported = unverifiedImported.filter(run => {
        const runRunType = run.runType || 'solo';
        return runRunType === importedRunsRunType;
      });
    }
    
    // Sort by date (most recent first)
    unverifiedImported.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    if (unverifiedImported.length === 0) {
      toast({
        title: "No Runs to Verify",
        description: "There are no unverified imported runs matching the current filters.",
        variant: "default",
      });
      return;
    }

    setBatchVerifyingAll(true);
    const verifiedBy = currentUser.displayName || currentUser.email || currentUser.uid;
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      for (const run of unverifiedImported) {
        try {
          if (!run.id) {
            errors.push(`Run missing ID: ${run.playerName || 'Unknown'}`);
            errorCount++;
            continue;
          }

          // Don't assign runs to users - they must be claimed first
          // Just verify the run without assigning playerId/player2Id

          // Verify the run
          const success = await updateRunVerificationStatus(run.id, true, verifiedBy);
          if (success) {
            successCount++;
          } else {
            errors.push(`Failed to verify run: ${run.playerName || 'Unknown'}`);
            errorCount++;
          }
        } catch (error: any) {
          errors.push(`Error verifying ${run.playerName || 'Unknown'}: ${error.message || String(error)}`);
          errorCount++;
        }
      }

      // Show summary toast
      if (successCount > 0 && errorCount === 0) {
        toast({
          title: "Batch Verification Complete",
          description: `Successfully verified ${successCount} run(s).`,
        });
      } else if (successCount > 0 && errorCount > 0) {
        toast({
          title: "Batch Verification Partial Success",
          description: `Verified ${successCount} run(s), ${errorCount} error(s). Check console for details.`,
          variant: "default",
        });
        console.error("Batch verify all errors:", errors);
      } else {
        toast({
          title: "Batch Verification Failed",
          description: `Failed to verify all runs. Check console for details.`,
          variant: "destructive",
        });
        console.error("Batch verify all errors:", errors);
      }

      // Refresh the runs list
      await refreshAllRunData();
    } catch (error: any) {
      console.error("Error in batch verify all:", error);
      toast({
        title: "Batch Verification Error",
        description: error.message || "An error occurred during batch verification.",
        variant: "destructive",
      });
    } finally {
      setBatchVerifyingAll(false);
    }
  };

  const handleClearUnverifiedRuns = async () => {
    if (!currentUser?.isAdmin) {
      toast({
        title: "Permission Denied",
        description: "You must be an admin to clear unverified runs.",
        variant: "destructive",
      });
      return;
    }

    setShowConfirmClearUnverifiedDialog(false);
    setClearingUnverifiedRuns(true);
    
    try {
      // Delete all unverified runs (non-imported)
      const runsToDelete = unverifiedRuns.filter(run => !run.importedFromSRC);
      
      if (runsToDelete.length === 0) {
        toast({
          title: "No Runs to Delete",
          description: "No unverified runs found to delete.",
        });
        setClearingUnverifiedRuns(false);
        return;
      }

      let deletedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const run of runsToDelete) {
        try {
          const success = await deleteLeaderboardEntry(run.id);
          if (success) {
            deletedCount++;
          } else {
            errorCount++;
            errors.push(`Failed to delete run ${run.id}`);
          }
        } catch (error: any) {
          errorCount++;
          errors.push(`Error deleting run ${run.id}: ${error.message || String(error)}`);
        }
      }

      if (deletedCount > 0) {
        toast({
          title: "Runs Cleared",
          description: `Successfully deleted ${deletedCount} unverified run(s).${errorCount > 0 ? ` ${errorCount} error(s) occurred.` : ''}`,
          variant: errorCount > 0 ? "destructive" : "default",
        });
        
        // Refresh the runs list
        await fetchUnverifiedRuns();
      } else if (errorCount > 0) {
        toast({
          title: "Clear Failed",
          description: `Failed to delete any runs. ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? ` and ${errors.length - 3} more.` : ''}`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error clearing unverified runs:", error);
      const errorMsg = error.message || String(error);
      const isPermissionError = errorMsg.toLowerCase().includes('permission') || 
                                errorMsg.toLowerCase().includes('insufficient') ||
                                errorMsg.toLowerCase().includes('missing');
      
      toast({
        title: isPermissionError ? "Permission Error" : "Error",
        description: isPermissionError 
          ? "You don't have permission to delete unverified runs. Please ensure you are logged in as an admin."
          : (errorMsg || "Failed to clear unverified runs."),
        variant: "destructive",
      });
    } finally {
      setClearingUnverifiedRuns(false);
    }
  };

  const handleSaveImportedRun = async () => {
    if (!editingImportedRun) return;
    
    // Validate required fields (matching SubmitRun validation)
    const finalForm = {
      playerName: editingImportedRunForm.playerName ?? editingImportedRun.playerName,
      player2Name: editingImportedRunForm.player2Name ?? editingImportedRun.player2Name,
      category: editingImportedRunForm.category ?? editingImportedRun.category,
      platform: editingImportedRunForm.platform ?? editingImportedRun.platform,
      runType: editingImportedRunForm.runType ?? editingImportedRun.runType,
      leaderboardType: editingImportedRunForm.leaderboardType ?? editingImportedRun.leaderboardType,
      level: editingImportedRunForm.level ?? editingImportedRun.level,
      time: editingImportedRunForm.time ?? editingImportedRun.time,
      date: editingImportedRunForm.date ?? editingImportedRun.date,
      videoUrl: editingImportedRunForm.videoUrl ?? editingImportedRun.videoUrl,
      comment: editingImportedRunForm.comment ?? editingImportedRun.comment,
    };
    
    // Validate required fields
    if (!finalForm.playerName || !finalForm.playerName.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter a player name.",
        variant: "destructive",
      });
      return;
    }
    
    if (!finalForm.category || !finalForm.category.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a category.",
        variant: "destructive",
      });
      return;
    }
    
    if (!finalForm.platform || !finalForm.platform.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a platform.",
        variant: "destructive",
      });
      return;
    }
    
    if (!finalForm.runType) {
      toast({
        title: "Missing Information",
        description: "Please select a run type.",
        variant: "destructive",
      });
      return;
    }
    
    if (!finalForm.time || !finalForm.time.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter a time.",
        variant: "destructive",
      });
      return;
    }
    
    if (!finalForm.date || !finalForm.date.trim()) {
      toast({
        title: "Missing Information",
        description: "Please select a date.",
        variant: "destructive",
      });
      return;
    }
    
    // For ILs and Community Golds, level is required
    if ((finalForm.leaderboardType === 'individual-level' || finalForm.leaderboardType === 'community-golds') && (!finalForm.level || !finalForm.level.trim())) {
      toast({
        title: "Missing Information",
        description: "Please select a level for Individual Level or Community Gold runs.",
        variant: "destructive",
      });
      return;
    }
    
    // For co-op runs, player2Name is required
    if (finalForm.runType === 'co-op' && (!finalForm.player2Name || !finalForm.player2Name.trim())) {
      toast({
        title: "Missing Information",
        description: "Please enter the second player's name for co-op runs.",
        variant: "destructive",
      });
      return;
    }
    
    setSavingImportedRun(true);
    try {
      const updateData: Partial<LeaderboardEntry> = {
        playerName: finalForm.playerName.trim(),
        category: finalForm.category.trim(),
        platform: finalForm.platform.trim(),
        runType: finalForm.runType,
        leaderboardType: finalForm.leaderboardType,
        time: finalForm.time.trim(),
        date: finalForm.date.trim(),
        verified: false, // Ensure it remains unverified after editing
      };

      // Add optional fields only if they have values
      if (finalForm.player2Name && finalForm.player2Name.trim()) {
        updateData.player2Name = finalForm.player2Name.trim();
      } else if (finalForm.runType === 'co-op') {
        // For co-op, ensure player2Name is set (shouldn't reach here due to validation)
        updateData.player2Name = finalForm.player2Name?.trim() || '';
      }
      
      if (finalForm.level && finalForm.level.trim()) {
        updateData.level = finalForm.level.trim();
      }
      
      if (finalForm.videoUrl && finalForm.videoUrl.trim()) {
        updateData.videoUrl = finalForm.videoUrl.trim();
      }
      
      if (finalForm.comment && finalForm.comment.trim()) {
        updateData.comment = finalForm.comment.trim();
      }

      const success = await updateLeaderboardEntry(editingImportedRun.id, updateData);
      if (success) {
        toast({
          title: "Run Updated",
          description: "The run has been updated successfully.",
        });
        // Update the local state instead of full refresh to avoid breaking the UI
        setImportedSRCRuns(prev => prev.map(run => 
          run.id === editingImportedRun.id 
            ? { ...run, ...updateData }
            : run
        ));
        // Also update unverified runs if this run is there
        setUnverifiedRuns(prev => prev.map(run => 
          run.id === editingImportedRun.id 
            ? { ...run, ...updateData }
            : run
        ));
        // Close dialog and reset form
        setEditingImportedRun(null);
        setEditingImportedRunForm({});
      } else {
        throw new Error("Failed to update run");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update imported run.",
        variant: "destructive",
      });
    } finally {
      setSavingImportedRun(false);
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
      const downloadEntry: Omit<DownloadEntry, 'id' | 'dateAdded' | 'order'> = {
        name: newDownload.name,
        description: newDownload.description,
        category: newDownload.category,
        addedBy: currentUser.uid,
        ...(newDownload.useFileUpload && newDownload.fileUrl
          ? { fileUrl: newDownload.fileUrl } 
          : newDownload.url
          ? { url: newDownload.url }
          : {}
        ),
      };
      
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
      const result = await addCategory(newCategoryName.trim(), categoryLeaderboardType);
      if (result) {
        toast({
          title: "Category Added",
          description: "New category has been added.",
        });
        setNewCategoryName("");
        fetchCategories(categoryLeaderboardType);
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
        fetchCategories(categoryLeaderboardType);
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
        await fetchCategories(categoryLeaderboardType);
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
        await fetchCategories(categoryLeaderboardType);
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
        await fetchCategories(categoryLeaderboardType);
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

  // Level management handlers
  const handleAddLevel = async () => {
    if (!newLevelName.trim()) {
      return;
    }
    setAddingLevel(true);
    try {
      const levelId = await addLevel(newLevelName.trim());
      if (levelId) {
        toast({
          title: "Level Added",
          description: "Level has been added.",
        });
        setNewLevelName("");
        await fetchLevels();
      } else {
        throw new Error("Another level with this name already exists.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add level.",
        variant: "destructive",
      });
    } finally {
      setAddingLevel(false);
    }
  };

  const handleStartEditLevel = (level: { id: string; name: string }) => {
    setEditingLevel(level);
    setEditingLevelName(level.name);
  };

  const handleCancelEditLevel = () => {
    setEditingLevel(null);
    setEditingLevelName("");
  };

  const handleSaveEditLevel = async () => {
    if (!editingLevel || !editingLevelName.trim()) {
      return;
    }
    
    setUpdatingLevel(true);
    try {
      const success = await updateLevel(editingLevel.id, editingLevelName.trim());
      if (success) {
        toast({
          title: "Level Updated",
          description: "Level has been updated.",
        });
        setEditingLevel(null);
        setEditingLevelName("");
        await fetchLevels();
      } else {
        throw new Error("Another level with this name already exists.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update level.",
        variant: "destructive",
      });
    } finally {
      setUpdatingLevel(false);
    }
  };

  const handleDeleteLevel = async (levelId: string) => {
    if (!window.confirm("Are you sure you want to delete this level? This may affect existing runs.")) {
      return;
    }
    try {
      const success = await deleteLevel(levelId);
      if (success) {
        toast({
          title: "Level Deleted",
          description: "Level has been removed.",
        });
        await fetchLevels();
      } else {
        throw new Error("Failed to delete level. It may not exist or you may not have permission.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete level.",
        variant: "destructive",
      });
    }
  };

  const handleMoveLevelUp = async (levelId: string) => {
    setReorderingLevel(levelId);
    try {
      const success = await moveLevelUp(levelId);
      if (success) {
        await fetchLevels();
      } else {
        toast({
          title: "Cannot Move",
          description: "Level is already at the top.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to move level.",
        variant: "destructive",
      });
    } finally {
      setReorderingLevel(null);
    }
  };

  const handleMoveLevelDown = async (levelId: string) => {
    setReorderingLevel(levelId);
    try {
      const success = await moveLevelDown(levelId);
      if (success) {
        await fetchLevels();
      } else {
        toast({
          title: "Cannot Move",
          description: "Level is already at the bottom.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to move level.",
        variant: "destructive",
      });
    } finally {
      setReorderingLevel(null);
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
        // Refresh players list if on users tab
        if (activeTab === "users") {
          fetchPlayers();
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

  // User management functions
  const fetchPlayers = async () => {
    setLoadingPlayers(true);
    try {
      const players = await getAllPlayers(playersSortBy, playersSortOrder);
      setAllPlayers(players);
    } catch (error) {
      console.error("Error fetching players:", error);
      toast({
        title: "Error",
        description: "Failed to load users.",
        variant: "destructive",
      });
    } finally {
      setLoadingPlayers(false);
    }
  };

  useEffect(() => {
    if (activeTab === "users") {
      fetchPlayers();
    }
  }, [activeTab, playersSortBy, playersSortOrder]);

  // Auto-run duplicate checking when tools tab is opened
  useEffect(() => {
    if (activeTab === "tools" && !loadingDuplicates && duplicateRuns.length === 0) {
      const checkDuplicates = async () => {
        setLoadingDuplicates(true);
        try {
          const duplicates = await findDuplicateRuns();
          setDuplicateRuns(duplicates);
        } catch (error: any) {
          console.error("Error auto-checking duplicates:", error);
          // Don't show toast on auto-check, only on manual check
        } finally {
          setLoadingDuplicates(false);
        }
      };
      checkDuplicates();
    }
  }, [activeTab]);

  const handleEditPlayer = (player: Player) => {
    setEditingPlayer(player);
    setEditingPlayerForm({
      displayName: player.displayName || "",
      email: player.email || "",
      isAdmin: player.isAdmin || false,
      nameColor: player.nameColor || "#cba6f7",
      bio: player.bio || "",
      pronouns: player.pronouns || "",
      twitchUsername: player.twitchUsername || "",
      srcUsername: player.srcUsername || "",
    });
  };

  const handleSavePlayer = async () => {
    if (!editingPlayer) return;
    
    setSavingPlayer(true);
    try {
      const success = await updatePlayer(editingPlayer.id, editingPlayerForm);
      if (success) {
        toast({
          title: "Success",
          description: "User updated successfully.",
        });
        setEditingPlayer(null);
        setEditingPlayerForm({});
        fetchPlayers();
      } else {
        throw new Error("Failed to update user.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update user.",
        variant: "destructive",
      });
    } finally {
      setSavingPlayer(false);
    }
  };

  const handleDeletePlayerClick = (player: Player) => {
    setPlayerToDelete({ id: player.id, displayName: player.displayName || "Unknown" });
    setShowDeletePlayerDialog(true);
  };

  const handleDeletePlayer = async () => {
    if (!playerToDelete) return;
    
    setDeletingPlayerId(playerToDelete.id);
    try {
      const result = await deletePlayer(playerToDelete.id, deletePlayerRuns);
      if (result.success) {
        toast({
          title: "User Deleted",
          description: `User deleted successfully.${result.deletedRuns ? ` ${result.deletedRuns} runs were also deleted.` : ""}`,
        });
        setShowDeletePlayerDialog(false);
        setPlayerToDelete(null);
        setDeletePlayerRuns(false);
        fetchPlayers();
      } else {
        throw new Error(result.error || "Failed to delete user.");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user.",
        variant: "destructive",
      });
    } finally {
      setDeletingPlayerId(null);
    }
  };

  // Filter and paginate players
  const filteredPlayers = allPlayers.filter(player => {
    if (!playersSearchQuery.trim()) return true;
    const query = playersSearchQuery.toLowerCase();
    return (
      player.displayName?.toLowerCase().includes(query) ||
      player.email?.toLowerCase().includes(query) ||
      player.uid?.toLowerCase().includes(query) ||
      player.twitchUsername?.toLowerCase().includes(query) ||
      player.srcUsername?.toLowerCase().includes(query)
    );
  });

  const paginatedPlayers = filteredPlayers.slice(
    (playersPage - 1) * itemsPerPage,
    playersPage * itemsPerPage
  );

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

    // For ILs and Community Golds, level is required
    if ((manualRunLeaderboardType === 'individual-level' || manualRunLeaderboardType === 'community-golds') && !manualRun.level) {
      toast({
        title: "Missing Information",
        description: "Please select a level.",
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
      
      // If player still not found, use empty string for unclaimed runs
      // This ensures runs for non-existent players don't get assigned to admin's account
      if (!playerId) {
        playerId = ""; // Empty string indicates unclaimed run
        
        toast({
          title: "Player Not Found",
          description: `Player "${manualRun.playerName}" does not have an account. Run will be submitted but won't be linked to any player profile until claimed.`,
          variant: "default",
        });
      }
      
      const entry: any = {
        playerId: playerId,
        playerName: manualRun.playerName,
        category: manualRun.category,
        platform: manualRun.platform,
        runType: manualRun.runType,
        leaderboardType: manualRunLeaderboardType,
        time: manualRun.time,
        date: manualRun.date,
        verified: manualRun.verified,
      };
      
      // Only include optional fields if they have values
      if (manualRun.runType === 'co-op' && manualRun.player2Name && manualRun.player2Name.trim()) {
        entry.player2Name = manualRun.player2Name.trim();
      }
      if ((manualRunLeaderboardType === 'individual-level' || manualRunLeaderboardType === 'community-golds') && manualRun.level) {
        entry.level = manualRun.level;
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
                          level: "",
                          platform: firestorePlatforms[0]?.id || "",
                          runType: "solo",
                          time: "",
                          date: new Date().toISOString().split('T')[0],
                          videoUrl: "",
                          comment: "",
                          verified: true,
                          verifiedBy: "",
                        });
                        setManualRunLeaderboardType('regular');
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
    <div className="min-h-screen bg-[#1e1e2e] text-ctp-text py-4 sm:py-6 overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 w-full">
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex items-center justify-center gap-2 mb-4">
            <ShieldAlert className="h-6 w-6 text-[#f2cdcd]" />
            <h1 className="text-3xl md:text-4xl font-bold text-[#f2cdcd]">
            Admin Panel
          </h1>
          </div>
          <p className="text-base text-ctp-subtext1 max-w-3xl mx-auto animate-fade-in-delay">
            Review and manage submitted speedruns and site resources.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex w-full mb-6 p-0.5 gap-1 overflow-x-auto overflow-y-hidden scrollbar-hide" style={{ minWidth: 'max-content' }}>
            <TabsTrigger 
              value="runs" 
              className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
            >
              Unverified Runs
            </TabsTrigger>
            <TabsTrigger 
              value="categories" 
              className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
            >
              Categories
            </TabsTrigger>
            <TabsTrigger 
              value="levels" 
              className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
            >
              Levels
            </TabsTrigger>
            <TabsTrigger 
              value="platforms" 
              className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
            >
              Platforms
            </TabsTrigger>
            <TabsTrigger 
              value="downloads" 
              className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
            >
              Downloads
            </TabsTrigger>
            <TabsTrigger 
              value="users" 
              className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
            >
              Users
            </TabsTrigger>
            <TabsTrigger 
              value="src" 
              className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
            >
              SRC Tools
            </TabsTrigger>
            <TabsTrigger 
              value="tools" 
              className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
            >
              Tools
            </TabsTrigger>
          </TabsList>

          {/* Tools Section */}
          <TabsContent value="tools" className="space-y-4 animate-fade-in">
            {/* Recalculate Points Card */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                  <span>
                      Recalculate All Points
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <p className="text-sm text-ctp-subtext1 leading-relaxed mb-4">
                      Recalculate and update points for all verified runs using the current points formula. This will also recalculate all players' total points based on their verified runs. Includes all run types (Full Game, Individual Levels, Community Golds). Obsolete runs receive base points only.
                    </p>
                    {backfillingPoints && (
                  <p className="text-xs text-ctp-overlay0 mb-4 italic flex items-center gap-2">
                    <span className="animate-pulse">●</span>
                        This may take a while depending on the number of runs...
                      </p>
                    )}
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
                            title: "Recalculation Complete with Errors",
                            description: `Updated ${result.runsUpdated} runs and ${result.playersUpdated} players. ${result.errors.length} error(s) occurred.`,
                            variant: "destructive",
                          });
                        } else {
                          toast({
                            title: "Recalculation Complete",
                            description: `Successfully recalculated points for ${result.runsUpdated} runs and updated ${result.playersUpdated} players.`,
                          });
                        }
                      } catch (error: any) {
                        toast({
                          title: "Error",
                          description: error.message || "Failed to recalculate points.",
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
              </CardContent>
            </Card>

            {/* Duplicate Detection Card */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                  <span>
                    Duplicate Run Detection
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <p className="text-sm text-ctp-subtext1 leading-relaxed mb-4">
                  Find and remove duplicate runs from the database. Duplicates are detected based on player names, category, platform, run type, time, leaderboard type, and level. When removing duplicates, the system keeps the best run (verified over unverified, older date over newer).
                </p>
                
                {duplicateRuns.length > 0 && (
                  <div className="mb-4 space-y-4">
                    <div className="p-4 bg-[hsl(240,21%,12%)] rounded-lg border border-[hsl(235,13%,30%)]">
                      <p className="text-sm font-semibold text-ctp-text mb-2">
                        Found {duplicateRuns.length} duplicate group(s) with {duplicateRuns.reduce((sum, group) => sum + group.runs.length, 0)} total runs
                      </p>
                      <p className="text-xs text-ctp-subtext1">
                        {duplicateRuns.reduce((sum, group) => sum + group.runs.length - 1, 0)} run(s) will be removed (keeping the best one from each group).
                      </p>
                    </div>
                    
                    {/* Duplicate Runs Table */}
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-[hsl(235,13%,30%)] hover:bg-transparent">
                            <TableHead className="py-3 px-4 text-left">Group</TableHead>
                            <TableHead className="py-3 px-4 text-left">Player(s)</TableHead>
                            <TableHead className="py-3 px-4 text-left">Category</TableHead>
                            <TableHead className="py-3 px-4 text-left">Platform</TableHead>
                            <TableHead className="py-3 px-4 text-left">Time</TableHead>
                            <TableHead className="py-3 px-4 text-left">Date</TableHead>
                            <TableHead className="py-3 px-4 text-left">Verified</TableHead>
                            <TableHead className="py-3 px-4 text-left">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {duplicateRuns.map((group, groupIdx) => {
                            // Sort runs to show which will be kept first
                            const sortedRuns = [...group.runs].sort((a, b) => {
                              if (a.verified && !b.verified) return -1;
                              if (!a.verified && b.verified) return 1;
                              if (a.date && b.date) {
                                const dateCompare = a.date.localeCompare(b.date);
                                if (dateCompare !== 0) return dateCompare;
                              }
                              return a.id.localeCompare(b.id);
                            });
                            
                            return sortedRuns.map((run, runIdx) => {
                              const willBeKept = runIdx === 0;
                              const categoryName = getCategoryName(run.category, firestoreCategories, run.srcCategoryName);
                              const platformName = getPlatformName(run.platform, firestorePlatforms, run.srcPlatformName);
                              
                              return (
                                <TableRow 
                                  key={run.id} 
                                  className={`border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)] ${willBeKept ? 'bg-green-900/10' : 'bg-red-900/10'}`}
                                >
                                  <TableCell className="py-3 px-4">
                                    <Badge variant={willBeKept ? "default" : "destructive"} className="text-xs">
                                      {groupIdx + 1}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="py-3 px-4">
                                    <div className="flex flex-col gap-1">
                                      <span style={{ color: run.nameColor || 'inherit' }}>{run.playerName || "Unknown"}</span>
                                      {run.player2Name && (
                                        <span className="text-muted-foreground text-sm">
                                          & <span style={{ color: run.player2Color || 'inherit' }}>{run.player2Name}</span>
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-3 px-4">{categoryName || "—"}</TableCell>
                                  <TableCell className="py-3 px-4">{platformName || "—"}</TableCell>
                                  <TableCell className="py-3 px-4 font-mono">{formatTime(run.time || '00:00:00')}</TableCell>
                                  <TableCell className="py-3 px-4">{run.date || "—"}</TableCell>
                                  <TableCell className="py-3 px-4">
                                    {run.verified ? (
                                      <Badge variant="default" className="bg-green-600/20 text-green-400 border-green-600/50">
                                        Verified
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary">Unverified</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-3 px-4">
                                    <div className="flex items-center gap-2">
                                      {willBeKept && (
                                        <Badge variant="outline" className="border-green-600/50 bg-green-600/10 text-green-400 text-xs">
                                          Will Keep
                                        </Badge>
                                      )}
                                      {!willBeKept && (
                                        <Badge variant="outline" className="border-red-600/50 bg-red-600/10 text-red-400 text-xs">
                                          Will Remove
                                        </Badge>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => navigate(`/run/${run.id}`)}
                                        className="text-blue-500 hover:bg-blue-900/20"
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            });
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={async () => {
                      setLoadingDuplicates(true);
                      try {
                        const duplicates = await findDuplicateRuns();
                        setDuplicateRuns(duplicates);
                        if (duplicates.length === 0) {
                          toast({
                            title: "No Duplicates Found",
                            description: "No duplicate runs were found in the database.",
                          });
                        } else {
                          toast({
                            title: "Duplicates Found",
                            description: `Found ${duplicates.length} duplicate group(s) with ${duplicates.reduce((sum, group) => sum + group.runs.length, 0)} total runs.`,
                          });
                        }
                      } catch (error: any) {
                        toast({
                          title: "Error",
                          description: error.message || "Failed to find duplicate runs.",
                          variant: "destructive",
                        });
                      } finally {
                        setLoadingDuplicates(false);
                      }
                    }}
                    disabled={loadingDuplicates}
                    className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] hover:from-[#b4a0e2] hover:to-[#cba6f7] text-[hsl(240,21%,15%)] font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-[#cba6f7]/50"
                  >
                    {loadingDuplicates ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Find Duplicates
                      </>
                    )}
                  </Button>
                  
                  {duplicateRuns.length > 0 && (
                    <Button
                      onClick={async () => {
                        if (!window.confirm(
                          `This will remove ${duplicateRuns.reduce((sum, group) => sum + group.runs.length - 1, 0)} duplicate run(s). ` +
                          "This operation cannot be undone. Continue?"
                        )) {
                          return;
                        }
                        
                        setRemovingDuplicates(true);
                        try {
                          const result = await removeDuplicateRuns(duplicateRuns);
                          if (result.errors.length > 0) {
                            toast({
                              title: "Removal Complete with Errors",
                              description: `Removed ${result.removed} duplicate run(s). ${result.errors.length} error(s) occurred.`,
                              variant: "destructive",
                            });
                          } else {
                            toast({
                              title: "Duplicates Removed",
                              description: `Successfully removed ${result.removed} duplicate run(s).`,
                            });
                          }
                          setDuplicateRuns([]);
                        } catch (error: any) {
                          toast({
                            title: "Error",
                            description: error.message || "Failed to remove duplicate runs.",
                            variant: "destructive",
                          });
                        } finally {
                          setRemovingDuplicates(false);
                        }
                      }}
                      disabled={removingDuplicates}
                      variant="destructive"
                      className="font-semibold transition-all duration-300 hover:scale-105 hover:shadow-xl"
                    >
                      {removingDuplicates ? (
                        <>
                          <LoadingSpinner size="sm" className="mr-2" />
                          Removing...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove Duplicates
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent Runs Card */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                    <Play className="h-5 w-5" />
                    <span>Recent Runs</span>
                  </CardTitle>
                  <Button
                    onClick={fetchRecentRuns}
                    disabled={loadingRecentRuns}
                    variant="outline"
                    size="sm"
                    className="border-[hsl(235,13%,30%)] bg-gradient-to-r from-transparent via-[hsl(237,16%,24%)]/50 to-transparent hover:from-[hsl(237,16%,24%)] hover:via-[hsl(237,16%,28%)] hover:to-[hsl(237,16%,24%)] hover:border-[#cba6f7]/50"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loadingRecentRuns ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {loadingRecentRuns ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="md" />
                  </div>
                ) : recentRuns.length === 0 ? (
                  <p className="text-sm text-ctp-subtext1 text-center py-8">
                    No recent runs found.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-[hsl(235,13%,30%)]">
                          <TableHead className="text-ctp-text">Date</TableHead>
                          <TableHead className="text-ctp-text">Player(s)</TableHead>
                          <TableHead className="text-ctp-text">Time</TableHead>
                          <TableHead className="text-ctp-text">Category</TableHead>
                          <TableHead className="text-ctp-text">Platform</TableHead>
                          <TableHead className="text-ctp-text">Type</TableHead>
                          <TableHead className="text-ctp-text">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentRuns.map((run) => {
                          const categoryName = getCategoryName(run.category, firestoreCategories, run.srcCategoryName);
                          const platformName = getPlatformName(run.platform, firestorePlatforms, run.srcPlatformName);
                          const isUnclaimed = !run.playerId || run.playerId.trim() === "";
                          
                          return (
                            <TableRow key={run.id} className="border-[hsl(235,13%,30%)]">
                              <TableCell className="text-ctp-text">{run.date}</TableCell>
                              <TableCell className="text-ctp-text">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span style={{ color: run.nameColor || '#cba6f7' }}>
                                    {run.playerName || "Unknown"}
                                  </span>
                                  {run.player2Name && (
                                    <>
                                      <span className="text-ctp-overlay0">&</span>
                                      <span style={{ color: run.player2Color || '#cba6f7' }}>
                                        {run.player2Name}
                                      </span>
                                    </>
                                  )}
                                  {isUnclaimed && (
                                    <Badge variant="outline" className="border-yellow-600/50 bg-yellow-600/10 text-yellow-400 text-xs">
                                      Unclaimed
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-ctp-text font-mono">{formatTime(run.time)}</TableCell>
                              <TableCell className="text-ctp-text">{categoryName}</TableCell>
                              <TableCell className="text-ctp-text">{platformName}</TableCell>
                              <TableCell className="text-ctp-text">
                                <Badge variant="outline" className="border-[hsl(235,13%,30%)]">
                                  {run.runType === 'co-op' ? 'Co-op' : 'Solo'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button
                                  onClick={() => handleDeleteRecentRun(run.id)}
                                  disabled={deletingRunId === run.id}
                                  variant="destructive"
                                  size="sm"
                                  className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border-red-600/50"
                                >
                                  {deletingRunId === run.id ? (
                                    <>
                                      <LoadingSpinner size="sm" className="mr-2" />
                                      Deleting...
                                    </>
                                  ) : (
                                    <>
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Delete
                                    </>
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Manual Run Input Section */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                  <span>
                    Manually Add Run
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
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

                  {/* Leaderboard Type Tabs */}
                  <div>
                    <Label className="text-sm font-semibold mb-2 block">Leaderboard Type *</Label>
                    <Tabs value={manualRunLeaderboardType} onValueChange={(value) => {
                      setManualRunLeaderboardType(value as 'regular' | 'individual-level' | 'community-golds');
                      setManualRun(prev => ({ ...prev, category: "", level: "" }));
                    }}>
                      <TabsList className="grid w-full grid-cols-3 p-0.5 gap-1">
                        <TabsTrigger 
                          value="regular" 
                          className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
                        >
                          <Trophy className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
                          <span className="hidden min-[375px]:inline">Full Game</span>
                          <span className="min-[375px]:hidden">Game</span>
                        </TabsTrigger>
                        <TabsTrigger 
                          value="individual-level" 
                          className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
                        >
                          <Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
                          <span className="hidden sm:inline">Individual Levels</span>
                          <span className="sm:hidden">ILs</span>
                        </TabsTrigger>
                        <TabsTrigger 
                          value="community-golds"
                          className="data-[state=active]:bg-[#f9e2af] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#f9e2af]/50 text-xs sm:text-sm py-1.5 sm:py-2 px-2 sm:px-3 whitespace-nowrap"
                        >
                          <Gem className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
                          <span className="hidden sm:inline">Community Golds</span>
                          <span className="sm:hidden">Golds</span>
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {/* Category Selection - Tabs */}
                  {firestoreCategories.length > 0 && (
                    <div>
                      <Label className="text-sm font-semibold mb-2 block">
                        {manualRunLeaderboardType === 'individual-level' ? 'Category Type *' : 
                         manualRunLeaderboardType === 'community-golds' ? 'Full Game Category *' : 
                         'Category *'}
                      </Label>
                      <Tabs value={manualRun.category} onValueChange={(value) => setManualRun({ ...manualRun, category: value })}>
                        <TabsList className="flex w-full p-0.5 gap-1 overflow-x-auto overflow-y-hidden scrollbar-hide" style={{ minWidth: 'max-content' }}>
                          {firestoreCategories.map((category, index) => (
                            <TabsTrigger 
                              key={category.id} 
                              value={category.id} 
                              className="data-[state=active]:bg-[#94e2d5] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#94e2d5]/50 py-2 px-3 text-sm"
                              style={{ animationDelay: `${index * 50}ms` }}
                            >
                              {category.name}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                      </Tabs>
                    </div>
                  )}

                  {/* Level Selection for ILs and Community Golds */}
                  {(manualRunLeaderboardType === 'individual-level' || manualRunLeaderboardType === 'community-golds') && (
                    <div>
                      <Label htmlFor="manualLevel">Level *</Label>
                      <Select
                        value={manualRun.level}
                        onValueChange={(value) => setManualRun({ ...manualRun, level: value })}
                      >
                        <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableLevels.map((level) => (
                            <SelectItem key={level.id} value={level.id}>
                              {level.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                  <span>
                    Manage Admin Status
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
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

        {/* SRC Tools Section */}
          <TabsContent value="src" className="space-y-4 animate-fade-in">
            {/* Import Runs from SRC */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                    <Upload className="h-5 w-5" />
                    <span>Import Runs from Speedrun.com</span>
                  </CardTitle>
                  {importedSRCRuns.filter(r => !r.verified).length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearImportedRuns}
                      disabled={clearingImportedRuns}
                      className="bg-red-900/20 border-red-700/50 text-red-400 hover:bg-red-900/30 hover:border-red-600 transition-all duration-300"
                    >
                      {clearingImportedRuns ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Clearing...
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 mr-2" />
                          Clear All Imported
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Import Section */}
                <div className="space-y-4 pb-6 pt-2 border-b border-[hsl(235,13%,30%)]">
                  <p className="text-[hsl(222,15%,60%)]">
                    Import runs from speedrun.com that aren't on the leaderboards. 
                    Runs will be added as unverified and can be edited or rejected.
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    <Button
                      onClick={handleImportFromSRC}
                      disabled={importingRuns}
                      className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] hover:from-[#b4a0e2] hover:to-[#cba6f7] text-[hsl(240,21%,15%)] font-bold transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    >
                      {importingRuns ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Import Runs
                        </>
                      )}
                    </Button>
                    {importedSRCRuns.filter(r => r.verified !== true).length > 0 && (
                      <>
                        <Button
                          onClick={handleBatchVerify}
                          disabled={batchVerifying || batchVerifyingAll || importingRuns}
                          className="bg-gradient-to-r from-[#94e2d5] to-[#74c7b0] hover:from-[#74c7b0] hover:to-[#94e2d5] text-[hsl(240,21%,15%)] font-bold transition-all duration-300 hover:scale-105 hover:shadow-lg"
                        >
                          {batchVerifying ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Verifying...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Batch Verify 10 Most Recent
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={handleBatchVerifyAll}
                          disabled={batchVerifying || batchVerifyingAll || importingRuns}
                          className="bg-gradient-to-r from-[#a6e3a1] to-[#86c77a] hover:from-[#86c77a] hover:to-[#a6e3a1] text-[hsl(240,21%,15%)] font-bold transition-all duration-300 hover:scale-105 hover:shadow-lg"
                        >
                          {batchVerifyingAll ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Verifying All...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Batch Verify All in Tab
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                  {importingRuns && importProgress.total > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-[hsl(222,15%,60%)]">
                        <span>Progress: {importProgress.imported + importProgress.skipped} / {importProgress.total}</span>
                        <span>Imported: {importProgress.imported} | Skipped: {importProgress.skipped}</span>
                      </div>
                      <div className="w-full bg-[hsl(235,19%,13%)] rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${((importProgress.imported + importProgress.skipped) / importProgress.total) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Imported Runs List - Same content as before */}
                {(() => {
                  // Filter unverified imported runs
                  let unverifiedImported = importedSRCRuns.filter(r => r.verified !== true);
                  
                  // Apply leaderboardType filter
                  unverifiedImported = unverifiedImported.filter(run => {
                    const runLeaderboardType = run.leaderboardType || 'regular';
                    return runLeaderboardType === importedRunsLeaderboardType;
                  });
                  
                  // Apply category filter (only if a category is selected)
                  if (importedRunsCategory && importedRunsCategory !== '__all__') {
                    unverifiedImported = unverifiedImported.filter(run => {
                      const runCategory = normalizeCategoryId(run.category);
                      return runCategory === importedRunsCategory;
                    });
                  }
                  
                  // Apply platform filter (only if a platform is selected)
                  if (importedRunsPlatform && importedRunsPlatform !== '__all__') {
                    unverifiedImported = unverifiedImported.filter(run => {
                      const runPlatform = normalizePlatformId(run.platform);
                      return runPlatform === importedRunsPlatform;
                    });
                  }
                  
                  // Apply level filter for ILs (only if a level is selected)
                  if (importedRunsLeaderboardType === 'individual-level' && importedRunsLevel && importedRunsLevel !== '__all__') {
                    unverifiedImported = unverifiedImported.filter(run => {
                      const runLevel = normalizeLevelId(run.level);
                      return runLevel === importedRunsLevel;
                    });
                  }
                  
                  // Apply run type filter (solo/co-op)
                  if (importedRunsRunType && importedRunsRunType !== '__all__') {
                    unverifiedImported = unverifiedImported.filter(run => {
                      const runRunType = run.runType || 'solo';
                      return runRunType === importedRunsRunType;
                    });
                  }
                  
                  // Sort by date (most recent first) - ensure sorting is maintained after filtering
                  unverifiedImported.sort((a, b) => {
                    // Handle missing dates
                    if (!a.date && !b.date) return 0;
                    if (!a.date) return 1; // Missing date goes to end
                    if (!b.date) return -1; // Missing date goes to end
                    
                    // Compare dates (YYYY-MM-DD format)
                    // Most recent first = descending order
                    return b.date.localeCompare(a.date);
                  });
                  
                  // Calculate counts for tabs (before category/platform/level filters)
                  const baseUnverified = importedSRCRuns.filter(r => r.verified !== true);
                  const fullGameCount = baseUnverified.filter(r => (r.leaderboardType || 'regular') === 'regular').length;
                  const ilCount = baseUnverified.filter(r => r.leaderboardType === 'individual-level').length;
                  
                  return (
                    <>
                      {/* Tabs for Full Game vs Individual Level - Always show tabs */}
                      <Tabs 
                        value={importedRunsLeaderboardType} 
                        onValueChange={(value) => {
                          setImportedRunsLeaderboardType(value as 'regular' | 'individual-level');
                        }} 
                        className="mb-6"
                      >
                        <TabsList className="grid w-full max-w-md grid-cols-2 mb-4 bg-[hsl(240,21%,15%)]">
                          <TabsTrigger value="regular" className="data-[state=active]:bg-[hsl(240,21%,20%)]">
                            Full Game ({fullGameCount})
                          </TabsTrigger>
                          <TabsTrigger value="individual-level" className="data-[state=active]:bg-[hsl(240,21%,20%)]">
                            Individual Levels ({ilCount})
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      
                      {/* Filters - Always show so users can adjust when results are empty */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div>
                          <Label htmlFor="imported-category-filter" className="text-[hsl(222,15%,60%)] mb-2 block">Category</Label>
                          <Select
                            value={importedRunsCategory}
                            onValueChange={(value) => {
                              setImportedRunsCategory(value);
                              setImportedPage(1);
                            }}
                          >
                            <SelectTrigger id="imported-category-filter" className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                              <SelectValue placeholder="All Categories" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">All Categories</SelectItem>
                              {importedRunsCategories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="imported-platform-filter" className="text-[hsl(222,15%,60%)] mb-2 block">Platform</Label>
                          <Select
                            value={importedRunsPlatform}
                            onValueChange={(value) => {
                              setImportedRunsPlatform(value);
                              setImportedPage(1);
                            }}
                          >
                            <SelectTrigger id="imported-platform-filter" className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                              <SelectValue placeholder="All Platforms" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">All Platforms</SelectItem>
                              {firestorePlatforms.map((platform) => (
                                <SelectItem key={platform.id} value={platform.id}>
                                  {platform.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {importedRunsLeaderboardType === 'individual-level' && (
                          <div>
                            <Label htmlFor="imported-level-filter" className="text-[hsl(222,15%,60%)] mb-2 block">Level</Label>
                            <Select
                              value={importedRunsLevel}
                              onValueChange={(value) => {
                                setImportedRunsLevel(value);
                                setImportedPage(1);
                              }}
                            >
                              <SelectTrigger id="imported-level-filter" className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                                <SelectValue placeholder="All Levels" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__all__">All Levels</SelectItem>
                                {availableLevels.map((level) => (
                                  <SelectItem key={level.id} value={level.id}>
                                    {level.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div>
                          <Label htmlFor="imported-runtype-filter" className="text-[hsl(222,15%,60%)] mb-2 block">Run Type</Label>
                          <Select
                            value={importedRunsRunType}
                            onValueChange={(value) => {
                              setImportedRunsRunType(value as "__all__" | "solo" | "co-op");
                              setImportedPage(1);
                            }}
                          >
                            <SelectTrigger id="imported-runtype-filter" className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                              <SelectValue placeholder="All Run Types" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">All Run Types</SelectItem>
                              <SelectItem value="solo">Solo</SelectItem>
                              <SelectItem value="co-op">Co-op</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      {/* Imported Runs Table */}
                      {unverifiedImported.length === 0 ? (
                        <p className="text-[hsl(222,15%,60%)] text-center py-8">No unverified imported runs found for the selected filters.</p>
                      ) : (
                        <>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-b border-[hsl(235,13%,30%)] hover:bg-transparent">
                                  <TableHead className="py-3 px-4 text-left">Player(s)</TableHead>
                                  <TableHead className="py-3 px-4 text-left">Category</TableHead>
                                  <TableHead className="py-3 px-4 text-left">Platform</TableHead>
                                  <TableHead className="py-3 px-4 text-left">Level</TableHead>
                                  <TableHead className="py-3 px-4 text-left">Time</TableHead>
                                  <TableHead className="py-3 px-4 text-left">Date</TableHead>
                                  <TableHead className="py-3 px-4 text-left">Type</TableHead>
                                  <TableHead className="py-3 px-4 text-left">Issues</TableHead>
                                  <TableHead className="py-3 px-4 text-center">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {unverifiedImported.slice((importedPage - 1) * itemsPerPage, importedPage * itemsPerPage).map((run) => {
                                  const categoryExists = firestoreCategories.some(c => c.id === run.category);
                                  const platformExists = firestorePlatforms.some(p => p.id === run.platform);
                                  const levelExists = run.level ? availableLevels.some(l => l.id === run.level) : true;
                                  const issues: string[] = [];
                                  if (!run.category || !categoryExists) issues.push("Invalid/Missing Category");
                                  if (!run.platform || !platformExists) issues.push("Invalid/Missing Platform");
                                  if ((run.leaderboardType === 'individual-level' || run.leaderboardType === 'community-golds') && (!run.level || !levelExists)) {
                                    issues.push("Invalid/Missing Level");
                                  }
                                  
                                  return (
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
                                      <TableCell className="py-3 px-4">{
                                        getCategoryName(run.category, firestoreCategories, run.srcCategoryName)
                                      }</TableCell>
                                      <TableCell className="py-3 px-4">{
                                        getPlatformName(run.platform, firestorePlatforms, run.srcPlatformName)
                                      }</TableCell>
                                      <TableCell className="py-3 px-4">{
                                        run.level ? getLevelName(run.level, availableLevels, run.srcLevelName) : "—"
                                      }</TableCell>
                                      <TableCell className="py-3 px-4 font-mono">{formatTime(run.time || '00:00:00')}</TableCell>
                                      <TableCell className="py-3 px-4">{run.date}</TableCell>
                                      <TableCell className="py-3 px-4">{run.runType.charAt(0).toUpperCase() + run.runType.slice(1)}</TableCell>
                                      <TableCell className="py-3 px-4">
                                        {issues.length > 0 ? (
                                          <div className="flex flex-wrap gap-1">
                                            {issues.map((issue, idx) => (
                                              <Badge 
                                                key={idx} 
                                                variant="destructive" 
                                                className="text-xs bg-yellow-600/20 text-yellow-400 border-yellow-600/50 hover:bg-yellow-600/30"
                                              >
                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                {issue}
                                              </Badge>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-muted-foreground text-xs">—</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="py-3 px-4 text-center space-x-2">
                                        <Button 
                                          variant="ghost" 
                                          size="sm" 
                                          onClick={() => {
                                            setEditingImportedRun(run);
                                            // Form will be initialized by useEffect
                                          }}
                                          className="text-blue-500 hover:bg-blue-900/20 transition-all duration-300 hover:scale-110 hover:shadow-md"
                                        >
                                          <Edit2 className="h-4 w-4" />
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
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                          {unverifiedImported.length > itemsPerPage && (
                            <Pagination
                              currentPage={importedPage}
                              totalPages={Math.ceil(unverifiedImported.length / itemsPerPage)}
                              onPageChange={setImportedPage}
                              itemsPerPage={itemsPerPage}
                              totalItems={unverifiedImported.length}
                            />
                          )}
                        </>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

        {/* Unverified Runs Section */}
          <TabsContent value="runs" className="space-y-4 animate-fade-in">
            {/* Regular Unverified Runs */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                  <span>
                    Unverified Runs
                  </span>
                    {unverifiedRuns.length > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {unverifiedRuns.length}
                      </Badge>
                    )}
                </CardTitle>
                  {unverifiedRuns.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowConfirmClearUnverifiedDialog(true)}
                      disabled={clearingUnverifiedRuns}
                      className="border-red-500/50 text-red-500 hover:bg-red-500/10 hover:border-red-500"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {clearingUnverifiedRuns ? "Clearing..." : "Clear All"}
                    </Button>
                  )}
                </div>
          </CardHeader>
          <CardContent>
            {unverifiedRuns.length === 0 ? (
              <p className="text-[hsl(222,15%,60%)] text-center py-8">No runs awaiting verification.</p>
            ) : (
              <>
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
                      {unverifiedRuns.slice((unverifiedPage - 1) * itemsPerPage, unverifiedPage * itemsPerPage).map((run) => (
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
                        <TableCell className="py-3 px-4">{
                          getCategoryName(run.category, firestoreCategories)
                        }</TableCell>
                        <TableCell className="py-3 px-4 font-mono">{formatTime(run.time || '00:00:00')}</TableCell>
                        <TableCell className="py-3 px-4">{
                          getPlatformName(run.platform, firestorePlatforms)
                        }</TableCell>
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
                {unverifiedRuns.length > itemsPerPage && (
                  <Pagination
                    currentPage={unverifiedPage}
                    totalPages={Math.ceil(unverifiedRuns.length / itemsPerPage)}
                    onPageChange={setUnverifiedPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={unverifiedRuns.length}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>

            {/* Import Runs from SRC */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                    <Upload className="h-5 w-5" />
                    <span>Import Runs from Speedrun.com</span>
                  </CardTitle>
                  {importedSRCRuns.filter(r => !r.verified).length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearImportedRuns}
                      disabled={clearingImportedRuns}
                      className="bg-red-900/20 border-red-700/50 text-red-400 hover:bg-red-900/30 hover:border-red-600 transition-all duration-300"
                    >
                      {clearingImportedRuns ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Clearing...
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 mr-2" />
                          Clear All Imported
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Import Section */}
                <div className="space-y-4 pb-6 pt-2 border-b border-[hsl(235,13%,30%)]">
                  <p className="text-[hsl(222,15%,60%)]">
                    Import runs from speedrun.com that aren't on the leaderboards. 
                    Runs will be added as unverified and can be edited or rejected.
                  </p>
                  <div className="flex gap-3 flex-wrap">
                    <Button
                      onClick={handleImportFromSRC}
                      disabled={importingRuns}
                      className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] hover:from-[#b4a0e2] hover:to-[#cba6f7] text-[hsl(240,21%,15%)] font-bold transition-all duration-300 hover:scale-105 hover:shadow-lg"
                    >
                      {importingRuns ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Import Runs
                        </>
                      )}
                    </Button>
                    {importedSRCRuns.filter(r => r.verified !== true).length > 0 && (
                      <>
                        <Button
                          onClick={handleBatchVerify}
                          disabled={batchVerifying || batchVerifyingAll || importingRuns}
                          className="bg-gradient-to-r from-[#94e2d5] to-[#74c7b0] hover:from-[#74c7b0] hover:to-[#94e2d5] text-[hsl(240,21%,15%)] font-bold transition-all duration-300 hover:scale-105 hover:shadow-lg"
                        >
                          {batchVerifying ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Verifying...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Batch Verify 10 Most Recent
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={handleBatchVerifyAll}
                          disabled={batchVerifying || batchVerifyingAll || importingRuns}
                          className="bg-gradient-to-r from-[#a6e3a1] to-[#86c77a] hover:from-[#86c77a] hover:to-[#a6e3a1] text-[hsl(240,21%,15%)] font-bold transition-all duration-300 hover:scale-105 hover:shadow-lg"
                        >
                          {batchVerifyingAll ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Verifying All...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Batch Verify All in Tab
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                  {importingRuns && importProgress.total > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-[hsl(222,15%,60%)]">
                        <span>Progress: {importProgress.imported + importProgress.skipped} / {importProgress.total}</span>
                        <span>Imported: {importProgress.imported} | Skipped: {importProgress.skipped}</span>
                      </div>
                      <div className="w-full bg-[hsl(235,19%,13%)] rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${((importProgress.imported + importProgress.skipped) / importProgress.total) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Imported Runs List */}
                {(() => {
                  // Filter unverified imported runs
                  let unverifiedImported = importedSRCRuns.filter(r => r.verified !== true);
                  
                  // Apply leaderboardType filter
                  unverifiedImported = unverifiedImported.filter(run => {
                    const runLeaderboardType = run.leaderboardType || 'regular';
                    return runLeaderboardType === importedRunsLeaderboardType;
                  });
                  
                  // Apply category filter (only if a category is selected)
                  if (importedRunsCategory && importedRunsCategory !== '__all__') {
                    unverifiedImported = unverifiedImported.filter(run => {
                      const runCategory = normalizeCategoryId(run.category);
                      return runCategory === importedRunsCategory;
                    });
                  }
                  
                  // Apply platform filter (only if a platform is selected)
                  if (importedRunsPlatform && importedRunsPlatform !== '__all__') {
                    unverifiedImported = unverifiedImported.filter(run => {
                      const runPlatform = normalizePlatformId(run.platform);
                      return runPlatform === importedRunsPlatform;
                    });
                  }
                  
                  // Apply level filter for ILs (only if a level is selected)
                  if (importedRunsLeaderboardType === 'individual-level' && importedRunsLevel && importedRunsLevel !== '__all__') {
                    unverifiedImported = unverifiedImported.filter(run => {
                      const runLevel = normalizeLevelId(run.level);
                      return runLevel === importedRunsLevel;
                    });
                  }
                  
                  // Apply run type filter (solo/co-op)
                  if (importedRunsRunType && importedRunsRunType !== '__all__') {
                    unverifiedImported = unverifiedImported.filter(run => {
                      const runRunType = run.runType || 'solo';
                      return runRunType === importedRunsRunType;
                    });
                  }
                  
                  // Sort by date (most recent first) - ensure sorting is maintained after filtering
                  unverifiedImported.sort((a, b) => {
                    // Handle missing dates
                    if (!a.date && !b.date) return 0;
                    if (!a.date) return 1; // Missing date goes to end
                    if (!b.date) return -1; // Missing date goes to end
                    
                    // Compare dates (YYYY-MM-DD format)
                    // Most recent first = descending order
                    return b.date.localeCompare(a.date);
                  });
                  
                  // Calculate counts for tabs (before category/platform/level filters)
                  const baseUnverified = importedSRCRuns.filter(r => r.verified !== true);
                  const fullGameCount = baseUnverified.filter(r => (r.leaderboardType || 'regular') === 'regular').length;
                  const ilCount = baseUnverified.filter(r => r.leaderboardType === 'individual-level').length;
                  
                  return (
                    <>
                      {/* Tabs for Full Game vs Individual Level - Always show tabs */}
                      <Tabs 
                        value={importedRunsLeaderboardType} 
                        onValueChange={(value) => {
                          setImportedRunsLeaderboardType(value as 'regular' | 'individual-level');
                        }} 
                        className="mb-6"
                      >
                        <TabsList className="grid w-full max-w-md grid-cols-2 mb-4 bg-[hsl(240,21%,15%)]">
                          <TabsTrigger value="regular" className="data-[state=active]:bg-[hsl(240,21%,20%)]">
                            Full Game ({fullGameCount})
                          </TabsTrigger>
                          <TabsTrigger value="individual-level" className="data-[state=active]:bg-[hsl(240,21%,20%)]">
                            Individual Levels ({ilCount})
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>
                      
                      {/* Filters - Always show so users can adjust when results are empty */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div>
                          <Label htmlFor="imported-category-filter" className="text-[hsl(222,15%,60%)] mb-2 block">Category</Label>
                          <Select
                            value={importedRunsCategory}
                            onValueChange={(value) => {
                              setImportedRunsCategory(value);
                              setImportedPage(1);
                            }}
                          >
                            <SelectTrigger id="imported-category-filter" className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                              <SelectValue placeholder="All Categories" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">All Categories</SelectItem>
                              {importedRunsCategories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="imported-platform-filter" className="text-[hsl(222,15%,60%)] mb-2 block">Platform</Label>
                          <Select
                            value={importedRunsPlatform}
                            onValueChange={(value) => {
                              setImportedRunsPlatform(value);
                              setImportedPage(1);
                            }}
                          >
                            <SelectTrigger id="imported-platform-filter" className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                              <SelectValue placeholder="All Platforms" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">All Platforms</SelectItem>
                              {firestorePlatforms.map((platform) => (
                                <SelectItem key={platform.id} value={platform.id}>
                                  {platform.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="imported-runtype-filter" className="text-[hsl(222,15%,60%)] mb-2 block">Run Type</Label>
                          <Select
                            value={importedRunsRunType}
                            onValueChange={(value) => {
                              setImportedRunsRunType(value as "__all__" | "solo" | "co-op");
                              setImportedPage(1);
                            }}
                          >
                            <SelectTrigger id="imported-runtype-filter" className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                              <SelectValue placeholder="All Run Types" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all__">All Run Types</SelectItem>
                              <SelectItem value="solo">Solo</SelectItem>
                              <SelectItem value="co-op">Co-op</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {importedRunsLeaderboardType === 'individual-level' && (
                          <div>
                            <Label htmlFor="imported-level-filter" className="text-[hsl(222,15%,60%)] mb-2 block">Level</Label>
                            <Select
                              value={importedRunsLevel}
                              onValueChange={(value) => {
                                setImportedRunsLevel(value);
                                setImportedPage(1);
                              }}
                            >
                              <SelectTrigger id="imported-level-filter" className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                                <SelectValue placeholder="All Levels" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__all__">All Levels</SelectItem>
                                {availableLevels.map((level) => (
                                  <SelectItem key={level.id} value={level.id}>
                                    {level.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>

                      {unverifiedImported.length === 0 ? (
                        <div className="space-y-4">
                          <p className="text-[hsl(222,15%,60%)] text-center py-8">
                            {importedSRCRuns.length === 0 
                              ? "No imported runs found. Import runs from speedrun.com to get started."
                              : "No imported runs awaiting verification for the selected filters."}
                          </p>
                          {importedSRCRuns.length > 0 && (
                            <div className="text-xs text-[hsl(222,15%,50%)] text-center space-y-1">
                              <div>
                                Total imported runs in database: {importedSRCRuns.length} | 
                                Unverified: {baseUnverified.length}
                              </div>
                              <div>
                                Current filter: {importedRunsLeaderboardType} | 
                                Category: {importedRunsCategory === '__all__' ? 'All' : importedRunsCategory} | 
                                Platform: {importedRunsPlatform === '__all__' ? 'All' : importedRunsPlatform} |
                                {importedRunsLeaderboardType === 'individual-level' && ` Level: ${importedRunsLevel === '__all__' ? 'All' : importedRunsLevel}`}
                              </div>
                              <p className="text-[hsl(222,15%,60%)] mt-2">Adjust the filters above to see different runs.</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>

                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-b border-[hsl(235,13%,30%)] hover:bg-transparent">
                              <TableHead className="py-3 px-4 text-left">Player(s)</TableHead>
                              <TableHead className="py-3 px-4 text-left">Category</TableHead>
                              {importedRunsLeaderboardType === 'individual-level' && (
                                <TableHead className="py-3 px-4 text-left">Level</TableHead>
                              )}
                              <TableHead className="py-3 px-4 text-left">Time</TableHead>
                              <TableHead className="py-3 px-4 text-left">Date</TableHead>
                              <TableHead className="py-3 px-4 text-left">Platform</TableHead>
                              <TableHead className="py-3 px-4 text-left">Type</TableHead>
                              <TableHead className="py-3 px-4 text-left">Video</TableHead>
                              <TableHead className="py-3 px-4 text-left">Issues</TableHead>
                              <TableHead className="py-3 px-4 text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {unverifiedImported.slice((importedPage - 1) * itemsPerPage, importedPage * itemsPerPage).map((run) => {
                              // Check for issues with this run
                              const issues: string[] = [];
                              
                              // Check if category is missing or invalid
                              const categoryExists = run.category ? 
                                [...importedRunsCategories, ...firestoreCategories].some(c => c.id === run.category) : false;
                              if (!run.category || run.category.trim() === "") {
                                if (!run.srcCategoryName || run.srcCategoryName.trim() === "") {
                                  issues.push("Missing Category");
                                }
                              } else if (!categoryExists) {
                                issues.push("Invalid Category ID");
                              }
                              
                              // Check if platform is missing or invalid
                              const platformExists = run.platform ? 
                                firestorePlatforms.some(p => p.id === run.platform) : false;
                              if (!run.platform || run.platform.trim() === "") {
                                if (!run.srcPlatformName || run.srcPlatformName.trim() === "") {
                                  issues.push("Missing Platform");
                                }
                              } else if (!platformExists) {
                                issues.push("Invalid Platform ID");
                              }
                              
                              // Check if level is missing or invalid (for IL runs)
                              if (importedRunsLeaderboardType === 'individual-level') {
                                const levelExists = run.level ? 
                                  availableLevels.some(l => l.id === run.level) : false;
                                if (!run.level || run.level.trim() === "") {
                                  if (!run.srcLevelName || run.srcLevelName.trim() === "") {
                                    issues.push("Missing Level");
                                  }
                                } else if (!levelExists) {
                                  issues.push("Invalid Level ID");
                                }
                              }
                              
                              // Check for other missing essential fields
                              if (!run.playerName || run.playerName.trim() === "") {
                                issues.push("Missing Player Name");
                              }
                              if (!run.time || run.time.trim() === "") {
                                issues.push("Missing Time");
                              }
                              if (!run.date || run.date.trim() === "") {
                                issues.push("Missing Date");
                              }
                              if (!run.runType) {
                                issues.push("Missing Run Type");
                              }
                              
                              // Check for co-op runs missing player2
                              if (run.runType === 'co-op' && (!run.player2Name || run.player2Name.trim() === "")) {
                                issues.push("Missing Player 2");
                              }
                              
                              return (
                          <TableRow key={run.id} className={`border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)] transition-all duration-200 hover:shadow-md ${issues.length > 0 ? 'bg-yellow-900/10' : ''}`}>
                            <TableCell className="py-3 px-4 font-medium">
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <span style={{ color: run.nameColor || 'inherit' }}>{run.playerName}</span>
                                  </div>
                                  {run.player2Name && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-muted-foreground"> & </span>
                                      <span style={{ color: run.player2Color || 'inherit' }}>{run.player2Name}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3 px-4">{
                              getCategoryName(run.category, [...importedRunsCategories, ...firestoreCategories], run.srcCategoryName)
                            }</TableCell>
                            {importedRunsLeaderboardType === 'individual-level' && (
                              <TableCell className="py-3 px-4">{
                                getLevelName(run.level, availableLevels, run.srcLevelName)
                              }</TableCell>
                            )}
                            <TableCell className="py-3 px-4">{formatTime(run.time || '00:00:00')}</TableCell>
                            <TableCell className="py-3 px-4">{run.date || 'N/A'}</TableCell>
                            <TableCell className="py-3 px-4">{
                              getPlatformName(run.platform, firestorePlatforms, run.srcPlatformName)
                            }</TableCell>
                            <TableCell className="py-3 px-4">{run.runType.charAt(0).toUpperCase() + run.runType.slice(1)}</TableCell>
                            <TableCell className="py-3 px-4">
                              {run.videoUrl && (
                                <a href={run.videoUrl} target="_blank" rel="noopener noreferrer" className="text-[#cba6f7] hover:underline flex items-center gap-1">
                                  Watch <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                              {run.srcRunId && (
                                <a 
                                  href={`https://www.speedrun.com/lsw/run/${run.srcRunId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-2 text-[#94e2d5] hover:underline flex items-center gap-1 text-xs"
                                >
                                  SRC <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </TableCell>
                            <TableCell className="py-3 px-4">
                              {issues.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {issues.map((issue, idx) => (
                                    <Badge 
                                      key={idx} 
                                      variant="destructive" 
                                      className="text-xs bg-yellow-600/20 text-yellow-400 border-yellow-600/50 hover:bg-yellow-600/30"
                                    >
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      {issue}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3 px-4 text-center space-x-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => {
                                  setEditingImportedRun(run);
                                  // Form will be initialized by useEffect
                                }}
                                className="text-blue-500 hover:bg-blue-900/20 transition-all duration-300 hover:scale-110 hover:shadow-md"
                              >
                                <Edit2 className="h-4 w-4" />
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
                          );
                          })}
                          </TableBody>
                        </Table>
                      </div>
                      {unverifiedImported.length > itemsPerPage && (
                        <Pagination
                          currentPage={importedPage}
                          totalPages={Math.ceil(unverifiedImported.length / itemsPerPage)}
                          onPageChange={setImportedPage}
                          itemsPerPage={itemsPerPage}
                          totalItems={unverifiedImported.length}
                        />
                      )}
                        </>
                      )}
                    </>
                  );
                })()}
          </CardContent>
        </Card>

        {/* Verified Runs with Invalid Data Card */}
        <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl border-yellow-500/30">
          <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
            <CardTitle className="flex items-center gap-2 text-xl text-yellow-400">
              <AlertTriangle className="h-5 w-5" />
              <span>Verified Runs with Invalid Data</span>
            </CardTitle>
            <p className="text-sm text-[hsl(222,15%,60%)] mt-2">
              These runs are verified but won't appear on leaderboards due to missing or invalid category, platform, or level data.
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            {verifiedRunsWithInvalidData.length === 0 ? (
              <p className="text-[hsl(222,15%,60%)] text-center py-8">No verified runs with invalid data found.</p>
            ) : (
              <>
                <div className="overflow-x-auto mb-4">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-[hsl(235,13%,30%)] hover:bg-transparent">
                        <TableHead className="py-3 px-4 text-left">Player(s)</TableHead>
                        <TableHead className="py-3 px-4 text-left">Category</TableHead>
                        <TableHead className="py-3 px-4 text-left">Platform</TableHead>
                        <TableHead className="py-3 px-4 text-left">Level</TableHead>
                        <TableHead className="py-3 px-4 text-left">Time</TableHead>
                        <TableHead className="py-3 px-4 text-left">Issues</TableHead>
                        <TableHead className="py-3 px-4 text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {verifiedRunsWithInvalidData.map((run) => {
                        const categoryExists = firestoreCategories.some(c => c.id === run.category);
                        const platformExists = firestorePlatforms.some(p => p.id === run.platform);
                        const levelExists = run.level ? availableLevels.some(l => l.id === run.level) : true;
                        const issues: string[] = [];
                        if (!run.category || !categoryExists) issues.push("Invalid/Missing Category");
                        if (!run.platform || !platformExists) issues.push("Invalid/Missing Platform");
                        if ((run.leaderboardType === 'individual-level' || run.leaderboardType === 'community-golds') && (!run.level || !levelExists)) {
                          issues.push("Invalid/Missing Level");
                        }
                        if (!run.playerName) issues.push("Missing Player Name");
                        if (!run.time) issues.push("Missing Time");
                        if (!run.date) issues.push("Missing Date");
                        if (!run.runType) issues.push("Missing Run Type");
                        
                        return (
                          <TableRow key={run.id} className="border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)]">
                            <TableCell className="py-3 px-4">
                              <div className="flex flex-col gap-1">
                                <span>{run.playerName || "Unknown"}</span>
                                {run.player2Name && (
                                  <span className="text-muted-foreground text-sm"> & {run.player2Name}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-3 px-4">
                              {categoryExists ? (
                                getCategoryName(run.category, firestoreCategories, run.srcCategoryName)
                              ) : (
                                <span className="text-yellow-500">Invalid: {run.category || "Missing"}</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3 px-4">
                              {platformExists ? (
                                getPlatformName(run.platform, firestorePlatforms, run.srcPlatformName)
                              ) : (
                                <span className="text-yellow-500">Invalid: {run.platform || "Missing"}</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3 px-4">
                              {run.level ? (
                                levelExists ? (
                                  getLevelName(run.level, availableLevels, run.srcLevelName)
                                ) : (
                                  <span className="text-yellow-500">Invalid: {run.level}</span>
                                )
                              ) : (
                                run.leaderboardType === 'individual-level' || run.leaderboardType === 'community-golds' ? (
                                  <span className="text-yellow-500">Missing</span>
                                ) : (
                                  <span className="text-muted-foreground">N/A</span>
                                )
                              )}
                            </TableCell>
                            <TableCell className="py-3 px-4 font-mono">{formatTime(run.time || '00:00:00')}</TableCell>
                            <TableCell className="py-3 px-4">
                              <div className="flex flex-col gap-1">
                                {issues.map((issue, idx) => (
                                  <Badge key={idx} variant="destructive" className="text-xs w-fit">
                                    {issue}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="py-3 px-4">
                              <div className="flex gap-2 justify-center">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingImportedRun(run);
                                    setEditingImportedRunForm({
                                      playerName: run.playerName,
                                      player2Name: run.player2Name,
                                      category: run.category,
                                      platform: run.platform,
                                      level: run.level,
                                      runType: run.runType,
                                      leaderboardType: run.leaderboardType,
                                      time: run.time,
                                      date: run.date,
                                      videoUrl: run.videoUrl,
                                      comment: run.comment,
                                    });
                                  }}
                                  className="text-blue-400 border-blue-400 hover:bg-blue-400/10"
                                >
                                  <Edit2 className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    if (!window.confirm(`Unverify this run? It will be moved to unverified runs.`)) return;
                                    try {
                                      await updateRunVerificationStatus(run.id, false);
                                      toast({
                                        title: "Run Unverified",
                                        description: "The run has been moved to unverified runs.",
                                      });
                                      await refreshAllRunData();
                                    } catch (error: any) {
                                      toast({
                                        title: "Error",
                                        description: error.message || "Failed to unverify run.",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                  className="text-yellow-400 border-yellow-400 hover:bg-yellow-400/10"
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Unverify
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={async () => {
                                    if (!window.confirm(`Delete this run permanently? This action cannot be undone.`)) return;
                                    try {
                                      await deleteLeaderboardEntry(run.id);
                                      toast({
                                        title: "Run Deleted",
                                        description: "The run has been deleted.",
                                      });
                                      await refreshAllRunData();
                                    } catch (error: any) {
                                      toast({
                                        title: "Error",
                                        description: error.message || "Failed to delete run.",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                  className="text-red-400 border-red-400 hover:bg-red-400/10"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

            {/* Unassigned Runs Section */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                    <AlertTriangle className="h-5 w-5" />
                    <span>Unassigned Runs</span>
                    {unassignedRuns.length > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {unassignedRuns.length}
                      </Badge>
                    )}
                  </CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchUnassignedRuns}
                      disabled={loadingUnassignedRuns}
                      className="border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)]"
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${loadingUnassignedRuns ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    {unassignedRuns.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!window.confirm(`Are you sure you want to delete all ${unassignedRuns.length} unassigned runs? This action cannot be undone.`)) {
                            return;
                          }
                          try {
                            let deleted = 0;
                            let errors = 0;
                            const errorMessages: string[] = [];
                            
                            for (const run of unassignedRuns) {
                              try {
                                const success = await deleteLeaderboardEntry(run.id);
                                if (success) {
                                  deleted++;
                                } else {
                                  errors++;
                                  errorMessages.push(`Failed to delete run ${run.id}`);
                                }
                              } catch (error: any) {
                                errors++;
                                const errorMsg = error?.message || String(error);
                                errorMessages.push(`Run ${run.id}: ${errorMsg}`);
                                console.error(`Error deleting run ${run.id}:`, error);
                              }
                            }
                            
                            if (errors > 0 && errorMessages.length > 0) {
                              // Show first few error messages
                              const preview = errorMessages.slice(0, 3).join('; ');
                              const remaining = errorMessages.length - 3;
                              toast({
                                title: "Unassigned Runs Deleted (with errors)",
                                description: `Deleted ${deleted} runs, ${errors} error(s) occurred.${remaining > 0 ? ` (Showing first 3, check console for all)` : ''} ${preview}`,
                                variant: errors === unassignedRuns.length ? "destructive" : "default",
                              });
                            } else {
                              toast({
                                title: "Unassigned Runs Deleted",
                                description: `Successfully deleted ${deleted} runs.`,
                              });
                            }
                            
                            await fetchUnassignedRuns();
                          } catch (error: any) {
                            console.error("Error in delete all:", error);
                            toast({
                              title: "Error",
                              description: error.message || "Failed to delete unassigned runs. Ensure your admin account has isAdmin: true set in your player document.",
                              variant: "destructive",
                            });
                          }
                        }}
                        className="bg-red-900/20 border-red-700/50 text-red-400 hover:bg-red-900/30 hover:border-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete All
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingUnassignedRuns ? (
                  <div className="text-center py-8">
                    <LoadingSpinner />
                  </div>
                ) : unassignedRuns.length === 0 ? (
                  <p className="text-[hsl(222,15%,60%)] text-center py-8">No unassigned runs found. All runs are linked to user accounts.</p>
                ) : (
                  <>
                    <p className="text-[hsl(222,15%,60%)] mb-4 text-sm">
                      These runs haven't been assigned to any user account. They can be claimed by users in their settings, or deleted if they're duplicates or invalid.
                    </p>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-[hsl(235,13%,30%)] hover:bg-transparent">
                            <TableHead className="py-3 px-4 text-left">Player(s)</TableHead>
                            <TableHead className="py-3 px-4 text-left">Category</TableHead>
                            <TableHead className="py-3 px-4 text-left">Time</TableHead>
                            <TableHead className="py-3 px-4 text-left">Platform</TableHead>
                            <TableHead className="py-3 px-4 text-left">Type</TableHead>
                            <TableHead className="py-3 px-4 text-left">Date</TableHead>
                            <TableHead className="py-3 px-4 text-left">Status</TableHead>
                            <TableHead className="py-3 px-4 text-center">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unassignedRuns.slice((unassignedPage - 1) * itemsPerPage, unassignedPage * itemsPerPage).map((run) => (
                            <TableRow key={run.id} className="border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)] transition-all duration-200 hover:shadow-md">
                              <TableCell className="py-3 px-4 font-medium">
                                <div className="flex flex-col gap-1">
                                  <span style={{ color: run.nameColor || 'inherit' }}>{run.playerName || "Unknown"}</span>
                                  {run.player2Name && (
                                    <span className="text-muted-foreground text-sm" style={{ color: run.player2Color || 'inherit' }}>
                                      & {run.player2Name}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="py-3 px-4">
                                {getCategoryName(run.category, firestoreCategories, run.srcCategoryName)}
                              </TableCell>
                              <TableCell className="py-3 px-4">{formatTime(run.time || '00:00:00')}</TableCell>
                              <TableCell className="py-3 px-4">
                                {getPlatformName(run.platform, firestorePlatforms, run.srcPlatformName)}
                              </TableCell>
                              <TableCell className="py-3 px-4">{run.runType?.charAt(0).toUpperCase() + run.runType?.slice(1) || 'Solo'}</TableCell>
                              <TableCell className="py-3 px-4">{run.date || 'N/A'}</TableCell>
                              <TableCell className="py-3 px-4">
                                <div className="flex flex-col gap-1">
                                  <Badge variant={run.verified ? "default" : "secondary"} className="w-fit">
                                    {run.verified ? "Verified" : "Unverified"}
                                  </Badge>
                                  <Badge variant="outline" className="w-fit border-yellow-600/50 bg-yellow-600/10 text-yellow-400 text-xs">
                                    Unclaimed
                                  </Badge>
                                  {run.importedFromSRC && (
                                    <Badge variant="outline" className="w-fit text-xs">
                                      From SRC
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="py-3 px-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      const playerName = prompt(`Enter the display name or UID of the player to assign this run to:\n\nRun: ${run.playerName}${run.player2Name ? ` & ${run.player2Name}` : ''}\nTime: ${formatTime(run.time)}\nCategory: ${getCategoryName(run.category, firestoreCategories, run.srcCategoryName)}`);
                                      if (!playerName || !playerName.trim()) return;
                                      
                                      try {
                                        // Try to find player by display name or UID
                                        let player = await getPlayerByDisplayName(playerName.trim());
                                        if (!player) {
                                          // Try by UID
                                          player = await getPlayerByUid(playerName.trim());
                                        }
                                        
                                        if (!player) {
                                          toast({
                                            title: "Player Not Found",
                                            description: `Could not find a player with name or UID "${playerName.trim()}".`,
                                            variant: "destructive",
                                          });
                                          return;
                                        }
                                        
                                        // Use claimRun to assign the run (it will handle validation and points recalculation)
                                        const success = await claimRun(run.id, player.uid);
                                        if (success) {
                                          toast({
                                            title: "Run Assigned",
                                            description: `Run has been assigned to ${player.displayName}.`,
                                          });
                                          await fetchUnassignedRuns();
                                        } else {
                                          throw new Error("Failed to assign run");
                                        }
                                      } catch (error: any) {
                                        toast({
                                          title: "Error",
                                          description: error.message || "Failed to assign run to player.",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    className="text-blue-400 border-blue-400 hover:bg-blue-400/10"
                                  >
                                    <UserPlus className="h-4 w-4 mr-1" />
                                    Assign
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={async () => {
                                      if (!window.confirm(`Delete this unassigned run permanently? This action cannot be undone.`)) return;
                                      try {
                                        const success = await deleteLeaderboardEntry(run.id);
                                        if (success) {
                                          toast({
                                            title: "Run Deleted",
                                            description: "The unassigned run has been deleted.",
                                          });
                                          await fetchUnassignedRuns();
                                        } else {
                                          throw new Error("Failed to delete run. Check console for details.");
                                        }
                                      } catch (error: any) {
                                        console.error("Delete error:", error);
                                        toast({
                                          title: "Error Deleting Run",
                                          description: error.message || "Failed to delete run. Ensure your admin account has isAdmin: true set in your player document.",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                    className="text-red-400 border-red-400 hover:bg-red-400/10"
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {unassignedRuns.length > itemsPerPage && (
                      <Pagination
                        currentPage={unassignedPage}
                        totalPages={Math.ceil(unassignedRuns.length / itemsPerPage)}
                        onPageChange={setUnassignedPage}
                        itemsPerPage={itemsPerPage}
                        totalItems={unassignedRuns.length}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>

        {/* Edit Imported Run Dialog */}
          <Dialog open={!!editingImportedRun} onOpenChange={(open) => {
          if (!open) {
            // Only close if not currently saving
            if (!savingImportedRun) {
              setEditingImportedRun(null);
              setEditingImportedRunForm({});
            }
          }
        }}>
          <DialogContent className="bg-[hsl(240,21%,16%)] border-[hsl(235,13%,30%)] max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[#f2cdcd]">
                {editingImportedRun?.importedFromSRC ? "Edit Imported Run" : "Edit Run"}
              </DialogTitle>
            </DialogHeader>
            {editingImportedRun && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-playerName">Player Name <span className="text-red-500">*</span></Label>
                    <Input
                      id="edit-playerName"
                      value={editingImportedRunForm.playerName ?? editingImportedRun.playerName ?? ""}
                      onChange={(e) => setEditingImportedRunForm({ ...editingImportedRunForm, playerName: e.target.value })}
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      placeholder="Enter player name"
                    />
                    {(!editingImportedRunForm.playerName && !editingImportedRun.playerName) && (
                      <p className="text-xs text-red-400 mt-1">Player name is required</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="edit-player2Name">
                      Player 2 Name (Co-op) 
                      {(editingImportedRunForm.runType ?? editingImportedRun.runType) === 'co-op' && (
                        <span className="text-red-500"> *</span>
                      )}
                    </Label>
                    <Input
                      id="edit-player2Name"
                      value={editingImportedRunForm.player2Name ?? editingImportedRun.player2Name ?? ""}
                      onChange={(e) => setEditingImportedRunForm({ ...editingImportedRunForm, player2Name: e.target.value || undefined })}
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      placeholder="Enter second player name"
                      disabled={(editingImportedRunForm.runType ?? editingImportedRun.runType) !== 'co-op'}
                    />
                    {(editingImportedRunForm.runType ?? editingImportedRun.runType) === 'co-op' && (!editingImportedRunForm.player2Name && !editingImportedRun.player2Name) && (
                      <p className="text-xs text-red-400 mt-1">Player 2 name is required for co-op runs</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-category">Category <span className="text-red-500">*</span></Label>
                    <Select
                      value={editingImportedRunForm.category ?? editingImportedRun.category ?? ""}
                      onValueChange={(value) => setEditingImportedRunForm({ ...editingImportedRunForm, category: value })}
                    >
                      <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {firestoreCategories
                          .filter(cat => {
                            // Filter categories by leaderboard type
                            const runLeaderboardType = editingImportedRunForm.leaderboardType ?? editingImportedRun.leaderboardType ?? 'regular';
                            const catType = (cat as Category).leaderboardType || 'regular';
                            return catType === runLeaderboardType;
                          })
                          .map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {(!editingImportedRunForm.category && !editingImportedRun.category) && (
                      <p className="text-xs text-red-400 mt-1">Category is required</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="edit-platform">Platform <span className="text-red-500">*</span></Label>
                    <Select
                      value={editingImportedRunForm.platform ?? editingImportedRun.platform ?? ""}
                      onValueChange={(value) => setEditingImportedRunForm({ ...editingImportedRunForm, platform: value })}
                    >
                      <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                        <SelectValue placeholder="Select a platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {firestorePlatforms.map((platform) => (
                          <SelectItem key={platform.id} value={platform.id}>
                            {platform.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(!editingImportedRunForm.platform && !editingImportedRun.platform) && (
                      <p className="text-xs text-red-400 mt-1">Platform is required</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-runType">Run Type <span className="text-red-500">*</span></Label>
                    <Select
                      value={editingImportedRunForm.runType ?? editingImportedRun.runType ?? ""}
                      onValueChange={(value) => {
                        const newRunType = value as 'solo' | 'co-op';
                        setEditingImportedRunForm({ 
                          ...editingImportedRunForm, 
                          runType: newRunType,
                          // Clear player2Name if switching to solo
                          player2Name: newRunType === 'solo' ? undefined : editingImportedRunForm.player2Name
                        });
                      }}
                    >
                      <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                        <SelectValue placeholder="Select run type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="solo">Solo</SelectItem>
                        <SelectItem value="co-op">Co-op</SelectItem>
                      </SelectContent>
                    </Select>
                    {(!editingImportedRunForm.runType && !editingImportedRun.runType) && (
                      <p className="text-xs text-red-400 mt-1">Run type is required</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="edit-time">Time (HH:MM:SS) <span className="text-red-500">*</span></Label>
                    <Input
                      id="edit-time"
                      value={editingImportedRunForm.time ?? editingImportedRun.time ?? ""}
                      onChange={(e) => setEditingImportedRunForm({ ...editingImportedRunForm, time: e.target.value })}
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      placeholder="00:00:00"
                    />
                    {(!editingImportedRunForm.time && !editingImportedRun.time) && (
                      <p className="text-xs text-red-400 mt-1">Time is required</p>
                    )}
                  </div>
                </div>
                {(editingImportedRun.leaderboardType === 'individual-level' || editingImportedRun.leaderboardType === 'community-golds') && (
                  <div>
                    <Label htmlFor="edit-level">Level <span className="text-red-500">*</span></Label>
                    <Select
                      value={editingImportedRunForm.level ?? editingImportedRun.level ?? ""}
                      onValueChange={(value) => setEditingImportedRunForm({ ...editingImportedRunForm, level: value })}
                    >
                      <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                        <SelectValue placeholder="Select a level" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLevels.map((level) => (
                          <SelectItem key={level.id} value={level.id}>
                            {level.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(!editingImportedRunForm.level && !editingImportedRun.level) && (
                      <p className="text-xs text-red-400 mt-1">Level is required for {editingImportedRun.leaderboardType === 'individual-level' ? 'Individual Level' : 'Community Gold'} runs</p>
                    )}
                  </div>
                )}
                <div>
                  <Label htmlFor="edit-date">Date <span className="text-red-500">*</span></Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editingImportedRunForm.date ?? editingImportedRun.date ?? ""}
                    onChange={(e) => setEditingImportedRunForm({ ...editingImportedRunForm, date: e.target.value })}
                    className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                  />
                  {(!editingImportedRunForm.date && !editingImportedRun.date) && (
                    <p className="text-xs text-red-400 mt-1">Date is required</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="edit-videoUrl">Video URL</Label>
                  <Input
                    id="edit-videoUrl"
                    value={editingImportedRunForm.videoUrl ?? editingImportedRun.videoUrl ?? ""}
                    onChange={(e) => setEditingImportedRunForm({ ...editingImportedRunForm, videoUrl: e.target.value || undefined })}
                    className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label htmlFor="edit-comment">Comment</Label>
                  <Textarea
                    id="edit-comment"
                    value={editingImportedRunForm.comment ?? editingImportedRun.comment ?? ""}
                    onChange={(e) => setEditingImportedRunForm({ ...editingImportedRunForm, comment: e.target.value || undefined })}
                    className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                    placeholder="Optional comment..."
                  />
                </div>
              </div>
            )}
            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingImportedRun(null);
                  setEditingImportedRunForm({});
                }}
                className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveImportedRun}
                disabled={savingImportedRun}
                className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] hover:from-[#b4a0e2] hover:to-[#cba6f7] text-[hsl(240,21%,15%)] font-bold"
              >
                {savingImportedRun ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                onClick={async () => {
                  // Verify the run immediately after saving
                  if (!editingImportedRun) return;
                  
                  // Validate required fields first
                  const finalForm = {
                    playerName: editingImportedRunForm.playerName ?? editingImportedRun.playerName,
                    player2Name: editingImportedRunForm.player2Name ?? editingImportedRun.player2Name,
                    category: editingImportedRunForm.category ?? editingImportedRun.category,
                    platform: editingImportedRunForm.platform ?? editingImportedRun.platform,
                    runType: editingImportedRunForm.runType ?? editingImportedRun.runType,
                    leaderboardType: editingImportedRunForm.leaderboardType ?? editingImportedRun.leaderboardType,
                    level: editingImportedRunForm.level ?? editingImportedRun.level,
                    time: editingImportedRunForm.time ?? editingImportedRun.time,
                    date: editingImportedRunForm.date ?? editingImportedRun.date,
                    videoUrl: editingImportedRunForm.videoUrl ?? editingImportedRun.videoUrl,
                    comment: editingImportedRunForm.comment ?? editingImportedRun.comment,
                  };
                  
                  // Quick validation
                  if (!finalForm.playerName?.trim() || !finalForm.category?.trim() || !finalForm.platform?.trim() || !finalForm.time?.trim() || !finalForm.date?.trim()) {
                    toast({
                      title: "Missing Information",
                      description: "Please fill in all required fields before verifying.",
                      variant: "destructive",
                    });
                    return;
                  }
                  
                  setSavingImportedRun(true);
                  try {
                    const updateData: Partial<LeaderboardEntry> = {
                      playerName: finalForm.playerName.trim(),
                      category: finalForm.category.trim(),
                      platform: finalForm.platform.trim(),
                      runType: finalForm.runType,
                      leaderboardType: finalForm.leaderboardType,
                      time: finalForm.time.trim(),
                      date: finalForm.date.trim(),
                      verified: true, // Verify immediately
                      verifiedBy: currentUser?.uid || currentUser?.displayName || "Admin",
                    };

                    // Add optional fields
                    if (finalForm.player2Name && finalForm.player2Name.trim()) {
                      updateData.player2Name = finalForm.player2Name.trim();
                    } else if (finalForm.runType === 'co-op') {
                      updateData.player2Name = finalForm.player2Name?.trim() || '';
                    }
                    
                    if (finalForm.level && finalForm.level.trim()) {
                      updateData.level = finalForm.level.trim();
                    }
                    
                    if (finalForm.videoUrl && finalForm.videoUrl.trim()) {
                      updateData.videoUrl = finalForm.videoUrl.trim();
                    }
                    
                    if (finalForm.comment && finalForm.comment.trim()) {
                      updateData.comment = finalForm.comment.trim();
                    }

                    const success = await updateLeaderboardEntry(editingImportedRun.id, updateData);
                    if (success) {
                      toast({
                        title: "Run Verified",
                        description: "The run has been saved and verified successfully.",
                      });
                      // Update local state - remove from imported runs since it's now verified
                      setImportedSRCRuns(prev => prev.filter(run => run.id !== editingImportedRun.id));
                      setUnverifiedRuns(prev => prev.filter(run => run.id !== editingImportedRun.id));
                      // Close dialog and reset form
                      setEditingImportedRun(null);
                      setEditingImportedRunForm({});
                    } else {
                      throw new Error("Failed to verify run");
                    }
                  } catch (error: any) {
                    toast({
                      title: "Error",
                      description: error.message || "Failed to verify imported run.",
                      variant: "destructive",
                    });
                  } finally {
                    setSavingImportedRun(false);
                  }
                }}
                disabled={savingImportedRun}
                className="bg-gradient-to-r from-[#a6e3a1] to-[#94e2d5] hover:from-[#94e2d5] hover:to-[#a6e3a1] text-[hsl(240,21%,15%)] font-bold"
              >
                {savingImportedRun ? "Verifying..." : "Save & Verify"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm Clear Unverified Runs Dialog */}
        <Dialog open={showConfirmClearUnverifiedDialog} onOpenChange={setShowConfirmClearUnverifiedDialog}>
          <DialogContent className="bg-[hsl(240,21%,16%)] border-[hsl(235,13%,30%)]">
            <DialogHeader>
              <DialogTitle className="text-[#f2cdcd]">Clear All Unverified Runs</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-[hsl(222,15%,60%)] mb-4">
                Are you sure you want to delete all {unverifiedRuns.filter(run => !run.importedFromSRC).length} unverified runs?
                This action cannot be undone and will permanently delete all manually submitted runs that are awaiting verification.
              </p>
              <p className="text-sm text-red-400 mb-4">
                Note: This will only delete manually submitted runs. Imported runs will remain in the Imported Runs tab.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirmClearUnverifiedDialog(false)}
                disabled={clearingUnverifiedRuns}
                className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleClearUnverifiedRuns}
                disabled={clearingUnverifiedRuns}
                className="bg-red-600 hover:bg-red-700"
              >
                {clearingUnverifiedRuns ? "Deleting..." : "Delete All"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Verify Imported Run Dialog */}
        <Dialog open={!!verifyingRun} onOpenChange={(open) => {
          if (!open) {
            setVerifyingRun(null);
            setVerifyingRunCategory("");
            setVerifyingRunPlatform("");
            setVerifyingRunLevel("");
          }
        }}>
          <DialogContent className="bg-[hsl(240,21%,16%)] border-[hsl(235,13%,30%)] max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-[#f2cdcd]">
                Verify Imported Run
              </DialogTitle>
            </DialogHeader>
            {verifyingRun && (
              <div className="space-y-4 py-4">
                <p className="text-sm text-[hsl(222,15%,60%)]">
                  Select the category, platform, and level (if applicable) for this run before verifying.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="verify-category">Category <span className="text-red-500">*</span></Label>
                    <Select
                      value={verifyingRunCategory}
                      onValueChange={setVerifyingRunCategory}
                    >
                      <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {firestoreCategories
                          .filter(cat => {
                            const runLeaderboardType = verifyingRun.leaderboardType || 'regular';
                            const catType = (cat as Category).leaderboardType || 'regular';
                            return catType === runLeaderboardType;
                          })
                          .map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {!verifyingRunCategory && (
                      <p className="text-xs text-red-400 mt-1">Category is required</p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="verify-platform">Platform <span className="text-red-500">*</span></Label>
                    <Select
                      value={verifyingRunPlatform}
                      onValueChange={setVerifyingRunPlatform}
                    >
                      <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                        <SelectValue placeholder="Select a platform" />
                      </SelectTrigger>
                      <SelectContent>
                        {firestorePlatforms.map((platform) => (
                          <SelectItem key={platform.id} value={platform.id}>
                            {platform.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!verifyingRunPlatform && (
                      <p className="text-xs text-red-400 mt-1">Platform is required</p>
                    )}
                  </div>
                </div>
                {(verifyingRun.leaderboardType === 'individual-level' || verifyingRun.leaderboardType === 'community-golds') && (
                  <div>
                    <Label htmlFor="verify-level">Level <span className="text-red-500">*</span></Label>
                    <Select
                      value={verifyingRunLevel}
                      onValueChange={setVerifyingRunLevel}
                    >
                      <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                        <SelectValue placeholder="Select a level" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLevels.map((level) => (
                          <SelectItem key={level.id} value={level.id}>
                            {level.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!verifyingRunLevel && (
                      <p className="text-xs text-red-400 mt-1">Level is required</p>
                    )}
                  </div>
                )}
                <div className="bg-[hsl(240,21%,15%)] rounded-lg p-3 border border-[hsl(235,13%,30%)]">
                  <div className="text-sm space-y-1">
                    <div><strong>Player:</strong> {verifyingRun.playerName}</div>
                    {verifyingRun.player2Name && <div><strong>Player 2:</strong> {verifyingRun.player2Name}</div>}
                    <div><strong>Time:</strong> {formatTime(verifyingRun.time || '00:00:00')}</div>
                    <div><strong>Date:</strong> {verifyingRun.date}</div>
                    {verifyingRun.srcCategoryName && (
                      <div className="text-xs text-[hsl(222,15%,60%)]">
                        SRC Category: {verifyingRun.srcCategoryName}
                      </div>
                    )}
                    {verifyingRun.srcPlatformName && (
                      <div className="text-xs text-[hsl(222,15%,60%)]">
                        SRC Platform: {verifyingRun.srcPlatformName}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setVerifyingRun(null);
                  setVerifyingRunCategory("");
                  setVerifyingRunPlatform("");
                  setVerifyingRunLevel("");
                }}
                className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!verifyingRunCategory || !verifyingRunPlatform) {
                    toast({
                      title: "Missing Information",
                      description: "Please select a category and platform.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if ((verifyingRun?.leaderboardType === 'individual-level' || verifyingRun?.leaderboardType === 'community-golds') && !verifyingRunLevel) {
                    toast({
                      title: "Missing Information",
                      description: "Please select a level.",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (verifyingRun) {
                    verifyRunDirectly(verifyingRun.id, verifyingRun);
                  }
                }}
                className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] hover:from-[#b4a0e2] hover:to-[#cba6f7] text-[hsl(240,21%,15%)] font-bold"
              >
                Verify Run
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </TabsContent>

        {/* Category Management Section */}
          <TabsContent value="categories" className="space-y-4 animate-fade-in">
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                  <span>
              Manage Categories
                  </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <Tabs value={categoryLeaderboardType} onValueChange={(value) => {
              setCategoryLeaderboardType(value as 'regular' | 'individual-level' | 'community-golds');
              fetchCategories(value as 'regular' | 'individual-level' | 'community-golds');
            }}>
              <TabsList className="grid w-full grid-cols-3 rounded-lg p-0.5 gap-1 mb-4">
                <TabsTrigger 
                  value="regular" 
                  className="data-[state=active]:bg-[#94e2d5] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#94e2d5]/50 py-2 px-3 text-sm"
                >
                  <Trophy className="h-4 w-4 mr-2" />
                  Full Game
                </TabsTrigger>
                <TabsTrigger 
                  value="individual-level" 
                  className="data-[state=active]:bg-[#94e2d5] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#94e2d5]/50 py-2 px-3 text-sm"
                >
                  <Star className="h-4 w-4 mr-2" />
                  Individual Level
                </TabsTrigger>
                <TabsTrigger 
                  value="community-golds" 
                  className="data-[state=active]:bg-[#94e2d5] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#94e2d5]/50 py-2 px-3 text-sm"
                >
                  <Gem className="h-4 w-4 mr-2" />
                  Community Golds
                </TabsTrigger>
              </TabsList>

              <TabsContent value={categoryLeaderboardType} className="mt-0">
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
                      <p className="text-[hsl(222,15%,60%)] text-center py-4 text-sm">No categories found. Add your first category!</p>
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
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
          </TabsContent>

          {/* Level Management Section */}
          <TabsContent value="levels" className="space-y-4 animate-fade-in">
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                  <span>
                    Manage Levels
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <Tabs value={levelLeaderboardType} onValueChange={(value) => {
                  setLevelLeaderboardType(value as 'individual-level' | 'community-golds');
                }}>
                  <TabsList className="grid w-full grid-cols-2 rounded-lg p-0.5 gap-1 mb-4">
                    <TabsTrigger 
                      value="individual-level" 
                      className="data-[state=active]:bg-[#94e2d5] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#94e2d5]/50 py-2 px-3 text-sm"
                    >
                      <Star className="h-4 w-4 mr-2" />
                      Individual Level
                    </TabsTrigger>
                    <TabsTrigger 
                      value="community-golds" 
                      className="data-[state=active]:bg-[#94e2d5] data-[state=active]:text-[#11111b] bg-ctp-surface0 text-ctp-text transition-all duration-300 font-medium border border-transparent hover:bg-ctp-surface1 hover:border-[#94e2d5]/50 py-2 px-3 text-sm"
                    >
                      <Gem className="h-4 w-4 mr-2" />
                      Community Golds
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value={levelLeaderboardType} className="mt-0">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-base font-semibold mb-3">Add New Level</h3>
                        <form onSubmit={(e) => { e.preventDefault(); handleAddLevel(); }} className="space-y-3">
                          <div>
                            <Label htmlFor="levelName" className="text-sm">Level Name</Label>
                            <Input
                              id="levelName"
                              type="text"
                              value={newLevelName}
                              onChange={(e) => setNewLevelName(e.target.value)}
                              placeholder="e.g., Level 1"
                              required
                              className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] h-9 text-sm"
                            />
                          </div>
                          <Button 
                            type="submit" 
                            disabled={addingLevel}
                            size="sm"
                            className="bg-gradient-to-r from-[#cba6f7] to-[#b4a0e2] hover:from-[#b4a0e2] hover:to-[#cba6f7] text-[hsl(240,21%,15%)] font-bold flex items-center gap-2 transition-all duration-300 hover:scale-105 hover:shadow-lg"
                          >
                            <PlusCircle className="h-3 w-3" />
                            {addingLevel ? "Adding..." : "Add Level"}
                          </Button>
                        </form>
                      </div>
                      <div>
                        <h3 className="text-base font-semibold mb-3">Existing Levels</h3>
                        {availableLevels.length === 0 ? (
                          <p className="text-[hsl(222,15%,60%)] text-center py-4 text-sm">No levels found.</p>
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
                                {availableLevels.map((level, index) => (
                              <TableRow key={level.id} className="border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)] transition-all duration-200 hover:shadow-sm">
                                <TableCell className="py-2 px-3 font-medium text-sm">
                                  {editingLevel?.id === level.id ? (
                                    <Input
                                      value={editingLevelName}
                                      onChange={(e) => setEditingLevelName(e.target.value)}
                                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] h-8 text-sm"
                                      autoFocus
                                    />
                                  ) : (
                                    level.name
                                  )}
                                </TableCell>
                                <TableCell className="py-2 px-3 text-center space-x-1">
                                  {editingLevel?.id === level.id ? (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleSaveEditLevel}
                                        disabled={updatingLevel}
                                        className="text-green-500 hover:bg-green-900/20 h-7"
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleCancelEditLevel}
                                        disabled={updatingLevel}
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
                                        onClick={() => handleMoveLevelUp(level.id)}
                                        disabled={reorderingLevel === level.id || index === 0}
                                        className="text-purple-500 hover:bg-purple-900/20 disabled:opacity-50 h-7 w-7 p-0 transition-all duration-200 hover:scale-110"
                                        title="Move up"
                                      >
                                        <ArrowUp className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleMoveLevelDown(level.id)}
                                        disabled={reorderingLevel === level.id || index === availableLevels.length - 1}
                                        className="text-purple-500 hover:bg-purple-900/20 disabled:opacity-50 h-7 w-7 p-0 transition-all duration-200 hover:scale-110"
                                        title="Move down"
                                      >
                                        <ArrowDown className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleStartEditLevel(level)}
                                        className="text-blue-500 hover:bg-blue-900/20 h-7 w-7 p-0 transition-all duration-200 hover:scale-110"
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteLevel(level.id)}
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
                  
                  {/* Category Management for Levels */}
                  {availableLevels.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-[hsl(235,13%,30%)]">
                      <h3 className="text-base font-semibold mb-4">Disable Levels by Category</h3>
                      <p className="text-sm text-[hsl(222,15%,60%)] mb-4">
                        Disable specific levels from appearing in certain categories for {levelLeaderboardType === 'individual-level' ? 'Individual Level' : 'Community Golds'} runs.
                      </p>
                      <div className="space-y-4 max-h-[500px] overflow-y-auto">
                        {availableLevels.map((level) => {
                          // Categories are already filtered by levelLeaderboardType in the useEffect above
                          // firestoreCategories should already contain the correct categories
                          // For community-golds, we use regular categories
                          // For individual-level, we use individual-level categories
                          const relevantCategories = firestoreCategories;
                          
                          if (relevantCategories.length === 0) {
                            return (
                              <div key={level.id} className="bg-[hsl(240,21%,15%)] rounded-lg p-4 border border-[hsl(235,13%,30%)]">
                                <div className="font-medium text-sm mb-3 text-[#f2cdcd]">{level.name}</div>
                                <p className="text-xs text-[hsl(222,15%,60%)]">
                                  No categories available for {levelLeaderboardType === 'community-golds' ? 'Community Golds' : 'Individual Level'} runs.
                                </p>
                              </div>
                            );
                          }
                          
                          const isDisabled = (categoryId: string) => {
                            return (level as Level).disabledCategories?.[categoryId] === true;
                          };
                          
                          return (
                            <div key={level.id} className="bg-[hsl(240,21%,15%)] rounded-lg p-4 border border-[hsl(235,13%,30%)]">
                              <div className="font-medium text-sm mb-3 text-[#f2cdcd]">{level.name}</div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {relevantCategories.map((category) => (
                                  <label
                                    key={category.id}
                                    className="flex items-center gap-2 p-2 rounded hover:bg-[hsl(235,19%,13%)] cursor-pointer transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!isDisabled(category.id)}
                                      onChange={async (e) => {
                                        const disabled = !e.target.checked;
                                        try {
                                          const success = await updateLevelCategoryDisabled(
                                            level.id,
                                            category.id,
                                            disabled
                                          );
                                          if (success) {
                                            // Update local state
                                            setAvailableLevels(prev => 
                                              prev.map(l => {
                                                if (l.id === level.id) {
                                                  const levelData = l as Level;
                                                  const disabledCategories = levelData.disabledCategories || {};
                                                  if (disabled) {
                                                    disabledCategories[category.id] = true;
                                                  } else {
                                                    delete disabledCategories[category.id];
                                                  }
                                                  return { ...l, disabledCategories };
                                                }
                                                return l;
                                              })
                                            );
                                            toast({
                                              title: disabled ? "Level Disabled" : "Level Enabled",
                                              description: `${level.name} is now ${disabled ? 'disabled' : 'enabled'} for ${category.name}.`,
                                            });
                                          } else {
                                            throw new Error("Failed to update level category state");
                                          }
                                        } catch (error: any) {
                                          toast({
                                            title: "Error",
                                            description: error.message || "Failed to update level category state.",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                      className="w-4 h-4 rounded border-[hsl(235,13%,30%)] bg-[hsl(240,21%,15%)] text-[#cba6f7] focus:ring-2 focus:ring-[#cba6f7] cursor-pointer"
                                    />
                                    <span className={`text-xs ${isDisabled(category.id) ? 'text-[hsl(222,15%,50%)] line-through' : 'text-[hsl(222,15%,70%)]'}`}>
                                      {category.name}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

        {/* Platform Management Section */}
          <TabsContent value="platforms" className="space-y-4 animate-fade-in">
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                  <span>
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

          {/* Users Section */}
          <TabsContent value="users" className="space-y-4 animate-fade-in">
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                    <Users className="h-5 w-5" />
                    <span>User Management</span>
                  </CardTitle>
                  <Button
                    onClick={fetchPlayers}
                    disabled={loadingPlayers}
                    variant="outline"
                    size="sm"
                    className="border-[hsl(235,13%,30%)] bg-gradient-to-r from-transparent via-[hsl(237,16%,24%)]/50 to-transparent hover:from-[hsl(237,16%,24%)] hover:via-[hsl(237,16%,28%)] hover:to-[hsl(237,16%,24%)] hover:border-[#cba6f7]/50"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${loadingPlayers ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                {/* Search and Filters */}
                <div className="mb-6 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ctp-overlay0" />
                      <Input
                        placeholder="Search by name, email, UID, Twitch, or SRC username..."
                        value={playersSearchQuery}
                        onChange={(e) => {
                          setPlayersSearchQuery(e.target.value);
                          setPlayersPage(1);
                        }}
                        className="pl-10 bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-ctp-text"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Select
                        value={playersSortBy}
                        onValueChange={(value: 'joinDate' | 'displayName' | 'totalPoints' | 'totalRuns') => {
                          setPlayersSortBy(value);
                          setPlayersPage(1);
                        }}
                      >
                        <SelectTrigger className="w-[180px] bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-ctp-text">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="joinDate">Join Date</SelectItem>
                          <SelectItem value="displayName">Display Name</SelectItem>
                          <SelectItem value="totalPoints">Total Points</SelectItem>
                          <SelectItem value="totalRuns">Total Runs</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPlayersSortOrder(playersSortOrder === 'asc' ? 'desc' : 'asc');
                          setPlayersPage(1);
                        }}
                        className="border-[hsl(235,13%,30%)] bg-[hsl(240,21%,15%)] text-ctp-text"
                      >
                        {playersSortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Players Table */}
                {loadingPlayers ? (
                  <div className="flex items-center justify-center py-8">
                    <LoadingSpinner size="md" />
                  </div>
                ) : filteredPlayers.length === 0 ? (
                  <p className="text-sm text-ctp-subtext1 text-center py-8">
                    {playersSearchQuery ? "No users found matching your search." : "No users found."}
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-[hsl(235,13%,30%)]">
                            <TableHead className="text-ctp-text">Display Name</TableHead>
                            <TableHead className="text-ctp-text">Email</TableHead>
                            <TableHead className="text-ctp-text">Join Date</TableHead>
                            <TableHead className="text-ctp-text">Stats</TableHead>
                            <TableHead className="text-ctp-text">Admin</TableHead>
                            <TableHead className="text-ctp-text">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedPlayers.map((player) => (
                            <TableRow key={player.id} className="border-[hsl(235,13%,30%)]">
                              <TableCell className="text-ctp-text">
                                <div className="flex items-center gap-2">
                                  <span style={{ color: player.nameColor || '#cba6f7' }}>
                                    {player.displayName || "Unknown"}
                                  </span>
                                  {player.isAdmin && (
                                    <Badge variant="outline" className="border-yellow-600/50 bg-yellow-600/10 text-yellow-400 text-xs">
                                      Admin
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-ctp-text">{player.email || "—"}</TableCell>
                              <TableCell className="text-ctp-text">{player.joinDate || "—"}</TableCell>
                              <TableCell className="text-ctp-text">
                                <div className="flex flex-col gap-1 text-xs">
                                  <span>Points: {player.totalPoints || 0}</span>
                                  <span>Runs: {player.totalRuns || 0}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-ctp-text">
                                {player.isAdmin ? (
                                  <Badge variant="outline" className="border-green-600/50 bg-green-600/10 text-green-400">
                                    Yes
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="border-[hsl(235,13%,30%)]">
                                    No
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button
                                    onClick={() => handleEditPlayer(player)}
                                    variant="outline"
                                    size="sm"
                                    className="border-[hsl(235,13%,30%)] bg-[hsl(240,21%,15%)] text-ctp-text hover:bg-[hsl(240,21%,18%)]"
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    onClick={() => handleDeletePlayerClick(player)}
                                    variant="destructive"
                                    size="sm"
                                    className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border-red-600/50"
                                    disabled={player.uid === currentUser?.uid}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {filteredPlayers.length > itemsPerPage && (
                      <div className="mt-4">
                        <Pagination
                          currentPage={playersPage}
                          totalPages={Math.ceil(filteredPlayers.length / itemsPerPage)}
                          onPageChange={setPlayersPage}
                          itemsPerPage={itemsPerPage}
                          totalItems={filteredPlayers.length}
                        />
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Edit Player Dialog */}
            {editingPlayer && (
              <Dialog open={!!editingPlayer} onOpenChange={(open) => !open && setEditingPlayer(null)}>
                <DialogContent className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-ctp-text max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-[#f2cdcd]">Edit User: {editingPlayer.displayName || "Unknown"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="edit-displayName">Display Name</Label>
                      <Input
                        id="edit-displayName"
                        value={editingPlayerForm.displayName || ""}
                        onChange={(e) => setEditingPlayerForm({ ...editingPlayerForm, displayName: e.target.value })}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-ctp-text"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-email">Email</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={editingPlayerForm.email || ""}
                        onChange={(e) => setEditingPlayerForm({ ...editingPlayerForm, email: e.target.value })}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-ctp-text"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-nameColor">Name Color</Label>
                      <Input
                        id="edit-nameColor"
                        type="color"
                        value={editingPlayerForm.nameColor || "#cba6f7"}
                        onChange={(e) => setEditingPlayerForm({ ...editingPlayerForm, nameColor: e.target.value })}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-ctp-text h-10"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-bio">Bio</Label>
                      <Textarea
                        id="edit-bio"
                        value={editingPlayerForm.bio || ""}
                        onChange={(e) => setEditingPlayerForm({ ...editingPlayerForm, bio: e.target.value })}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-ctp-text"
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-pronouns">Pronouns</Label>
                      <Input
                        id="edit-pronouns"
                        value={editingPlayerForm.pronouns || ""}
                        onChange={(e) => setEditingPlayerForm({ ...editingPlayerForm, pronouns: e.target.value })}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-ctp-text"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-twitchUsername">Twitch Username</Label>
                      <Input
                        id="edit-twitchUsername"
                        value={editingPlayerForm.twitchUsername || ""}
                        onChange={(e) => setEditingPlayerForm({ ...editingPlayerForm, twitchUsername: e.target.value })}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-ctp-text"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-srcUsername">Speedrun.com Username</Label>
                      <Input
                        id="edit-srcUsername"
                        value={editingPlayerForm.srcUsername || ""}
                        onChange={(e) => setEditingPlayerForm({ ...editingPlayerForm, srcUsername: e.target.value })}
                        className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-ctp-text"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="edit-isAdmin"
                        checked={editingPlayerForm.isAdmin || false}
                        onChange={(e) => setEditingPlayerForm({ ...editingPlayerForm, isAdmin: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="edit-isAdmin">Admin Status</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingPlayer(null);
                        setEditingPlayerForm({});
                      }}
                      className="border-[hsl(235,13%,30%)] bg-[hsl(240,21%,15%)] text-ctp-text"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSavePlayer}
                      disabled={savingPlayer}
                      className="bg-[#cba6f7] hover:bg-[#b4a0e2] text-[hsl(240,21%,15%)] font-bold"
                    >
                      {savingPlayer ? (
                        <>
                          <LoadingSpinner size="sm" className="mr-2" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" />
                          Save
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {/* Delete Player Dialog */}
            <Dialog open={showDeletePlayerDialog} onOpenChange={setShowDeletePlayerDialog}>
              <DialogContent className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)] text-ctp-text">
                <DialogHeader>
                  <DialogTitle className="text-[#f2cdcd]">Delete User</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-ctp-text">
                    Are you sure you want to delete <strong>{playerToDelete?.displayName}</strong>? This action cannot be undone.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="delete-runs"
                      checked={deletePlayerRuns}
                      onChange={(e) => setDeletePlayerRuns(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="delete-runs">Also delete all runs associated with this user</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowDeletePlayerDialog(false);
                      setPlayerToDelete(null);
                      setDeletePlayerRuns(false);
                    }}
                    className="border-[hsl(235,13%,30%)] bg-[hsl(240,21%,15%)] text-ctp-text"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeletePlayer}
                    disabled={deletingPlayerId === playerToDelete?.id}
                    variant="destructive"
                    className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border-red-600/50"
                  >
                    {deletingPlayerId === playerToDelete?.id ? (
                      <>
                        <LoadingSpinner size="sm" className="mr-2" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

        {/* Manage Downloads Section */}
          <TabsContent value="downloads" className="space-y-4 animate-fade-in">
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                  <span>
              Manage Downloads
                  </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
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
                              const uploadedFiles = await startUpload([file]);
                              
                              // Handle different response structures
                              let fileUrl: string | null = null;
                              
                              if (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
                                // Standard array response
                                const firstFile = uploadedFiles[0] as any;
                                fileUrl = firstFile?.url || firstFile?.serverData?.url || null;
                              } else if (uploadedFiles && typeof uploadedFiles === 'object') {
                                // Object response - try different possible properties
                                fileUrl = (uploadedFiles as any).url || 
                                         (uploadedFiles as any).fileUrl || 
                                         (uploadedFiles as any)[0]?.url ||
                                         null;
                              }
                              
                              if (fileUrl) {
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