'use client';

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import { clock } from './clock';
import { connect } from './socket';
import type { AudioCue, GameState, You } from './types';

interface Options {
  /** Appele une fois l'horloge synchronisee : c'est la qu'on rejoint le salon. */
  onReady: (socket: Socket) => void | Promise<void>;
  onAudio?: (cue: AudioCue) => void;
  onKicked?: () => void;
}

/**
 * Connexion temps reel partagee par la regie, l'ecran et les joueurs.
 *
 * Les callbacks sont gardes dans des refs : la connexion n'est etablie qu'une
 * fois, meme si la page se re-rend, et les gestionnaires voient toujours l'etat
 * le plus recent sans relancer la socket.
 */
export function useGameSocket({ onReady, onAudio, onKicked }: Options) {
  const [state, setState] = useState<GameState | null>(null);
  const [you, setYou] = useState<You | null>(null);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  const handlers = useRef({ onReady, onAudio, onKicked });
  handlers.current = { onReady, onAudio, onKicked };

  useEffect(() => {
    const s = connect();
    setSocket(s);

    const onConnect = async () => {
      setConnected(true);
      await clock.sync(s);
      await handlers.current.onReady(s);
    };

    s.on('connect', onConnect);
    s.on('disconnect', () => setConnected(false));
    s.on('state', (next: GameState) => setState(next));
    s.on('you', (next: You) => setYou(next));
    s.on('audio', (cue: AudioCue) => handlers.current.onAudio?.(cue));
    s.on('kicked', () => handlers.current.onKicked?.());

    return () => {
      s.removeAllListeners();
      s.close();
    };
  }, []);

  return { socket, state, setState, you, setYou, connected };
}
