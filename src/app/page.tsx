'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gamepad2, Search, Upload, Settings, Play, Star, Eye, Trash2,
  Edit3, Zap, Monitor, Cpu, Menu, Grid3X3, Trophy, ArrowLeft,
  ExternalLink, Maximize2, Globe, Database, SlidersHorizontal,
  Plus, Loader2,
  Swords, Compass, CircleDot, Bike, Car, Layers, Smile,
  MousePointerClick, Truck, DoorOpen, Crosshair, Skull,
  Dices, Users, Puzzle, Target, Goal, PersonStanding,
  Brain, Castle, LayoutGrid, Package, Pickaxe,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { DEFAULT_SETTINGS as CACHE_DEFAULTS } from '@/lib/cache-config';
import { CRAZYGAMES_BASE, SOURCE_POLL_INTERVAL, CATEGORY_POLL_INTERVAL, PROGRESS_CLEAR_DELAY, CATEGORY_PROGRESS_CLEAR_DELAY } from '@/lib/constants';

// ─── Genre Icon Map ──────────────────────────────────────────────
const GENRE_ICON_MAP: Record<string, LucideIcon> = {
  Swords, Compass, CircleDot, Bike, Car, Layers, Smile,
  MousePointerClick, Gamepad2, Truck, DoorOpen, Zap,
  Crosshair, Skull, Globe, Grid3X3, Dices, Users, Puzzle,
  Target, Goal, Trophy, PersonStanding, Brain, Castle, Pickaxe,
  LayoutGrid, Package,
};

// ─── Types ──────────────────────────────────────────────────────────
interface Game {
  id: string;
  title: string;
  description: string;
  category: string;
  genre: string;
  thumbnailUrl: string;
  videoUrl: string;
  gameUrl: string;
  plays: number;
  rating: number;
  featured: boolean;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'home' | 'play' | 'manage' | 'sources';
type SortOption = 'newest' | 'popular' | 'top-rated';

interface GenreInfo {
  name: string;
  slug: string;
  icon: string;
  count: number;
}

interface GameSource {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  isActive: boolean;
  gamesFetched: number;
  totalGames: number;
  lastFetched: string | null;
  searchQuery: string;
  createdAt: string;
}

// ─── useTypingEffect Hook ────────────────────────────────────────────
function useTypingEffect(text: string, speed = 100, startDelay = 300) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    setDisplayed('');
    setDone(false);
    const timeout = setTimeout(() => {
      const interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
      return () => clearInterval(interval);
    }, startDelay);
    return () => clearTimeout(timeout);
  }, [text, speed, startDelay]);

  return { displayed, done };
}

// ─── CategoryBadge Component ─────────────────────────────────────────
function CategoryBadge({ category }: { category: string }) {
  switch (category) {
    case 'HTML5':
      return (
        <Badge className="badge-html5 text-xs gap-1">
          <Monitor className="w-3 h-3" /> HTML5
        </Badge>
      );
    case 'UNITY_WEBGL':
      return (
        <Badge className="badge-webgl text-xs gap-1">
          <Cpu className="w-3 h-3" /> Unity WebGL
        </Badge>
      );
    case 'FLASH':
      return (
        <Badge className="badge-flash text-xs gap-1">
          <Zap className="w-3 h-3" /> Flash
        </Badge>
      );
    default:
      return null;
  }
}

// ─── formatPlays Helper ─────────────────────────────────────────────
function formatPlays(plays: number): string {
  if (plays >= 1_000_000) return `${(plays / 1_000_000).toFixed(1)}M`;
  if (plays >= 1_000) return `${(plays / 1_000).toFixed(0)}K`;
  return plays.toString();
}

// ─── GamePortal Component ───────────────────────────────────────────
export default function GamePortal() {
  // State
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('home');
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('All');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [genres, setGenres] = useState<GenreInfo[]>([]);
  const [genresLoading, setGenresLoading] = useState(false);
  const [categoryFetching, setCategoryFetching] = useState(false);
  const [categoryFetchProgress, setCategoryFetchProgress] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gameLoading, setGameLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loadingOverlayDone, setLoadingOverlayDone] = useState(false);

  // Cache settings (synced with DEFAULT_SETTINGS from cache-config)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [cacheImageTTL, setCacheImageTTL] = useState(720);
  const [cacheVideoTTL, setCacheVideoTTL] = useState(168);
  const [cacheStats, setCacheStats] = useState<{ totalFiles: number; totalSize: number; totalSizeFormatted: string } | null>(null);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [cacheSaving, setCacheSaving] = useState(false);

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    category: 'HTML5' as Game['category'],
    thumbnailUrl: '',
    gameUrl: '',
    featured: false,
    tags: '',
  });

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '',
    title: '',
    description: '',
    category: 'HTML5' as Game['category'],
    thumbnailUrl: '',
    gameUrl: '',
    featured: false,
    tags: '',
    rating: 4.0,
  });

  // Hero typing
  const heroTyping = useTypingEffect('PLAY ANY GAME', 120, 400);

  // Sources
  const [sources, setSources] = useState<GameSource[]>([]);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [addSourceForm, setAddSourceForm] = useState({
    name: '',
    type: 'CRAZYGAMES' as string,
    baseUrl: CRAZYGAMES_BASE,
    searchQuery: '',
  });
  const [fetchingSourceId, setFetchingSourceId] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState<{
    status: string;
    message: string;
    current: number;
    total: number;
  } | null>(null);
  const fetchProgressInterval = useRef<ReturnType<typeof setInterval> | null>(null);



  // Refs
  const gameFrameRef = useRef<HTMLIFrameElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Particles
  const particles = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        animationDuration: 10 + Math.random() * 20,
        animationDelay: Math.random() * 15,
        size: 1 + Math.random() * 2,
      })),
    [],
  );

  // ─── Effects ─────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch genres list
  const fetchGenres = useCallback(async () => {
    try {
      const res = await fetch('/api/games/fetch-categories?mode=genres');
      if (res.ok) {
        const data = await res.json();
        setGenres(data);
      }
    } catch {
      // Silent fail
    }
  }, []);

  // Fetch games on mount and when filters change
  const fetchGames = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (genreFilter && genreFilter !== 'All') params.set('genre', genreFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('sortBy', sortBy);

      const res = await fetch(`/api/games?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setGames(data);
      }
    } catch {
      toast.error('Failed to fetch games');
    } finally {
      setLoading(false);
    }
  }, [genreFilter, searchQuery, sortBy]);

  // Fetch genres on mount
  useEffect(() => {
    fetchGenres();
  }, [fetchGenres]);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // Fetch sources when viewing sources
  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch('/api/sources');
      if (res.ok) {
        const data = await res.json();
        setSources(data);
      }
    } catch {
      toast.error('Failed to fetch sources');
    }
  }, []);

  useEffect(() => {
    if (view === 'sources') {
      fetchSources();
    }
  }, [view, fetchSources]);

  // Cleanup fetch progress interval
  useEffect(() => {
    return () => {
      if (fetchProgressInterval.current) {
        clearInterval(fetchProgressInterval.current);
      }
    };
  }, []);

  // Keyboard shortcut: Ctrl+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── API Functions ───────────────────────────────────────────────

  const playGame = async (game: Game) => {
    setSelectedGame(game);
    setGameLoading(true);
    setView('play');
    try {
      await fetch(`/api/games/${game.id}/play`, { method: 'POST' });
      setGames((prev) =>
        prev.map((g) => (g.id === game.id ? { ...g, plays: g.plays + 1 } : g)),
      );
    } catch {
      // Silent fail for play count
    }
  };

  const handleUpload = async () => {
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadForm),
      });
      if (res.ok) {
        toast.success('Game uploaded successfully!');
        setUploadOpen(false);
        setUploadForm({
          title: '',
          description: '',
          category: 'HTML5',
          thumbnailUrl: '',
          gameUrl: '',
          featured: false,
          tags: '',
        });
        fetchGames();
      } else {
        toast.error('Failed to upload game');
      }
    } catch {
      toast.error('Failed to upload game');
    }
  };

  const openEdit = (game: Game) => {
    setEditForm({
      id: game.id,
      title: game.title,
      description: game.description,
      category: game.category,
      thumbnailUrl: game.thumbnailUrl,
      gameUrl: game.gameUrl,
      featured: game.featured,
      tags: game.tags,
      rating: game.rating,
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    try {
      const res = await fetch(`/api/games/${editForm.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        toast.success('Game updated successfully!');
        setEditOpen(false);
        fetchGames();
      } else {
        toast.error('Failed to update game');
      }
    } catch {
      toast.error('Failed to update game');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/games/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Game deleted successfully!');
        fetchGames();
      } else {
        toast.error('Failed to delete game');
      }
    } catch {
      toast.error('Failed to delete game');
    }
  };

  const toggleFullscreen = () => {
    if (!fullscreenRef.current) return;
    if (!document.fullscreenElement) {
      fullscreenRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const fetchFromSource = async (sourceId: string) => {
    try {
      setFetchingSourceId(sourceId);
      setFetchProgress({ status: 'searching', message: 'Starting fetch...', current: 0, total: 0 });
      await fetch(`/api/sources/${sourceId}/fetch`, { method: 'POST' });

      // Poll for progress
      fetchProgressInterval.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/sources/${sourceId}/fetch`);
          if (res.ok) {
            const progress = await res.json();
            setFetchProgress({
              status: progress.status,
              message: progress.message,
              current: progress.current,
              total: progress.total,
            });
            if (progress.status === 'done' || progress.status === 'error') {
              if (fetchProgressInterval.current) {
                clearInterval(fetchProgressInterval.current);
                fetchProgressInterval.current = null;
              }
              setFetchingSourceId(null);
              fetchSources();
              fetchGames();
              if (progress.status === 'done') {
                toast.success(progress.message);
                // Fire-and-forget: fix any missing thumbnails
                fetch('/api/games/fix-thumbnails', { method: 'POST' }).catch(() => {});
              } else {
                toast.error(progress.message);
              }
              setTimeout(() => setFetchProgress(null), PROGRESS_CLEAR_DELAY);
            }
          }
        } catch {
          // continue polling
        }
      }, SOURCE_POLL_INTERVAL);
    } catch {
      toast.error('Failed to start fetch');
      setFetchingSourceId(null);
    }
  };

  const handleCreateSource = async () => {
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addSourceForm),
      });
      if (res.ok) {
        toast.success('Source created successfully!');
        setAddSourceOpen(false);
        setAddSourceForm({
          name: '',
          type: 'CRAZYGAMES',
          baseUrl: CRAZYGAMES_BASE,
          searchQuery: '',
        });
        fetchSources();
      } else {
        toast.error('Failed to create source');
      }
    } catch {
      toast.error('Failed to create source');
    }
  };

  const handleDeleteSource = async (id: string) => {
    try {
      const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Source deleted successfully!');
        fetchSources();
      } else {
        toast.error('Failed to delete source');
      }
    } catch {
      toast.error('Failed to delete source');
    }
  };

  const fetchCacheStats = useCallback(async () => {
    try {
      const res = await fetch('/api/cache');
      if (res.ok) {
        const data = await res.json();
        setCacheEnabled(data.enabled);
        setCacheImageTTL(data.imageTTL);
        setCacheVideoTTL(data.videoTTL);
        setCacheStats({ totalFiles: data.totalFiles, totalSize: data.totalSize, totalSizeFormatted: data.totalSizeFormatted });
      }
    } catch { /* silent */ }
  }, []);

  const handleSaveCacheSettings = async () => {
    try {
      setCacheSaving(true);
      const res = await fetch('/api/cache', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: cacheEnabled, imageTTL: cacheImageTTL, videoTTL: cacheVideoTTL }),
      });
      if (res.ok) toast.success('Cache settings updated!');
      else toast.error('Failed to update settings');
    } catch { toast.error('Failed to update settings'); }
    finally { setCacheSaving(false); }
  };

  const handleClearCache = async () => {
    try {
      setCacheClearing(true);
      const res = await fetch('/api/cache', { method: 'DELETE' });
      if (res.ok) {
        toast.success('Cache cleared!');
        await fetchCacheStats();
      } else toast.error('Failed to clear cache');
    } catch { toast.error('Failed to clear cache'); }
    finally { setCacheClearing(false); }
  };

  useEffect(() => {
    if (settingsOpen) fetchCacheStats();
  }, [settingsOpen, fetchCacheStats]);

  const handleFetchCategories = async () => {
    try {
      setCategoryFetching(true);
      setCategoryFetchProgress('Starting...');
      const res = await fetch('/api/games/fetch-categories', { method: 'POST' });
      if (res.ok) {
        toast.success('Fetching games from CrazyGames...');
      } else {
        toast.error('Failed to start fetch');
        setCategoryFetching(false);
        setCategoryFetchProgress(null);
        return;
      }

      // Poll for progress every 2 seconds
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/games/fetch-categories?mode=status');
          if (statusRes.ok) {
            const status = await statusRes.json();

            // Build progress message
            const parts = [`[${status.genresDone}/${status.genresTotal}]`];
            if (status.gamesFound > 0) parts.push(`${status.gamesFound} new`);
            parts.push(status.message);
            setCategoryFetchProgress(parts.join(' | '));

            if (status.status === 'done' || status.status === 'error') {
              clearInterval(pollInterval);
              setCategoryFetching(false);
              setTimeout(() => setCategoryFetchProgress(null), CATEGORY_PROGRESS_CLEAR_DELAY);
              fetchGenres();
              fetchGames();
              if (status.status === 'done') {
                toast.success(status.message);
              } else {
                toast.error(status.message);
              }
            }
          }
        } catch {
          // Continue polling
        }
      }, CATEGORY_POLL_INTERVAL);
    } catch {
      toast.error('Failed to start fetch');
      setCategoryFetching(false);
      setCategoryFetchProgress(null);
    }
  };

  // ─── Computed Values ─────────────────────────────────────────────
  const featuredGames = useMemo(() => games.filter((g) => g.featured), [games]);
  const allGames = useMemo(() => games, [games]);

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen flex flex-col kali-gradient-bg scanlines scanlines-movable kali-grid-bg">
      {/* ── Dragon Page Background ── */}
      {mounted && (
        <img
          src="/dragon.svg"
          alt=""
          className="dragon-page-bg"
          aria-hidden="true"
        />
      )}
      {/* ── Background Particles ── */}
      {mounted &&
        particles.map((p) => (
          <div
            key={p.id}
            className="particle"
            style={{
              left: `${p.left}%`,
              bottom: '-10px',
              width: `${p.size}px`,
              height: `${p.size}px`,
              animation: `float ${p.animationDuration}s linear ${p.animationDelay}s infinite`,
            }}
          />
        ))}

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-[#050a05]/80 backdrop-blur-md header-glow px-4 py-3 border-b border-[#00ff41]/20">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="text-[#00ff41] header-logo-glow">
              <Gamepad2 className="w-7 h-7" strokeWidth={2.5} />
            </div>
            <span className="text-xl font-bold kali-text cursor-pointer tracking-wider">
              CYBERPLAY
            </span>
          </div>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#00ff41]/40" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="kali-input w-full pl-10 pr-20 py-2 rounded-lg text-sm"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#00ff41]/30 border border-[#00ff41]/15 rounded px-1.5 py-0.5">
              CTRL+K
            </kbd>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1.5">
            <button
              onClick={() => setView('sources')}
              className={`kali-btn-sm ${view === 'sources' ? 'kali-btn-green-active' : 'kali-btn-green'}`}
            >
              <Globe className="w-3 h-3 mr-1" /> SOURCES
            </button>
            <button
              onClick={() => setUploadOpen(true)}
              className="kali-btn-green kali-btn-sm"
            >
              <Upload className="w-3 h-3 mr-1" /> UPLOAD
            </button>
            <button
              onClick={() => setView('manage')}
              className={`kali-btn-sm ${view === 'manage' ? 'kali-btn-green-active' : 'kali-btn-green'}`}
            >
              <Settings className="w-3 h-3 mr-1" /> MANAGE
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="kali-btn-outline kali-btn-sm"
            >
              <SlidersHorizontal className="w-3 h-3 mr-1" /> SETTINGS
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-[#00ff41] p-2 rounded hover:bg-[#00ff41]/10 border border-[#00ff41]/20 transition-all"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile dropdown menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden"
            >
              <div className="pt-3 pb-2 flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Search games..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="kali-input w-full px-3 py-2 rounded text-sm"
                />
                <button onClick={() => { setView('sources'); setMobileMenuOpen(false); }} className="kali-btn-green kali-btn-sm justify-start">
                  <Globe className="w-3 h-3 mr-1" /> SOURCES
                </button>
                <button onClick={() => { setUploadOpen(true); setMobileMenuOpen(false); }} className="kali-btn-green kali-btn-sm justify-start">
                  <Upload className="w-3 h-3 mr-1" /> UPLOAD
                </button>
                <button onClick={() => { setView('manage'); setMobileMenuOpen(false); }} className="kali-btn-green kali-btn-sm justify-start">
                  <Settings className="w-3 h-3 mr-1" /> MANAGE
                </button>
                <button onClick={() => { setSettingsOpen(true); setMobileMenuOpen(false); }} className="kali-btn-outline kali-btn-sm justify-start">
                  <SlidersHorizontal className="w-3 h-3 mr-1" /> SETTINGS
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 px-4 py-6 pb-14">
        <AnimatePresence mode="wait">
          {/* ═══════════════════════════════════════════════════════════
              HOME VIEW
              ═══════════════════════════════════════════════════════════ */}
          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-7xl mx-auto space-y-8"
            >
              {/* Hero Section */}
              <section className="relative kali-border rounded p-6 md:p-10 text-center overflow-hidden bg-[#050a05]/60">
                {/* Dragon background watermark (right) */}
                <img
                  src="/dragon.svg"
                  alt=""
                  className="dragon-bg-watermark absolute -right-4 -top-4 w-64 md:w-80 opacity-[0.04]"
                  aria-hidden="true"
                />
                {/* Dragon background watermark (left, cyan) */}
                <img
                  src="/dragon.svg"
                  alt=""
                  className="dragon-bg-watermark dragon-bg-watermark-cyan absolute -left-4 -bottom-4 w-48 md:w-56 scale-x-[-1] opacity-[0.03]"
                  aria-hidden="true"
                />
                {/* Floating orbs */}
                <div className="hero-orb-1 absolute top-4 left-8 w-32 h-32 rounded-full bg-[#00ff41]/5 blur-3xl pointer-events-none" />
                <div className="hero-orb-2 absolute bottom-4 right-8 w-40 h-40 rounded-full bg-[#06b6d4]/5 blur-3xl pointer-events-none" />

                <div className="relative z-10">
                  {/* Terminal header bar */}
                  <div className="terminal-header mx-auto mb-4">
                    <span className="terminal-header-dots">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                      <span className="w-2.5 h-2.5 rounded-full bg-[#28ca42]" />
                    </span>
                    <span className="terminal-header-title">cyberplay@portal:~$</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-[#00ff41] status-dot-glow" />
                    <span className="text-[#00ff41] text-[10px] font-medium">
                      System Online
                    </span>
                  </div>

                  {/* Typing animation */}
                  <h1 className="text-4xl md:text-6xl font-bold mb-2">
                    <span className="kali-text">{heroTyping.displayed}</span>
                    {!heroTyping.done && (
                      <span className="typing-cursor" />
                    )}
                  </h1>
                  <p className="text-sm text-[#94a3b8] mt-3 max-w-xl mx-auto font-light">
                    <span className="text-[#00ff41] font-medium">root@cyberplay</span>{' >'} Browse, play, and manage HTML5, Unity WebGL & Flash games.
                    No downloads required — just click and play.
                  </p>
                </div>
              </section>

              {/* Genre Category Bar — CrazyGames Style */}
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#00ff41] terminal-prefix">category_scan</span>
                    {categoryFetching && (
                      <span className="text-xs text-[#06b6d4] flex items-center gap-1.5 max-w-[60vw] truncate">
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                        <span className="truncate">{categoryFetchProgress || 'Fetching games...'}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleFetchCategories}
                      disabled={categoryFetching}
                      className="kali-btn-green kali-btn-sm text-[10px]"
                      title="Fetch all games from CrazyGames (direct HTTP, no SDK)"
                    >
                      <Database className="w-3 h-3 mr-1" />
                      {categoryFetching ? 'FETCHING...' : 'FETCH ALL'}
                    </button>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                      <SelectTrigger className="kali-input w-32 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#080f08] border-[#00ff41]/15">
                        <SelectItem value="newest">Newest</SelectItem>
                        <SelectItem value="popular">Most Played</SelectItem>
                        <SelectItem value="top-rated">Top Rated</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Genre dropdown */}
                <div className="flex items-center gap-2">
                  <Select value={genreFilter} onValueChange={(v) => setGenreFilter(v)}>
                    <SelectTrigger className="kali-input w-44 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#080f08] border-[#00ff41]/15 max-h-64">
                      {genres.filter(g => g.count > 0 && g.name !== 'Uncategorized' || g.name === 'All').map((genre) => {
                        const IconComponent = GENRE_ICON_MAP[genre.icon] || Gamepad2;
                        return (
                          <SelectItem key={genre.name} value={genre.name} className="text-xs">
                            <span className="flex items-center gap-2">
                              <IconComponent className="w-3.5 h-3.5 shrink-0" />
                              <span>{genre.name}</span>
                              <span className="text-[10px] text-[#94a3b8]/50 ml-auto">{genre.count}</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Stats bar */}
              <div className="flex items-center gap-2 text-xs text-[#94a3b8] tracking-wider">
                <span className="text-[#00ff41]">$</span>
                {loading ? (
                  <span className="text-[#06b6d4]">scanning games_db...</span>
                ) : (
                  <span><span className="text-[#00ff41]">{allGames.length}</span> GAME{allGames.length !== 1 ? 'S' : ''} FOUND <span className="hex-decoration">0x{allGames.length.toString(16).toUpperCase()}</span></span>
                )}
              </div>

              {/* Featured Games */}
              {!loading && featuredGames.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Trophy className="w-5 h-5 text-[#fbbf24] icon-glow-gold" />
                    <h2 className="text-xl font-bold kali-text-gold">FEATURED GAMES</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {featuredGames.map((game) => (
                      <GameCard key={game.id} game={game} onPlay={playGame} />
                    ))}
                  </div>
                </section>
              )}

              {/* All Games Grid */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Gamepad2 className="w-5 h-5 text-[#00ff41] icon-glow-green" />
                  <h2 className="text-xl font-bold kali-text">
                    {genreFilter === 'All' ? 'ALL GAMES' : genreFilter.toUpperCase()}
                  </h2>
                  {genreFilter !== 'All' && (
                    <button
                      onClick={() => setGenreFilter('All')}
                      className="text-[10px] text-[#94a3b8] hover:text-[#00ff41] ml-2 transition-colors"
                    >
                      [clear]
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="game-card rounded-xl p-0"
                      >
                        <div className="skeleton-glow h-40 rounded-t-xl" />
                        <div className="p-4 space-y-3">
                          <div className="skeleton-glow h-4 rounded w-3/4" />
                          <div className="skeleton-glow h-3 rounded w-full" />
                          <div className="skeleton-glow h-3 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : allGames.length === 0 ? (
                  <div className="text-center py-16">
                    <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-[#00ff41]/30 icon-glow-green" />
                    <p className="text-[#94a3b8] text-sm">
                      No games found. Try a different search or category.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {allGames.map((game) => (
                      <GameCard key={game.id} game={game} onPlay={playGame} />
                    ))}
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              PLAY VIEW
              ═══════════════════════════════════════════════════════════ */}
          {view === 'play' && selectedGame && (
            <motion.div
              key="play"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="max-w-7xl mx-auto h-[calc(100vh-140px)] flex flex-col"
            >
              {/* Game Header */}
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setView('home')}
                    className="text-[#00ff41] hover:bg-[#00ff41]/10"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back
                  </Button>
                  <h2 className="text-lg font-bold text-white">{selectedGame.title}</h2>
                  <CategoryBadge category={selectedGame.category} />
                  <span className="text-xs text-[#94a3b8] flex items-center gap-1">
                    <Eye className="w-3 h-3" /> {formatPlays(selectedGame.plays)} plays
                  </span>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleFullscreen}
                    className="text-[#e2e8f0] hover:bg-white/5"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                  <a
                    href={selectedGame.gameUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[#e2e8f0] hover:bg-white/5"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </a>
                </div>
              </div>

              {/* Game Frame — original CrazyGames layout (no clipping) */}
              <div ref={fullscreenRef} className="relative flex-1 rounded-xl overflow-hidden kali-border bg-black">
                <iframe
                  ref={gameFrameRef}
                  src={selectedGame.gameUrl}
                  className="w-full h-full border-0"
                  allowFullScreen
                  allow="autoplay; fullscreen; gamepad"
                  title={selectedGame.title}
                  onLoad={() => setGameLoading(false)}
                />

                {/* Loading overlay (shown initially, fades out on load) */}
                <AnimatePresence>
                  {gameLoading && (
                    <motion.div
                      key="game-loader"
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                      className="absolute inset-0 bg-[#050a05]/90 flex flex-col items-center justify-center gap-4 pointer-events-none"
                    >
                      <div className="relative">
                        <Gamepad2 className="w-12 h-12 text-[#00ff41] animate-bounce icon-glow-green" />
                        <span className="absolute inset-0 rounded-full bg-[#00ff41]/20 animate-ping" />
                      </div>
                      <div className="w-48 h-1 bg-[#0c150c] rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-[#00ff41] to-[#06b6d4] rounded-full"
                          initial={{ width: '0%' }}
                          animate={{ width: '100%' }}
                          transition={{ duration: 2, ease: 'easeInOut' }}
                        />
                      </div>
                      <p className="text-xs text-[#94a3b8]">Loading game...</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Game Info Bar */}
              <div className="mt-3 flex items-center justify-between text-xs text-[#94a3b8] shrink-0">
                <div className="flex items-center gap-4">
                  <CategoryBadge category={selectedGame.category} />
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-[#fbbf24]" />
                    {selectedGame.rating.toFixed(1)}
                  </span>
                </div>
                <span>{selectedGame.tags}</span>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              MANAGE VIEW
              ═══════════════════════════════════════════════════════════ */}
          {view === 'manage' && (
            <motion.div
              key="manage"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-7xl mx-auto"
            >
              <div className="flex items-center gap-3 mb-6">
                <Button variant="ghost" size="sm" onClick={() => setView('home')} className="text-[#00ff41] hover:bg-[#00ff41]/10">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Settings className="w-5 h-5 text-[#39ff14] icon-glow-gold" />
                <h2 className="text-xl font-bold kali-text-green">GAME MANAGER</h2>
              </div>

              {/* Table Header */}
              <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs text-[#94a3b8] tracking-wider uppercase border-b border-[#00ff41]/10">
                <div className="col-span-4">Title</div>
                <div className="col-span-2">Genre</div>
                <div className="col-span-1">Plays</div>
                <div className="col-span-1">Rating</div>
                <div className="col-span-4 text-right">Actions</div>
              </div>

              {/* Game Rows */}
              <ScrollArea className="h-[calc(100vh-260px)]">
                <div className="space-y-2 mt-2">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="skeleton-glow h-14 rounded-lg" />
                    ))
                  ) : games.length === 0 ? (
                    <div className="text-center py-16 text-[#94a3b8] text-sm">
                      No games to manage.
                    </div>
                  ) : (
                    games.map((game, idx) => (
                      <motion.div
                        key={game.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center px-4 py-3 rounded-lg bg-[#080f08]/50 border border-[#00ff41]/8 hover:border-[#00ff41]/20 transition-all"
                      >
                        {/* Title + Thumbnail */}
                        <div className="md:col-span-4 flex items-center gap-3">
                          {game.thumbnailUrl && (
                            <img
                              src={game.thumbnailUrl.startsWith('/') ? game.thumbnailUrl : `/api/proxy?url=${encodeURIComponent(game.thumbnailUrl)}`}
                              alt={game.title}
                              className="w-10 h-10 rounded object-cover shrink-0"
                              loading="lazy"
                            />
                          )}
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-white truncate block">
                              {game.title}
                              {game.featured && (
                                <Star className="inline w-3 h-3 text-[#fbbf24] ml-1 fill-[#fbbf24]" />
                              )}
                            </span>
                          </div>
                        </div>

                        {/* Genre/Category */}
                        <div className="md:col-span-2">
                          {game.genre ? (
                            <Badge className="text-[10px] bg-[#00ff41]/10 text-[#39ff14] border border-[#00ff41]/20">
                              {game.genre}
                            </Badge>
                          ) : (
                            <CategoryBadge category={game.category} />
                          )}
                        </div>

                        {/* Plays */}
                        <div className="md:col-span-1 text-sm text-[#94a3b8]">
                          {formatPlays(game.plays)}
                        </div>

                        {/* Rating */}
                        <div className="md:col-span-1 text-sm text-[#94a3b8] flex items-center gap-1">
                          <Star className="w-3 h-3 text-[#fbbf24]" />
                          {game.rating.toFixed(1)}
                        </div>

                        {/* Actions */}
                        <div className="md:col-span-4 flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => playGame(game)}
                            className="text-[#00ff41] hover:bg-[#00ff41]/10 hover:shadow-[0_0_10px_rgba(0,255,65,0.3)] text-xs"
                          >
                            <Play className="w-3 h-3 mr-1" /> Play
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(game)}
                            className="text-[#06b6d4] hover:bg-[#06b6d4]/10 hover:shadow-[0_0_10px_rgba(6,182,212,0.3)] text-xs"
                          >
                            <Edit3 className="w-3 h-3 mr-1" /> Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-400 hover:bg-red-400/10 hover:shadow-[0_0_10px_rgba(255,68,68,0.3)] text-xs"
                              >
                                <Trash2 className="w-3 h-3 mr-1" /> Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-[#080f08] border-[#ef4444]/20">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-white">
                                  Delete Game
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-[#94a3b8]">
                                  Are you sure you want to delete &quot;{game.title}&quot;? This action
                                  cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="bg-[#0c150c] border-[#00ff41]/15 text-[#e2e8f0] hover:bg-[#0c1a0c]">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(game.id)}
                                  className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════
              SOURCES VIEW
              ═══════════════════════════════════════════════════════════ */}
          {view === 'sources' && (
            <motion.div
              key="sources"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-7xl mx-auto space-y-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <Button variant="ghost" size="sm" onClick={() => setView('home')} className="text-[#00ff41] hover:bg-[#00ff41]/10">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
                <Globe className="w-5 h-5 text-[#39ff14] icon-glow-green" />
                <h2 className="text-xl font-bold kali-text-green">GAME SOURCES</h2>
              </div>
              <div className="flex items-center justify-between">
                <Button
                  onClick={() => setAddSourceOpen(true)}
                  className="kali-btn text-xs"
                >
                  <Plus className="w-4 h-4 mr-1" /> ADD SOURCE
                </Button>
              </div>

              {/* Fetch Progress Bar */}
              {fetchProgress && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="kali-border-blue rounded-xl p-4 bg-[#050a05]/80"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Loader2 className="w-5 h-5 text-[#06b6d4] animate-spin" />
                    <span className="text-sm text-[#06b6d4]">{fetchProgress.message}</span>
                  </div>
                  <div className="w-full h-2 bg-[#0c150c] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#06b6d4] to-[#00ff41]"
                      animate={{
                        width:
                          fetchProgress.total > 0
                            ? `${(fetchProgress.current / fetchProgress.total) * 100}%`
                            : '0%',
                      }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                </motion.div>
              )}

              {/* Source Cards Grid */}
              {sources.length === 0 ? (
                <div className="text-center py-16">
                  <Globe className="w-16 h-16 mx-auto mb-4 text-[#06b6d4]/30 icon-glow-blue" />
                  <p className="text-[#94a3b8] text-sm">
                    No sources configured. Add a source to fetch games.
                  </p>
                  <Button
                    onClick={() => setAddSourceOpen(true)}
                    className="mt-4 kali-btn text-xs"
                  >
                    <Plus className="w-4 h-4 mr-1" /> ADD SOURCE
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sources.map((source) => (
                    <motion.div
                      key={source.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="game-card p-4"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Globe className="w-5 h-5 text-[#06b6d4] icon-glow-blue" />
                          <div>
                            <h3 className="text-sm font-bold text-white">{source.name}</h3>
                            <p className="text-xs text-[#94a3b8] truncate max-w-[200px]">
                              {source.baseUrl}
                            </p>
                          </div>
                        </div>
                        <Badge className="badge-webgl text-[10px]">{source.type}</Badge>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-[#94a3b8] mb-3">
                        <span>{source.totalGames} games</span>
                        <span>{source.gamesFetched} fetched</span>
                        <span>
                          {source.lastFetched
                            ? `Last: ${new Date(source.lastFetched).toLocaleDateString()}`
                            : 'Never'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => fetchFromSource(source.id)}
                          disabled={!!fetchingSourceId}
                          className="text-[#06b6d4] hover:bg-[#06b6d4]/10 text-xs"
                        >
                          {fetchingSourceId === source.id ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Database className="w-3 h-3 mr-1" />
                          )}
                          Fetch
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:bg-red-400/10 text-xs"
                            >
                              <Trash2 className="w-3 h-3 mr-1" /> Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-[#080f08] border-[#ef4444]/20">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-white">
                                Delete Source
                              </AlertDialogTitle>
                              <AlertDialogDescription className="text-[#94a3b8]">
                                Are you sure you want to delete &quot;{source.name}&quot;?
                                Linked games will not be deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="bg-[#0c150c] border-[#00ff41]/15 text-[#e2e8f0] hover:bg-[#0c1a0c]">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteSource(source.id)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Dialogs ── */}

      {/* Add Source Dialog */}
      <Dialog open={addSourceOpen} onOpenChange={setAddSourceOpen}>
        <DialogContent className="bg-[#080f08] border-[#06b6d4]/20 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#06b6d4]">
              <Globe className="w-5 h-5" /> Add Game Source
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Add a new game source to fetch games from.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Source Name</Label>
              <Input
                value={addSourceForm.name}
                onChange={(e) => setAddSourceForm({ ...addSourceForm, name: e.target.value })}
                className="kali-input"
                placeholder="My Game Source"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Source Type</Label>
              <Select
                value={addSourceForm.type}
                onValueChange={(v) =>
                  setAddSourceForm({
                    ...addSourceForm,
                    type: v,
                    baseUrl:
                      v === 'CRAZYGAMES'
                        ? CRAZYGAMES_BASE
                        : v === 'POKI'
                          ? 'https://www.poki.com'
                          : addSourceForm.baseUrl,
                  })
                }
              >
                <SelectTrigger className="kali-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#080f08] border-[#00ff41]/15">
                  <SelectItem value="CRAZYGAMES">CrazyGames</SelectItem>
                  <SelectItem value="POKI">Poki</SelectItem>
                  <SelectItem value="CUSTOM">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Base URL</Label>
              <Input
                value={addSourceForm.baseUrl}
                onChange={(e) => setAddSourceForm({ ...addSourceForm, baseUrl: e.target.value })}
                className="kali-input"
                placeholder="https://www.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Search Query</Label>
              <Input
                value={addSourceForm.searchQuery}
                onChange={(e) => setAddSourceForm({ ...addSourceForm, searchQuery: e.target.value })}
                className="kali-input"
                placeholder="popular free games"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAddSourceOpen(false)}
              className="text-[#94a3b8] hover:text-white"
            >
              Cancel
            </Button>
            <Button onClick={handleCreateSource} className="kali-btn text-xs">
              Create Source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Game Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="bg-[#080f08] border-[#00ff41]/20 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#00ff41]">
              <Upload className="w-5 h-5" /> Upload Game
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Add a new game to the portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Title *</Label>
              <Input
                value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                className="kali-input"
                placeholder="Game Title"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Description *</Label>
              <Textarea
                value={uploadForm.description}
                onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                className="kali-input min-h-[80px] resize-none"
                placeholder="Game description..."
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-[#94a3b8]">Category *</Label>
                <Select
                  value={uploadForm.category}
                  onValueChange={(v) => setUploadForm({ ...uploadForm, category: v as Game['category'] })}
                >
                  <SelectTrigger className="kali-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#080f08] border-[#00ff41]/15">
                    <SelectItem value="HTML5">HTML5</SelectItem>
                    <SelectItem value="UNITY_WEBGL">Unity WebGL</SelectItem>
                    <SelectItem value="FLASH">Flash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-[#94a3b8]">Featured</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch
                    checked={uploadForm.featured}
                    onCheckedChange={(v) => setUploadForm({ ...uploadForm, featured: v })}
                  />
                  <span className="text-xs text-[#94a3b8]">{uploadForm.featured ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Thumbnail URL</Label>
              <Input
                value={uploadForm.thumbnailUrl}
                onChange={(e) => setUploadForm({ ...uploadForm, thumbnailUrl: e.target.value })}
                className="kali-input"
                placeholder="https://example.com/thumb.jpg"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Game URL *</Label>
              <Input
                value={uploadForm.gameUrl}
                onChange={(e) => setUploadForm({ ...uploadForm, gameUrl: e.target.value })}
                className="kali-input"
                placeholder="https://example.com/game.html"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Tags (comma separated)</Label>
              <Input
                value={uploadForm.tags}
                onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
                className="kali-input"
                placeholder="action, arcade, fun"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setUploadOpen(false)}
              className="text-[#94a3b8] hover:text-white"
            >
              Cancel
            </Button>
            <Button onClick={handleUpload} className="kali-btn text-xs">
              Upload Game
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Game Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-[#080f08] border-[#06b6d4]/20 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#06b6d4]">
              <Edit3 className="w-5 h-5" /> Edit Game
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8]">
              Update game details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="kali-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="kali-input min-h-[80px] resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-[#94a3b8]">Category</Label>
                <Select
                  value={editForm.category}
                  onValueChange={(v) => setEditForm({ ...editForm, category: v as Game['category'] })}
                >
                  <SelectTrigger className="kali-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#080f08] border-[#00ff41]/15">
                    <SelectItem value="HTML5">HTML5</SelectItem>
                    <SelectItem value="UNITY_WEBGL">Unity WebGL</SelectItem>
                    <SelectItem value="FLASH">Flash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-[#94a3b8]">Rating</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={editForm.rating}
                  onChange={(e) => setEditForm({ ...editForm, rating: parseFloat(e.target.value) || 0 })}
                  className="kali-input"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Thumbnail URL</Label>
              <Input
                value={editForm.thumbnailUrl}
                onChange={(e) => setEditForm({ ...editForm, thumbnailUrl: e.target.value })}
                className="kali-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Game URL</Label>
              <Input
                value={editForm.gameUrl}
                onChange={(e) => setEditForm({ ...editForm, gameUrl: e.target.value })}
                className="kali-input"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-[#94a3b8]">Featured</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editForm.featured}
                    onCheckedChange={(v) => setEditForm({ ...editForm, featured: v })}
                  />
                  <span className="text-xs text-[#94a3b8]">{editForm.featured ? 'Yes' : 'No'}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-[#94a3b8]">Tags (comma separated)</Label>
              <Input
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                className="kali-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditOpen(false)}
              className="text-[#94a3b8] hover:text-white"
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} className="kali-btn text-xs">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Settings Dialog ── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="bg-[#080f08] border-[#00ff41]/20 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#00ff41] flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" /> CACHE SETTINGS
            </DialogTitle>
            <DialogDescription className="text-[#94a3b8] text-xs">
              Manage image &amp; video proxy cache
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Cache toggle */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-[#e2e8f0]">Enable Cache</Label>
                <p className="text-[10px] text-[#94a3b8]">Cache thumbnails &amp; video previews locally</p>
              </div>
              <Switch checked={cacheEnabled} onCheckedChange={setCacheEnabled} />
            </div>

            {/* Image TTL */}
            <div className="space-y-2">
              <Label className="text-sm text-[#e2e8f0]">Image Cache TTL</Label>
              <Select value={String(cacheImageTTL)} onValueChange={(v) => setCacheImageTTL(Number(v))}>
                <SelectTrigger className="kali-input text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#080f08] border-[#00ff41]/15">
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                  <SelectItem value="336">14 days</SelectItem>
                  <SelectItem value="720">30 days</SelectItem>
                  <SelectItem value="2160">90 days</SelectItem>
                  <SelectItem value="4320">180 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Video TTL */}
            <div className="space-y-2">
              <Label className="text-sm text-[#e2e8f0]">Video Cache TTL</Label>
              <Select value={String(cacheVideoTTL)} onValueChange={(v) => setCacheVideoTTL(Number(v))}>
                <SelectTrigger className="kali-input text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#080f08] border-[#00ff41]/15">
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="72">3 days</SelectItem>
                  <SelectItem value="168">7 days</SelectItem>
                  <SelectItem value="336">14 days</SelectItem>
                  <SelectItem value="720">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stats */}
            {cacheStats && (
              <div className="kali-border rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[#94a3b8]">Cached Files</span>
                  <span className="text-[#00ff41] font-mono">{cacheStats.totalFiles}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#94a3b8]">Total Size</span>
                  <span className="text-[#00ff41] font-mono">{cacheStats.totalSizeFormatted}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            <Button
              variant="ghost"
              onClick={handleClearCache}
              disabled={cacheClearing || !cacheStats?.totalFiles}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs"
            >
              {cacheClearing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
              Clear Cache
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSettingsOpen(false)} className="text-[#94a3b8] hover:text-white text-xs">
                Cancel
              </Button>
              <Button onClick={handleSaveCacheSettings} disabled={cacheSaving} className="kali-btn text-xs">
                {cacheSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Loading Overlay ── */}
      {mounted && !loadingOverlayDone && (
        <LoadingOverlay onComplete={() => setLoadingOverlayDone(true)} />
      )}

      {/* ── Footer ── */}
      <footer className="footer-glow fixed bottom-0 left-0 right-0 z-40 px-4 py-2.5 bg-[#050a05]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-[#94a3b8]">
          <div className="flex items-center gap-2">
            <div className="text-[#00ff41] header-logo-glow font-bold">
              <Gamepad2 className="w-4 h-4" strokeWidth={2.5} />
            </div>
            <span className="kali-text text-[10px] font-bold">CYBERPLAY</span>
            <span className="text-[10px] text-[#00ff41]/80 font-bold kali-text tracking-wider">
              - COPYRIGHT © 2026 ZEOLABS STUDIO
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff41] status-dot-glow" />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="w-7 h-7 flex items-center justify-center rounded border border-[#00ff41]/20 text-[#00ff41] hover:bg-[#00ff41]/10 hover:border-[#00ff41]/50 cursor-pointer transition-all"
              title="Scroll to top"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
              className="w-7 h-7 flex items-center justify-center rounded border border-[#00ff41]/20 text-[#00ff41] hover:bg-[#00ff41]/10 hover:border-[#00ff41]/50 cursor-pointer transition-all"
              title="Scroll to bottom"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── LoadingOverlay Component (Hacking Boot Style) ──────────────────
function LoadingOverlay({ onComplete }: { onComplete: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const [phase, setPhase] = useState<'boot' | 'logo' | 'done'>('boot');
  const [visible, setVisible] = useState(true);

  const bootSequence = useMemo(() => [
    '[BOOT] Initializing system...',
    '[OK]   Kernel loaded',
    '[OK]   Mounting filesystem...',
    '[OK]   Database connected',
    '[OK]   Cache layer online',
    '[....] Scanning game library...',
    '[OK]   Game engine ready',
    '[OK]   Network secured',
    '[OK]   All systems nominal',
    '[>>>]  CYBERPLAY ONLINE',
  ], []);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < bootSequence.length) {
        setLines((prev) => [...prev, bootSequence[i]]);
        i++;
      } else {
        clearInterval(interval);
        setPhase('logo');
        setTimeout(() => {
          setPhase('done');
          setTimeout(() => {
            setVisible(false);
            setTimeout(onComplete, 400);
          }, 500);
        }, 1200);
      }
    }, 180);
    return () => clearInterval(interval);
  }, [bootSequence, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="fixed inset-0 z-[9999] bg-[#030803] flex items-center justify-center"
        >
          {/* Matrix rain background */}
          <div className="absolute inset-0 overflow-hidden opacity-20 pointer-events-none">
            {Array.from({ length: 30 }).map((_, i) => (
              <div
                key={i}
                className="absolute top-0 text-[#00ff41]/40 text-xs font-mono animate-pulse"
                style={{
                  left: `${(i / 30) * 100}%`,
                  animation: `matrixFall ${2 + Math.random() * 3}s linear ${Math.random() * 2}s infinite`,
                  fontSize: '10px',
                }}
              >
                {Array.from({ length: 15 }).map((__, j) => (
                  <div key={j}>
                    {String.fromCharCode(0x30A0 + Math.random() * 96)}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="relative z-10 w-full max-w-lg px-6">
            {/* Terminal window */}
            <div className="rounded-lg border border-[#00ff41]/20 bg-[#0a0f0a]/90 shadow-[0_0_60px_rgba(0,255,65,0.08)] overflow-hidden">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-2 bg-[#0c150c] border-b border-[#00ff41]/10">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#28ca42]" />
                <span className="ml-2 text-[10px] text-[#00ff41]/50 font-mono">cyberplay@boot:~$</span>
              </div>

              {/* Terminal body */}
              <div className="p-4 font-mono text-[11px] min-h-[220px] max-h-[260px] overflow-hidden">
                <div className="overflow-x-clip">
                {lines.map((line, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.1 }}
                    className={`leading-relaxed ${
                      !line ? 'text-[#94a3b8]' :
                      line.includes('[OK]')
                        ? 'text-[#00ff41]'
                        : line.includes('[>>>]')
                        ? 'text-[#39ff14] font-bold'
                        : line.includes('[....]')
                        ? 'text-[#fbbf24]'
                        : 'text-[#94a3b8]'
                    }`}
                  >
                    {line || ''}
                    {idx === lines.length - 1 && phase === 'boot' && (
                      <span className="inline-block w-2 h-3.5 bg-[#00ff41] ml-0.5 animate-pulse" />
                    )}
                  </motion.div>
                ))}
                </div>
              </div>
            </div>

            {/* Logo reveal */}
            <AnimatePresence>
              {(phase === 'logo' || phase === 'done') && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{
                    opacity: phase === 'done' ? 0.5 : 1,
                    scale: 1,
                    y: 0,
                  }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="flex flex-col items-center gap-3 mt-6"
                >
                  <div className="relative">
                    <Gamepad2 className="w-10 h-10 text-[#00ff41] icon-glow-green" strokeWidth={1.5} />
                    <span className="absolute inset-0 rounded-full bg-[#00ff41]/20 animate-ping" />
                  </div>
                  <span className="text-2xl font-bold kali-text tracking-[0.2em]">CYBERPLAY</span>
                  <span className="text-[10px] text-[#94a3b8]/60 tracking-widest">GAME PORTAL SYSTEM</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── GameCard Component (CrazyGames-style hover video) ──────────────
function GameCard({ game, onPlay }: { game: Game; onPlay: (game: Game) => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 300);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  // Play/pause video on hover state change
  useEffect(() => {
    if (isHovered && videoRef.current && game.videoUrl) {
      videoRef.current.play().catch(() => {});
    }
    if (!isHovered && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [isHovered, game.videoUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return (
    <motion.div
      whileHover={{ scale: isHovered ? 1.02 : 1.01 }}
      whileTap={{ scale: 0.98 }}
      className={`group game-card cursor-pointer ${game.featured ? 'game-card-featured' : ''}`}
      onClick={() => onPlay(game)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Thumbnail / Video area */}
      <div className="relative overflow-hidden bg-[#0c150c] h-40">
        {/* Thumbnail image — proxied & cached, hidden when video is playing */}
        {game.thumbnailUrl && (
          <img
            src={game.thumbnailUrl.startsWith('/') ? game.thumbnailUrl : `/api/proxy?url=${encodeURIComponent(game.thumbnailUrl)}`}
            alt={game.title}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isHovered && game.videoUrl ? 'opacity-0' : 'opacity-100'}`}
            loading="lazy"
            decoding="async"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}

        {/* Video preview — proxied & cached, shown on hover */}
        {game.videoUrl && (
          <video
            ref={videoRef}
            src={game.videoUrl.startsWith('/') ? game.videoUrl : `/api/proxy?url=${encodeURIComponent(game.videoUrl)}`}
            autoPlay
            loop
            muted
            playsInline
            preload="none"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
          />
        )}

        {/* Fallback: game initial letter when no thumbnail */}
        <div className={`absolute inset-0 flex items-center justify-center ${game.thumbnailUrl ? 'hidden' : ''}`}>
          <div className="text-4xl font-bold text-[#00ff41]/20 select-none">
            {(game.title || '?')[0].toUpperCase()}
          </div>
        </div>

        {/* Dark overlay (always present) */}
        <div className="absolute inset-0 bg-black/40 pointer-events-none" />

        {/* Gradient overlay at bottom (stronger) */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

        {/* Genre/Category badge top-left */}
        <div className="absolute top-2 left-2 z-10">
          {game.genre ? (
            <Badge className="text-[10px] bg-[#00ff41]/30 text-[#39ff14] border border-[#00ff41]/25 backdrop-blur-sm">
              {game.genre}
            </Badge>
          ) : (
            <CategoryBadge category={game.category} />
          )}
        </div>

        {/* Featured star */}
        {game.featured && (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1 kali-text-gold text-xs font-bold">
            <Star className="w-3.5 h-3.5 icon-glow-gold fill-[#fbbf24]" />
            HOT
          </div>
        )}

        {/* Play count bottom-left */}
        <div className="absolute bottom-2 left-2 z-10 text-[10px] text-white/80 flex items-center gap-1">
          <Eye className="w-3 h-3" />
          {formatPlays(game.plays)}
        </div>

        {/* Play button overlay — only show when not playing video */}
        <div className={`absolute inset-0 flex items-center justify-center z-10 transition-opacity duration-300 ${isHovered && game.videoUrl ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
          <div className="play-btn-glow w-14 h-14 rounded-full bg-[#00ff41]/20 border border-[#00ff41]/40 flex items-center justify-center backdrop-blur-sm">
            <Play className="w-6 h-6 text-[#00ff41] fill-[#00ff41] ml-1" />
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="p-3">
        <h3 className="text-sm font-bold text-[#e2e8f0] mb-1 truncate transition-all duration-300 group-hover:text-[#00ff41] group-hover:[text-shadow:0_0_8px_rgba(0,255,65,0.5)]">
          {game.title}
        </h3>
        <p className="text-xs text-[#94a3b8] line-clamp-2 mb-2">{game.description}</p>

        {/* Rating + Tags */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`w-3 h-3 ${
                  i < Math.round(game.rating)
                    ? 'text-[#fbbf24] fill-[#fbbf24]'
                    : 'text-[#1a1a2e]'
                }`}
              />
            ))}
            <span className="text-[10px] text-[#94a3b8] ml-1">{game.rating.toFixed(1)}</span>
          </div>
          {game.tags && (
            <span className="text-[10px] text-[#94a3b8] truncate max-w-[100px]">
              {game.tags.split(',').slice(0, 2).join(', ')}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
