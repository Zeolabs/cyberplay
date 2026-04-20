'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gamepad2, Search, Upload, Settings, Play, Star, Eye, Trash2,
  Edit3, Zap, Monitor, Cpu, Menu, Grid3X3, Trophy, ArrowLeft,
  ExternalLink, Maximize2, Volume2, VolumeX, Globe, Database,
  Plus, Loader2,
} from 'lucide-react';
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

// ─── Types ──────────────────────────────────────────────────────────
interface Game {
  id: string;
  title: string;
  description: string;
  category: 'HTML5' | 'UNITY_WEBGL' | 'FLASH';
  thumbnailUrl: string;
  gameUrl: string;
  plays: number;
  rating: number;
  featured: boolean;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'home' | 'play' | 'manage' | 'sources';
type CategoryFilter = 'ALL' | 'HTML5' | 'UNITY_WEBGL' | 'FLASH';
type SortOption = 'newest' | 'popular' | 'top-rated';

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
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

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
    baseUrl: 'https://www.crazygames.com',
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

  // Hover preview state
  const [hoveredGame, setHoveredGame] = useState<Game | null>(null);
  const [hoveredRect, setHoveredRect] = useState<{top: number; left: number} | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHoverGame = useCallback((game: Game | null, e?: React.MouseEvent) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (game && e) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setHoveredRect({ top: rect.top, left: rect.left + rect.width / 2 });
      hoverTimeoutRef.current = setTimeout(() => {
        setHoveredGame(game);
      }, 400);
    } else {
      setHoveredGame(null);
      setHoveredRect(null);
    }
  }, []);

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

  // Fetch games on mount and when filters change
  const fetchGames = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
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
  }, [categoryFilter, searchQuery, sortBy]);

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

  // Cleanup fetch progress interval & hover timeout
  useEffect(() => {
    return () => {
      if (fetchProgressInterval.current) {
        clearInterval(fetchProgressInterval.current);
      }
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
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
              setTimeout(() => setFetchProgress(null), 3000);
            }
          }
        } catch {
          // continue polling
        }
      }, 1500);
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
          baseUrl: 'https://www.crazygames.com',
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
      <header className="sticky top-0 z-50 bg-[#0a0a14]/80 backdrop-blur-md header-glow px-4 py-3 border-b border-[#8b5cf6]/20">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="text-[#8b5cf6] header-logo-glow">
              <Gamepad2 className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <span className="text-xl font-bold kali-text cursor-pointer tracking-wider">
              CYBERPLAY
            </span>
          </div>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b5cf6]/40" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="kali-input w-full pl-10 pr-20 py-2 rounded-lg text-sm"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#8b5cf6]/30 border border-[#8b5cf6]/15 rounded px-1.5 py-0.5">
              CTRL+K
            </kbd>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1.5">
            <button
              onClick={() => setView('sources')}
              className={`kali-btn-sm ${view === 'sources' ? 'kali-btn-cyan-active' : 'kali-btn-cyan'}`}
            >
              <Globe className="w-3 h-3 mr-1" /> SOURCES
            </button>
            <button
              onClick={() => setUploadOpen(true)}
              className="kali-btn-purple kali-btn-sm"
            >
              <Upload className="w-3 h-3 mr-1" /> UPLOAD
            </button>
            <button
              onClick={() => setView('manage')}
              className={`kali-btn-sm ${view === 'manage' ? 'kali-btn-purple-active' : 'kali-btn-purple'}`}
            >
              <Settings className="w-3 h-3 mr-1" /> MANAGE
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-[#8b5cf6] p-2 rounded hover:bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 transition-all"
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
                <button onClick={() => { setView('sources'); setMobileMenuOpen(false); }} className="kali-btn-cyan kali-btn-sm justify-start">
                  <Globe className="w-3 h-3 mr-1" /> SOURCES
                </button>
                <button onClick={() => { setUploadOpen(true); setMobileMenuOpen(false); }} className="kali-btn-purple kali-btn-sm justify-start">
                  <Upload className="w-3 h-3 mr-1" /> UPLOAD
                </button>
                <button onClick={() => { setView('manage'); setMobileMenuOpen(false); }} className="kali-btn-purple kali-btn-sm justify-start">
                  <Settings className="w-3 h-3 mr-1" /> MANAGE
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 px-4 py-6">
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
              <section className="relative kali-border rounded p-6 md:p-10 text-center overflow-hidden bg-[#0a0a14]/60">
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
                <div className="hero-orb-1 absolute top-4 left-8 w-32 h-32 rounded-full bg-[#8b5cf6]/5 blur-3xl pointer-events-none" />
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
                    <span className="w-2 h-2 rounded-full bg-[#8b5cf6] status-dot-glow" />
                    <span className="text-[#8b5cf6] text-[10px] font-medium">
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
                    <span className="text-[#06b6d4] font-medium">root@cyberplay</span>{' >'} Browse, play, and manage HTML5, Unity WebGL & Flash games.
                    No downloads required — just click and play.
                  </p>
                </div>
              </section>

              {/* Category Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { key: 'ALL', label: 'All Games', Icon: Grid3X3 },
                    { key: 'HTML5', label: 'HTML5', Icon: Monitor },
                    { key: 'UNITY_WEBGL', label: 'Unity WebGL', Icon: Cpu },
                    { key: 'FLASH', label: 'Flash', Icon: Zap },
                  ] as const
                ).map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    onClick={() => setCategoryFilter(key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
                      categoryFilter === key
                        ? 'bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/30 tab-active-glow'
                        : 'text-[#e2e8f0]/60 hover:text-[#e2e8f0] border border-transparent hover:border-[#8b5cf6]/15'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}

                {/* Sort Dropdown */}
                <div className="ml-auto">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                    <SelectTrigger className="kali-input w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0d0d1f] border-[#8b5cf6]/15">
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="popular">Most Played</SelectItem>
                      <SelectItem value="top-rated">Top Rated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Stats bar */}
              <div className="flex items-center gap-2 text-xs text-[#94a3b8] tracking-wider">
                <span className="text-[#8b5cf6]">$</span>
                {loading ? (
                  <span className="text-[#06b6d4]">scanning games_db...</span>
                ) : (
                  <span><span className="text-[#8b5cf6]">{allGames.length}</span> GAME{allGames.length !== 1 ? 'S' : ''} FOUND <span className="hex-decoration">0x{allGames.length.toString(16).toUpperCase()}</span></span>
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
                      <GameCard key={game.id} game={game} onPlay={playGame} onHoverGame={handleHoverGame} />
                    ))}
                  </div>
                </section>
              )}

              {/* All Games Grid */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Gamepad2 className="w-5 h-5 text-[#8b5cf6] icon-glow-purple" />
                  <h2 className="text-xl font-bold kali-text">ALL GAMES</h2>
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
                    <Gamepad2 className="w-16 h-16 mx-auto mb-4 text-[#8b5cf6]/30 icon-glow-purple" />
                    <p className="text-[#94a3b8] text-sm">
                      No games found. Try a different search or category.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {allGames.map((game) => (
                      <GameCard key={game.id} game={game} onPlay={playGame} onHoverGame={handleHoverGame} />
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
                    className="text-[#8b5cf6] hover:bg-[#8b5cf6]/10"
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
                    onClick={() => setIsMuted(!isMuted)}
                    className="text-[#e2e8f0] hover:bg-white/5"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
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

              {/* Game Frame */}
              <div ref={fullscreenRef} className="relative flex-1 rounded-xl overflow-hidden kali-border bg-black">
                <iframe
                  ref={gameFrameRef}
                  src={selectedGame.gameUrl}
                  className="w-full h-full border-0"
                  allowFullScreen
                  allow="autoplay; fullscreen; gamepad"
                  title={selectedGame.title}
                />

                {/* Loading overlay (shown initially) */}
                <div className="absolute inset-0 bg-[#0a0a14]/90 flex flex-col items-center justify-center gap-4 pointer-events-none">
                  <div className="relative">
                    <Gamepad2 className="w-12 h-12 text-[#8b5cf6] animate-bounce icon-glow-purple" />
                    <span className="absolute inset-0 rounded-full bg-[#8b5cf6]/20 animate-ping" />
                  </div>
                  <div className="w-48 h-1 bg-[#111127] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-[#8b5cf6] to-[#06b6d4] rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 2, ease: 'easeInOut' }}
                    />
                  </div>
                  <p className="text-xs text-[#94a3b8]">Loading game...</p>
                </div>
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
              <div className="flex items-center gap-2 mb-6">
                <Settings className="w-5 h-5 text-[#a78bfa] icon-glow-gold" />
                <h2 className="text-xl font-bold kali-text-purple">GAME MANAGER</h2>
              </div>

              {/* Table Header */}
              <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs text-[#94a3b8] tracking-wider uppercase border-b border-[#8b5cf6]/10">
                <div className="col-span-4">Title</div>
                <div className="col-span-2">Category</div>
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
                        className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center px-4 py-3 rounded-lg bg-[#0d0d1f]/50 border border-[#8b5cf6]/8 hover:border-[#8b5cf6]/20 transition-all"
                      >
                        {/* Title + Thumbnail */}
                        <div className="md:col-span-4 flex items-center gap-3">
                          {game.thumbnailUrl && (
                            <img
                              src={game.thumbnailUrl}
                              alt={game.title}
                              className="w-10 h-10 rounded object-cover shrink-0"
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

                        {/* Category */}
                        <div className="md:col-span-2">
                          <CategoryBadge category={game.category} />
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
                            className="text-[#8b5cf6] hover:bg-[#8b5cf6]/10 hover:shadow-[0_0_10px_rgba(139,92,246,0.3)] text-xs"
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
                            <AlertDialogContent className="bg-[#0d0d1f] border-[#ef4444]/20">
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
                                <AlertDialogCancel className="bg-[#111127] border-[#8b5cf6]/15 text-[#e2e8f0] hover:bg-[#1a1a2e]">
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-[#06b6d4] icon-glow-blue" />
                  <h2 className="text-xl font-bold kali-text-cyan">GAME SOURCES</h2>
                </div>
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
                  className="kali-border-blue rounded-xl p-4 bg-[#0a0a14]/80"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Loader2 className="w-5 h-5 text-[#06b6d4] animate-spin" />
                    <span className="text-sm text-[#06b6d4]">{fetchProgress.message}</span>
                  </div>
                  <div className="w-full h-2 bg-[#111127] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#06b6d4] to-[#8b5cf6]"
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
                          <AlertDialogContent className="bg-[#0d0d1f] border-[#ef4444]/20">
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
                              <AlertDialogCancel className="bg-[#111127] border-[#8b5cf6]/15 text-[#e2e8f0] hover:bg-[#1a1a2e]">
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

      {/* ── Game Hover Preview Popup ── */}
      <AnimatePresence>
        {hoveredGame && hoveredRect && (
          <motion.div
            key={hoveredGame.id}
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed z-[100] pointer-events-none w-[340px] hidden md:block"
            style={{
              top: Math.min(hoveredRect.top, window.innerHeight - 460),
              left: hoveredRect.left > window.innerWidth / 2
                ? hoveredRect.left - 360
                : hoveredRect.left + 20,
            }}
            onMouseEnter={() => {}}
          >
            <div className="rounded-xl border-2 border-[#8b5cf6]/60 bg-[#0d0d1f]/95 backdrop-blur-md overflow-hidden shadow-[0_0_30px_rgba(139,92,246,0.25),0_0_60px_rgba(139,92,246,0.1)]">
              {/* Thumbnail */}
              <div className="relative h-[180px] bg-[#111127] overflow-hidden">
                {hoveredGame.thumbnailUrl ? (
                  <img
                    src={hoveredGame.thumbnailUrl}
                    alt={hoveredGame.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Gamepad2 className="w-16 h-16 text-[#8b5cf6]/20" />
                  </div>
                )}
                {/* Purple gradient overlay at bottom */}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0d0d1f] to-transparent" />
                {/* Category badge */}
                <div className="absolute top-3 left-3">
                  <CategoryBadge category={hoveredGame.category} />
                </div>
                {/* Featured badge */}
                {hoveredGame.featured && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 text-xs font-bold text-[#fbbf24]">
                    <Star className="w-3 h-3 fill-[#fbbf24]" />
                    FEATURED
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                {/* Title */}
                <h3 className="text-base font-bold text-white mb-1.5 leading-tight truncate"
                  style={{ textShadow: '0 0 10px rgba(139,92,246,0.3)' }}
                >
                  {hoveredGame.title}
                </h3>

                {/* Description */}
                <p className="text-xs text-[#94a3b8] line-clamp-2 mb-3 leading-relaxed">
                  {hoveredGame.description || 'No description available.'}
                </p>

                {/* Stats row */}
                <div className="flex items-center gap-3 mb-3 text-xs text-[#94a3b8]">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-[#fbbf24]" />
                    <span className="text-white font-medium">{hoveredGame.rating.toFixed(1)}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    <span>{formatPlays(hoveredGame.plays)} plays</span>
                  </span>
                </div>

                {/* Tags */}
                {hoveredGame.tags && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {hoveredGame.tags.split(',').slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/20"
                      >
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}

                {/* Play Now button */}
                <button
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white text-xs font-bold tracking-wider uppercase transition-all hover:from-[#a78bfa] hover:to-[#8b5cf6] shadow-[0_0_15px_rgba(139,92,246,0.3)] flex items-center justify-center gap-2"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  PLAY NOW
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dialogs ── */}

      {/* Add Source Dialog */}
      <Dialog open={addSourceOpen} onOpenChange={setAddSourceOpen}>
        <DialogContent className="bg-[#0d0d1f] border-[#06b6d4]/20 text-white">
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
                        ? 'https://www.crazygames.com'
                        : v === 'POKI'
                          ? 'https://www.poki.com'
                          : addSourceForm.baseUrl,
                  })
                }
              >
                <SelectTrigger className="kali-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0d0d1f] border-[#8b5cf6]/15">
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
        <DialogContent className="bg-[#0d0d1f] border-[#8b5cf6]/20 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#8b5cf6]">
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
                  <SelectContent className="bg-[#0d0d1f] border-[#8b5cf6]/15">
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
        <DialogContent className="bg-[#0d0d1f] border-[#06b6d4]/20 text-white">
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
                  <SelectContent className="bg-[#0d0d1f] border-[#8b5cf6]/15">
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

      {/* ── Footer ── */}
      <footer className="footer-glow mt-auto px-4 py-3 bg-[#0a0a14]/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-[#94a3b8]">
          <div className="flex items-center gap-2">
            <div className="text-[#8b5cf6] header-logo-glow">
              <Gamepad2 className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <span className="kali-text text-[10px]">CYBERPLAY</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6] status-dot-glow" />
          </div>
          <span>{games.length} GAME{games.length !== 1 ? 'S' : ''} AVAILABLE</span>
        </div>
      </footer>
    </div>
  );
}

// ─── GameCard Component ─────────────────────────────────────────────
function GameCard({ game, onPlay, onHoverGame }: { game: Game; onPlay: (game: Game) => void; onHoverGame: (game: Game | null, e?: React.MouseEvent) => void }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={`group game-card cursor-pointer ${game.featured ? 'game-card-featured' : ''}`}
      onClick={() => onPlay(game)}
      onMouseEnter={(e) => onHoverGame(game, e)}
      onMouseLeave={() => onHoverGame(null)}
    >
      {/* Thumbnail */}
      <div className="relative overflow-hidden bg-[#111127]">
        {game.thumbnailUrl ? (
          <img
            src={game.thumbnailUrl}
            alt={game.title}
            className="w-full h-40 object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : null}
        {/* Fallback: game initial letter when no thumbnail */}
        <div className={`absolute inset-0 flex items-center justify-center ${game.thumbnailUrl ? 'hidden' : ''}`}>
          <div className="text-4xl font-bold text-[#8b5cf6]/20 select-none">
            {(game.title || '?')[0].toUpperCase()}
          </div>
        </div>
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="play-btn-glow w-14 h-14 rounded-full bg-[#8b5cf6]/20 border border-[#8b5cf6]/40 flex items-center justify-center">
            <Play className="w-6 h-6 text-[#8b5cf6] fill-[#8b5cf6] ml-1" />
          </div>
        </div>

        {/* Category badge top-left */}
        <div className="absolute top-2 left-2">
          <CategoryBadge category={game.category} />
        </div>

        {/* Featured star */}
        {game.featured && (
          <div className="absolute top-2 right-2 flex items-center gap-1 kali-text-gold text-xs font-bold">
            <Star className="w-3.5 h-3.5 icon-glow-gold fill-[#fbbf24]" />
            HOT
          </div>
        )}

        {/* Play count bottom-left */}
        <div className="absolute bottom-2 left-2 text-[10px] text-white/70 flex items-center gap-1">
          <Eye className="w-3 h-3" />
          {formatPlays(game.plays)}
        </div>
      </div>

      {/* Card body */}
      <div className="p-3">
        <h3 className="text-sm font-bold text-[#e2e8f0] mb-1 truncate transition-all duration-300 group-hover:text-[#8b5cf6] group-hover:[text-shadow:0_0_8px_rgba(139,92,246,0.5)]">
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
