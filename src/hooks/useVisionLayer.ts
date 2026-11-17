import { useCallback, useEffect, useRef, useState } from 'react';
import type { GazeCoordinates, VisionEventPayload, VisionEventType } from '../types/akane';

export function isSecureMediaContext(): boolean {
  if (typeof window === 'undefined') return true;
  const { protocol, hostname } = window.location;
  if (protocol === 'https:') return true;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

export function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

export function formatMediaError(
  err: unknown,
  device: 'Microphone' | 'Camera' | 'Screen Share'
): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return `${device} permission denied. Please allow ${device.toLowerCase()} access and try again.`;
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return `No ${device.toLowerCase()} device found.`;
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return `${device} is already in use by another app or browser tab.`;
    }
    if (err.name === 'OverconstrainedError') {
      return `${device} resolution constraints are unsupported on this device.`;
    }
    if (err.name === 'AbortError') {
      return `${device} request was cancelled.`;
    }
    if (err.message) return `${device} error (${err.name}): ${err.message}`;
  }
  if (err instanceof Error && err.message) return err.message;
  return `${device} access failed.`;
}

interface VisionRuleSpec {
  systemText: string;
  clipKey: string;
  urgent: boolean;
  priority: number;
  cooldownMs: number;
}

const VISION_EVENT_SPECS: Record<VisionEventType, VisionRuleSpec> = {
  wave: {
    systemText: '[user waved]',
    clipKey: 'greet',
    urgent: true,
    priority: 100,
    cooldownMs: 20_000,
  },
  thumbs_up: {
    systemText: '[user gave a thumbs up]',
    clipKey: 'proud',
    urgent: false,
    priority: 85,
    cooldownMs: 25_000,
  },
  yawn: {
    systemText: '[user yawned]',
    clipKey: 'sleepy',
    urgent: false,
    priority: 75,
    cooldownMs: 45_000,
  },
  nod: {
    systemText: '[user nodded yes]',
    clipKey: 'nod_yes',
    urgent: false,
    priority: 70,
    cooldownMs: 25_000,
  },
  shake: {
    systemText: '[user shook head no]',
    clipKey: 'shake_no',
    urgent: false,
    priority: 70,
    cooldownMs: 25_000,
  },
  face_appear: {
    systemText: '[user came back on camera]',
    clipKey: 'greet',
    urgent: false,
    priority: 65,
    cooldownMs: 25_000,
  },
  on_camera: {
    systemText: '[user turned on camera]',
    clipKey: 'curious',
    urgent: false,
    priority: 60,
    cooldownMs: 30_000,
  },
  face_disappear: {
    systemText: '[user stepped away from camera]',
    clipKey: 'worried',
    urgent: false,
    priority: 55,
    cooldownMs: 35_000,
  },
  smile: {
    systemText: '[user smiled]',
    clipKey: 'happy',
    urgent: false,
    priority: 50,
    cooldownMs: 30_000,
  },
  look_away: {
    systemText: '[user looked away]',
    clipKey: 'wait',
    urgent: false,
    priority: 40,
    cooldownMs: 45_000,
  },
};

const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const GESTURE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

interface UseVisionLayerOptions {
  isLiveConnected: boolean;
  isMuted: boolean;
  isPaused: boolean;
  sendVideoFrame: (base64Jpeg: string) => void;
  sendVisionText: (systemText: string) => void;
  onInstantVisionClip: (payload: VisionEventPayload) => void;
  onVisionError: (message: string) => void;
}

export function useVisionLayer({
  isLiveConnected,
  isMuted,
  isPaused,
  sendVideoFrame,
  sendVisionText,
  onInstantVisionClip,
  onVisionError,
}: UseVisionLayerOptions) {
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [screenShareWarning, setScreenShareWarning] = useState<string | null>(null);
  const [lastDetectedEvent, setLastDetectedEvent] = useState<VisionEventType | null>(null);
  const [gaze, setGaze] = useState<GazeCoordinates>({
    x: 0,
    y: 0,
    isContact: true,
    fatigueScore: 0,
    attentionScore: 1,
  });

  useEffect(() => {
    if (isCameraOn) return;
    const onMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setGaze({
        x: Math.max(-1, Math.min(1, x)),
        y: Math.max(-1, Math.min(1, y)),
        isContact: Math.abs(x) < 0.6 && Math.abs(y) < 0.6,
        fatigueScore: 0,
        attentionScore: 1,
      });
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, [isCameraOn]);

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const layerBIntervalRef = useRef<number | null>(null);
  const screenIntervalRef = useRef<number | null>(null);
  const layerAIntervalRef = useRef<number | null>(null);

  const faceLandmarkerRef = useRef<{
    detectForVideo: (
      video: HTMLVideoElement,
      ts: number
    ) => {
      faceLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
      faceBlendshapes?: Array<{
        categories: Array<{ categoryName: string; score: number }>;
      }>;
    };
    close?: () => void;
  } | null>(null);
  const gestureRecognizerRef = useRef<{
    recognizeForVideo: (
      video: HTMLVideoElement,
      ts: number
    ) => {
      gestures?: Array<Array<{ categoryName: string; score: number }>>;
      landmarks?: Array<Array<{ x: number; y: number; z: number }>>;
    };
    close?: () => void;
  } | null>(null);
  const mediaPipeLoadingRef = useRef(false);

  // Tracking state for Layer A heuristics & cooldowns
  const lastEventFiredAtRef = useRef<Partial<Record<VisionEventType, number>>>({});
  const lastNonUrgentSentAtRef = useRef<number>(0);
  const lastFrameSentAtRef = useRef<number>(0);
  const hasSeenFaceRef = useRef<boolean>(false);
  const faceMissingSinceRef = useRef<number | null>(null);
  const yawnStartedAtRef = useRef<number | null>(null);
  const lookAwayStartedAtRef = useRef<number | null>(null);
  const noseHistoryRef = useRef<Array<{ t: number; x: number; y: number }>>([]);
  const wristXHistoryRef = useRef<Array<{ t: number; x: number }>>([]);

  const liveConnectedRef = useRef(isLiveConnected);
  const mutedRef = useRef(isMuted);
  const pausedRef = useRef(isPaused);
  const sendVideoFrameRef = useRef(sendVideoFrame);
  const sendVisionTextRef = useRef(sendVisionText);
  const onInstantClipRef = useRef(onInstantVisionClip);
  const onErrorRef = useRef(onVisionError);

  liveConnectedRef.current = isLiveConnected;
  mutedRef.current = isMuted;
  pausedRef.current = isPaused;
  sendVideoFrameRef.current = sendVideoFrame;
  sendVisionTextRef.current = sendVisionText;
  onInstantClipRef.current = onInstantVisionClip;
  onErrorRef.current = onVisionError;

  const captureAndSendFrame = useCallback((vid: HTMLVideoElement | null, force = false) => {
    if (!liveConnectedRef.current || mutedRef.current || pausedRef.current) return;
    if (!vid || vid.readyState < 2 || vid.videoWidth === 0) return;

    const now = Date.now();
    if (!force && now - lastFrameSentAtRef.current < 900) return;
    if (force && now - lastFrameSentAtRef.current < 450) return;

    if (!frameCanvasRef.current) {
      frameCanvasRef.current = document.createElement('canvas');
    }
    const canvas = frameCanvasRef.current;
    const maxDim = 640;
    const scale = Math.min(1, maxDim / Math.max(vid.videoWidth, vid.videoHeight));
    const targetW = Math.max(1, Math.round(vid.videoWidth * scale));
    const targetH = Math.max(1, Math.round(vid.videoHeight * scale));

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(vid, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    const base64 = dataUrl.split(',')[1];
    if (base64) {
      lastFrameSentAtRef.current = now;
      sendVideoFrameRef.current(base64);
    }
  }, []);

  const emitVisionEvent = useCallback(
    (type: VisionEventType) => {
      const now = Date.now();
      const spec = VISION_EVENT_SPECS[type];
      const lastForType = lastEventFiredAtRef.current[type] ?? 0;
      if (now - lastForType < spec.cooldownMs) return false;

      if (!spec.urgent && now - lastNonUrgentSentAtRef.current < 5_500) {
        return false;
      }

      lastEventFiredAtRef.current[type] = now;
      if (!spec.urgent) {
        lastNonUrgentSentAtRef.current = now;
      }

      const payload: VisionEventPayload = {
        type,
        ...spec,
      };

      setLastDetectedEvent(type);
      // 1. Trigger Akane's reaction clip IMMEDIATELY without waiting for the model
      onInstantClipRef.current(payload);

      // 2. Send lightweight system hint text to Gemini Live & refresh frame if connected
      if (liveConnectedRef.current && !mutedRef.current && !pausedRef.current) {
        sendVisionTextRef.current(spec.systemText);
        if (cameraVideoRef.current) {
          captureAndSendFrame(cameraVideoRef.current, true);
        }
      }
      return true;
    },
    [captureAndSendFrame]
  );

  const ensureMediaPipeLoaded = useCallback(async () => {
    if (faceLandmarkerRef.current || gestureRecognizerRef.current || mediaPipeLoadingRef.current) {
      return;
    }
    mediaPipeLoadingRef.current = true;
    try {
      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks('/mediapipe/wasm');

      const [faceResult, gestureResult] = await Promise.allSettled([
        vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          outputFaceBlendshapes: true,
          numFaces: 1,
        }),
        vision.GestureRecognizer.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: GESTURE_MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 1,
        }),
      ]);

      if (faceResult.status === 'fulfilled') {
        faceLandmarkerRef.current = faceResult.value;
      }
      if (gestureResult.status === 'fulfilled') {
        gestureRecognizerRef.current = gestureResult.value;
      }
    } catch {
      // Local MediaPipe models unavailable/offline — gracefully fall back to Layer B frames
    } finally {
      mediaPipeLoadingRef.current = false;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (layerAIntervalRef.current !== null) {
      window.clearInterval(layerAIntervalRef.current);
      layerAIntervalRef.current = null;
    }
    if (layerBIntervalRef.current !== null) {
      window.clearInterval(layerBIntervalRef.current);
      layerBIntervalRef.current = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop failure
        }
      });
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      try {
        cameraVideoRef.current.pause();
        cameraVideoRef.current.srcObject = null;
      } catch {
        // Ignore cleanup failure
      }
    }
    hasSeenFaceRef.current = false;
    faceMissingSinceRef.current = null;
    yawnStartedAtRef.current = null;
    lookAwayStartedAtRef.current = null;
    noseHistoryRef.current = [];
    wristXHistoryRef.current = [];
    setCameraStream(null);
    setIsCameraOn(false);
    setLastDetectedEvent(null);
  }, []);

  const stopScreenShare = useCallback(() => {
    if (screenIntervalRef.current !== null) {
      window.clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore
        }
      });
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      try {
        screenVideoRef.current.pause();
        screenVideoRef.current.srcObject = null;
      } catch {
        // Ignore
      }
    }
    setScreenStream(null);
    setIsScreenSharing(false);
  }, []);

  const runLayerATick = useCallback(() => {
    const vid = cameraVideoRef.current;
    if (!vid || vid.readyState < 2 || vid.videoWidth === 0) return;

    const ts = performance.now();
    const candidates: VisionEventType[] = [];

    // 1. Hand Gestures (wave, thumbs_up)
    if (gestureRecognizerRef.current) {
      try {
        const res = gestureRecognizerRef.current.recognizeForVideo(vid, ts);
        const topGesture = res.gestures?.[0]?.[0];
        const handLandmarks = res.landmarks?.[0];

        if (handLandmarks && handLandmarks[0]) {
          wristXHistoryRef.current.push({ t: Date.now(), x: handLandmarks[0].x });
          wristXHistoryRef.current = wristXHistoryRef.current.filter(
            (p) => Date.now() - p.t < 1100
          );
        }

        if (topGesture && topGesture.score >= 0.55) {
          if (topGesture.categoryName === 'Open_Palm') {
            // Confirm wave on open palm held or slight lateral motion
            const xs = wristXHistoryRef.current.map((p) => p.x);
            const spread = xs.length >= 2 ? Math.max(...xs) - Math.min(...xs) : 0.05;
            if (spread >= 0.02 || topGesture.score >= 0.65) {
              candidates.push('wave');
            }
          } else if (topGesture.categoryName === 'Thumb_Up') {
            candidates.push('thumbs_up');
          }
        }
      } catch {
        // Ignore single frame MediaPipe error
      }
    }

    // 2. Face Landmarks & Blendshapes (appear, disappear, smile, yawn, look_away, nod, shake)
    if (faceLandmarkerRef.current) {
      try {
        const res = faceLandmarkerRef.current.detectForVideo(vid, ts);
        const landmarks = res.faceLandmarks?.[0];
        const blendshapes = res.faceBlendshapes?.[0]?.categories ?? [];
        const now = Date.now();

        if (!landmarks || landmarks.length === 0) {
          yawnStartedAtRef.current = null;
          lookAwayStartedAtRef.current = null;
          if (hasSeenFaceRef.current) {
            if (faceMissingSinceRef.current === null) {
              faceMissingSinceRef.current = now;
            } else if (now - faceMissingSinceRef.current >= 2500) {
              candidates.push('face_disappear');
              hasSeenFaceRef.current = false;
            }
          }
        } else {
          if (!hasSeenFaceRef.current) {
            hasSeenFaceRef.current = true;
            if (faceMissingSinceRef.current !== null) {
              candidates.push('face_appear');
            }
          }
          faceMissingSinceRef.current = null;

          const scoreOf = (name: string) =>
            blendshapes.find((c) => c.categoryName === name)?.score ?? 0;

          const smileScore = (scoreOf('mouthSmileLeft') + scoreOf('mouthSmileRight')) / 2;
          if (smileScore > 0.45) {
            candidates.push('smile');
          }

          const jawOpen = scoreOf('jawOpen');
          if (jawOpen > 0.52) {
            if (yawnStartedAtRef.current === null) {
              yawnStartedAtRef.current = now;
            } else if (now - yawnStartedAtRef.current >= 700) {
              candidates.push('yawn');
              yawnStartedAtRef.current = null;
            }
          } else {
            yawnStartedAtRef.current = null;
          }

          // Head yaw approximation using nose tip (1) vs cheek boundaries (234 & 454)
          const leftCheek = landmarks[234];
          const rightCheek = landmarks[454];
          const noseTip = landmarks[1];
          if (leftCheek && rightCheek && noseTip) {
            const gx = (0.5 - noseTip.x) * 2;
            const gy = (noseTip.y - 0.45) * 2;
            const blinkL = scoreOf('eyeBlinkLeft');
            const blinkR = scoreOf('eyeBlinkRight');
            const fatigue = (blinkL + blinkR) / 2 > 0.65 ? 0.85 : jawOpen > 0.5 ? 0.7 : 0.05;
            setGaze({
              x: Math.max(-1, Math.min(1, gx)),
              y: Math.max(-1, Math.min(1, gy)),
              isContact: Math.abs(gx) < 0.5 && Math.abs(gy) < 0.5,
              fatigueScore: fatigue,
              attentionScore: Math.max(0, 1 - Math.abs(gx)),
            });

            const width = Math.abs(rightCheek.x - leftCheek.x);
            if (width > 0.05) {
              const centerRatio = (noseTip.x - Math.min(leftCheek.x, rightCheek.x)) / width;
              if (Math.abs(centerRatio - 0.5) > 0.25) {
                if (lookAwayStartedAtRef.current === null) {
                  lookAwayStartedAtRef.current = now;
                } else if (now - lookAwayStartedAtRef.current >= 1600) {
                  candidates.push('look_away');
                  lookAwayStartedAtRef.current = null;
                }
              } else {
                lookAwayStartedAtRef.current = null;
              }
            }

            // Nod & shake oscillation detection
            noseHistoryRef.current.push({ t: now, x: noseTip.x, y: noseTip.y });
            noseHistoryRef.current = noseHistoryRef.current.filter((p) => now - p.t <= 1100);

            if (noseHistoryRef.current.length >= 4) {
              let xFlips = 0;
              let yFlips = 0;
              let prevDx = 0;
              let prevDy = 0;
              for (let i = 1; i < noseHistoryRef.current.length; i++) {
                const dx = noseHistoryRef.current[i].x - noseHistoryRef.current[i - 1].x;
                const dy = noseHistoryRef.current[i].y - noseHistoryRef.current[i - 1].y;
                if (Math.abs(dx) > 0.015) {
                  const sign = dx > 0 ? 1 : -1;
                  if (prevDx !== 0 && sign !== prevDx) xFlips += 1;
                  prevDx = sign;
                }
                if (Math.abs(dy) > 0.012) {
                  const sign = dy > 0 ? 1 : -1;
                  if (prevDy !== 0 && sign !== prevDy) yFlips += 1;
                  prevDy = sign;
                }
              }
              if (yFlips >= 2) {
                candidates.push('nod');
                noseHistoryRef.current = [];
              } else if (xFlips >= 2) {
                candidates.push('shake');
                noseHistoryRef.current = [];
              }
            }
          }
        }
      } catch {
        // Ignore single frame detection error
      }
    }

    if (candidates.length === 0) return;

    // Pick highest priority event (e.g. wave > smile)
    candidates.sort(
      (a, b) => VISION_EVENT_SPECS[b].priority - VISION_EVENT_SPECS[a].priority
    );
    for (const ev of candidates) {
      if (emitVisionEvent(ev)) {
        break;
      }
    }
  }, [emitVisionEvent]);

  const startCamera = useCallback(async () => {
    if (cameraStreamRef.current) return;

    if (!isSecureMediaContext()) {
      onErrorRef.current(
        'Camera requires HTTPS or localhost. Plain HTTP cannot open camera devices.'
      );
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onErrorRef.current('Camera API is unavailable in this browser context.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
      });

      cameraStreamRef.current = stream;
      setCameraStream(stream);
      setIsCameraOn(true);

      const videoEl = cameraVideoRef.current;
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.playsInline = true;
        try {
          await videoEl.play();
        } catch {
          // Ignore autoplay restriction cleanly
        }
      }

      emitVisionEvent('on_camera');
      void ensureMediaPipeLoaded();

      if (layerAIntervalRef.current !== null) {
        window.clearInterval(layerAIntervalRef.current);
      }
      layerAIntervalRef.current = window.setInterval(runLayerATick, 450);

      if (layerBIntervalRef.current !== null) {
        window.clearInterval(layerBIntervalRef.current);
      }
      layerBIntervalRef.current = window.setInterval(() => {
        captureAndSendFrame(cameraVideoRef.current, false);
      }, 2500);
    } catch (err) {
      stopCamera();
      onErrorRef.current(formatMediaError(err, 'Camera'));
    }
  }, [captureAndSendFrame, emitVisionEvent, ensureMediaPipeLoaded, runLayerATick, stopCamera]);

  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      await startCamera();
    }
  }, [isCameraOn, startCamera, stopCamera]);

  const startScreenShare = useCallback(async () => {
    if (screenStreamRef.current) return;
    setScreenShareWarning(null);

    if (!isSecureMediaContext()) {
      onErrorRef.current('Screen sharing requires HTTPS or localhost.');
      return;
    }

    if (
      isLikelyMobileDevice() ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getDisplayMedia !== 'function'
    ) {
      setScreenShareWarning(
        'Screen sharing is limited or unsupported on mobile browsers. Use a desktop browser to share your screen.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      });

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsScreenSharing(true);

      const videoEl = screenVideoRef.current;
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.muted = true;
        videoEl.playsInline = true;
        try {
          await videoEl.play();
        } catch {
          // Ignore play interruption
        }
      }

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare();
        };
      }

      if (screenIntervalRef.current !== null) {
        window.clearInterval(screenIntervalRef.current);
      }
      screenIntervalRef.current = window.setInterval(() => {
        captureAndSendFrame(screenVideoRef.current, false);
      }, 1100);
    } catch (err) {
      stopScreenShare();
      const msg = formatMediaError(err, 'Screen Share');
      if (!msg.toLowerCase().includes('cancelled')) {
        onErrorRef.current(msg);
      }
    }
  }, [captureAndSendFrame, stopScreenShare]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      await startScreenShare();
    }
  }, [isScreenSharing, startScreenShare, stopScreenShare]);

  useEffect(() => {
    return () => {
      stopCamera();
      stopScreenShare();
      try {
        faceLandmarkerRef.current?.close?.();
        gestureRecognizerRef.current?.close?.();
      } catch {
        // Ignore close errors
      }
      faceLandmarkerRef.current = null;
      gestureRecognizerRef.current = null;
    };
  }, [stopCamera, stopScreenShare]);

  return {
    isCameraOn,
    cameraStream,
    cameraVideoRef,
    isScreenSharing,
    screenStream,
    screenVideoRef,
    screenShareWarning,
    lastDetectedEvent,
    gaze,
    dismissScreenShareWarning: () => setScreenShareWarning(null),
    toggleCamera,
    stopCamera,
    toggleScreenShare,
    stopScreenShare,
  };
}
