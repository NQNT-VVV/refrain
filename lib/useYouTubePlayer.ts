'use client';

import { useCallback, useEffect, useRef } from 'react';

import { clock } from './clock';
import type { AudioCue } from './types';

/* Surface minimale de l'API IFrame, plutot qu'une dependance de types entiere. */
interface YTPlayer {
  cuePlaylist(opts: { list: string; listType: string; index?: number }): void;
  cueVideoById(opts: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getDuration(): number;
  getPlaylist(): string[] | null;
  getVideoData(): { video_id?: string; title?: string; author?: string };
  destroy(): void;
}

interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: Record<string, unknown>) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** L'API IFrame ne se charge qu'une fois par page, quel que soit le nombre de lecteurs. */
let apiPromise: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error('API YouTube indisponible.'));
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => reject(new Error('Impossible de charger le lecteur YouTube.'));
    document.head.append(tag);
  });
  return apiPromise;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attend qu'une valeur soit disponible, sans bloquer indefiniment. */
async function poll<T>(read: () => T, ok: (v: T) => boolean, timeoutMs = 4000): Promise<T | null> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const value = read();
    if (ok(value)) return value;
    await sleep(120);
  }
  return null;
}

/**
 * On evite le tout debut du morceau : une intro ou un silence ne se devine pas.
 * A defaut de duree connue, 30 s est un compromis raisonnable.
 */
function pickOffset(duration: number): number {
  if (!duration || duration < 30) return 0;
  return Math.min(45, Math.max(10, Math.floor(duration * 0.2)));
}

interface Options {
  onVideos: (playlistId: string, videoIds: string[]) => void;
  onMeta: (meta: { videoId: string; title: string; author: string }) => void;
  onFailed: (info: { videoId: string; reason: string }) => void;
}

/**
 * Lecteur YouTube cache, pilote par les ordres du serveur.
 *
 * Le serveur ne connait pas le contenu d'une playlist YouTube : ce lecteur lui
 * remonte la liste des videos a l'import, puis le titre de chaque video au
 * moment de la jouer — c'est ce titre qui sert ensuite a la correction.
 */
export function useYouTubePlayer({ onVideos, onMeta, onFailed }: Options) {
  const container = useRef<HTMLDivElement | null>(null);
  const player = useRef<YTPlayer | null>(null);
  const ready = useRef<Promise<YTPlayer> | null>(null);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volume = useRef(80);
  const handlers = useRef({ onVideos, onMeta, onFailed });
  handlers.current = { onVideos, onMeta, onFailed };

  const ensure = useCallback((): Promise<YTPlayer> => {
    if (ready.current) return ready.current;
    ready.current = loadApi().then(
      (YT) => new Promise<YTPlayer>((resolve) => {
        const host = document.createElement('div');
        container.current?.append(host);
        const instance = new YT.Player(host, {
          width: '320',
          height: '180',
          playerVars: {
            controls: 0, disablekb: 1, modestbranding: 1, rel: 0,
            playsinline: 1, iv_load_policy: 3, origin: window.location.origin,
          },
          events: {
            onReady: () => {
              instance.setVolume(volume.current);
              player.current = instance;
              resolve(instance);
            },
            onError: (event: { data: number }) => {
              const data = instance.getVideoData?.();
              handlers.current.onFailed({
                videoId: data?.video_id ?? '',
                reason: `code ${event?.data ?? '?'}`,
              });
            },
          },
        });
      }),
    );
    return ready.current;
  }, []);

  /** Charge une playlist et remonte ses identifiants de video au serveur. */
  const loadPlaylist = useCallback(async (playlistId: string) => {
    const p = await ensure();
    p.cuePlaylist({ list: playlistId, listType: 'playlist', index: 0 });
    const ids = await poll(() => p.getPlaylist() ?? [], (v) => v.length > 0, 8000);
    handlers.current.onVideos(playlistId, ids ?? []);
  }, [ensure]);

  const setVolume = useCallback((value: number) => {
    volume.current = Math.round(value * 100);
    player.current?.setVolume(volume.current);
  }, []);

  const handleCue = useCallback(async (cue: AudioCue) => {
    if (cue.kind !== 'youtube') return;
    const p = await ensure();

    if (cue.action === 'play' && cue.videoId && cue.startAt) {
      if (startTimer.current) clearTimeout(startTimer.current);
      p.cueVideoById({ videoId: cue.videoId, startSeconds: 0 });

      // Le titre part des que le lecteur le connait : le serveur en a besoin
      // pour corriger les reponses, bien avant la revelation.
      poll(() => p.getVideoData(), (d) => Boolean(d?.title), 5000).then((data) => {
        if (data?.title) {
          handlers.current.onMeta({
            videoId: data.video_id ?? cue.videoId!,
            title: data.title,
            author: data.author ?? '',
          });
        }
      });

      const duration = await poll(() => p.getDuration(), (d) => d > 0, 3000);
      const offset = pickOffset(duration ?? 0);
      const wait = Math.max(0, cue.startAt - clock.now());
      startTimer.current = setTimeout(() => {
        p.seekTo(offset, true);
        p.setVolume(volume.current);
        p.playVideo();
      }, wait);
    } else if (cue.action === 'pause') {
      p.pauseVideo();
    } else if (cue.action === 'resume') {
      p.playVideo();
    } else if (cue.action === 'stop') {
      if (startTimer.current) clearTimeout(startTimer.current);
      p.stopVideo();
    }
  }, [ensure]);

  useEffect(() => () => {
    if (startTimer.current) clearTimeout(startTimer.current);
    try { player.current?.destroy(); } catch { /* deja detruit */ }
    player.current = null;
    ready.current = null;
  }, []);

  return { container, loadPlaylist, handleCue, setVolume };
}
