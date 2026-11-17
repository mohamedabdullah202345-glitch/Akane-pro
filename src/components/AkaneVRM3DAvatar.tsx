import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils, VRMExpressionPresetName } from '@pixiv/three-vrm';
import type {
  AvatarActivityState,
  CompanionMode,
  GazeCoordinates,
  OutfitStyle,
  TalkMood,
} from '../types/akane';
import { Sparkles, UploadCloud } from 'lucide-react';

export interface AkaneVRM3DAvatarHandle {
  triggerReaction: (type?: 'nod' | 'happy' | 'wave' | 'surprise') => void;
  loadModel: (urlOrFile: string | File) => Promise<void>;
  getVrm: () => VRM | null;
}

export interface AkaneVRM3DAvatarProps {
  activityState: AvatarActivityState;
  audioLevel: number;
  isUserSpeaking?: boolean;
  companionMode?: CompanionMode;
  mood?: TalkMood;
  gaze?: GazeCoordinates;
  outfitStyle?: OutfitStyle;
  framingZoom?: number;
  framingOffsetY?: number;
  modelUrl?: string;
  onAvatarClick?: () => void;
  onModelLoaded?: (vrm: VRM) => void;
}

export const AkaneVRM3DAvatar = forwardRef<AkaneVRM3DAvatarHandle, AkaneVRM3DAvatarProps>(
  function AkaneVRM3DAvatar(
    {
      activityState,
      audioLevel,
      isUserSpeaking = false,
      companionMode = 'companion',
      mood = 'neutral',
      gaze = { x: 0, y: 0, isContact: true, fatigueScore: 0, attentionScore: 1 },
      framingZoom = 1.0,
      framingOffsetY = 0,
      modelUrl = '/models/akane.vrm',
      onAvatarClick,
      onModelLoaded,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isDraggingFile, setIsDraggingFile] = useState(false);
    const [modelName, setModelName] = useState<string>('Akane 3D');

    // Three.js and VRM internal refs
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const vrmRef = useRef<VRM | null>(null);
    const lookAtTargetRef = useRef<THREE.Object3D | null>(null);
    const animFrameIdRef = useRef<number | null>(null);
    const clockRef = useRef<THREE.Clock>(new THREE.Clock());

    // Head / camera positioning
    const headBasePosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.35, 0));
    const cameraLookTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 1.20, 0));

    // Live animation parameters
    const liveStateRef = useRef({
      activityState,
      audioLevel,
      mood,
      companionMode,
      gaze,
      isUserSpeaking,
      framingZoom,
      framingOffsetY,
    });

    useEffect(() => {
      liveStateRef.current = {
        activityState,
        audioLevel,
        mood,
        companionMode,
        gaze,
        isUserSpeaking,
        framingZoom,
        framingOffsetY,
      };
    }, [
      activityState,
      audioLevel,
      mood,
      companionMode,
      gaze,
      isUserSpeaking,
      framingZoom,
      framingOffsetY,
    ]);

    // Blinking state
    const blinkStateRef = useRef({
      nextBlinkTime: 2.5,
      isBlinking: false,
      blinkProgress: 0,
      blinkDuration: 0.14,
      isDoubleBlinkPending: false,
    });

    // Touch / reaction state
    const reactionRef = useRef<{
      active: boolean;
      type: 'nod' | 'happy' | 'wave' | 'surprise';
      time: number;
      duration: number;
    }>({
      active: false,
      type: 'happy',
      time: 0,
      duration: 1.5,
    });

    // Smoothed gaze for natural non-jittery head tracking
    const smoothGazeRef = useRef({ x: 0, y: 0 });

    // Stylize VRM materials to match Akane's exact appearance from video clips
    const customizeMaterialsForAkane = useCallback((vrm: VRM) => {
      vrm.scene.traverse((node: any) => {
        if (!node.isMesh || !node.material) return;

        const mats = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of mats) {
          const name = (mat.name || '').toLowerCase();

          // 1. Jet-Black Raven Hair
          if (name.includes('hair')) {
            mat.color = new THREE.Color(0x1a1a24);
            if ('shadeColor' in mat) {
              (mat as any).shadeColor = new THREE.Color(0x0e0e16);
            }
          }

          // 2. Ruby Crimson Anime Eyes (Akane's signature eye color)
          else if (name.includes('eyeiris') || name.includes('eye_iris') || name.includes('iris')) {
            mat.color = new THREE.Color(0xdc2626);
            if ('shadeColor' in mat) {
              (mat as any).shadeColor = new THREE.Color(0x881337);
            }
          }

          // 3. Eyebrows & Eyelines (dark matching black hair)
          else if (
            name.includes('eyebrow') ||
            name.includes('eyelash') ||
            name.includes('eyeline') ||
            name.includes('facebrow') ||
            name.includes('faceeyelash') ||
            name.includes('faceeyeline')
          ) {
            mat.color = new THREE.Color(0x181920);
          }

          // 4. Hakama / Red Kimono Skirt
          else if (name.includes('bottoms') || name.includes('skirt') || name.includes('hakama')) {
            mat.color = new THREE.Color(0x991b1b);
            if ('shadeColor' in mat) {
              (mat as any).shadeColor = new THREE.Color(0x590c0c);
            }
          }

          // 5. White Kimono Top
          else if (name.includes('tops') || name.includes('kimono') || name.includes('huku')) {
            mat.color = new THREE.Color(0xffffff);
            if ('shadeColor' in mat) {
              (mat as any).shadeColor = new THREE.Color(0xf1f5f9);
            }
          }

          // 6. Fair Japanese Anime Skin
          else if (name.includes('skin') || name.includes('face') || name.includes('body')) {
            mat.color = new THREE.Color(0xfff5f2);
            if ('shadeColor' in mat) {
              (mat as any).shadeColor = new THREE.Color(0xfde2e4);
            }
          }

          mat.needsUpdate = true;
        }
      });
    }, []);

    // Helper to pose arms naturally in relaxed A-pose
    const applyRelaxedPose = useCallback((vrm: VRM) => {
      if (!vrm.humanoid) return;
      try {
        const lUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
        const rUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
        if (lUpperArm) lUpperArm.rotation.z = -1.18; // ~68 deg downward
        if (rUpperArm) rUpperArm.rotation.z = 1.18;

        const lLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
        const rLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');
        if (lLowerArm) lLowerArm.rotation.x = -0.16;
        if (rLowerArm) rLowerArm.rotation.x = -0.16;
      } catch (e) {
        console.warn('[AkaneVRM3D] Pose adjustment notice:', e);
      }
    }, []);

    // Core loader function
    const loadVRM = useCallback(
      async (urlOrBlob: string | ArrayBuffer) => {
        if (!sceneRef.current) return;
        setIsLoading(true);
        setLoadError(null);

        try {
          const loader = new GLTFLoader();
          loader.register((parser) => new VRMLoaderPlugin(parser));

          const onGltfLoaded = (gltf: any) => {
            const vrm: VRM = gltf.userData.vrm;
            if (!vrm) {
              throw new Error('الملف ليس نموذج VRM صالحاً');
            }

            // Dispose old VRM if present
            if (vrmRef.current) {
              sceneRef.current?.remove(vrmRef.current.scene);
              VRMUtils.deepDispose(vrmRef.current.scene);
              vrmRef.current = null;
            }

            // Optimize mesh & skeletons
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.combineSkeletons(gltf.scene);

            // Handle VRM0 coordinate rotation if applicable
            VRMUtils.rotateVRM0(vrm);

            vrmRef.current = vrm;
            sceneRef.current?.add(vrm.scene);

            // Configure LookAt target
            if (lookAtTargetRef.current && vrm.lookAt) {
              vrm.lookAt.target = lookAtTargetRef.current;
            }

            // Calculate head bone position for framing
            const head = vrm.humanoid?.getNormalizedBoneNode('head');
            if (head) {
              const headPos = new THREE.Vector3();
              head.getWorldPosition(headPos);
              headBasePosRef.current.copy(headPos);
            } else {
              headBasePosRef.current.set(0, 1.35, 0);
            }

            // Apply relaxed standing pose
            applyRelaxedPose(vrm);

            // Apply Akane character color styling (black hair, crimson eyes, kimono)
            customizeMaterialsForAkane(vrm);

            setModelName('Akane 3D');
            setIsLoading(false);
            if (onModelLoaded) onModelLoaded(vrm);
          };

          if (typeof urlOrBlob === 'string') {
            loader.load(
              urlOrBlob,
              onGltfLoaded,
              undefined,
              (err) => {
                console.error('[AkaneVRM3D] Failed to load VRM:', err);
                setLoadError('تعذر تحميل مجسم الأفاتار 3D. تحقق من مسار الملف.');
                setIsLoading(false);
              }
            );
          } else {
            loader.parse(
              urlOrBlob,
              '',
              onGltfLoaded,
              (err) => {
                console.error('[AkaneVRM3D] Parse error:', err);
                setLoadError('حدث خطأ أثناء معالجة نموذج VRM.');
                setIsLoading(false);
              }
            );
          }
        } catch (err: any) {
          console.error('[AkaneVRM3D] Load exception:', err);
          setLoadError(err?.message || 'خطأ غير معروف في تحميل نموذج 3D.');
          setIsLoading(false);
        }
      },
      [applyRelaxedPose, customizeMaterialsForAkane, onModelLoaded]
    );

    // Public imperative handle
    useImperativeHandle(
      ref,
      () => ({
        triggerReaction: (type = 'happy') => {
          reactionRef.current = {
            active: true,
            type,
            time: 0,
            duration: 1.4,
          };
        },
        loadModel: async (urlOrFile: string | File) => {
          if (typeof urlOrFile === 'string') {
            await loadVRM(urlOrFile);
          } else {
            const buf = await urlOrFile.arrayBuffer();
            await loadVRM(buf);
            setModelName(urlOrFile.name.replace(/\.vrm$/i, ''));
          }
        },
        getVrm: () => vrmRef.current,
      }),
      [loadVRM]
    );

    // Setup Three.js scene, renderer, camera and animation loop
    useEffect(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const width = container.clientWidth || 640;
      const height = container.clientHeight || 800;

      // 1. Scene
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      // 2. Camera: Framed for upper-body portrait anime framing with 28 fov portrait lens
      const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 20.0);
      camera.position.set(0, 1.25, 1.35);
      cameraRef.current = camera;

      // 3. LookAt dummy target
      const lookAtTarget = new THREE.Object3D();
      lookAtTarget.position.set(0, 1.35, 2.0);
      scene.add(lookAtTarget);
      lookAtTargetRef.current = lookAtTarget;

      // 4. Lights: Anime Studio setup with warm key light and crimson rim light
      const ambientLight = new THREE.AmbientLight(0xfff1f2, 1.25);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
      keyLight.position.set(1.2, 2.2, 2.4);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xdce7ff, 0.85);
      fillLight.position.set(-1.4, 1.2, 1.8);
      scene.add(fillLight);

      // Signature Akane Crimson Back Rim Light
      const rimLight = new THREE.DirectionalLight(0xa3202b, 2.6);
      rimLight.position.set(0.0, 2.4, -2.2);
      scene.add(rimLight);

      const bottomBounce = new THREE.DirectionalLight(0xffedd5, 0.4);
      bottomBounce.position.set(0, -1.2, 1.0);
      scene.add(bottomBounce);

      // 5. Renderer
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      rendererRef.current = renderer;

      // 6. Resize Observer
      const handleResize = () => {
        if (!container || !renderer || !camera) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);

      // 7. Initial Load
      loadVRM(modelUrl);

      // 8. Main Render Animation Loop
      const clock = clockRef.current;
      clock.start();

      const animate = () => {
        animFrameIdRef.current = requestAnimationFrame(animate);

        const delta = Math.min(clock.getDelta(), 0.1);
        const elapsedTime = clock.getElapsedTime();
        const vrm = vrmRef.current;
        const live = liveStateRef.current;

        // Camera dynamic zoom and offset (framed perfectly for upper-body portrait)
        const baseHeadY = headBasePosRef.current.y || 1.35;
        const zoom = Math.max(0.6, Math.min(1.8, live.framingZoom || 1.0));
        const offsetY = live.framingOffsetY || 0;

        cameraLookTargetRef.current.set(0, baseHeadY - 0.16 + offsetY, 0);
        camera.position.set(0, baseHeadY - 0.08 + offsetY, 1.35 / zoom);
        camera.lookAt(cameraLookTargetRef.current);

        if (vrm) {
          // --- A. Smooth Gaze Tracking ---
          const rawGazeX = THREE.MathUtils.clamp(live.gaze?.x || 0, -1, 1);
          const rawGazeY = THREE.MathUtils.clamp(live.gaze?.y || 0, -1, 1);
          smoothGazeRef.current.x += (rawGazeX - smoothGazeRef.current.x) * 0.12;
          smoothGazeRef.current.y += (rawGazeY - smoothGazeRef.current.y) * 0.12;
          const gx = smoothGazeRef.current.x;
          const gy = smoothGazeRef.current.y;

          if (lookAtTargetRef.current) {
            lookAtTargetRef.current.position.x = gx * 0.55;
            lookAtTargetRef.current.position.y = baseHeadY + gy * 0.35;
            lookAtTargetRef.current.position.z = camera.position.z;
          }

          // Subtle head bone orientation towards user
          const headBone = vrm.humanoid?.getNormalizedBoneNode('head');
          const neckBone = vrm.humanoid?.getNormalizedBoneNode('neck');
          if (headBone) {
            headBone.rotation.y = -gx * 0.32;
            headBone.rotation.x = gy * 0.22;
            headBone.rotation.z = -gx * 0.05;
          }
          if (neckBone) {
            neckBone.rotation.y = -gx * 0.14;
          }

          // --- B. Breathing & Micro Body Sway ---
          const breath = Math.sin(elapsedTime * 1.8) * 0.015;
          const microSway = Math.cos(elapsedTime * 0.9) * 0.008;
          const chestBone =
            vrm.humanoid?.getNormalizedBoneNode('chest') ||
            vrm.humanoid?.getNormalizedBoneNode('spine');
          if (chestBone) {
            chestBone.rotation.x = breath;
            chestBone.rotation.z = microSway;
          }

          // --- C. Natural Blinking Cycle ---
          const bState = blinkStateRef.current;
          bState.nextBlinkTime -= delta;

          if (bState.nextBlinkTime <= 0 && !bState.isBlinking) {
            bState.isBlinking = true;
            bState.blinkProgress = 0;
            // 22% chance of double blink
            bState.isDoubleBlinkPending = Math.random() < 0.22;
          }

          let currentBlinkWeight = 0;
          if (bState.isBlinking) {
            bState.blinkProgress += delta / bState.blinkDuration;
            if (bState.blinkProgress >= 1.0) {
              bState.isBlinking = false;
              if (bState.isDoubleBlinkPending) {
                bState.isDoubleBlinkPending = false;
                bState.nextBlinkTime = 0.08;
              } else {
                bState.nextBlinkTime = THREE.MathUtils.randFloat(2.2, 4.5);
              }
              currentBlinkWeight = 0;
            } else {
              currentBlinkWeight = Math.sin(bState.blinkProgress * Math.PI);
            }
          }

          // --- D. Dynamic Lip-Sync Visemes (Speech) ---
          let targetAa = 0;
          let targetOh = 0;
          let targetIh = 0;

          if (live.activityState === 'speaking') {
            const openAmt = Math.min(1.0, Math.max(0.12, live.audioLevel * 3.4));
            // Realistic vowel modulation during continuous speech
            targetAa = openAmt * Math.max(0, Math.sin(elapsedTime * 13.0));
            targetOh = openAmt * 0.65 * Math.max(0, Math.cos(elapsedTime * 8.5));
            targetIh = openAmt * 0.45 * Math.max(0, Math.sin(elapsedTime * 15.0 + 1.2));
          } else if (live.activityState === 'listening') {
            // Slightly parted lips when listening intently
            targetAa = 0.06;
          }

          // --- E. Emotion & Mood Expressions ---
          let targetHappy = 0;
          let targetRelaxed = 0;
          let targetSurprised = 0;
          let targetAngry = 0;
          let targetSad = 0;

          const moodKey = live.mood || 'neutral';
          if (moodKey === 'happy' || moodKey === 'playful') {
            targetHappy = 0.85;
            targetRelaxed = 0.25;
          } else if (moodKey === 'warm' || moodKey === 'comfort') {
            targetRelaxed = 0.8;
            targetHappy = 0.3;
          } else if (moodKey === 'thinking') {
            targetRelaxed = 0.35;
            targetSad = 0.15;
          } else if (moodKey === 'surprised') {
            targetSurprised = 0.9;
          }

          if (live.companionMode === 'tsundere') {
            targetAngry = Math.max(targetAngry, 0.22);
            targetHappy = Math.max(targetHappy, 0.35);
          } else if (live.companionMode === 'wife') {
            targetRelaxed = Math.max(targetRelaxed, 0.65);
          }

          // --- F. Touch Reaction Animation ---
          const react = reactionRef.current;
          if (react.active) {
            react.time += delta;
            const progress = react.time / react.duration;
            if (progress >= 1.0) {
              react.active = false;
              vrm.scene.position.y = 0;
            } else {
              // Cute hop bounce & nod
              vrm.scene.position.y = Math.sin(progress * Math.PI) * 0.04;
              if (headBone) {
                headBone.rotation.x += Math.sin(progress * Math.PI * 2) * 0.12;
              }
              targetHappy = Math.max(targetHappy, 1.0);
            }
          }

          // --- G. Apply Weights to VRM Expression Manager ---
          if (vrm.expressionManager) {
            const setExpr = (name: string, val: number) => {
              try { vrm.expressionManager?.setValue(name, val); } catch {}
            };

            // Set standard preset
            setExpr(VRMExpressionPresetName.Blink, currentBlinkWeight);
            setExpr(VRMExpressionPresetName.Aa, targetAa);
            setExpr(VRMExpressionPresetName.Oh, targetOh);
            setExpr(VRMExpressionPresetName.Ih, targetIh);
            setExpr(VRMExpressionPresetName.Happy, targetHappy);
            setExpr(VRMExpressionPresetName.Relaxed, targetRelaxed);
            setExpr(VRMExpressionPresetName.Surprised, targetSurprised);
            setExpr(VRMExpressionPresetName.Angry, targetAngry);
            setExpr(VRMExpressionPresetName.Sad, targetSad);

            // Also set VRM 0.0 legacy group names for complete compatibility
            setExpr('Blink', currentBlinkWeight);
            setExpr('A', targetAa);
            setExpr('O', targetOh);
            setExpr('I', targetIh);
            setExpr('Joy', targetHappy);
            setExpr('Fun', targetRelaxed);
            setExpr('Surprised', targetSurprised);
            setExpr('surprised', targetSurprised);
            setExpr('Sorrow', targetSad);

            vrm.expressionManager.update();
          }

          // --- H. VRM Physics and Spring Bones ---
          vrm.update(delta);
        }

        // Render frame
        renderer.render(scene, camera);
      };

      animate();

      return () => {
        if (animFrameIdRef.current) {
          cancelAnimationFrame(animFrameIdRef.current);
        }
        resizeObserver.disconnect();

        if (vrmRef.current) {
          scene.remove(vrmRef.current.scene);
          VRMUtils.deepDispose(vrmRef.current.scene);
          vrmRef.current = null;
        }

        renderer.dispose();
      };
    }, [loadVRM, modelUrl]);

    // Handle drag and drop custom VRM file
    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingFile(true);
    };

    const handleDragLeave = () => {
      setIsDraggingFile(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingFile(false);

      const files = Array.from(e.dataTransfer.files);
      const vrmFile = files.find((f) => f.name.toLowerCase().endsWith('.vrm'));
      if (vrmFile) {
        const buf = await vrmFile.arrayBuffer();
        await loadVRM(buf);
        setModelName(vrmFile.name.replace(/\.vrm$/i, ''));
      }
    };

    const handleClickStage = () => {
      reactionRef.current = {
        active: true,
        type: 'happy',
        time: 0,
        duration: 1.3,
      };
      if (onAvatarClick) onAvatarClick();
    };

    return (
      <div
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClickStage}
        className="relative w-full h-full flex items-center justify-center cursor-pointer select-none overflow-hidden"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Loading overlay with subtle spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0C0A]/60 backdrop-blur-sm z-20 pointer-events-none transition-opacity">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-2 border-[#A3202B]/30" />
              <div className="absolute inset-0 rounded-full border-2 border-[#A3202B] border-t-transparent animate-spin" />
              <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-[#A3202B] animate-pulse" />
            </div>
            <p className="mt-3 text-xs font-semibold text-[#F5F1EC]/90 tracking-wide font-display">
              جاري تجهيز محرك الأفاتار ثلاثي الأبعاد (VTuber 3D)...
            </p>
          </div>
        )}

        {/* Error overlay */}
        {loadError && (
          <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs backdrop-blur-md z-30 flex items-center justify-between">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                loadVRM(modelUrl);
              }}
              className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white font-medium text-xs ml-3"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Drag-over indicator */}
        {isDraggingFile && (
          <div className="absolute inset-4 rounded-3xl border-2 border-dashed border-[#A3202B] bg-[#A3202B]/20 backdrop-blur-md flex flex-col items-center justify-center z-40 pointer-events-none">
            <UploadCloud className="w-12 h-12 text-[#F5F1EC] mb-2 animate-bounce" />
            <p className="text-sm font-bold text-[#F5F1EC]">أفلت ملف الأفاتار (.vrm) هنا</p>
            <p className="text-xs text-[#F5F1EC]/70 mt-1">سيتم تحميل وتجسيم الشخصية فوراً</p>
          </div>
        )}

        {/* Subtle Bottom Badge: Active 3D Model Name */}
        {!isLoading && !loadError && (
          <div className="absolute bottom-20 right-6 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-white/10 backdrop-blur-md text-[11px] text-[#F5F1EC]/80 pointer-events-none transition-opacity hover:opacity-100">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold">{modelName} (VTuber 3D)</span>
          </div>
        )}
      </div>
    );
  }
);
