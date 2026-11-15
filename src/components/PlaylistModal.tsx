import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Music,
  Check,
  FolderPlus,
  Link2,
  Loader2,
  Sparkles,
  FileText,
  AlertCircle,
  CheckCircle2,
  ImagePlus,
  Trash2,
  Pencil,
} from 'lucide-react';
import { Playlist, Song } from '../types/music';
import { useUser } from '../context/UserContext';
import { cleanHtmlEntities } from '../utils/audioCore';
import { compressPlaylistCoverFile, isValidPlaylistCoverUrl } from '../utils/imageUtils';
import { musicAPI, ImportPlaylistResult } from '../services/api';

export type PlaylistModalInitialMode = 'list' | 'create' | 'import' | 'edit';

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  songToAdd?: Song | null;
  playlistToEdit?: Playlist | null;
  initialMode?: PlaylistModalInitialMode;
  onImportedPlaylistOpen?: (playlistId: string) => void;
}

const GRADIENT_COLORS = [
  'from-violet-600 to-indigo-700',
  'from-pink-600 to-rose-700',
  'from-cyan-600 to-blue-700',
  'from-emerald-600 to-teal-800',
  'from-amber-600 to-orange-700',
  'from-fuchsia-600 to-purple-800',
];

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  onClose,
  songToAdd,
  playlistToEdit,
  initialMode = 'list',
  onImportedPlaylistOpen,
}) => {
  const {
    playlists,
    createPlaylist,
    createPlaylistWithSongs,
    updatePlaylist,
    addSongToPlaylist,
  } = useUser();

  const [mode, setMode] = useState<'list' | 'create' | 'import' | 'edit'>('list');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(GRADIENT_COLORS[0]);
  const [coverUrl, setCoverUrl] = useState('');
  const [coverError, setCoverError] = useState<string | null>(null);
  const [addedPlaylistId, setAddedPlaylistId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Import state
  const [importInputType, setImportInputType] = useState<'link' | 'text'>('link');
  const [importUrl, setImportUrl] = useState('');
  const [importRawText, setImportRawText] = useState('');
  const [importCustomName, setImportCustomName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importPhase, setImportPhase] = useState<'extracting' | 'matching' | 'saving'>('extracting');
  const [importProgress, setImportProgress] = useState({ completed: 0, total: 0, matched: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<{
    playlistId: string;
    result: ImportPlaylistResult;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialMode === 'edit' && playlistToEdit) {
        setMode('edit');
        setName(playlistToEdit.name || '');
        setDescription(playlistToEdit.description || '');
        setSelectedColor(playlistToEdit.coverColor || GRADIENT_COLORS[0]);
        setCoverUrl(playlistToEdit.coverUrl || '');
      } else if (initialMode === 'import') {
        setMode('import');
        setCoverUrl('');
      } else if (initialMode === 'create' || (!songToAdd && playlists.length === 0)) {
        setMode('create');
        setName('');
        setDescription('');
        setSelectedColor(GRADIENT_COLORS[0]);
        setCoverUrl('');
      } else {
        setMode('list');
      }
      setAddedPlaylistId(null);
      setCoverError(null);
      setImportError(null);
      setImportSuccess(null);
    } else {
      setName('');
      setDescription('');
      setCoverUrl('');
      setCoverError(null);
      setMode('list');
      setImportUrl('');
      setImportRawText('');
      setImportCustomName('');
      setIsImporting(false);
      setImportProgress({ completed: 0, total: 0, matched: 0 });
      setImportError(null);
      setImportSuccess(null);
    }
    // Intentionally omit playlists.length so saving an imported playlist doesn't reset importSuccess
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, songToAdd, playlistToEdit, initialMode]);

  if (!isOpen) return null;

  const handleCoverFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCoverError(null);
    try {
      const compressed = await compressPlaylistCoverFile(file, 320);
      setCoverUrl(compressed);
    } catch (err: any) {
      setCoverError(err?.message || 'Unable to process that image file.');
    }
  };

  const handleCreateOrSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCoverError(null);

    const trimmedCover = coverUrl.trim();
    if (trimmedCover && !isValidPlaylistCoverUrl(trimmedCover)) {
      setCoverError('Cover URL must start with https:// or be an uploaded photo.');
      return;
    }

    if (mode === 'edit' && playlistToEdit) {
      await updatePlaylist(playlistToEdit.id, {
        name,
        description,
        coverColor: selectedColor,
        coverUrl: trimmedCover,
      });
      onClose();
      return;
    }

    const created = await createPlaylist(name, description, selectedColor, trimmedCover || undefined);
    if (songToAdd) {
      await addSongToPlaylist(created.id, songToAdd);
    }
    setName('');
    setDescription('');
    setCoverUrl('');
    onClose();
  };

  const handleAddToExisting = async (playlistId: string) => {
    if (!songToAdd) return;
    await addSongToPlaylist(playlistId, songToAdd);
    setAddedPlaylistId(playlistId);
    setTimeout(() => {
      setAddedPlaylistId(null);
      onClose();
    }, 550);
  };

  const handleStartImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError(null);
    setImportSuccess(null);

    if (importInputType === 'link' && !importUrl.trim()) {
      setImportError('Paste a public Spotify, YouTube, Apple Music, or JioSaavn playlist URL.');
      return;
    }
    if (importInputType === 'text' && !importRawText.trim()) {
      setImportError('Paste one or more song lines (e.g. "Kesariya - Arijit Singh").');
      return;
    }

    setIsImporting(true);
    setImportPhase('extracting');
    setImportProgress({ completed: 0, total: 0, matched: 0 });

    try {
      const result = await musicAPI.importPlaylistFromLink(
        importInputType === 'link'
          ? { url: importUrl.trim() }
          : { rawText: importRawText.trim() },
        (completed, total, matched) => {
          setImportPhase('matching');
          setImportProgress({ completed, total, matched });
        }
      );

      if (result.songs.length === 0) {
        throw new Error(
          'Tracks were found, but none could be matched cleanly. Try a different playlist link.'
        );
      }

      setImportPhase('saving');
      const finalName = importCustomName.trim() || result.playlistName;
      const saved = await createPlaylistWithSongs(
        finalName,
        result.songs,
        `Imported from ${result.platform} (${result.songs.length} tracks)`,
        selectedColor
      );

      setImportSuccess({
        playlistId: saved.id,
        result: { ...result, playlistName: saved.name },
      });
    } catch (err: any) {
      setImportError(err?.message || 'Failed to import playlist. Verify the link is public.');
    } finally {
      setIsImporting(false);
    }
  };

  const progressPct =
    importProgress.total > 0
      ? Math.min(100, Math.round((importProgress.completed / importProgress.total) * 100))
      : 15;

  const hasValidPreviewImage = isValidPlaylistCoverUrl(coverUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4 safe-modal-inset animate-fade-in"
      onClick={() => !isImporting && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-[var(--bg-elevated)] border border-[var(--border-strong)] p-6 shadow-2xl text-[var(--text-primary)] relative max-h-full overflow-y-auto no-scrollbar animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={isImporting}
          aria-label="Close playlist modal"
          className="absolute top-4 right-4 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center justify-center transition active:scale-90 cursor-pointer disabled:opacity-40"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 mb-4 pr-10">
          <div className="p-2 rounded-xl bg-[var(--accent-soft)] text-[var(--accent-primary)] shrink-0">
            {mode === 'import' ? (
              <Link2 className="w-5 h-5" />
            ) : mode === 'edit' ? (
              <Pencil className="w-5 h-5" />
            ) : (
              <FolderPlus className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">
              {mode === 'import'
                ? 'Import Playlist'
                : mode === 'edit'
                ? 'Edit Playlist'
                : songToAdd
                ? 'Add to Playlist'
                : 'New Playlist'}
            </h3>
            {songToAdd && mode === 'list' ? (
              <p className="text-xs text-[var(--text-secondary)] truncate max-w-[230px]">
                {cleanHtmlEntities(songToAdd.name)}
              </p>
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">
                {mode === 'import'
                  ? 'Supports 100–450 tracks via link or list'
                  : mode === 'edit'
                  ? 'Rename playlist & customize artwork'
                  : 'Organize your tracks & sync across devices'}
              </p>
            )}
          </div>
        </div>

        {/* Mode Switcher Tabs when creating/importing (hidden in edit mode) */}
        {!songToAdd && !importSuccess && mode !== 'edit' && (
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] mb-4">
            <button
              type="button"
              disabled={isImporting}
              onClick={() => setMode('create')}
              className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                mode === 'create'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New</span>
            </button>
            <button
              type="button"
              disabled={isImporting}
              onClick={() => setMode('import')}
              className={`min-h-[40px] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                mode === 'import'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Import Link (100+)</span>
            </button>
          </div>
        )}

        {/* VIEW 1: IMPORT FROM LINK OR TRACK LIST */}
        {mode === 'import' && (
          <div className="space-y-4">
            {importSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-3 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                    Imported from {importSuccess.result.platform}
                  </p>
                  <h4 className="text-base font-extrabold text-[var(--text-primary)] truncate px-2">
                    {importSuccess.result.playlistName}
                  </h4>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Saved{' '}
                    <span className="font-bold text-[var(--text-primary)]">
                      {importSuccess.result.matchedCount}
                    </span>
                    {importSuccess.result.totalExtracted > importSuccess.result.matchedCount
                      ? ` of ${importSuccess.result.totalExtracted}`
                      : ''}{' '}
                    songs to your library &amp; cloud sync.
                  </p>
                  {importSuccess.result.note && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-xl p-2 mt-2 text-left leading-relaxed">
                      {importSuccess.result.note}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 min-h-[44px] rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-primary)] transition cursor-pointer"
                  >
                    Done
                  </button>
                  {onImportedPlaylistOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        const id = importSuccess.playlistId;
                        onClose();
                        onImportedPlaylistOpen(id);
                      }}
                      className="flex-1 min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition shadow-lg shadow-indigo-600/30 cursor-pointer"
                    >
                      Open Playlist
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleStartImport} className="space-y-4">
                {/* Toggle between URL vs Pasted List/CSV */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={() => {
                      setImportInputType('link');
                      setImportError(null);
                    }}
                    className={`flex-1 min-h-[40px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      importInputType === 'link'
                        ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-primary)] font-bold'
                        : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Playlist URL</span>
                  </button>
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={() => {
                      setImportInputType('text');
                      setImportError(null);
                    }}
                    className={`flex-1 min-h-[40px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      importInputType === 'text'
                        ? 'bg-[var(--accent-soft)] border-[var(--accent-border)] text-[var(--accent-primary)] font-bold'
                        : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Paste Song List</span>
                  </button>
                </div>

                {importInputType === 'link' ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block">
                      Paste Public Playlist Link
                    </label>
                    <input
                      type="url"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      disabled={isImporting}
                      placeholder="https://music.youtube.com/playlist?list=... or Spotify / Apple / JioSaavn"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-base sm:text-sm focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-60"
                    />
                    <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                      Works with{' '}
                      <span className="text-[var(--text-primary)] font-medium">
                        YouTube / YT Music, Apple Music, JioSaavn, Spotify
                      </span>{' '}
                      public playlists (up to 450 tracks).
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)] block">
                      Paste Tracks or CSV (up to 450 songs)
                    </label>
                    <textarea
                      rows={5}
                      value={importRawText}
                      onChange={(e) => setImportRawText(e.target.value)}
                      disabled={isImporting}
                      placeholder={`Kesariya - Arijit Singh\nBlinding Lights - The Weeknd\nTum Hi Ho - Arijit Singh\n...`}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-base sm:text-xs font-mono leading-relaxed focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-60"
                    />
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      One song per line (&ldquo;Song - Artist&rdquo;) or CSV export (&ldquo;Song, Artist&rdquo;).
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                    Custom Playlist Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={importCustomName}
                    onChange={(e) => setImportCustomName(e.target.value)}
                    disabled={isImporting}
                    placeholder="Auto-detect from playlist link"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-base sm:text-sm focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-2">
                    Cover Theme
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {GRADIENT_COLORS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        disabled={isImporting}
                        onClick={() => setSelectedColor(g)}
                        className={`w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-gradient-to-tr ${g} flex items-center justify-center transition cursor-pointer active:scale-95 ${
                          selectedColor === g
                            ? 'ring-2 ring-[var(--accent-primary)] scale-105 shadow-lg'
                            : 'opacity-80 hover:opacity-100'
                        }`}
                      >
                        {selectedColor === g && <Check className="w-4 h-4 text-white stroke-[2.5]" />}
                      </button>
                    ))}
                  </div>
                </div>

                {importError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-xs text-rose-500 dark:text-rose-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
                    <span>{importError}</span>
                  </div>
                )}

                {isImporting && (
                  <div className="p-3.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-border)] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary)]" />
                        {importPhase === 'extracting'
                          ? 'Reading tracks from playlist...'
                          : importPhase === 'saving'
                          ? 'Saving & syncing playlist...'
                          : `Matching ${importProgress.completed} / ${importProgress.total} songs`}
                      </span>
                      {importProgress.total > 0 && (
                        <span className="font-mono text-[11px] text-[var(--accent-primary)] font-bold">
                          {importProgress.matched} found
                        </span>
                      )}
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--border-subtle)] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all duration-200"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  {songToAdd || playlists.length > 0 ? (
                    <button
                      type="button"
                      disabled={isImporting}
                      onClick={() => setMode('list')}
                      className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm font-semibold transition cursor-pointer disabled:opacity-40"
                    >
                      Back
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={isImporting}
                    className="flex-[2] min-h-[44px] py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-bold transition shadow-lg shadow-indigo-600/30 cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Importing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Import Songs</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* VIEW 2: CREATE NEW OR EDIT PLAYLIST (NAME, DESCRIPTION, COVER PHOTO / COLOR) */}
        {(mode === 'create' || mode === 'edit') && (
          <form onSubmit={handleCreateOrSave} className="space-y-4 my-2">
            {/* Artwork Preview + Upload Photo Row */}
            <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
              {hasValidPreviewImage ? (
                <img
                  src={coverUrl.trim()}
                  alt={name || 'Playlist artwork'}
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-2xl object-cover shadow-md shrink-0 border border-white/15"
                />
              ) : (
                <div
                  className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${selectedColor} flex items-center justify-center shadow-md shrink-0`}
                >
                  <Music className="w-7 h-7 text-white/95" />
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-xs font-bold text-[var(--text-primary)]">Cover Image</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCoverFileSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--accent-soft)] border border-[var(--accent-border)] text-[var(--accent-primary)] text-xs font-bold flex items-center gap-1.5 hover:opacity-90 transition cursor-pointer active:scale-95"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>{hasValidPreviewImage ? 'Change Photo' : 'Upload Photo'}</span>
                  </button>
                  {coverUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setCoverUrl('');
                        setCoverError(null);
                      }}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500 text-xs font-semibold flex items-center gap-1 hover:bg-rose-500/15 transition cursor-pointer active:scale-95"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {coverError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 dark:text-rose-300">
                {coverError}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                Playlist Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Late Night Vibes"
                required
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-base sm:text-sm focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. My top favorite tracks for focus & flow"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-base sm:text-sm focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                Or Paste Cover Image URL (Optional)
              </label>
              <input
                type="url"
                value={coverUrl.startsWith('data:') ? '' : coverUrl}
                onChange={(e) => {
                  setCoverUrl(e.target.value);
                  setCoverError(null);
                }}
                placeholder={
                  coverUrl.startsWith('data:')
                    ? 'Photo uploaded (tap Remove to use URL instead)'
                    : 'https://example.com/cover.jpg'
                }
                disabled={coverUrl.startsWith('data:')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-base sm:text-xs focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-2">
                Fallback Cover Theme
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {GRADIENT_COLORS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setSelectedColor(g)}
                    className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-gradient-to-tr ${g} flex items-center justify-center transition cursor-pointer active:scale-95 ${
                      selectedColor === g
                        ? 'ring-2 ring-[var(--accent-primary)] scale-105 shadow-lg'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    {selectedColor === g && <Check className="w-5 h-5 text-white stroke-[2.5]" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              {mode === 'edit' ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm font-semibold transition cursor-pointer flex items-center justify-center active:scale-95"
                >
                  Cancel
                </button>
              ) : (songToAdd || playlists.length > 0) && (
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm font-semibold transition cursor-pointer flex items-center justify-center active:scale-95"
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                className="flex-1 min-h-[44px] py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition shadow-lg shadow-indigo-600/30 cursor-pointer flex items-center justify-center active:scale-95"
              >
                {mode === 'edit' ? 'Save Changes' : songToAdd ? 'Create & Add' : 'Create'}
              </button>
            </div>
          </form>
        )}

        {/* VIEW 3: EXISTING PLAYLIST PICKER */}
        {mode === 'list' && (
          <div className="my-2 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('create')}
                className="min-h-[48px] px-3 rounded-2xl border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] hover:opacity-90 text-[var(--accent-primary)] text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Create New</span>
              </button>

              <button
                onClick={() => setMode('import')}
                className="min-h-[48px] px-3 rounded-2xl border border-dashed border-[var(--accent-border)] bg-[var(--accent-soft)] hover:opacity-90 text-[var(--accent-primary)] text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-98"
              >
                <Link2 className="w-4 h-4 shrink-0" />
                <span>Import Link</span>
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto no-scrollbar space-y-2 pr-1 pt-1">
              {playlists.map((pl) => {
                const alreadyContains = songToAdd
                  ? pl.songs.some((s) => s.id === songToAdd.id)
                  : false;
                const isJustAdded = addedPlaylistId === pl.id;

                return (
                  <button
                    key={pl.id}
                    disabled={alreadyContains || !songToAdd}
                    onClick={() => handleAddToExisting(pl.id)}
                    className={`w-full min-h-[56px] p-3 rounded-2xl border text-left flex items-center justify-between transition cursor-pointer active:scale-98 ${
                      alreadyContains
                        ? 'bg-[var(--bg-surface)] border-[var(--border-subtle)] opacity-60 cursor-not-allowed'
                        : isJustAdded
                        ? 'bg-emerald-600/15 border-emerald-500 text-emerald-500'
                        : !songToAdd
                        ? 'bg-[var(--bg-surface)] border-[var(--border-subtle)] opacity-75 cursor-default'
                        : 'bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      {pl.coverUrl ? (
                        <img
                          src={pl.coverUrl}
                          alt={pl.name}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-xl object-cover shrink-0 shadow-sm border border-white/15"
                        />
                      ) : (
                        <div
                          className={`w-11 h-11 rounded-xl bg-gradient-to-tr ${
                            pl.coverColor || 'from-violet-600 to-indigo-700'
                          } flex items-center justify-center shrink-0 shadow-sm`}
                        >
                          <Music className="w-5 h-5 text-white/90" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-[var(--text-primary)] truncate leading-snug">
                          {pl.name}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] truncate leading-normal">
                          {pl.songs.length} tracks
                        </p>
                      </div>
                    </div>

                    {isJustAdded ? (
                      <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1 shrink-0">
                        <Check className="w-4 h-4" /> Added
                      </span>
                    ) : alreadyContains ? (
                      <span className="text-[11px] text-[var(--text-muted)] font-medium shrink-0">
                        In playlist
                      </span>
                    ) : songToAdd ? (
                      <div className="w-9 h-9 rounded-full bg-[var(--bg-app)]/70 border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] shrink-0">
                        <Plus className="w-4 h-4" />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
