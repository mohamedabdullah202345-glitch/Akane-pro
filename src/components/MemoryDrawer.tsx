import React, { useMemo, useState } from 'react';
import { Calendar, Eraser, Network, Plus, Search, Sparkles, X } from 'lucide-react';
import { TRANSLATIONS, type AkaneTranslations } from '../i18n/translations';
import { KnowledgeGraphView } from './KnowledgeGraphView';
import { loadKnowledgeGraph } from '../services/localStore';
import type {
  MemoryStore,
  MemoryV2Item,
  MemoryV2Kind,
  SessionSummaryItem,
} from '../types/akane';

interface MemoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  t?: AkaneTranslations;
  memory: MemoryStore;
  memoriesV2: MemoryV2Item[];
  sessionSummaries: SessionSummaryItem[];
  isSignedIn: boolean;
  onUpdateProfile: (
    patch: Partial<Pick<MemoryStore, 'userName' | 'universityOrWork' | 'dailyHabits'>>
  ) => void;
  onAddMemoryV2: (input: {
    kind: MemoryV2Kind;
    content: string;
    dueAt?: string;
    source: 'manual';
  }) => void;
  onForgetMemoryV2: (id: string) => void;
}

const KINDS: MemoryV2Kind[] = ['fact', 'preference', 'event', 'open_loop'];

const KIND_LABELS: Record<MemoryV2Kind, string> = {
  fact: 'Fact',
  preference: 'Preference',
  event: 'Event',
  open_loop: 'Open Loop',
};

export const MemoryDrawer: React.FC<MemoryDrawerProps> = ({
  isOpen,
  onClose,
  t = TRANSLATIONS.en,
  memory,
  memoriesV2,
  sessionSummaries,
  isSignedIn,
  onUpdateProfile,
  onAddMemoryV2,
  onForgetMemoryV2,
}) => {
  const [search, setSearch] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newDueAt, setNewDueAt] = useState('');
  const [newKind, setNewKind] = useState<MemoryV2Kind>('fact');
  const [activeTab, setActiveTab] = useState<'memories' | 'graph'>('memories');
  const [knowledgeGraph, setKnowledgeGraph] = useState(() => loadKnowledgeGraph());

  const filteredV2 = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return memoriesV2;
    return memoriesV2.filter(
      (e) =>
        e.content.toLowerCase().includes(q) ||
        e.kind.toLowerCase().includes(q) ||
        (e.dueAt || '').toLowerCase().includes(q)
    );
  }, [memoriesV2, search]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    onAddMemoryV2({
      kind: newKind,
      content: newContent.trim(),
      dueAt: newDueAt.trim() || undefined,
      source: 'manual',
    });
    setNewContent('');
    setNewDueAt('');
  };

  return (
    <aside
      aria-label={t.memory.title}
      className="fixed top-20 end-4 bottom-24 z-40 w-[400px] max-w-[calc(100vw-2rem)] flex flex-col rounded-3xl bg-[#0B0C0A]/95 backdrop-blur-2xl border border-[#A3202B]/40 shadow-[0_16px_48px_rgba(0,0,0,0.75)] overflow-hidden text-[#F5F1EC]"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#F5F1EC]/12">
        <div>
          <h2 className="font-display text-xl font-bold text-[#F5F1EC]">
            {t.memory.title}
          </h2>
          <p className="text-base text-[#F5F1EC]/75">
            {isSignedIn ? t.memory.synced : t.memory.local} · {memoriesV2.length}{' '}
            {t.memory.items}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-w-[48px] min-h-[48px] rounded-2xl text-[#F5F1EC]/80 hover:text-[#F5F1EC] hover:bg-white/10 flex items-center justify-center"
          aria-label={t.common.close}
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex border-b border-[#F5F1EC]/12 px-6 pt-2 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('memories')}
          className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'memories'
              ? 'border-[#A3202B] text-[#F5F1EC]'
              : 'border-transparent text-[#F5F1EC]/60 hover:text-[#F5F1EC]'
          }`}
        >
          الذكريات المخزنة
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('graph')}
          className={`pb-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'graph'
              ? 'border-[#A3202B] text-[#F5F1EC]'
              : 'border-transparent text-[#F5F1EC]/60 hover:text-[#F5F1EC]'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>شجرة المعرفة (Graph)</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto akane-scroll p-6 space-y-6">
        {activeTab === 'graph' ? (
          <KnowledgeGraphView
            nodes={knowledgeGraph.nodes}
            links={knowledgeGraph.links}
          />
        ) : (
          <>
        <div className="space-y-4">
          <label className="block">
            <span className="text-base font-medium text-[#F5F1EC]/85">
              {t.memory.yourName}
            </span>
            <input
              type="text"
              value={memory.userName}
              onChange={(e) => onUpdateProfile({ userName: e.target.value })}
              placeholder="e.g., Mohamed"
              className="mt-1.5 w-full min-h-[48px] rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 px-4 py-2 text-base text-[#F5F1EC] placeholder:text-[#F5F1EC]/40 focus:outline-none focus:border-[#A3202B]"
            />
          </label>

          <label className="block">
            <span className="text-base font-medium text-[#F5F1EC]/85">
              {t.memory.workOrUni}
            </span>
            <input
              type="text"
              value={memory.universityOrWork}
              onChange={(e) => onUpdateProfile({ universityOrWork: e.target.value })}
              placeholder="e.g., Computer Science"
              className="mt-1.5 w-full min-h-[48px] rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 px-4 py-2 text-base text-[#F5F1EC] placeholder:text-[#F5F1EC]/40 focus:outline-none focus:border-[#A3202B]"
            />
          </label>

          <label className="block">
            <span className="text-base font-medium text-[#F5F1EC]/85">
              {t.memory.habits}
            </span>
            <textarea
              rows={2}
              value={memory.dailyHabits}
              onChange={(e) => onUpdateProfile({ dailyHabits: e.target.value })}
              placeholder="e.g., Study sprints at 8 PM, mint tea"
              className="mt-1.5 w-full rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 px-4 py-2.5 text-base text-[#F5F1EC] placeholder:text-[#F5F1EC]/40 focus:outline-none focus:border-[#A3202B] resize-none"
            />
          </label>
        </div>

        <div className="h-px bg-[#F5F1EC]/12" />

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-semibold text-[#F5F1EC]">
              {t.memory.addTitle}
            </span>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as MemoryV2Kind)}
              className="min-h-[48px] rounded-2xl bg-[#0B0C0A] border border-[#F5F1EC]/25 px-3 py-2 text-base text-[#F5F1EC] focus:outline-none focus:border-[#A3202B]"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder={
                newKind === 'event'
                  ? 'e.g., Algorithms exam'
                  : 'e.g., Prefers mint tea'
              }
              className="flex-1 min-w-0 min-h-[48px] rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 px-4 py-2 text-base text-[#F5F1EC] placeholder:text-[#F5F1EC]/40 focus:outline-none focus:border-[#A3202B]"
            />
            <button
              type="submit"
              className="min-h-[48px] min-w-[48px] px-4 py-2 rounded-2xl bg-[#A3202B] hover:bg-[#b82834] text-[#F5F1EC] text-base font-semibold flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-5 h-5" />
              <span>{t.memory.save}</span>
            </button>
          </div>
          {(newKind === 'event' || newKind === 'open_loop') && (
            <input
              type="text"
              value={newDueAt}
              onChange={(e) => setNewDueAt(e.target.value)}
              placeholder="When? (e.g., Thursday 9 AM)"
              className="w-full min-h-[48px] rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 px-4 py-2 text-base text-[#F5F1EC] placeholder:text-[#F5F1EC]/40 focus:outline-none focus:border-[#A3202B]"
            />
          )}
        </form>

        <div className="space-y-4">
          <div className="relative">
            <Search className="w-5 h-5 text-[#F5F1EC]/50 absolute start-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.memory.searchPlaceholder}
              className="w-full min-h-[48px] rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/20 ps-11 pe-4 py-2 text-base text-[#F5F1EC] placeholder:text-[#F5F1EC]/40 focus:outline-none focus:border-[#A3202B]"
            />
          </div>

          {filteredV2.length === 0 ? (
            <p className="text-base text-[#F5F1EC]/65 py-4 text-center">
              {t.memory.empty}
            </p>
          ) : (
            <ul className="space-y-3">
              {filteredV2.map((entry) => (
                <li
                  key={entry.id}
                  className="p-4 rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/12 flex flex-col gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-base text-[#F5F1EC] leading-snug break-words">
                      {entry.content}
                    </p>
                    <p className="mt-1.5 text-base text-[#F5F1EC]/70 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#E0A030]">
                        {KIND_LABELS[entry.kind]}
                      </span>
                      {entry.dueAt && (
                        <span className="inline-flex items-center gap-1.5 text-[#17BD7F]">
                          <Calendar className="w-4 h-4" />
                          {entry.dueAt}
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onForgetMemoryV2(entry.id)}
                    className="w-full min-h-[48px] px-4 py-2 rounded-2xl text-base font-semibold text-[#F5F1EC] bg-[#6F0E19]/50 hover:bg-[#A3202B] border border-[#A3202B]/50 flex items-center justify-center gap-2"
                  >
                    <Eraser className="w-5 h-5" />
                    <span>{t.memory.forgetThis}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {sessionSummaries.length > 0 && (
          <>
            <div className="h-px bg-[#F5F1EC]/12" />
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-base font-semibold text-[#F5F1EC]">
                <Sparkles className="w-5 h-5 text-[#A3202B]" />
                <span>{t.memory.recentSummaries}</span>
              </div>
              <ul className="space-y-2">
                {sessionSummaries.slice(0, 4).map((s) => (
                  <li
                    key={s.id}
                    className="rounded-2xl bg-white/[0.04] border border-[#F5F1EC]/12 p-4 text-base text-[#F5F1EC]/90 leading-relaxed"
                  >
                    {s.summary}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        </>
        )}
      </div>
    </aside>
  );
};
