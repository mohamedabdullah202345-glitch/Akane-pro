export type ProactiveCategory =
  | 'water_stretch'
  | 'fatigue_rest'
  | 'distraction_warning'
  | 'late_night'
  | 'affection_compliment'
  | 'random_curiosity';

export interface ProactiveCheckinEvent {
  id: string;
  category: ProactiveCategory;
  arabicText: string;
  cueType: 'sigh' | 'chuckle' | 'hmmm' | 'cheer';
  actionLabel?: string;
  dismissLabel: string;
  actionType?: 'destress' | 'pomodoro' | 'diary' | 'affection';
}

export type ProactiveListener = (event: ProactiveCheckinEvent) => void;

class ProactiveCompanionEngine {
  private listeners: Set<ProactiveListener> = new Set();
  private checkInterval: NodeJS.Timeout | null = null;
  private sessionStartTime: number = Date.now();
  private lastInteractionTime: number = Date.now();
  private lastTriggerTime: number = 0;
  private continuousFocusMinutes: number = 0;
  private consecutiveFatigueFrames: number = 0;
  private consecutiveDistractionFrames: number = 0;
  private isStudyingMode: boolean = false;

  private readonly MIN_COOLDOWN_MS = 180_000; // 3 minutes between proactive checks

  public start() {
    if (this.checkInterval) return;
    this.sessionStartTime = Date.now();
    this.lastInteractionTime = Date.now();

    // Check every 30 seconds
    this.checkInterval = setInterval(() => {
      this.evaluateState();
    }, 30_000);
  }

  public stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  public recordUserActivity() {
    this.lastInteractionTime = Date.now();
  }

  public setStudyingMode(studying: boolean) {
    this.isStudyingMode = studying;
  }

  public updateVisionTelemetry(fatigueScore: number, isEyeContact: boolean) {
    if (fatigueScore > 0.6) {
      this.consecutiveFatigueFrames++;
    } else {
      this.consecutiveFatigueFrames = Math.max(0, this.consecutiveFatigueFrames - 1);
    }

    if (this.isStudyingMode && !isEyeContact) {
      this.consecutiveDistractionFrames++;
    } else {
      this.consecutiveDistractionFrames = Math.max(0, this.consecutiveDistractionFrames - 1);
    }
  }

  public subscribe(listener: ProactiveListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private evaluateState() {
    const now = Date.now();
    if (now - this.lastTriggerTime < this.MIN_COOLDOWN_MS) {
      return;
    }

    const elapsedMinutes = Math.floor((now - this.sessionStartTime) / 60_000);
    const hour = new Date().getHours();

    // 1. Fatigue trigger (MediaPipe high fatigue detected)
    if (this.consecutiveFatigueFrames >= 6) {
      this.consecutiveFatigueFrames = 0;
      this.emitCheckin({
        id: `fatigue_${now}`,
        category: 'fatigue_rest',
        arabicText: 'لاحظت إنك بتثاوب وعينيك مجهدة.. تحب نشغل جلسة تفريغ وتتنفس بهدوء معايا؟',
        cueType: 'sigh',
        actionLabel: 'بدء تمرين التنفس (4-7-8)',
        dismissLabel: 'أنا كويس، مكمل',
        actionType: 'destress',
      });
      return;
    }

    // 2. Distraction in Study/Focus Mode
    if (this.isStudyingMode && this.consecutiveDistractionFrames >= 8) {
      this.consecutiveDistractionFrames = 0;
      this.emitCheckin({
        id: `distract_${now}`,
        category: 'distraction_warning',
        arabicText: 'سرحت في إيه يا بشمهندس؟ ركز معايا في المهمة دي علشان نكسب XP التحدي!',
        cueType: 'hmmm',
        actionLabel: 'راجع المهمة',
        dismissLabel: 'مركز أهو!',
        actionType: 'pomodoro',
      });
      return;
    }

    // 3. Late Night Warning (12:00 AM - 4:59 AM)
    if ((hour >= 0 && hour <= 4) && Math.random() < 0.45) {
      this.emitCheckin({
        id: `night_${now}`,
        category: 'late_night',
        arabicText: 'الساعة عدت نص الليل.. السهر الكتير هيتعبك بكرة، تحب نلخص إنجازنا ونقفل لليوم؟',
        cueType: 'sigh',
        actionLabel: 'كتابة مذكرات اليوم',
        dismissLabel: 'شوية كمان وهنام',
        actionType: 'diary',
      });
      return;
    }

    // 4. Continuous deep work (every 45 minutes)
    if (elapsedMinutes > 0 && elapsedMinutes % 45 === 0) {
      this.emitCheckin({
        id: `stretch_${now}`,
        category: 'water_stretch',
        arabicText: 'بقالي 45 دقيقة شايفك شغال متواصل.. افرد ضهرك، قوم اشرب شوية ماية وريح عينيك!',
        cueType: 'chuckle',
        actionLabel: 'أخذ استراحة قصيرة',
        dismissLabel: 'تمام هقوم أهو',
        actionType: 'pomodoro',
      });
      return;
    }

    // 5. Friendly curiosity check-in if user has been silent for 4+ minutes
    const idleMs = now - this.lastInteractionTime;
    if (idleMs > 240_000 && Math.random() < 0.35) {
      this.emitCheckin({
        id: `curiosity_${now}`,
        category: 'random_curiosity',
        arabicText: 'هممم.. مركز وساكت كده ليه؟ أنا هنا لو احتجت تسألني في كود أو تدردش معايا.',
        cueType: 'hmmm',
        actionLabel: 'دردشة سريعة',
        dismissLabel: 'شغال بتركيز',
      });
    }
  }

  private emitCheckin(event: ProactiveCheckinEvent) {
    this.lastTriggerTime = Date.now();
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Proactive check-in listener error:', err);
      }
    });
  }
}

export const proactiveEngine = new ProactiveCompanionEngine();
