import type { AffectionState } from '../types/akane';
import { loadAffectionState, saveAffectionState } from './localStore';

const LEVEL_TITLES: Record<number, { en: string; ar: string }> = {
  1: { en: 'New Acquaintance', ar: 'تعارف جديد' },
  2: { en: 'Familiar Friend', ar: 'صديق مألوف' },
  3: { en: 'Good Companion', ar: 'رفيق طيّب' },
  4: { en: 'Trusted Confidante', ar: 'محل ثقة' },
  5: { en: 'Deep Bond', ar: 'رابطة عميقة' },
  6: { en: 'Inseparable Partner', ar: 'شريك لا يفارقك' },
  7: { en: 'Guardian Soul', ar: 'روح حامية' },
  8: { en: 'Harmonious Match', ar: 'تناغم تام' },
  9: { en: 'Eternal Heart', ar: 'قلب أبدي' },
  10: { en: 'True Soulmate', ar: 'توأم الروح' },
};

export class AffectionService {
  private state: AffectionState;

  constructor() {
    this.state = loadAffectionState();
    this.checkDailyStreak();
  }

  public getState(): AffectionState {
    return { ...this.state };
  }

  public addXp(amount: number): { leveledUp: boolean; nextState: AffectionState } {
    let leveledUp = false;
    let nextXp = this.state.xp + amount;
    let nextLevel = this.state.level;
    let maxExp = nextLevel * 120;

    while (nextXp >= maxExp && nextLevel < 10) {
      nextXp -= maxExp;
      nextLevel += 1;
      maxExp = nextLevel * 120;
      leveledUp = true;
    }

    const titleObj = LEVEL_TITLES[nextLevel] || LEVEL_TITLES[10];
    this.state = {
      ...this.state,
      level: nextLevel,
      xp: nextXp,
      maxExp,
      title: titleObj.ar,
      hearts: Math.min(5, this.state.hearts + (leveledUp ? 1 : 0)),
    };
    saveAffectionState(this.state);
    return { leveledUp, nextState: this.state };
  }

  private checkDailyStreak(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (!this.state.lastActiveDate) {
      this.state.lastActiveDate = today;
      this.state.streakDays = 1;
      saveAffectionState(this.state);
      return;
    }

    if (this.state.lastActiveDate === today) return;

    const last = new Date(this.state.lastActiveDate);
    const now = new Date(today);
    const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 3600 * 24));

    if (diffDays === 1) {
      this.state.streakDays += 1;
      this.addXp(30); // streak bonus
    } else if (diffDays > 1) {
      this.state.streakDays = 1;
    }
    this.state.lastActiveDate = today;
    saveAffectionState(this.state);
  }
}

export const affectionService = new AffectionService();
