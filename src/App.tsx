import React, { useEffect, useRef, useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { UserProvider, useUser } from './context/UserContext';
import { useAudio } from './hooks/useAudio';
import { Header } from './components/Header';
import { BottomNav, NavTab } from './components/BottomNav';
import { MiniPlayer } from './components/MiniPlayer';
import { FullPlayerModal } from './components/FullPlayerModal';
import { AudioQualityModal } from './components/AudioQualityModal';
import { SleepTimerModal } from './components/SleepTimerModal';
import { PlaylistModal, PlaylistModalInitialMode } from './components/PlaylistModal';
import { UserModal } from './components/UserModal';
import { AppearanceModal } from './components/AppearanceModal';
import { LoginGateModal } from './components/LoginGateModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SplashScreen } from './components/SplashScreen';
import { HomeView } from './views/HomeView';
import { SearchView } from './views/SearchView';
import { LibraryView } from './views/LibraryView';
import { DownloadsView } from './views/DownloadsView';
import { Playlist, Song } from './types/music';

function MainApp() {
  const { currentSong, playState } = useAudio();
  const {
    isGuest,
    isLoginGateOpen,
    loginGateReason,
    closeLoginGate,
    recordGuestPlaybackSeconds,
    recordGuestTrackFinished,
  } = useUser();
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const lastTrackIdRef = useRef<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);
  const [isSleepTimerOpen, setIsSleepTimerOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isAppearanceModalOpen, setIsAppearanceModalOpen] = useState(false);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [playlistModalMode, setPlaylistModalMode] = useState<PlaylistModalInitialMode>('list');
  const [songToAddToPlaylist, setSongToAddToPlaylist] = useState<Song | null>(null);
  const [playlistToEdit, setPlaylistToEdit] = useState<Playlist | null>(null);
  const [searchInitialQuery, setSearchInitialQuery] = useState('');
  const [libraryTargetPlaylistId, setLibraryTargetPlaylistId] = useState<string | null>(null);
  const [libraryTargetMode, setLibraryTargetMode] = useState<'all' | 'liked' | 'history'>('all');

  // Close FullPlayer automatically if playback resets (e.g. switching accounts or logging out)
  useEffect(() => {
    if (!currentSong && isFullPlayerOpen) {
      setIsFullPlayerOpen(false);
    }
  }, [currentSong, isFullPlayerOpen]);

  // Monitor guest playback duration
  useEffect(() => {
    if (!isGuest || playState !== 'playing') return;
    const interval = setInterval(() => {
      recordGuestPlaybackSeconds(1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isGuest, playState, recordGuestPlaybackSeconds]);

  // Track finished tracks in guest mode
  useEffect(() => {
    if (!isGuest) return;
    if (currentSong?.id) {
      if (lastTrackIdRef.current && lastTrackIdRef.current !== currentSong.id) {
        recordGuestTrackFinished();
      }
      lastTrackIdRef.current = currentSong.id;
    }
  }, [isGuest, currentSong?.id, recordGuestTrackFinished]);

  const anyModalOpen =
    showSplash ||
    isFullPlayerOpen ||
    isQualityModalOpen ||
    isSleepTimerOpen ||
    isUserModalOpen ||
    isAppearanceModalOpen ||
    isPlaylistModalOpen ||
    isLoginGateOpen;

  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    if (anyModalOpen) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [anyModalOpen]);

  const handleOpenPlaylistForSong = (song: Song) => {
    setSongToAddToPlaylist(song);
    setPlaylistModalMode('list');
    setIsPlaylistModalOpen(true);
  };

  const handleSearchGenre = (genre: string) => {
    setSearchInitialQuery(genre);
    setActiveTab('search');
  };

  const handleOpenLibraryPlaylist = (playlistId: string) => {
    setLibraryTargetPlaylistId(playlistId);
    setLibraryTargetMode('all');
    setActiveTab('library');
  };

  const handleOpenLikedSongs = () => {
    setLibraryTargetPlaylistId(null);
    setLibraryTargetMode('liked');
    setActiveTab('library');
  };

  const handleOpenCreatePlaylist = () => {
    setSongToAddToPlaylist(null);
    setPlaylistToEdit(null);
    setPlaylistModalMode('create');
    setIsPlaylistModalOpen(true);
  };

  const handleOpenImportPlaylist = () => {
    setSongToAddToPlaylist(null);
    setPlaylistToEdit(null);
    setPlaylistModalMode('import');
    setIsPlaylistModalOpen(true);
  };

  const handleOpenEditPlaylist = (pl: Playlist) => {
    setSongToAddToPlaylist(null);
    setPlaylistToEdit(pl);
    setPlaylistModalMode('edit');
    setIsPlaylistModalOpen(true);
  };

  const handleSelectTab = (tab: NavTab) => {
    if (tab !== 'library' || activeTab !== 'library') {
      setLibraryTargetPlaylistId(null);
      setLibraryTargetMode('all');
    }
    if (tab !== 'search' || activeTab !== 'search') {
      setSearchInitialQuery('');
    }
    setActiveTab(tab);
    mainScrollRef.current?.scrollTo({ top: 0 });
  };

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col items-center transition-colors duration-150">
      {/* Subtle Top Atmospheric Ambient Light */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-80 transition-opacity duration-200"
        style={{ background: 'var(--ambient-glow)' }}
      />

      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}

      {/* Responsive Application Shell (Fixed Edge-to-Edge Viewport Flex Column for iOS Standalone & Desktop) */}
      <div className="w-full max-w-md sm:max-w-2xl md:max-w-3xl lg:max-w-5xl h-full flex-1 min-h-0 flex flex-col relative bg-[var(--bg-shell)] sm:border-x sm:border-[var(--border-subtle)] shadow-2xl overflow-hidden transition-colors duration-150">
        <Header
          onOpenUserModal={() => setIsUserModalOpen(true)}
          onOpenQualityModal={() => setIsQualityModalOpen(true)}
          onOpenAppearanceModal={() => setIsAppearanceModalOpen(true)}
        />

        <OfflineIndicator />

        {/* Independent Scrollable Main Content Area */}
        <main
          ref={mainScrollRef}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y no-scrollbar px-4 sm:px-6"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div key={activeTab} className="animate-view-enter">
            {activeTab === 'home' && (
              <HomeView
                onOpenPlaylistModal={handleOpenPlaylistForSong}
                onSearchGenre={handleSearchGenre}
                onOpenPlaylist={handleOpenLibraryPlaylist}
                onOpenLikedSongs={handleOpenLikedSongs}
                onCreatePlaylist={handleOpenCreatePlaylist}
                onImportPlaylist={handleOpenImportPlaylist}
              />
            )}

            {activeTab === 'search' && (
              <SearchView
                initialQuery={searchInitialQuery}
                onOpenPlaylistModal={handleOpenPlaylistForSong}
              />
            )}

            {activeTab === 'library' && (
              <LibraryView
                initialPlaylistId={libraryTargetPlaylistId}
                initialViewMode={libraryTargetMode}
                onClearInitialTarget={() => setLibraryTargetPlaylistId(null)}
                onOpenCreatePlaylist={handleOpenCreatePlaylist}
                onOpenImportPlaylist={handleOpenImportPlaylist}
                onEditPlaylist={handleOpenEditPlaylist}
                onOpenUserModal={() => setIsUserModalOpen(true)}
                onOpenPlaylistModal={handleOpenPlaylistForSong}
              />
            )}

            {activeTab === 'downloads' && (
              <DownloadsView
                onOpenPlaylistModal={handleOpenPlaylistForSong}
                onGoToSearch={() => {
                  setSearchInitialQuery('');
                  setActiveTab('search');
                }}
              />
            )}
          </div>
        </main>

        {/* Docked Mini Player */}
        <MiniPlayer onExpand={() => setIsFullPlayerOpen(true)} />

        {/* Bottom Tab Navigation */}
        <BottomNav activeTab={activeTab} onSelectTab={handleSelectTab} />

        {/* Full Screen Player Sheet (mounted only when open) */}
        {isFullPlayerOpen && (
          <FullPlayerModal
            isOpen={isFullPlayerOpen}
            onClose={() => setIsFullPlayerOpen(false)}
            onOpenQualityModal={() => setIsQualityModalOpen(true)}
            onOpenSleepTimer={() => setIsSleepTimerOpen(true)}
            onOpenPlaylistModal={(song) => handleOpenPlaylistForSong(song)}
          />
        )}

        {/* Quality & Sound Mastering Modal */}
        {isQualityModalOpen && (
          <AudioQualityModal
            isOpen={isQualityModalOpen}
            onClose={() => setIsQualityModalOpen(false)}
          />
        )}

        {/* Sleep Timer Modal */}
        {isSleepTimerOpen && (
          <SleepTimerModal
            isOpen={isSleepTimerOpen}
            onClose={() => setIsSleepTimerOpen(false)}
          />
        )}

        {/* Playlist Management Modal */}
        {isPlaylistModalOpen && (
          <PlaylistModal
            isOpen={isPlaylistModalOpen}
            songToAdd={songToAddToPlaylist}
            playlistToEdit={playlistToEdit}
            initialMode={playlistModalMode}
            onImportedPlaylistOpen={handleOpenLibraryPlaylist}
            onClose={() => {
              setIsPlaylistModalOpen(false);
              setSongToAddToPlaylist(null);
              setPlaylistToEdit(null);
              setPlaylistModalMode('list');
            }}
          />
        )}

        {/* Account & Settings Modal */}
        {isUserModalOpen && (
          <UserModal
            isOpen={isUserModalOpen}
            onClose={() => setIsUserModalOpen(false)}
            onOpenQualityModal={() => {
              setIsUserModalOpen(false);
              setIsQualityModalOpen(true);
            }}
            onOpenAppearanceModal={() => {
              setIsUserModalOpen(false);
              setIsAppearanceModalOpen(true);
            }}
          />
        )}

        {/* Theme & Font Family Customizer */}
        {isAppearanceModalOpen && (
          <AppearanceModal
            isOpen={isAppearanceModalOpen}
            onClose={() => setIsAppearanceModalOpen(false)}
          />
        )}

        {/* Welcome / Device Login Gate Modal */}
        {isLoginGateOpen && (
          <LoginGateModal
            isOpen={isLoginGateOpen}
            onClose={closeLoginGate}
            reason={loginGateReason}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <UserProvider>
        <MainApp />
      </UserProvider>
    </ThemeProvider>
  );
}
