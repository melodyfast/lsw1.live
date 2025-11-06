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
import { CheckCircle, XCircle, ShieldAlert, ExternalLink, Download, PlusCircle, Trash2, Wrench, Edit2, FolderTree, Play, ArrowUp, ArrowDown, Gamepad2, UserPlus, UserMinus, Trophy, Upload, Star, Gem, RefreshCw, X, AlertTriangle } from "lucide-react";
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
} from "@/lib/db";
import { 
  getLSWGameId, 
  fetchRunsNotOnLeaderboards, 
  mapSRCRunToLeaderboardEntry,
  fetchCategories as fetchSRCCategories,
  fetchLevels as fetchSRCLevels,
  fetchPlatforms as fetchSRCPlatforms,
  type SRCRun,
} from "@/lib/speedruncom";
import { useUploadThing } from "@/lib/uploadthing";
import { LeaderboardEntry, DownloadEntry } from "@/types/database";
import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { formatTime } from "@/lib/utils";
import { getCategoryName, getPlatformName, getLevelName, normalizeCategoryId, normalizePlatformId, normalizeLevelId } from "@/lib/dataValidation";

const Admin = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [unverifiedRuns, setUnverifiedRuns] = useState<LeaderboardEntry[]>([]);
  const [importedSRCRuns, setImportedSRCRuns] = useState<LeaderboardEntry[]>([]);
  const [importingRuns, setImportingRuns] = useState(false);
  const [importProgress, setImportProgress] = useState({ total: 0, imported: 0, skipped: 0 });
  const [editingImportedRun, setEditingImportedRun] = useState<LeaderboardEntry | null>(null);
  const [editingImportedRunForm, setEditingImportedRunForm] = useState<Partial<LeaderboardEntry>>({});
  const [savingImportedRun, setSavingImportedRun] = useState(false);
  const [unverifiedPage, setUnverifiedPage] = useState(1);
  const [importedPage, setImportedPage] = useState(1);
  const [clearingImportedRuns, setClearingImportedRuns] = useState(false);
  const itemsPerPage = 25;
  // Filters for imported runs
  const [importedRunsLeaderboardType, setImportedRunsLeaderboardType] = useState<'regular' | 'individual-level'>('regular');
  const [importedRunsCategory, setImportedRunsCategory] = useState("__all__"); // "__all__" = All Categories
  const [importedRunsPlatform, setImportedRunsPlatform] = useState("__all__"); // "__all__" = All Platforms
  const [importedRunsLevel, setImportedRunsLevel] = useState("__all__"); // "__all__" = All Levels
  const [importedRunsCategories, setImportedRunsCategories] = useState<{ id: string; name: string }[]>([]);
  const [unmatchedPlayers, setUnmatchedPlayers] = useState<Map<string, { player1?: string; player2?: string }>>(new Map()); // Map of runId to unmatched player names
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
  const [categoryLeaderboardType, setCategoryLeaderboardType] = useState<'regular' | 'individual-level'>('regular');
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
  const [activeTab, setActiveTab] = useState("runs");

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

  useEffect(() => {
    if (firestorePlatforms.length > 0 && !manualRun.platform) {
      setManualRun(prev => ({ ...prev, platform: firestorePlatforms[0].id }));
    }
  }, [firestorePlatforms]);

  useEffect(() => {
    if (editingImportedRun) {
      setEditingImportedRunForm({
        playerName: editingImportedRun.playerName,
        player2Name: editingImportedRun.player2Name,
        category: editingImportedRun.category,
        platform: editingImportedRun.platform,
        runType: editingImportedRun.runType,
        leaderboardType: editingImportedRun.leaderboardType,
        level: editingImportedRun.level,
        time: editingImportedRun.time,
        date: editingImportedRun.date,
        videoUrl: editingImportedRun.videoUrl,
        comment: editingImportedRun.comment,
      });
    }
  }, [editingImportedRun]);

  useEffect(() => {
    // Fetch categories when leaderboard type changes for manual run
    const categoryType = manualRunLeaderboardType === 'community-golds' ? 'regular' : manualRunLeaderboardType;
    fetchCategories(categoryType);
    setManualRun(prev => ({ ...prev, category: "", level: "" })); // Reset category and level when type changes
  }, [manualRunLeaderboardType]);

  const fetchAllData = async () => {
    if (hasFetchedData) return;
    setLoading(true);
    try {
      const [unverifiedData, importedData, downloadData, categoriesData] = await Promise.all([
        getUnverifiedLeaderboardEntries(),
        getImportedSRCRuns(),
        getDownloadEntries(),
        getCategoriesFromFirestore('regular')
      ]);
      setUnverifiedRuns(unverifiedData.filter(run => !run.importedFromSRC));
      setImportedSRCRuns(importedData);
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

  // Fetch data on mount
  useEffect(() => {
    if (!authLoading && currentUser) {
      fetchAllData();
    }
  }, [authLoading, currentUser]);
  
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
      setUnverifiedRuns(data.filter(run => !run.importedFromSRC));
      setUnverifiedPage(1); // Reset to first page when data changes
      
      try {
        const importedData = await getImportedSRCRuns();
        setImportedSRCRuns(importedData);
        setImportedPage(1); // Reset to first page when data changes
        
        // Check for unmatched players in imported runs
        const unmatchedMap = new Map<string, { player1?: string; player2?: string }>();
        for (const run of importedData) {
          if (!run.verified) {
            const unmatched: { player1?: string; player2?: string } = {};
            
            // Check player1
            if (run.playerName) {
              const player1 = await getPlayerByDisplayName(run.playerName);
              if (!player1) {
                unmatched.player1 = run.playerName;
              }
            }
            
            // Check player2
            if (run.player2Name) {
              const player2 = await getPlayerByDisplayName(run.player2Name);
              if (!player2) {
                unmatched.player2 = run.player2Name;
              }
            }
            
            if (unmatched.player1 || unmatched.player2) {
              unmatchedMap.set(run.id, unmatched);
            }
          }
        }
        setUnmatchedPlayers(unmatchedMap);
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

  const handleImportFromSRC = async () => {
    if (importingRuns) return;
    
    setImportingRuns(true);
    setImportProgress({ total: 0, imported: 0, skipped: 0 });
    
    try {
      // Get game ID
      const gameId = await getLSWGameId();
      if (!gameId) {
        throw new Error("Could not find LEGO Star Wars game on speedrun.com");
      }

      // Fetch runs from speedrun.com
      toast({
        title: "Fetching Runs",
        description: "Fetching runs from speedrun.com...",
      });
      
      const srcRuns = await fetchRunsNotOnLeaderboards(gameId);
      setImportProgress(prev => ({ ...prev, total: srcRuns.length }));

      if (srcRuns.length === 0) {
        toast({
          title: "No Runs Found",
          description: "No runs found to import from speedrun.com.",
        });
        setImportingRuns(false);
        return;
      }

      // Get existing runs to check for duplicates
      const existingRuns = await getAllRunsForDuplicateCheck();
      const existingSRCRunIds = new Set(
        existingRuns.filter(r => r.srcRunId).map(r => r.srcRunId!)
      );

      // Create a set of existing runs for duplicate checking by run data
      // Normalize player names for comparison
      const normalizeName = (name: string) => name.trim().toLowerCase();
      const existingRunKeys = new Set<string>();
      // Only check verified runs for duplicates (unverified runs can be duplicates during import)
      for (const run of existingRuns.filter(r => r.verified)) {
        const key = `${normalizeName(run.playerName)}|${run.category}|${run.platform}|${run.runType}|${run.time}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
        existingRunKeys.add(key);
        // For co-op runs, also add the swapped key
        if (run.runType === 'co-op' && run.player2Name) {
          const swappedKey = `${normalizeName(run.player2Name)}|${run.category}|${run.platform}|${run.runType}|${run.time}|${run.leaderboardType || 'regular'}|${run.level || ''}`;
          existingRunKeys.add(swappedKey);
        }
      }

      // Get mappings for categories, platforms, and levels
      const [ourCategories, ourPlatforms, ourLevels, srcCategories, srcPlatforms, srcLevels] = await Promise.all([
        getCategoriesFromFirestore(),
        getPlatformsFromFirestore(),
        getLevels(),
        fetchSRCCategories(gameId),
        fetchSRCPlatforms(),
        fetchSRCLevels(gameId),
      ]);

      // Create mapping maps (by name, since IDs differ)
      const categoryMapping = new Map<string, string>();
      const platformMapping = new Map<string, string>();
      const levelMapping = new Map<string, string>();

      // Map SRC categories to our categories by name
      for (const srcCat of srcCategories) {
        const ourCat = ourCategories.find(c => 
          c.name.toLowerCase() === srcCat.name.toLowerCase()
        );
        if (ourCat) {
          categoryMapping.set(srcCat.id, ourCat.id);
        }
      }

      // Map SRC platforms to our platforms by name
      for (const srcPlatform of srcPlatforms) {
        const ourPlatform = ourPlatforms.find(p => 
          p.name.toLowerCase() === srcPlatform.name.toLowerCase()
        );
        if (ourPlatform) {
          platformMapping.set(srcPlatform.id, ourPlatform.id);
        }
      }

      // Map SRC levels to our levels by name
      for (const srcLevel of srcLevels) {
        const ourLevel = ourLevels.find(l => 
          l.name.toLowerCase() === srcLevel.name.toLowerCase()
        );
        if (ourLevel) {
          levelMapping.set(srcLevel.id, ourLevel.id);
        }
      }

      // Also create reverse mappings for embedded data (by name)
      const categoryNameMapping = new Map<string, string>(); // SRC category name -> our category ID
      const platformNameMapping = new Map<string, string>(); // SRC platform name -> our platform ID
      
      for (const srcCat of srcCategories) {
        const ourCat = ourCategories.find(c => 
          c.name.toLowerCase() === srcCat.name.toLowerCase()
        );
        if (ourCat) {
          categoryNameMapping.set(srcCat.name.toLowerCase(), ourCat.id);
        }
      }
      
      for (const srcPlatform of srcPlatforms) {
        const ourPlatform = ourPlatforms.find(p => 
          p.name.toLowerCase() === srcPlatform.name.toLowerCase()
        );
        if (ourPlatform) {
          platformNameMapping.set(srcPlatform.name.toLowerCase(), ourPlatform.id);
        }
      }

      let imported = 0;
      let skipped = 0;
      const unmatchedPlayersMap = new Map<string, { player1?: string; player2?: string }>();

      // Import runs
      for (const srcRun of srcRuns) {
        // Skip if already imported by srcRunId
        if (existingSRCRunIds.has(srcRun.id)) {
          skipped++;
          setImportProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }));
          continue;
        }

        try {
          // Extract category and platform from embedded data or IDs
          let srcCategoryId = typeof srcRun.category === 'string' ? srcRun.category : srcRun.category?.data?.id || '';
          let srcCategoryName = typeof srcRun.category === 'string' ? '' : (srcRun.category?.data?.name || '');
          
          let srcPlatformId = '';
          let srcPlatformName = '';
          if (srcRun.system?.platform) {
            if (typeof srcRun.system.platform === 'string') {
              srcPlatformId = srcRun.system.platform;
            } else {
              srcPlatformId = srcRun.system.platform.data?.id || '';
              srcPlatformName = srcRun.system.platform.data?.name || '';
            }
          }
          
          // Try to find our category ID - first by SRC ID, then by name
          let ourCategoryId = categoryMapping.get(srcCategoryId);
          if (!ourCategoryId && srcCategoryName) {
            ourCategoryId = categoryNameMapping.get(srcCategoryName.toLowerCase());
          }
          if (!ourCategoryId) {
            ourCategoryId = srcCategoryId; // Fallback to SRC ID if no mapping found
          }
          
          // Try to find our platform ID - first by SRC ID, then by name
          let ourPlatformId = platformMapping.get(srcPlatformId);
          if (!ourPlatformId && srcPlatformName) {
            ourPlatformId = platformNameMapping.get(srcPlatformName.toLowerCase());
          }
          if (!ourPlatformId) {
            ourPlatformId = srcPlatformId; // Fallback to SRC ID if no mapping found
          }

          // Map the run with corrected IDs and name mappings
          const mappedRun = mapSRCRunToLeaderboardEntry(
            srcRun,
            undefined,
            categoryMapping,
            platformMapping,
            levelMapping,
            "imported",
            categoryNameMapping,
            platformNameMapping
          );

          // Override with correctly mapped category and platform (in case mapping function didn't use name mappings)
          mappedRun.category = ourCategoryId;
          mappedRun.platform = ourPlatformId;

          // Check if we have a valid category and platform
          if (!mappedRun.category || !mappedRun.platform || mappedRun.category === '' || mappedRun.platform === '') {
            console.log(`Skipping run ${srcRun.id}: missing category or platform. Category: ${mappedRun.category}, Platform: ${mappedRun.platform}`);
            skipped++;
            setImportProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }));
            continue;
          }
          
          // Ensure player names are strings
          if (typeof mappedRun.playerName !== 'string') {
            mappedRun.playerName = String(mappedRun.playerName || 'Unknown');
          }
          if (mappedRun.player2Name && typeof mappedRun.player2Name !== 'string') {
            mappedRun.player2Name = String(mappedRun.player2Name);
          }

          // Check if a similar run already exists on the site
          const player1Name = normalizeName(mappedRun.playerName || '');
          const player2Name = mappedRun.player2Name ? normalizeName(mappedRun.player2Name) : '';
          const runKey = `${player1Name}|${mappedRun.category}|${mappedRun.platform}|${mappedRun.runType}|${mappedRun.time}|${mappedRun.leaderboardType || 'regular'}|${mappedRun.level || ''}`;
          
          // Check for exact duplicate (only against verified runs)
          if (existingRunKeys.has(runKey)) {
            console.log(`Skipping run ${srcRun.id}: duplicate found (verified run exists)`);
            skipped++;
            setImportProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }));
            continue;
          }

          // Also check for co-op runs with swapped players
          if (mappedRun.runType === 'co-op' && player2Name) {
            const swappedKey = `${player2Name}|${mappedRun.category}|${mappedRun.platform}|${mappedRun.runType}|${mappedRun.time}|${mappedRun.leaderboardType || 'regular'}|${mappedRun.level || ''}`;
            if (existingRunKeys.has(swappedKey)) {
              console.log(`Skipping run ${srcRun.id}: duplicate found (verified co-op run exists with swapped players)`);
              skipped++;
              setImportProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }));
              continue;
            }
          }

          // Check if player names match any players on the site
          const player1Matched = await getPlayerByDisplayName(mappedRun.playerName || '');
          const player2Matched = mappedRun.player2Name ? await getPlayerByDisplayName(mappedRun.player2Name) : null;
          
          // Track unmatched players
          const unmatched: { player1?: string; player2?: string } = {};
          if (!player1Matched) {
            unmatched.player1 = mappedRun.playerName;
          }
          if (mappedRun.player2Name && !player2Matched) {
            unmatched.player2 = mappedRun.player2Name;
          }
          
          // Verify the run has importedFromSRC set
          if (!mappedRun.importedFromSRC) {
            console.warn(`Run ${srcRun.id} missing importedFromSRC flag, setting it now`);
            mappedRun.importedFromSRC = true;
          }
          if (!mappedRun.srcRunId) {
            mappedRun.srcRunId = srcRun.id;
          }
          
          // Add the run
          const addedRunId = await addLeaderboardEntry(mappedRun as any);
          
          if (!addedRunId) {
            console.error(`Failed to add run ${srcRun.id} - no ID returned`);
            skipped++;
            setImportProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }));
            continue;
          }
          
          console.log(`Successfully imported run ${srcRun.id} with ID ${addedRunId}`);
          
          // Store unmatched player info if any (use the run ID from the response)
          if ((unmatched.player1 || unmatched.player2) && addedRunId) {
            unmatchedPlayersMap.set(addedRunId, unmatched);
          }
          
          imported++;
          setImportProgress(prev => ({ ...prev, imported: prev.imported + 1 }));
          
          // Add to existing keys to prevent duplicates within the same import batch
          existingRunKeys.add(runKey);
        } catch (error) {
          console.error(`Error importing run ${srcRun.id}:`, error);
          skipped++;
          setImportProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }));
        }
      }

      // Update unmatched players state
      setUnmatchedPlayers(unmatchedPlayersMap);
      
      // Show summary with unmatched player warnings
      const unmatchedCount = unmatchedPlayersMap.size;
      if (unmatchedCount > 0) {
        toast({
          title: "Import Complete",
          description: `Imported ${imported} runs, skipped ${skipped} duplicates or invalid runs. ${unmatchedCount} run(s) have player names that don't match any players on the site.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Import Complete",
          description: `Imported ${imported} runs, skipped ${skipped} duplicates or invalid runs.`,
        });
      }

      // Refresh the runs list - wait a moment for Firestore to update and index
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try fetching with retries in case Firestore needs more time
      let retries = 3;
      let fetched = false;
      while (retries > 0 && !fetched) {
        try {
          await fetchUnverifiedRuns();
          const checkData = await getImportedSRCRuns();
          if (checkData.length >= imported) {
            fetched = true;
            console.log(`Successfully fetched ${checkData.length} imported runs after refresh`);
          } else {
            console.log(`Only fetched ${checkData.length} of ${imported} imported runs, retrying...`);
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        } catch (error) {
          console.error("Error refreshing runs:", error);
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      if (!fetched) {
        toast({
          title: "Warning",
          description: "Some imported runs may not appear immediately. Please refresh the page.",
          variant: "default",
        });
      }
    } catch (error: any) {
      toast({
        title: "Import Error",
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

  const handleSaveImportedRun = async () => {
    if (!editingImportedRun) return;
    
    setSavingImportedRun(true);
    try {
      const updateData: Partial<LeaderboardEntry> = {
        playerName: editingImportedRunForm.playerName,
        player2Name: editingImportedRunForm.player2Name,
        category: editingImportedRunForm.category,
        platform: editingImportedRunForm.platform,
        runType: editingImportedRunForm.runType,
        leaderboardType: editingImportedRunForm.leaderboardType,
        level: editingImportedRunForm.level,
        time: editingImportedRunForm.time,
        date: editingImportedRunForm.date,
        videoUrl: editingImportedRunForm.videoUrl,
        comment: editingImportedRunForm.comment,
      };

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key as keyof LeaderboardEntry] === undefined) {
          delete updateData[key as keyof LeaderboardEntry];
        }
      });

      const success = await updateLeaderboardEntry(editingImportedRun.id, updateData);
      if (success) {
        toast({
          title: "Run Updated",
          description: "The imported run has been updated successfully.",
        });
        setEditingImportedRun(null);
        setEditingImportedRunForm({});
        await fetchUnverifiedRuns();
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

        {/* Unverified Runs Section */}
          <TabsContent value="runs" className="space-y-4 animate-fade-in">
            {/* Import from Speedrun.com Card */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                  <Upload className="h-5 w-5" />
                  <span>Import from Speedrun.com</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <p className="text-[hsl(222,15%,60%)]">
                    Import runs from speedrun.com that aren't on the leaderboards. 
                    Runs will be added as unverified and can be edited, verified, or rejected.
                  </p>
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
              </CardContent>
            </Card>

            {/* Regular Unverified Runs */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                  <span>
                    Unverified Runs
                  </span>
                </CardTitle>
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

            {/* Imported Runs from Speedrun.com */}
            <Card className="bg-gradient-to-br from-[hsl(240,21%,16%)] via-[hsl(240,21%,14%)] to-[hsl(235,19%,13%)] border-[hsl(235,13%,30%)] shadow-xl">
              <CardHeader className="bg-gradient-to-r from-[hsl(240,21%,18%)] to-[hsl(240,21%,15%)] border-b border-[hsl(235,13%,30%)]">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl text-[#f2cdcd]">
                    <Star className="h-5 w-5" />
                    <span>Imported Runs from Speedrun.com</span>
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
              <CardContent>
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
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                      {/* Filters */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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
                      </div>

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
                              <TableHead className="py-3 px-4 text-left">Platform</TableHead>
                              <TableHead className="py-3 px-4 text-left">Type</TableHead>
                              <TableHead className="py-3 px-4 text-left">Video</TableHead>
                              <TableHead className="py-3 px-4 text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {unverifiedImported.slice((importedPage - 1) * itemsPerPage, importedPage * itemsPerPage).map((run) => {
                              const unmatched = unmatchedPlayers.get(run.id);
                              return (
                          <TableRow key={run.id} className="border-b border-[hsl(235,13%,30%)] hover:bg-[hsl(235,19%,13%)] transition-all duration-200 hover:shadow-md">
                            <TableCell className="py-3 px-4 font-medium">
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <span style={{ color: run.nameColor || 'inherit' }}>{run.playerName}</span>
                                    {unmatched?.player1 && (
                                      <div title={`Player "${run.playerName}" not found on site`}>
                                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                      </div>
                                    )}
                                  </div>
                                  {run.player2Name && (
                                    <div className="flex items-center gap-1">
                                      <span className="text-muted-foreground"> & </span>
                                      <span style={{ color: run.player2Color || 'inherit' }}>{run.player2Name}</span>
                                      {unmatched?.player2 && (
                                        <div title={`Player "${run.player2Name}" not found on site`}>
                                          <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                        </div>
                                      )}
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
                            <TableCell className="py-3 px-4 font-mono">{formatTime(run.time || '00:00:00')}</TableCell>
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
                            <TableCell className="py-3 px-4 text-center space-x-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setEditingImportedRun(run)}
                                className="text-blue-500 hover:bg-blue-900/20 transition-all duration-300 hover:scale-110 hover:shadow-md"
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
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

        {/* Edit Imported Run Dialog */}
        <Dialog open={!!editingImportedRun} onOpenChange={(open) => {
          if (!open) {
            setEditingImportedRun(null);
            setEditingImportedRunForm({});
          }
        }}>
          <DialogContent className="bg-[hsl(240,21%,16%)] border-[hsl(235,13%,30%)] max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-[#f2cdcd]">Edit Imported Run</DialogTitle>
            </DialogHeader>
            {editingImportedRun && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-playerName">Player Name</Label>
                    <Input
                      id="edit-playerName"
                      value={editingImportedRunForm.playerName ?? editingImportedRun.playerName}
                      onChange={(e) => setEditingImportedRunForm({ ...editingImportedRunForm, playerName: e.target.value })}
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-player2Name">Player 2 Name (Co-op)</Label>
                    <Input
                      id="edit-player2Name"
                      value={editingImportedRunForm.player2Name ?? editingImportedRun.player2Name ?? ""}
                      onChange={(e) => setEditingImportedRunForm({ ...editingImportedRunForm, player2Name: e.target.value || undefined })}
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-category">Category</Label>
                    <Select
                      value={editingImportedRunForm.category ?? editingImportedRun.category}
                      onValueChange={(value) => setEditingImportedRunForm({ ...editingImportedRunForm, category: value })}
                    >
                      <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {firestoreCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="edit-platform">Platform</Label>
                    <Select
                      value={editingImportedRunForm.platform ?? editingImportedRun.platform}
                      onValueChange={(value) => setEditingImportedRunForm({ ...editingImportedRunForm, platform: value })}
                    >
                      <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                        <SelectValue />
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
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-runType">Run Type</Label>
                    <Select
                      value={editingImportedRunForm.runType ?? editingImportedRun.runType}
                      onValueChange={(value) => setEditingImportedRunForm({ ...editingImportedRunForm, runType: value as 'solo' | 'co-op' })}
                    >
                      <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="solo">Solo</SelectItem>
                        <SelectItem value="co-op">Co-op</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="edit-time">Time (HH:MM:SS)</Label>
                    <Input
                      id="edit-time"
                      value={editingImportedRunForm.time ?? editingImportedRun.time}
                      onChange={(e) => setEditingImportedRunForm({ ...editingImportedRunForm, time: e.target.value })}
                      className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                      placeholder="00:00:00"
                    />
                  </div>
                </div>
                {(editingImportedRun.leaderboardType === 'individual-level' || editingImportedRun.leaderboardType === 'community-golds') && (
                  <div>
                    <Label htmlFor="edit-level">Level</Label>
                    <Select
                      value={editingImportedRunForm.level ?? editingImportedRun.level ?? ""}
                      onValueChange={(value) => setEditingImportedRunForm({ ...editingImportedRunForm, level: value })}
                    >
                      <SelectTrigger className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]">
                        <SelectValue />
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
                <div>
                  <Label htmlFor="edit-date">Date</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editingImportedRunForm.date ?? editingImportedRun.date}
                    onChange={(e) => setEditingImportedRunForm({ ...editingImportedRunForm, date: e.target.value })}
                    className="bg-[hsl(240,21%,15%)] border-[hsl(235,13%,30%)]"
                  />
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
            <DialogFooter>
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
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
              setCategoryLeaderboardType(value as 'regular' | 'individual-level');
              fetchCategories(value as 'regular' | 'individual-level');
            }}>
              <TabsList className="grid w-full grid-cols-2 rounded-lg p-0.5 gap-1 mb-4">
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