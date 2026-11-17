import React, { useEffect, useState } from 'react';
import { Play, RotateCcw, X } from 'lucide-react';
import { getManifestSync, loadAkaneManifest } from '../config/videoManifest';
import type { DirectorSnapshot, ResolvedManifestClip } from '../types/akane';

interface DirectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: DirectorSnapshot | null;
  framingZoom: number;
  framingOffsetY: number;
  onUpdateFraming: (patch: { framingZoom?: number; framingOffsetY?: number }) => void;
  onTriggerClip: (clipId: string, bypassCooldown: boolean) => void;
}

export const DirectorDrawer: React.FC<DirectorDrawerProps> = ({
  isOpen,
  onClose,
  snapshot,
  framingZoom,
  framingOffsetY,
  onUpdateFraming,
  onTriggerClip,
}) => {
  const [clips, setClips] = useState<ResolvedManifestClip[]>(
    () => getManifestSync().allClips
  );
  const [catFilter, setCatFilter] = useState<'all' | 'core' | 'react'>('all');
  const [respectCooldowns, setRespectCooldowns] = useState(true);

  useEffect(() => {
    void loadAkaneManifest().then((m) => {
      setClips(m.allClips);
    });
  }, []);

  if (!isOpen) return null;

  const filteredClips =
    catFilter === 'all'
      ? clips
      : catFilter === 'react'
        ? clips.filter((c) => c.category === 'react')
        : clips.filter((c) => c.category !== 'react');

  const cooldownSec = snapshot ? Math.ceil(snapshot.cooldownRemainingMs / 1000) : 0;

  return (
    <aside
      aria-label="Animation Director"
      className="fixed top-20 start-4 bottom-24 z-40 w-[400px] max-w-[calc(100vw-2rem)] flex flex-col rounded-3xl bg-[#0B0C0A]/95 backdrop-blur-2xl border border-[#A3202B]/40 shadow-[0_16px_48px_rgba(0,0,0,0.75)] overflow-hidden text-[#F5F1EC]"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F5F1EC]/12">
        <div>
          <h2 className="font-display text-xl font-bold text-[#F5F1EC]">
            Animation Director
          </h2>
          <p className="text-base text-[#F5F1EC]/75 font-mono">
            {snapshot?.characterState ?? 'idle'} · {snapshot?.activeClipId ?? 'idle_1'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-w-[48px] min-h-[48px] rounded-2xl text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10 flex items-center justify-center"
          aria-label="Close Animation Director"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Framing Fine-Tune Controls */}
      <div className="px-6 py-4 border-b border-[#F5F1EC]/12 bg-white/[0.03] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold">Stage Framing</span>
          <button
            type="button"
            onClick={() => onUpdateFraming({ framingZoom: 1.0, framingOffsetY: 0 })}
            className="min-h-[48px] px-3 py-1 rounded-xl inline-flex items-center gap-1.5 text-base text-[#F5F1EC]/80 hover:text-[#F5F1EC]"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
        <label className="block space-y-1.5">
          <div className="flex justify-between text-base text-[#F5F1EC]/85">
            <span>Zoom</span>
            <span className="font-mono">{framingZoom.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min={1.0}
            max={1.4}
            step={0.02}
            value={framingZoom}
            onChange={(e) =>
              onUpdateFraming({ framingZoom: parseFloat(e.target.value) })
            }
            className="w-full h-3 accent-[#A3202B] cursor-pointer"
          />
        </label>
        <label className="block space-y-1.5">
          <div className="flex justify-between text-base text-[#F5F1EC]/85">
            <span>Vertical Offset</span>
            <span className="font-mono">{framingOffsetY}px</span>
          </div>
          <input
            type="range"
            min={-80}
            max={80}
            step={2}
            value={framingOffsetY}
            onChange={(e) =>
              onUpdateFraming({ framingOffsetY: parseInt(e.target.value, 10) })
            }
            className="w-full h-3 accent-[#A3202B] cursor-pointer"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 divide-x divide-[#F5F1EC]/12 border-b border-[#F5F1EC]/12">
        <div className="px-4 py-3">
          <p className="text-base text-[#F5F1EC]/70">Cooldown</p>
          <p className="font-mono text-base font-bold text-[#17BD7F]">
            {cooldownSec > 0 ? `${cooldownSec}s` : 'Ready'}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-base text-[#F5F1EC]/70">Queue</p>
          <p className="font-mono text-base font-bold text-[#F5F1EC]">1 max</p>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-[#F5F1EC]/12 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-2xl border border-[#F5F1EC]/15">
          {(['all', 'core', 'react'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCatFilter(cat)}
              className={`min-h-[48px] px-3 py-1 text-base rounded-xl whitespace-nowrap ${
                catFilter === cat
                  ? 'bg-[#A3202B] text-[#F5F1EC] font-semibold'
                  : 'text-[#F5F1EC]/75 hover:text-[#F5F1EC]'
              }`}
            >
              {cat === 'all' ? `All (${clips.length})` : cat === 'core' ? 'State' : 'React'}
            </button>
          ))}
        </div>
        <label className="min-h-[48px] flex items-center gap-2 text-base text-[#F5F1EC]/85 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={respectCooldowns}
            onChange={(e) => setRespectCooldowns(e.target.checked)}
            className="w-5 h-5 accent-[#A3202B]"
          />
          <span>Guard</span>
        </label>
      </div>

      <div className="flex-1 overflow-y-auto akane-scroll px-6 py-3">
        <ul className="space-y-2">
          {filteredClips.map((clip) => {
            const isCurrent = snapshot?.activeClipId === clip.id;
            return (
              <li
                key={clip.id}
                className="p-3 rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/10 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-base font-semibold text-[#F5F1EC]">
                      {clip.file}
                    </span>
                    {isCurrent && (
                      <span className="text-base font-semibold text-[#17BD7F]">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-base text-[#F5F1EC]/75 leading-snug">
                    {clip.semanticRule}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onTriggerClip(clip.id, !respectCooldowns)}
                  className="min-w-[48px] min-h-[48px] rounded-2xl bg-[#A3202B]/30 hover:bg-[#A3202B] text-[#F5F1EC] flex items-center justify-center shrink-0"
                  aria-label={`Preview ${clip.file}`}
                >
                  <Play className="w-5 h-5" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
};
