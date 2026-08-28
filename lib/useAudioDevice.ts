'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import { call } from './socket';
import type { AudioCue } from './types';
import { useAudioPlayer, type AudioFailure } from './useAudioPlayer';
import { useYouTubePlayer } from './useYouTubePlayer';

/**
 * Terminal charge du son — ecran de diffusion ou regie.
 *
 * Deux moteurs coexistent : un element <audio> pour les extraits Deezer, un
 * lecteur YouTube cache pour les playlists importees. Les ordres du serveur
 * portent leur origine, le bon moteur repond, et l'appelant n'a qu'un seul
 * point d'entree.
 */
export function useAudioDevice(onFailure?: (reason: AudioFailure) => void) {
  const socketRef = useRef<Socket | null>(null);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);

  const deezer = useAudioPlayer();

  const youtube = useYouTubePlayer({
    onVideos: (playlistId, videoIds) => {
      setLoadingPlaylist(false);
      const socket = socketRef.current;
      if (socket) void call(socket, 'youtube:videos', { playlistId, videoIds }, 20000);
    },
    onMeta: (meta) => {
      const socket = socketRef.current;
      if (socket) void call(socket, 'youtube:meta', meta);
    },
    onFailed: (info) => {
      const socket = socketRef.current;
      if (socket) void call(socket, 'youtube:failed', info);
    },
  });

  const handleCue = useCallback((cue: AudioCue) => {
    if (!cue) return;
    if (cue.kind === 'youtube') {
      void deezer.handleCue({ action: 'stop' });   // coupe un extrait qui trainerait
      void youtube.handleCue(cue);
    } else {
      deezer.handleCue(cue, onFailure);
    }
  }, [deezer, youtube, onFailure]);

  const setVolume = useCallback((value: number) => {
    deezer.setVolume(value);
    youtube.setVolume(value);
  }, [deezer, youtube]);

  /** Debloque la lecture : a appeler depuis un vrai geste utilisateur. */
  const unlock = useCallback(() => {
    deezer.unlock();
  }, [deezer]);

  /**
   * Relie le terminal a la partie. Le serveur demande le chargement d'une
   * playlist YouTube par un evenement dedie, puisqu'il ne sait pas la lire.
   */
  const attach = useCallback((socket: Socket | null) => {
    socketRef.current = socket;
    if (!socket) return undefined;
    const onLoad = ({ playlistId }: { playlistId: string }) => {
      setLoadingPlaylist(true);
      void youtube.loadPlaylist(playlistId);
    };
    socket.on('youtube:load', onLoad);
    return () => { socket.off('youtube:load', onLoad); };
  }, [youtube]);

  return {
    audio: deezer.audio,
    ytContainer: youtube.container,
    handleCue,
    setVolume,
    unlock,
    attach,
    loadingPlaylist,
  };
}
