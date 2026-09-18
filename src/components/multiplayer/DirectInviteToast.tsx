import React, { useState, useEffect } from 'react';
import { Mail, X, Check, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GameInvitation } from '../../types';
import { PlayerAvatar } from '../profile/PlayerAvatar';
import { triggerHaptic } from '../../utils/sound';

interface DirectInviteToastProps {
  invitations: GameInvitation[];
  onAccept: (invitation: GameInvitation) => void;
  onDecline: (invitation: GameInvitation) => void;
  onDismiss: (inviteId: string) => void;
}

const INVITE_TIMEOUT_SECONDS = 20;

export const DirectInviteToast: React.FC<DirectInviteToastProps> = ({
  invitations,
  onAccept,
  onDecline,
  onDismiss,
}) => {
  if (!invitations || invitations.length === 0) return null;

  // Show the latest unhandled invitation
  const currentInvite = invitations[0];
  const [secondsRemaining, setSecondsRemaining] = useState<number>(INVITE_TIMEOUT_SECONDS);

  // Initialize and tick the 20s countdown timer for the active invitation
  useEffect(() => {
    if (!currentInvite) return;

    // Calculate remaining seconds if created timestamp exists, else standard 20s window
    const now = Date.now();
    const elapsedSeconds = currentInvite.createdAt
      ? Math.max(0, Math.floor((now - currentInvite.createdAt) / 1000))
      : 0;
    const initialSeconds = Math.max(1, INVITE_TIMEOUT_SECONDS - elapsedSeconds);
    setSecondsRemaining(initialSeconds);

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onDismiss(currentInvite.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentInvite?.id, currentInvite?.createdAt, onDismiss]);

  const progressPercent = Math.max(0, Math.min(100, (secondsRemaining / INVITE_TIMEOUT_SECONDS) * 100));

  return (
    <AnimatePresence mode="wait">
      <motion.div
        layout
        key={currentInvite.id}
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="pointer-events-auto relative w-[calc(100%-1.5rem)] sm:w-96 max-w-md p-3.5 sm:p-4 rounded-2xl bg-slate-900/95 border border-amber-500/50 shadow-2xl backdrop-blur-xl flex flex-col gap-3 overflow-hidden"
      >
          {/* Animated Countdown Progress Bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800">
            <motion.div
              className={`h-full transition-all duration-1000 ease-linear ${
                secondsRemaining <= 5 ? 'bg-rose-500' : secondsRemaining <= 10 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Top Row: Sender Info & Dismiss */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="relative shrink-0">
                <PlayerAvatar
                  avatarId={(currentInvite.fromUserAvatar as any) || 'avatar_1'}
                  size="sm"
                  className="w-9 h-9"
                />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[9px] font-black shadow">
                  <Mail className="w-2.5 h-2.5" />
                </span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs sm:text-sm font-black text-white truncate">
                    {currentInvite.fromUserName}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                    Invitation
                  </span>
                  <span className={`text-[10px] font-mono font-black px-1.5 py-0.2 rounded flex items-center gap-0.5 shrink-0 ${
                    secondsRemaining <= 5 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse' : 'bg-slate-800 text-amber-300 border border-slate-700'
                  }`}>
                    <Clock className="w-2.5 h-2.5" />
                    <span>{secondsRemaining}s</span>
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 truncate">
                  Salon <strong>#{currentInvite.roomCode}</strong> · Mise : <strong className="text-amber-400">{currentInvite.baseBet} jetons</strong>
                </span>
                <span className="text-[9px] text-emerald-400 font-medium mt-0.5 truncate">
                  💾 Sauvegarde auto de votre partie solo si acceptée
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onDismiss(currentInvite.id);
              }}
              className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
              title="Fermer la notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onDecline(currentInvite);
              }}
              className="flex-1 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition active:scale-95 cursor-pointer"
            >
              Refuser
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('success');
                onAccept(currentInvite);
              }}
              className="flex-1 h-9 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Rejoindre ({secondsRemaining}s)</span>
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
  );
};
