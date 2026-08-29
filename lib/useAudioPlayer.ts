'use client';

import { useCallback, useRef } from 'react';

import { clock } from './clock';
import type { AudioCue } from './types';

/** Pourquoi la lecture n'a pas demarre : geste utilisateur manquant, ou extrait illisible. */
export type AudioFailure = 'autoplay' | 'source';

/**
 * Echantillon silencieux servant uniquement a lever le blocage de lecture
 * automatique. Sans source, `play()` peut rester en attente indefiniment dans
 * Chrome : on ne l'attend donc jamais, seul le geste utilisateur compte.
 */
const SILENCE = 'data:audio/wav;base64,UklGRsAIAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YZwIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

/**
 * Lecture des extraits, pilotee par les ordres du serveur.
 *
 * Le demarrage est cale sur un horodatage absolu plutot que sur la reception du
 * message : l'extrait part exactement au meme instant que le compte a rebours
 * affiche, meme si le reseau a pris son temps.
 */
export function useAudioPlayer() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const startTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const volume = useRef(0.8);

  const clearTimers = useCallback(() => {
    if (startTimer.current) { clearTimeout(startTimer.current); startTimer.current = null; }
    if (fadeTimer.current) { clearInterval(fadeTimer.current); fadeTimer.current = null; }
  }, []);

  const fadeTo = useCallback((target: number, ms = 450, done?: () => void) => {
    const el = audio.current;
    if (!el) return;
    if (fadeTimer.current) clearInterval(fadeTimer.current);
    const from = el.volume;
    const steps = Math.max(1, Math.round(ms / 40));
    let i = 0;
    fadeTimer.current = setInterval(() => {
      i += 1;
      el.volume = Math.max(0, Math.min(1, from + (target - from) * (i / steps)));
      if (i >= steps) {
        if (fadeTimer.current) clearInterval(fadeTimer.current);
        fadeTimer.current = null;
        done?.();
      }
    }, 40);
  }, []);

  /** A appeler dans un gestionnaire de clic : autorise la lecture pour la suite. */
  const unlock = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    try {
      el.src = SILENCE;
      el.muted = true;
      const started = el.play();
      const finish = () => {
        try { el.pause(); el.currentTime = 0; } catch { /* rien a faire */ }
        el.muted = false;
      };
      if (started && typeof started.then === 'function') started.then(finish, finish);
      else finish();
    } catch {
      el.muted = false;
    }
  }, []);

  const setVolume = useCallback((value: number) => {
    volume.current = value;
    const el = audio.current;
    if (el && !el.paused) el.volume = value;
  }, []);

  /**
   * iOS ignore silencieusement toute ecriture sur `volume` : seuls les boutons
   * physiques agissent. On le detecte pour proposer le bon reglage plutot qu'un
   * curseur qui ne fait rien.
   */
  const canSetVolume = useCallback((): boolean => {
    const el = audio.current;
    if (!el) return true;
    const before = el.volume;
    try {
      el.volume = before > 0.5 ? 0.3 : 0.9;
      const changed = Math.abs(el.volume - before) > 0.01;
      el.volume = before;
      return changed;
    } catch {
      return false;
    }
  }, []);

  const handleCue = useCallback((cue: AudioCue, onFailure?: (reason: AudioFailure) => void) => {
    const el = audio.current;
    if (!el || !cue) return;

    if (cue.action === 'play' && cue.preview && cue.startAt) {
      clearTimers();
      el.src = cue.preview;
      el.currentTime = 0;
      el.volume = 0;
      el.load();
      const wait = Math.max(0, cue.startAt - clock.now());
      startTimer.current = setTimeout(() => {
        el.currentTime = 0;
        el.play()
          .then(() => fadeTo(volume.current, 400))
          // NotAllowedError = lecture automatique refusee ; le reste vient de la source.
          .catch((err: DOMException) => onFailure?.(err?.name === 'NotAllowedError' ? 'autoplay' : 'source'));
      }, wait);
    } else if (cue.action === 'pause') {
      fadeTo(0, 180, () => el.pause());
    } else if (cue.action === 'resume') {
      el.play().then(() => fadeTo(volume.current, 250)).catch(() => {});
    } else if (cue.action === 'stop') {
      clearTimers();
      fadeTo(0, 420, () => { el.pause(); el.currentTime = 0; });
    }
  }, [clearTimers, fadeTo]);

  return { audio, handleCue, unlock, setVolume, canSetVolume, clearTimers };
}
