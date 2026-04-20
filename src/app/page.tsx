'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gamepad2, Search, Upload, Settings, Play, Star, Eye, Trash2,
  Edit3, X, ChevronDown, Filter, Zap, Monitor, Cpu, ZapIcon,
  Menu, Grid3X3, List, TrendingUp, Clock, Trophy, ArrowLeft,
  ExternalLink, Heart, Share2, Maximize2, Volume2, VolumeX, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────
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

type ViewMode = 'home' | 'play' | 'manage';
type CategoryFilter = 'ALL' | 'HTML5' | 'UNITY_WEBGL' | 'FLASH';
type SortOption = 'newest' | 'popular' | 'top-rated';

// ─── Helper Components ───────────────────────────────────────────────
function CategoryBadge({ category }: { category: string }) {
  const config: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    HTML5: { cls: 'badge-html5', icon: <Monitor className="w-3 h-3 mr-1" />, label: 'HTML5' },
    UNITY_WEBGL: { cls: 'badge-webgl', icon: <Cpu className="w-3 h-3 mr-1" />, label: 'Unity WebGL' },
    FLASH: { cls: 'badge-flash', icon: <Zap className="w-3 h-3 mr-1" />, label: 'Flash' },
  };
  const c = config[category] || config.HTML5;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}

function formatPlays(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// ─── Typing Animation Hook ─────────────────────────────────────────
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

// ─── Main App ────────────────────────────────────────────────────────
export default function GamePortal() {
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
  const gameFrameRef = useRef<HTMLIFrameElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  const heroTyping = useTypingEffect('PLAY ANY GAME', 120, 400);

  useEffect(() => { setMounted(true); }, []);

  // Upload dialog state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '', description: '', category: 'HTML5' as Game['category'],
    thumbnailUrl: '', gameUrl: '', featured: false, tags: '',
  });

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: '', title: '', description: '', category: 'HTML5' as Game['category'],
    thumbnailUrl: '', gameUrl: '', featured: false, tags: '', rating: 0,
  });

  // ─── Fetch Games ────────────────────────────────────────────────
  const fetchGames = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('sortBy', sortBy);

      const res = await fetch(`/api/games?${params}`);
      if (res.ok) {
        const data = await res.json();
        setGames(data);
      }
    } catch (err) {
      console.error('Failed to fetch games:', err);
      toast.error('Failed to load games');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, searchQuery, sortBy]);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  // ─── Seed Database ──────────────────────────────────────────────
  const seedDatabase = async () => {
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      if (res.ok) {
        toast.success('Database seeded with games!');
        fetchGames();
      }
    } catch (err) {
      toast.error('Failed to seed database');
    }
  };

  // ─── Play Game ──────────────────────────────────────────────────
  const playGame = async (game: Game) => {
    setSelectedGame(game);
    setView('play');
    try {
      await fetch(`/api/games/${game.id}/play`, { method: 'POST' });
    } catch (e) { /* silent */ }
  };

  // ─── Upload Game ────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadForm.title || !uploadForm.description || !uploadForm.gameUrl) {
      toast.error('Please fill in required fields');
      return;
    }
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadForm),
      });
      if (res.ok) {
        toast.success('Game uploaded successfully!');
        setUploadOpen(false);
        setUploadForm({ title: '', description: '', category: 'HTML5', thumbnailUrl: '', gameUrl: '', featured: false, tags: '' });
        fetchGames();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to upload');
      }
    } catch {
      toast.error('Failed to upload game');
    }
  };

  // ─── Edit Game ──────────────────────────────────────────────────
  const openEdit = (game: Game) => {
    setEditForm({
      id: game.id, title: game.title, description: game.description,
      category: game.category, thumbnailUrl: game.thumbnailUrl,
      gameUrl: game.gameUrl, featured: game.featured, tags: game.tags, rating: game.rating,
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
        toast.success('Game updated!');
        setEditOpen(false);
        fetchGames();
      } else {
        toast.error('Failed to update game');
      }
    } catch {
      toast.error('Failed to update game');
    }
  };

  // ─── Delete Game ────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/games/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Game deleted!');
        fetchGames();
      } else {
        toast.error('Failed to delete game');
      }
    } catch {
      toast.error('Failed to delete game');
    }
  };

  // ─── Fullscreen Toggle ──────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!fullscreenRef.current) return;
    if (!document.fullscreenElement) {
      fullscreenRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // ─── Filtered Games ─────────────────────────────────────────────
  const featuredGames = games.filter(g => g.featured);
  const regularGames = games.filter(g => !g.featured);

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col cyber-gradient-bg scanlines grid-bg relative">
      {/* Background particles — client-only to avoid hydration mismatch */}
      {mounted && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left: `${Math.random() * 100}%`,
                animationDuration: `${8 + Math.random() * 12}s`,
                animationDelay: `${Math.random() * 10}s`,
                animation: `float ${8 + Math.random() * 12}s linear ${Math.random() * 10}s infinite`,
                opacity: Math.random() * 0.5 + 0.1,
              }}
            />
          ))}
        </div>
      )}

      {/* ─── HEADER ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#050508]/80 header-glow">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <button
              onClick={() => { setView('home'); setSelectedGame(null); }}
              className="flex items-center gap-2 group flex-shrink-0"
            >
              <div className="relative">
                <Gamepad2 className="w-8 h-8 text-[#00ff41] icon-glow-green transition-all" />
                <div className="absolute inset-0 w-8 h-8 bg-[#00ff41]/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold font-mono neon-text glitch-hover leading-none">
                  CYBER<span className="neon-text-cyan">PLAY</span>
                </h1>
                <p className="text-[10px] text-[#8b949e] font-mono tracking-widest">GAME PORTAL v2.0</p>
              </div>
            </button>

            {/* Search Bar */}
            <div className="flex-1 max-w-md hidden sm:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#00ff41]/50" />
                <input
                  type="text"
                  placeholder="search_games..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[rgba(0,255,65,0.05)] border border-[rgba(0,255,65,0.2)] rounded-lg text-sm font-mono text-[#00ff41] placeholder:text-[rgba(0,255,65,0.3)] focus:outline-none focus:border-[rgba(0,255,65,0.5)] focus:shadow-[0_0_10px_rgba(0,255,65,0.15)] transition-all"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#8b949e] font-mono">
                  CTRL+K
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                onClick={() => seedDatabase()}
                size="sm"
                className="hidden md:flex gap-1.5 bg-transparent border border-[rgba(255,107,0,0.3)] text-[#ff6b00] hover:bg-[rgba(255,107,0,0.1)] hover:shadow-[0_0_12px_rgba(255,107,0,0.25)] hover:border-[rgba(255,107,0,0.5)] font-mono text-xs transition-all"
              >
                <ZapIcon className="w-3 h-3" /> SEED DATA
              </Button>

              <Button
                onClick={() => setUploadOpen(true)}
                size="sm"
                className="gap-1.5 bg-transparent border border-[#00ff41]/50 text-[#00ff41] hover:bg-[rgba(0,255,65,0.1)] hover:shadow-[0_0_12px_rgba(0,255,65,0.25)] hover:border-[#00ff41]/70 font-mono text-xs transition-all"
              >
                <Upload className="w-3 h-3" /> <span className="hidden sm:inline">UPLOAD</span>
              </Button>

              <Button
                onClick={() => setView(view === 'manage' ? 'home' : 'manage')}
                size="sm"
                variant="ghost"
                className={`gap-1.5 font-mono text-xs transition-all ${view === 'manage' ? 'text-[#ff00ff] border border-[#ff00ff]/50 shadow-[0_0_10px_rgba(255,0,255,0.2)]' : 'text-[#8b949e] hover:text-[#e0e0e0]'}`}
              >
                <Settings className="w-3 h-3" /> <span className="hidden sm:inline">MANAGE</span>
              </Button>

              {/* Mobile menu */}
              <Button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                size="sm"
                variant="ghost"
                className="sm:hidden text-[#8b949e]"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Mobile search & filters */}
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="sm:hidden mt-3 space-y-3"
            >
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#00ff41]/50" />
                <input
                  type="text"
                  placeholder="search_games..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[rgba(0,255,65,0.05)] border border-[rgba(0,255,65,0.2)] rounded-lg text-sm font-mono text-[#00ff41] placeholder:text-[rgba(0,255,65,0.3)] focus:outline-none focus:border-[rgba(0,255,65,0.5)] transition-all"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={seedDatabase} size="sm" className="gap-1 bg-transparent border border-[rgba(255,107,0,0.3)] text-[#ff6b00] text-xs font-mono">
                  <ZapIcon className="w-3 h-3" /> SEED
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </header>

      {/* ─── MAIN CONTENT ─────────────────────────────────────────── */}
      <main className="flex-1 relative z-10">
        <AnimatePresence mode="wait">
          {/* ─── HOME VIEW ─────────────────────────────────────── */}
          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-7xl mx-auto px-4 py-6 space-y-8"
            >
              {/* Hero Section */}
              <section className="relative overflow-hidden rounded-2xl neon-border p-6 md:p-10 bg-gradient-to-br from-[#0d1117] via-[#0a0f0a] to-[#0a0a14]">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#00ff41]/8 rounded-full blur-[100px] hero-orb-1" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#00f0ff]/8 rounded-full blur-[80px] hero-orb-2" />
                <div className="absolute top-1/2 left-1/2 w-32 h-32 bg-[#ff00ff]/5 rounded-full blur-[60px] hero-orb-1" />
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block w-2 h-2 bg-[#00ff41] rounded-full status-dot-glow" />
                    <span className="text-xs font-mono text-[#00ff41]/60 tracking-widest">SYSTEM ONLINE</span>
                  </div>
                  <h2 className="text-3xl md:text-5xl font-bold font-mono mb-3 leading-tight min-h-[1.2em]">
                    {heroTyping.displayed.split(' ').map((word, wi) => {
                      const colors = ['neon-text', 'text-[#e0e0e0]', 'neon-text-cyan'];
                      return (
                        <span key={wi}>
                          <span className={colors[wi] || 'text-[#e0e0e0]'}>
                            {word}
                          </span>
                          {wi < heroTyping.displayed.split(' ').length - 1 && '\u00A0'}
                        </span>
                      );
                    })}
                    <span
                      className="inline-block w-[3px] h-[0.85em] bg-[#00ff41] ml-1 align-middle"
                      style={{
                        animation: 'blink 1s step-end infinite',
                        opacity: heroTyping.displayed.length > 0 ? 1 : 0,
                      }}
                    />
                  </h2>
                  <p className="text-[#8b949e] font-mono text-sm md:text-base max-w-xl">
                    {'>'} Access {games.length}+ games. HTML5, Unity WebGL, Flash. No downloads. No limits. Just play.
                  </p>
                  <div className="flex gap-4 mt-6">
                    <div className="flex items-center gap-2 text-xs font-mono text-[#8b949e]">
                      <Monitor className="w-4 h-4 text-[#00ff41] icon-glow-green" />
                      <span>HTML5</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-[#8b949e]">
                      <Cpu className="w-4 h-4 text-[#00f0ff] icon-glow-cyan" />
                      <span>Unity WebGL</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-[#8b949e]">
                      <Zap className="w-4 h-4 text-[#ff6b00] icon-glow-orange" />
                      <span>Flash</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Filters Bar */}
              <section className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {/* Category Tabs */}
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { key: 'ALL' as CategoryFilter, label: 'All Games', icon: <Grid3X3 className="w-3.5 h-3.5" /> },
                      { key: 'HTML5' as CategoryFilter, label: 'HTML5', icon: <Monitor className="w-3.5 h-3.5" /> },
                      { key: 'UNITY_WEBGL' as CategoryFilter, label: 'Unity WebGL', icon: <Cpu className="w-3.5 h-3.5" /> },
                      { key: 'FLASH' as CategoryFilter, label: 'Flash', icon: <Zap className="w-3.5 h-3.5" /> },
                    ].map((cat) => (
                      <button
                        key={cat.key}
                        onClick={() => setCategoryFilter(cat.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                          categoryFilter === cat.key
                            ? 'bg-[#00ff41]/15 border border-[#00ff41]/40 text-[#00ff41] tab-active-glow'
                            : 'bg-transparent border border-[rgba(255,255,255,0.05)] text-[#8b949e] hover:border-[rgba(255,255,255,0.1)] hover:text-[#e0e0e0]'
                        }`}
                      >
                        {cat.icon}{cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Sort */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#8b949e]">SORT:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      className="bg-transparent border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-1.5 text-xs font-mono text-[#e0e0e0] focus:outline-none focus:border-[#00ff41]/40 appearance-none cursor-pointer"
                    >
                      <option value="newest" className="bg-[#0d1117]">Newest</option>
                      <option value="popular" className="bg-[#0d1117]">Most Played</option>
                      <option value="top-rated" className="bg-[#0d1117]">Top Rated</option>
                    </select>
                  </div>
                </div>

                {/* Stats Bar */}
                <div className="flex items-center gap-4 text-xs font-mono text-[#8b949e]">
                  <span>{'>'} Found <span className="text-[#00ff41]">{games.length}</span> games</span>
                  {searchQuery && (
                    <span>
                      for &quot;<span className="text-[#00f0ff]">{searchQuery}</span>&quot;
                    </span>
                  )}
                  {categoryFilter !== 'ALL' && (
                    <span>
                      in <CategoryBadge category={categoryFilter} />
                    </span>
                  )}
                </div>
              </section>

              {/* Featured Games */}
              {featuredGames.length > 0 && categoryFilter === 'ALL' && !searchQuery && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Trophy className="w-4 h-4 text-[#ffd700] icon-glow-gold" />
                    <h3 className="text-sm font-mono font-bold text-[#ffd700] neon-text-gold tracking-wider">FEATURED GAMES</h3>
                    <div className="flex-1 h-px bg-gradient-to-r from-[#ffd700]/30 to-transparent" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {featuredGames.map((game, i) => (
                      <GameCard key={game.id} game={game} onPlay={playGame} index={i} featured />
                    ))}
                  </div>
                </section>
              )}

              {/* All Games Grid */}
              <section>
                {(featuredGames.length > 0 && categoryFilter === 'ALL' && !searchQuery) && (
                  <div className="flex items-center gap-2 mb-4">
                    <Gamepad2 className="w-4 h-4 text-[#00ff41] icon-glow-green" />
                    <h3 className="text-sm font-mono font-bold text-[#00ff41] neon-text tracking-wider">ALL GAMES</h3>
                    <div className="flex-1 h-px bg-gradient-to-r from-[#00ff41]/30 to-transparent" />
                  </div>
                )}

                {loading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="rounded-xl bg-[#0d1117] border border-[rgba(0,255,65,0.1)] overflow-hidden">
                        <div className="aspect-[16/10] bg-[#161b22] skeleton-glow" />
                        <div className="p-4 space-y-2">
                          <div className="h-4 bg-[#161b22] rounded skeleton-glow w-3/4" />
                          <div className="h-3 bg-[#161b22] rounded skeleton-glow w-full" />
                          <div className="h-3 bg-[#161b22] rounded skeleton-glow w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : games.length === 0 ? (
                  <div className="text-center py-20 space-y-4">
                    <Gamepad2 className="w-16 h-16 text-[#00ff41]/20 mx-auto icon-glow-green" />
                    <p className="font-mono text-[#8b949e]">{'> '}No games found.</p>
                    <p className="font-mono text-[#8b949e] text-sm">
                      Try adjusting filters or{' '}
                      <button onClick={() => seedDatabase()} className="text-[#00ff41] hover:underline">seed the database</button>
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {(categoryFilter === 'ALL' && !searchQuery ? regularGames : games).map((game, i) => (
                      <GameCard key={game.id} game={game} onPlay={playGame} index={i} />
                    ))}
                  </div>
                )}
              </section>
            </motion.div>
          )}

          {/* ─── PLAY VIEW ──────────────────────────────────────── */}
          {view === 'play' && selectedGame && (
            <motion.div
              key="play"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              ref={fullscreenRef}
              className={`flex flex-col h-[calc(100vh-57px)] ${isFullscreen ? 'bg-black' : ''}`}
            >
              {/* Game Header */}
              <div className={`flex items-center justify-between px-4 py-3 border-b border-[rgba(0,255,65,0.15)] ${isFullscreen ? 'bg-black/90' : 'bg-[#0d1117]/90 backdrop-blur-sm'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => { setView('home'); setSelectedGame(null); }}
                    className="flex-shrink-0 p-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] text-[#8b949e] hover:text-[#e0e0e0] hover:border-[rgba(255,255,255,0.2)] transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-sm font-mono font-bold text-[#e0e0e0] truncate">{selectedGame.title}</h2>
                    <div className="flex items-center gap-2">
                      <CategoryBadge category={selectedGame.category} />
                      <span className="text-[10px] font-mono text-[#8b949e]">{selectedGame.plays.toLocaleString()} plays</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] text-[#8b949e] hover:text-[#e0e0e0] transition-all"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] text-[#8b949e] hover:text-[#e0e0e0] transition-all"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <a
                    href={selectedGame.gameUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] text-[#8b949e] hover:text-[#e0e0e0] transition-all"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Game Frame */}
              <div className="flex-1 relative bg-black">
                <iframe
                  ref={gameFrameRef}
                  src={selectedGame.gameUrl}
                  className="w-full h-full border-0"
                  allow="autoplay; fullscreen; gamepad; microphone; clipboard-write"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
                  title={selectedGame.title}
                />
                {/* Loading overlay */}
                <div id="game-loading-overlay" className="absolute inset-0 bg-[#050508] flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <div className="relative">
                      <Gamepad2 className="w-12 h-12 text-[#00ff41] mx-auto animate-pulse" />
                      <div className="absolute inset-0 w-12 h-12 mx-auto bg-[#00ff41]/30 rounded-full blur-xl animate-ping" />
                    </div>
                    <p className="font-mono text-xs text-[#8b949e] tracking-widest">LOADING GAME...</p>
                    <div className="w-48 h-1 bg-[#161b22] rounded-full mx-auto overflow-hidden">
                      <div className="h-full bg-[#00ff41] rounded-full animate-[loading_2s_ease-in-out_infinite]" style={{ width: '60%' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Game Info Bar */}
              <div className={`px-4 py-3 border-t border-[rgba(0,255,65,0.15)] ${isFullscreen ? 'bg-black/90' : 'bg-[#0d1117]/90 backdrop-blur-sm'}`}>
                <p className="text-xs font-mono text-[#8b949e] line-clamp-1">{selectedGame.description}</p>
              </div>
            </motion.div>
          )}

          {/* ─── MANAGE VIEW ────────────────────────────────────── */}
          {view === 'manage' && (
            <motion.div
              key="manage"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-7xl mx-auto px-4 py-6 space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setView('home')}
                    className="p-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] text-[#8b949e] hover:text-[#e0e0e0] hover:border-[rgba(255,255,255,0.2)] transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h2 className="text-lg font-mono font-bold neon-text">GAME MANAGER</h2>
                    <p className="text-xs font-mono text-[#8b949e]">{'> '}Total: {games.length} games</p>
                  </div>
                </div>
                <Button
                  onClick={() => setUploadOpen(true)}
                  className="gap-1.5 bg-transparent border border-[#00ff41]/50 text-[#00ff41] hover:bg-[rgba(0,255,65,0.1)] font-mono text-xs"
                >
                  <Upload className="w-3 h-3" /> ADD GAME
                </Button>
              </div>

              {/* Games Table */}
              <div className="rounded-xl border border-[rgba(0,255,65,0.15)] overflow-hidden bg-[#0d1117]">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-[#161b22] border-b border-[rgba(0,255,65,0.1)] text-[10px] font-mono text-[#8b949e] tracking-wider uppercase">
                  <div className="col-span-4 sm:col-span-3">Title</div>
                  <div className="col-span-3 sm:col-span-2 hidden sm:block">Category</div>
                  <div className="col-span-2 hidden md:block">Plays</div>
                  <div className="col-span-2 hidden md:block">Rating</div>
                  <div className="col-span-8 sm:col-span-3 text-right">Actions</div>
                </div>

                {/* Table Rows */}
                <ScrollArea className="max-h-[60vh]">
                  {games.length === 0 ? (
                    <div className="text-center py-12 text-xs font-mono text-[#8b949e]">No games in database</div>
                  ) : (
                    games.map((game, i) => (
                      <motion.div
                        key={game.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-[rgba(0,255,65,0.05)] hover:bg-[rgba(0,255,65,0.03)] transition-colors items-center"
                      >
                        <div className="col-span-4 sm:col-span-3 flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded bg-[#161b22] flex-shrink-0 overflow-hidden">
                            {game.thumbnailUrl ? (
                              <img src={game.thumbnailUrl} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[#8b949e]">
                                <Gamepad2 className="w-4 h-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-mono text-[#e0e0e0] truncate">{game.title}</p>
                            {game.featured && <span className="text-[8px] font-mono text-[#ffd700]">★ FEATURED</span>}
                          </div>
                        </div>
                        <div className="col-span-3 sm:col-span-2 hidden sm:block">
                          <CategoryBadge category={game.category} />
                        </div>
                        <div className="col-span-2 hidden md:flex items-center gap-1 text-xs font-mono text-[#8b949e]">
                          <Eye className="w-3 h-3" />{formatPlays(game.plays)}
                        </div>
                        <div className="col-span-2 hidden md:flex items-center gap-1 text-xs font-mono text-[#ffd700]">
                          <Star className="w-3 h-3" />{game.rating.toFixed(1)}
                        </div>
                        <div className="col-span-8 sm:col-span-3 flex items-center justify-end gap-1">
                          <button
                            onClick={() => playGame(game)}
                            className="p-1.5 rounded border border-[#00ff41]/30 text-[#00ff41] hover:bg-[#00ff41]/10 hover:shadow-[0_0_8px_rgba(0,255,65,0.25)] hover:border-[#00ff41]/50 transition-all"
                            title="Play"
                          >
                            <Play className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => openEdit(game)}
                            className="p-1.5 rounded border border-[#00f0ff]/30 text-[#00f0ff] hover:bg-[#00f0ff]/10 hover:shadow-[0_0_8px_rgba(0,240,255,0.25)] hover:border-[#00f0ff]/50 transition-all"
                            title="Edit"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="p-1.5 rounded border border-[#ff4444]/30 text-[#ff4444] hover:bg-[#ff4444]/10 hover:shadow-[0_0_8px_rgba(255,68,68,0.25)] hover:border-[#ff4444]/50 transition-all" title="Delete">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-[#0d1117] border border-[rgba(255,255,255,0.1)]">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-[#e0e0e0] font-mono">Delete Game?</AlertDialogTitle>
                                <AlertDialogDescription className="text-[#8b949e] font-mono">
                                  This will permanently delete &quot;{game.title}&quot; from the database. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="bg-transparent border border-[rgba(255,255,255,0.1)] text-[#8b949e]">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(game.id)}
                                  className="bg-[#ff4444]/20 border border-[#ff4444]/50 text-[#ff4444] hover:bg-[#ff4444]/30"
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
                </ScrollArea>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ─── FOOTER ──────────────────────────────────────────────── */}
      <footer className="relative z-10 footer-glow bg-[#050508]/80 backdrop-blur-sm mt-auto">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-[#00ff41] icon-glow-green" />
              <span className="text-xs font-mono text-[#8b949e]">
                CYBERPLAY v2.0 &mdash; All systems operational
              </span>
              <span className="inline-block w-1.5 h-1.5 bg-[#00ff41] rounded-full status-dot-glow" />
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-[#8b949e]">
              <span>{games.length} games indexed</span>
              <span className="hidden sm:inline">|</span>
              <span className="hidden sm:inline">HTML5 / WebGL / Flash</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ─── UPLOAD DIALOG ───────────────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="bg-[#0d1117] border border-[rgba(0,255,65,0.2)] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-[#00ff41] flex items-center gap-2">
              <Upload className="w-4 h-4" /> UPLOAD NEW GAME
            </DialogTitle>
            <DialogDescription className="font-mono text-[#8b949e] text-xs">
              {'>'} Fill in the details to add a new game to the portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-[#8b949e]">TITLE *</Label>
              <Input
                value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                placeholder="Game title..."
                className="cyber-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-[#8b949e]">DESCRIPTION *</Label>
              <Textarea
                value={uploadForm.description}
                onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                placeholder="Describe the game..."
                rows={3}
                className="cyber-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-[#8b949e]">CATEGORY *</Label>
                <select
                  value={uploadForm.category}
                  onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value as Game['category'] })}
                  className="w-full cyber-input rounded-md px-3 py-2 text-sm"
                >
                  <option value="HTML5" className="bg-[#0d1117]">HTML5</option>
                  <option value="UNITY_WEBGL" className="bg-[#0d1117]">Unity WebGL</option>
                  <option value="FLASH" className="bg-[#0d1117]">Flash</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-[#8b949e]">THUMBNAIL URL</Label>
                <Input
                  value={uploadForm.thumbnailUrl}
                  onChange={(e) => setUploadForm({ ...uploadForm, thumbnailUrl: e.target.value })}
                  placeholder="https://..."
                  className="cyber-input"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-[#8b949e]">GAME URL *</Label>
              <Input
                value={uploadForm.gameUrl}
                onChange={(e) => setUploadForm({ ...uploadForm, gameUrl: e.target.value })}
                placeholder="https://game-url.com/embed"
                className="cyber-input"
              />
              <p className="text-[10px] font-mono text-[#8b949e]">{'>'} Direct URL or embed URL for the game</p>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-[#8b949e]">TAGS</Label>
              <Input
                value={uploadForm.tags}
                onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
                placeholder="action, shooter, multiplayer..."
                className="cyber-input"
              />
              <p className="text-[10px] font-mono text-[#8b949e]">{'>'} Comma-separated tags for search</p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={uploadForm.featured}
                onCheckedChange={(v) => setUploadForm({ ...uploadForm, featured: v })}
              />
              <Label className="font-mono text-xs text-[#ffd700]">★ Featured game</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setUploadOpen(false)}
              className="font-mono text-xs text-[#8b949e]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              className="font-mono text-xs bg-[#00ff41]/10 border border-[#00ff41]/50 text-[#00ff41] hover:bg-[#00ff41]/20 hover:shadow-[0_0_10px_rgba(0,255,65,0.2)]"
            >
              <Upload className="w-3 h-3 mr-1" /> UPLOAD GAME
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── EDIT DIALOG ─────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-[#0d1117] border border-[rgba(0,240,255,0.2)] max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-[#00f0ff] flex items-center gap-2">
              <Edit3 className="w-4 h-4" /> EDIT GAME
            </DialogTitle>
            <DialogDescription className="font-mono text-[#8b949e] text-xs">
              {'>'} Modify game details and save changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-[#8b949e]">TITLE</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="cyber-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-[#8b949e]">DESCRIPTION</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
                className="cyber-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-[#8b949e]">CATEGORY</Label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value as Game['category'] })}
                  className="w-full cyber-input rounded-md px-3 py-2 text-sm"
                >
                  <option value="HTML5" className="bg-[#0d1117]">HTML5</option>
                  <option value="UNITY_WEBGL" className="bg-[#0d1117]">Unity WebGL</option>
                  <option value="FLASH" className="bg-[#0d1117]">Flash</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-xs text-[#8b949e]">RATING (0-5)</Label>
                <Input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={editForm.rating}
                  onChange={(e) => setEditForm({ ...editForm, rating: parseFloat(e.target.value) || 0 })}
                  className="cyber-input"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-[#8b949e]">THUMBNAIL URL</Label>
              <Input
                value={editForm.thumbnailUrl}
                onChange={(e) => setEditForm({ ...editForm, thumbnailUrl: e.target.value })}
                className="cyber-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-[#8b949e]">GAME URL</Label>
              <Input
                value={editForm.gameUrl}
                onChange={(e) => setEditForm({ ...editForm, gameUrl: e.target.value })}
                className="cyber-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-[#8b949e]">TAGS</Label>
              <Input
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                className="cyber-input"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={editForm.featured}
                onCheckedChange={(v) => setEditForm({ ...editForm, featured: v })}
              />
              <Label className="font-mono text-xs text-[#ffd700]">★ Featured game</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditOpen(false)}
              className="font-mono text-xs text-[#8b949e]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              className="font-mono text-xs bg-[#00f0ff]/10 border border-[#00f0ff]/50 text-[#00f0ff] hover:bg-[#00f0ff]/20 hover:shadow-[0_0_10px_rgba(0,240,255,0.2)]"
            >
              <Edit3 className="w-3 h-3 mr-1" /> SAVE CHANGES
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Game Card Component ─────────────────────────────────────────────
function GameCard({ game, onPlay, index, featured = false }: {
  game: Game;
  onPlay: (game: Game) => void;
  index: number;
  featured?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`game-card cursor-pointer group ${featured ? 'game-card-featured' : ''}`}
      onClick={() => onPlay(game)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[16/10] overflow-hidden bg-[#161b22]">
        {!imgError && game.thumbnailUrl ? (
          <img
            src={game.thumbnailUrl}
            alt={game.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#161b22] to-[#0d1117]">
            <Gamepad2 className="w-10 h-10 text-[#00ff41]/20 icon-glow-green" />
          </div>
        )}

        {/* Overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-[#050508] via-transparent to-transparent transition-opacity ${isHovered ? 'opacity-100' : 'opacity-60'}`} />

        {/* Play Button */}
        <motion.div
          initial={false}
          animate={{ scale: isHovered ? 1 : 0.8, opacity: isHovered ? 1 : 0 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="w-14 h-14 rounded-full bg-[#00ff41]/20 border-2 border-[#00ff41]/60 flex items-center justify-center backdrop-blur-sm play-btn-glow">
            <Play className="w-6 h-6 text-[#00ff41] ml-0.5" fill="currentColor" />
          </div>
        </motion.div>

        {/* Category badge */}
        <div className="absolute top-2 left-2">
          <CategoryBadge category={game.category} />
        </div>

        {/* Featured star */}
        {game.featured && (
          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded bg-[rgba(255,215,0,0.2)] border border-[rgba(255,215,0,0.3)]" style={{ boxShadow: '0 0 8px rgba(255,215,0,0.15)' }}>
            <Star className="w-3 h-3 text-[#ffd700] icon-glow-gold" fill="currentColor" />
            <span className="text-[9px] font-mono neon-text-gold">HOT</span>
          </div>
        )}

        {/* Play count */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded bg-black/60 backdrop-blur-sm">
          <Eye className="w-3 h-3 text-[#8b949e]" />
          <span className="text-[10px] font-mono text-[#8b949e]">{formatPlays(game.plays)}</span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <h3 className="text-sm font-mono font-bold text-[#e0e0e0] truncate group-hover:text-[#00ff41] transition-all group-hover:[text-shadow:0_0_8px_rgba(0,255,65,0.5)]">
          {game.title}
        </h3>
        <p className="text-[11px] font-mono text-[#8b949e] line-clamp-2 leading-relaxed">
          {game.description}
        </p>
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 text-[#ffd700]" fill="currentColor" />
            <span className="text-[10px] font-mono text-[#ffd700]">{game.rating.toFixed(1)}</span>
          </div>
          <div className="flex gap-1">
            {game.tags.split(',').slice(0, 2).map((tag) => (
              tag.trim() && (
                <span key={tag} className="text-[9px] font-mono text-[#8b949e] px-1.5 py-0.5 rounded bg-[#161b22]">
                  {tag.trim()}
                </span>
              )
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
