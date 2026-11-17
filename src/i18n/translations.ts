import type { LanguageCode } from '../types/akane';

export interface AkaneTranslations {
  aiCompanionLabel: string;
  akaneName: string;
  status: {
    idle: string;
    connecting: string;
    connected: string;
    listening: string;
    thinking: string;
    speaking: string;
    muted: string;
    paused: string;
    calm: string;
    beRightBack: string;
    error: string;
  };
  header: {
    memory: string;
    studio: string;
    settings: string;
    endCall: string;
  };
  dock: {
    camera: string;
    cameraOff: string;
    share: string;
    stopShare: string;
    talk: string;
    endCall: string;
    connecting: string;
    reconnecting: string;
    chat: string;
    sleep: string;
    wake: string;
    sendPlaceholder: string;
    send: string;
  };
  calm: {
    title: string;
    subtitle: string;
    wakeButton: string;
    sleepingSubtitle: string;
    timerLabel: string;
  };
  sharing: {
    barLabel: string;
    stop: string;
    camBadge: string;
    camOff: string;
  };
  studio: {
    title: string;
    tabs: {
      outfit: string;
      voice: string;
      room: string;
    };
    outfits: {
      default: string;
      outfit_1: string;
      outfit_2: string;
    };
    voiceMode: string;
    modes: {
      companion: string;
      tsundere: string;
      wife: string;
    };
    soundscape: string;
    soundscapes: {
      off: string;
      rain: string;
      whitenoise: string;
    };
    soundVolume: string;
    nightWhisper: string;
    studyFocus: string;
    roomBg: string;
    bgDark: string;
    bgTransparent: string;
    lightingTitle: string;
    lighting: {
      auto: string;
      morning: string;
      day: string;
      evening: string;
      night: string;
    };
    sleepTimer: string;
    timerOff: string;
    timerMins: string;
  };
  settings: {
    title: string;
    account: string;
    signIn: string;
    signOut: string;
    signedInAs: string;
    sections: {
      studio: string;
      memory: string;
      permissions: string;
      privacy: string;
      accessibility: string;
    };
    framingZoom: string;
    framingOffset: string;
    resetFraming: string;
    openStudio: string;
    openDirector: string;
    openMemory: string;
    openMissions: string;
    languageLabel: string;
    langEn: string;
    langAr: string;
    biggerText: string;
    biggerTextDesc: string;
    bridgeNote: string;
    cameraNote: string;
    deleteData: string;
    deleteConfirmTitle: string;
    deleteConfirmBtn: string;
    cancel: string;
    deleting: string;
    deletedDone: string;
    installApp: string;
  };
  memory: {
    title: string;
    synced: string;
    local: string;
    items: string;
    yourName: string;
    workOrUni: string;
    habits: string;
    addTitle: string;
    save: string;
    searchPlaceholder: string;
    empty: string;
    forgetThis: string;
    recentSummaries: string;
  };
  onboarding: {
    stepLabel: string;
    s1Title: string;
    s1Body: string;
    adultCheck: string;
    micPerm: string;
    camPerm: string;
    granted: string;
    grantBtn: string;
    deniedHint: string;
    nextBtn: string;
    s2Title: string;
    s2Body: string;
    playTestTone: string;
    tonePlayed: string;
    s3Title: string;
    s3Body: string;
    chooseOutfit: string;
    chooseTone: string;
    enterStage: string;
  };
  common: {
    close: string;
    dismiss: string;
    offline: string;
    allow: string;
    deny: string;
  };
}

export const TRANSLATIONS: Record<LanguageCode, AkaneTranslations> = {
  en: {
    aiCompanionLabel: 'AI companion',
    akaneName: 'Akane',
    status: {
      idle: 'Ready',
      connecting: 'Connecting...',
      connected: 'Live',
      listening: 'Listening',
      thinking: 'Thinking',
      speaking: 'Speaking',
      muted: 'Muted',
      paused: 'Paused',
      calm: 'Resting',
      beRightBack: 'Be right back...',
      error: 'Needs attention',
    },
    header: {
      memory: 'Memory',
      studio: 'Outfit & Studio',
      settings: 'Settings',
      endCall: 'End Call',
    },
    dock: {
      camera: 'Camera',
      cameraOff: 'Cam Off',
      share: 'Share',
      stopShare: 'Stop Share',
      talk: 'Talk',
      endCall: 'End',
      connecting: 'Connecting',
      reconnecting: 'Wait...',
      chat: 'Chat',
      sleep: 'Sleep',
      wake: 'Wake',
      sendPlaceholder: 'Message Akane...',
      send: 'Send',
    },
    calm: {
      title: 'Resting calmly to save battery',
      subtitle: 'Tap anywhere here or press Talk to resume with Akane.',
      wakeButton: 'Tap to Wake Akane',
      sleepingSubtitle: 'Sleep mode active. Audio and camera are paused.',
      timerLabel: 'Sleep in',
    },
    sharing: {
      barLabel: 'Sharing Screen with Akane',
      stop: 'Stop',
      camBadge: 'CAM LIVE',
      camOff: 'Off',
    },
    studio: {
      title: 'Studio',
      tabs: {
        outfit: 'Outfit',
        voice: 'Voice',
        room: 'Room',
      },
      outfits: {
        default: 'Crimson Kimono',
        outfit_1: 'Midnight Indigo',
        outfit_2: 'Sakura Silk',
      },
      voiceMode: 'Personality Tone',
      modes: {
        companion: 'Mommy / Warm',
        tsundere: 'Playful Tease',
        wife: 'Soft Wife',
      },
      soundscape: 'Ambient Audio',
      soundscapes: {
        off: 'Silent',
        rain: 'Soft Rain',
        whitenoise: 'Calm Room',
      },
      soundVolume: 'Ambient Volume',
      nightWhisper: 'Quiet Whisper Lighting',
      studyFocus: 'Study Focus (No Interruptions)',
      roomBg: 'Stage Backdrop',
      bgDark: 'Burgundy Studio',
      bgTransparent: 'Transparent Widget',
      lightingTitle: 'Time-of-Day Lighting',
      lighting: {
        auto: 'Auto',
        morning: 'Dawn',
        day: 'Day',
        evening: 'Evening',
        night: 'Night',
      },
      sleepTimer: 'Sleep Timer',
      timerOff: 'Off',
      timerMins: 'min',
    },
    settings: {
      title: 'Settings',
      account: 'Google Account',
      signIn: 'Sign in with Google',
      signOut: 'Sign out',
      signedInAs: 'Signed in as',
      sections: {
        studio: 'Studio & Framing',
        memory: 'Memory & Missions',
        permissions: 'Permissions & Bridge',
        privacy: 'Privacy & Data',
        accessibility: 'Language & Text',
      },
      framingZoom: 'Character Zoom',
      framingOffset: 'Vertical Position',
      resetFraming: 'Reset Framing',
      openStudio: 'Open Studio Drawer',
      openDirector: 'Animation Director',
      openMemory: 'Memory Drawer',
      openMissions: 'Smart Missions',
      languageLabel: 'Interface Language',
      langEn: 'English (LTR)',
      langAr: 'العربية (RTL)',
      biggerText: 'Bigger Text',
      biggerTextDesc: 'Increases captions, buttons, and panel text size.',
      bridgeNote:
        'Desktop Bridge keeps Level A (open URL, read allowed folders) automatic, asks confirmation for Level B, and blocks Level C.',
      cameraNote:
        'Camera frames stay live in memory only and are never recorded. A red indicator is always visible when active.',
      deleteData: 'Delete my data',
      deleteConfirmTitle: 'Erase all saved memories, tasks, and local preferences?',
      deleteConfirmBtn: 'Yes, delete everything',
      cancel: 'Cancel',
      deleting: 'Deleting...',
      deletedDone: 'All local and cloud companion data erased.',
      installApp: 'Install Akane Pro App',
    },
    memory: {
      title: 'Memory',
      synced: 'Cloud synced',
      local: 'Local preview',
      items: 'items',
      yourName: 'Your Name',
      workOrUni: 'University / Work',
      habits: 'Daily Habits',
      addTitle: 'Remember New Item',
      save: 'Save',
      searchPlaceholder: 'Search memories...',
      empty: 'Nothing saved yet. Talk with Akane naturally and she will remember.',
      forgetThis: 'Forget this',
      recentSummaries: 'Recent Session Summaries',
    },
    onboarding: {
      stepLabel: 'Setup',
      s1Title: 'Welcome to Akane Pro',
      s1Body: 'Before we start, please confirm you are 18+ and enable audio or camera access.',
      adultCheck: 'I confirm I am 18 years or older (adult companion experience).',
      micPerm: 'Microphone Access',
      camPerm: 'Camera Access (Optional)',
      granted: 'Ready',
      grantBtn: 'Allow',
      deniedHint: 'You can always change permissions later in browser settings.',
      nextBtn: 'Continue',
      s2Title: 'Sound Check',
      s2Body: 'Let us test your speakers so Akane can greet you clearly right away.',
      playTestTone: 'Play Test Chime',
      tonePlayed: 'Audio ready',
      s3Title: 'Choose Your Companion Look',
      s3Body: 'Pick her outfit and tone to enter the studio stage.',
      chooseOutfit: 'Outfit',
      chooseTone: 'Voice Style',
      enterStage: 'Enter Stage',
    },
    common: {
      close: 'Close',
      dismiss: 'Dismiss',
      offline: 'You are offline — reconnect to talk live with Akane.',
      allow: 'Allow',
      deny: 'Deny',
    },
  },
  ar: {
    aiCompanionLabel: 'رفيقة ذكية AI',
    akaneName: 'أكاني',
    status: {
      idle: 'جاهزة',
      connecting: 'جاري الاتصال...',
      connected: 'مباشر',
      listening: 'تستمع إليك',
      thinking: 'تفكر...',
      speaking: 'تتحدث',
      muted: 'مكتوم',
      paused: 'متوقف مؤقتاً',
      calm: 'في وضع الهدوء',
      beRightBack: 'سأعود حالاً...',
      error: 'يوجد تنبيه',
    },
    header: {
      memory: 'الذاكرة',
      studio: 'المظهر والاستوديو',
      settings: 'الإعدادات',
      endCall: 'إنهاء المكالمة',
    },
    dock: {
      camera: 'الكاميرا',
      cameraOff: 'إيقاف الكاميرا',
      share: 'مشاركة',
      stopShare: 'إيقاف المشاركة',
      talk: 'تحدث',
      endCall: 'إنهاء',
      connecting: 'اتصال...',
      reconnecting: 'لحظة...',
      chat: 'دردشة',
      sleep: 'نوم',
      wake: 'إيقاظ',
      sendPlaceholder: 'اكتب رسالة لأكاني...',
      send: 'إرسال',
    },
    calm: {
      title: 'في وضع الراحة لتوفير الطاقة',
      subtitle: 'اضغط هنا أو على زر التحدث لاستئناف الجلسة مع أكاني.',
      wakeButton: 'اضغط لإيقاظ أكاني',
      sleepingSubtitle: 'وضع النوم مفعل. الصوت والكاميرا متوقفان.',
      timerLabel: 'النوم بعد',
    },
    sharing: {
      barLabel: 'مشاركة الشاشة مع أكاني نشطة',
      stop: 'إيقاف',
      camBadge: 'كاميرا مباشرة',
      camOff: 'إيقاف',
    },
    studio: {
      title: 'الاستوديو',
      tabs: {
        outfit: 'المظهر',
        voice: 'الصوت',
        room: 'الغرفة',
      },
      outfits: {
        default: 'كيمونو قرمزي',
        outfit_1: 'نيلي ليلي',
        outfit_2: 'حرير ساكورا',
      },
      voiceMode: 'نبرة الشخصية',
      modes: {
        companion: 'حنونة ودافئة',
        tsundere: 'مرحة ومشاغبة',
        wife: 'هادئة ومقربة',
      },
      soundscape: 'أصوات الخلفية',
      soundscapes: {
        off: 'صامت',
        rain: 'مطر خفيف',
        whitenoise: 'غرفة هادئة',
      },
      soundVolume: 'مستوى الصوت المحيط',
      nightWhisper: 'إضاءة همس ليلية',
      studyFocus: 'وضع التركيز والدراسة',
      roomBg: 'خلفية المسرح',
      bgDark: 'استوديو عنابي',
      bgTransparent: 'خلفية شفافة',
      lightingTitle: 'إضاءة حسب الوقت',
      lighting: {
        auto: 'تلقائي',
        morning: 'فجر',
        day: 'نهار',
        evening: 'مساء',
        night: 'ليل',
      },
      sleepTimer: 'مؤقت النوم',
      timerOff: 'إيقاف',
      timerMins: 'دقيقة',
    },
    settings: {
      title: 'الإعدادات',
      account: 'حساب جوجل',
      signIn: 'تسجيل الدخول بجوجل',
      signOut: 'تسجيل الخروج',
      signedInAs: 'مسجل باسم',
      sections: {
        studio: 'الاستوديو والإطار',
        memory: 'الذاكرة والمهام',
        permissions: 'الصلاحيات والجسر',
        privacy: 'الخصوصية والبيانات',
        accessibility: 'اللغة وحجم الخط',
      },
      framingZoom: 'تقريب الشخصية',
      framingOffset: 'الإزاحة العمودية',
      resetFraming: 'إعادة ضبط الإطار',
      openStudio: 'فتح نافذة الاستوديو',
      openDirector: 'مخرج الحركات',
      openMemory: 'دفتر الذاكرة',
      openMissions: 'المهام الذكية',
      languageLabel: 'لغة الواجهة',
      langEn: 'English (LTR)',
      langAr: 'العربية (RTL)',
      biggerText: 'نص أكبر',
      biggerTextDesc: 'يكبّر حجم الترجمة والأزرار والنصوص لتسهيل القراءة.',
      bridgeNote:
        'جسر سطح المكتب يشغّل المستوى A تلقائياً، ويطلب موافقتك للمستوى B، ويمنع المستوى C تماماً.',
      cameraNote:
        'لقطات الكاميرا لا تُخزّن أبداً. يظهر مؤشر أحمر دائم عند تشغيل الكاميرا أو مشاركة الشاشة.',
      deleteData: 'حذف بياناتي',
      deleteConfirmTitle: 'هل تريد مسح كل الذكريات والمهام والإعدادات المحفوظة؟',
      deleteConfirmBtn: 'نعم، احذف الكل',
      cancel: 'إلغاء',
      deleting: 'جاري الحذف...',
      deletedDone: 'تم حذف جميع البيانات المحلية والسحابية.',
      installApp: 'تثبيت تطبيق Akane Pro',
    },
    memory: {
      title: 'الذاكرة',
      synced: 'متزامن سحابياً',
      local: 'معاينة محلية',
      items: 'عناصر',
      yourName: 'اسمك',
      workOrUni: 'الجامعة أو العمل',
      habits: 'عاداتك اليومية',
      addTitle: 'إضافة ذكرى جديدة',
      save: 'حفظ',
      searchPlaceholder: 'ابحث في الذاكرة...',
      empty: 'لا توجد ذكريات محفوظة بعد. تحدث مع أكاني وستتذكر تلقائياً.',
      forgetThis: 'انسَ هذا',
      recentSummaries: 'ملخصات الجلسات الأخيرة',
    },
    onboarding: {
      stepLabel: 'الإعداد',
      s1Title: 'مرحباً بك في Akane Pro',
      s1Body: 'قبل البدء، يرجى تأكيد أن عمرك 18+ وتفعيل أذونات الصوت والكاميرا.',
      adultCheck: 'أؤكد أن عمري 18 عاماً أو أكثر (تجربة مخصصة للبالغين).',
      micPerm: 'إذن الميكروفون',
      camPerm: 'إذن الكاميرا (اختياري)',
      granted: 'مفعّل',
      grantBtn: 'سماح',
      deniedHint: 'يمكنك تعديل الأذونات في أي وقت من إعدادات المتصفح.',
      nextBtn: 'متابعة',
      s2Title: 'اختبار الصوت',
      s2Body: 'دعنا نختبر السماعات لتتمكن أكاني من الترحيب بك بوضوح.',
      playTestTone: 'تشغيل نغمة الاختبار',
      tonePlayed: 'الصوت جاهز',
      s3Title: 'اختر مظهر رفيقتك',
      s3Body: 'اختر الزي والأسلوب للانتقال مباشرة إلى المسرح.',
      chooseOutfit: 'الزي',
      chooseTone: 'أسلوب الحديث',
      enterStage: 'دخول المسرح',
    },
    common: {
      close: 'إغلاق',
      dismiss: 'إخفاء',
      offline: 'أنت غير متصل بالإنترنت — أعد الاتصال للتحدث مباشرة.',
      allow: 'سماح',
      deny: 'رفض',
    },
  },
};
