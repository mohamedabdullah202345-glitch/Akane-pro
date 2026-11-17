import React, { useMemo, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import type { MissionItem, MissionPriority } from '../types/akane';

interface MissionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  missions: MissionItem[];
  onCreateMission: (title: string, description: string, priority: MissionPriority) => void;
  onToggleMission: (id: string) => void;
  onDeleteMission: (id: string) => void;
}

export const MissionsDrawer: React.FC<MissionsDrawerProps> = ({
  isOpen,
  onClose,
  missions,
  onCreateMission,
  onToggleMission,
  onDeleteMission,
}) => {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<MissionPriority>('medium');
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return missions;
    return missions.filter((m) => m.status === filter);
  }, [filter, missions]);

  if (!isOpen) return null;

  const activeCount = missions.filter((m) => m.status === 'pending').length;
  const doneCount = missions.filter((m) => m.status === 'completed').length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreateMission(title, '', priority);
    setTitle('');
  };

  return (
    <aside
      aria-label="Smart Missions"
      className="fixed top-20 end-4 bottom-24 z-40 w-[400px] max-w-[calc(100vw-2rem)] flex flex-col rounded-3xl bg-[#0B0C0A]/95 backdrop-blur-2xl border border-[#A3202B]/40 shadow-[0_16px_48px_rgba(0,0,0,0.75)] overflow-hidden text-[#F5F1EC]"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F5F1EC]/12">
        <div>
          <h2 className="font-display text-xl font-bold text-[#F5F1EC]">
            Smart Missions
          </h2>
          <p className="text-base text-[#F5F1EC]/75 font-mono">
            {activeCount} active · {doneCount} done
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-w-[48px] min-h-[48px] rounded-2xl text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10 flex items-center justify-center"
          aria-label="Close Smart Missions"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="p-6 space-y-4 border-b border-[#F5F1EC]/12">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New mission..."
              className="flex-1 min-w-0 min-h-[48px] rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 px-4 py-2 text-base text-[#F5F1EC] placeholder:text-[#F5F1EC]/40 focus:outline-none focus:border-[#A3202B]"
            />
            <button
              type="submit"
              className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-[#F5F1EC] text-base font-semibold flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-5 h-5" />
              <span>Add</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-2xl border border-[#F5F1EC]/15">
              {(['all', 'pending', 'completed'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`min-h-[48px] px-3 py-1 text-base rounded-xl whitespace-nowrap ${
                    filter === tab
                      ? 'bg-[#A3202B] text-[#F5F1EC] font-semibold'
                      : 'text-[#F5F1EC]/75 hover:text-[#F5F1EC]'
                  }`}
                >
                  {tab === 'all' ? 'All' : tab === 'pending' ? 'Active' : 'Done'}
                </button>
              ))}
            </div>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as MissionPriority)}
              className="min-h-[48px] rounded-2xl bg-[#0B0C0A] border border-[#F5F1EC]/25 px-3 py-2 text-base text-[#F5F1EC] focus:outline-none"
              aria-label="Mission Priority"
            >
              <option value="high">High</option>
              <option value="medium">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto akane-scroll px-6 py-3">
        {filtered.length === 0 ? (
          <p className="text-base text-[#F5F1EC]/65 py-8 text-center">
            No missions in this view. Add a goal above or ask Akane to track one.
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((mission) => {
              const isDone = mission.status === 'completed';
              return (
                <li
                  key={mission.id}
                  className="p-3 rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/10 flex items-center gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onToggleMission(mission.id)}
                    className={`min-w-[48px] min-h-[48px] rounded-2xl border flex items-center justify-center shrink-0 ${
                      isDone
                        ? 'bg-[#17BD7F] border-[#17BD7F] text-[#0B0C0A]'
                        : 'border-[#F5F1EC]/35 hover:border-[#A3202B] text-transparent'
                    }`}
                    aria-label={isDone ? 'Mark mission pending' : 'Complete mission'}
                  >
                    <Check className="w-6 h-6" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-base leading-snug break-words ${
                        isDone ? 'line-through text-[#F5F1EC]/45' : 'text-[#F5F1EC]'
                      }`}
                    >
                      {mission.title}
                    </p>
                    <p className="mt-0.5 text-base text-[#F5F1EC]/65 capitalize">
                      {mission.priority}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteMission(mission.id)}
                    className="min-w-[48px] min-h-[48px] rounded-2xl text-[#F5F1EC]/65 hover:text-[#A3202B] hover:bg-white/10 flex items-center justify-center shrink-0"
                    aria-label="Delete mission"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};
