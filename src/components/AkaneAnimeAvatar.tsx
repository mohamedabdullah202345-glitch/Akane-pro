import React, { useEffect, useRef, useState } from 'react';
import type { AvatarActivityState, CompanionMode, GazeCoordinates, OutfitStyle, TalkMood } from '../types/akane';

interface AkaneAnimeAvatarProps {
  activityState: AvatarActivityState;
  audioLevel: number;
  companionMode: CompanionMode;
  mood?: TalkMood;
  gaze?: GazeCoordinates;
  outfitStyle?: OutfitStyle;
  isUserSpeaking?: boolean;
  onAvatarClick?: () => void;
}

export const AkaneAnimeAvatar: React.FC<AkaneAnimeAvatarProps> = ({
  activityState,
  audioLevel,
  companionMode,
  mood = 'neutral',
  gaze = { x: 0, y: 0, isContact: true, fatigueScore: 0, attentionScore: 1 },
  outfitStyle = 'default',
  isUserSpeaking = false,
  onAvatarClick,
}) => {
  const [blink, setBlink] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [blush, setBlush] = useState(false);
  const [swayOffset, setSwayOffset] = useState({ x: 0, y: 0, rot: 0 });

  // Natural blinking cycle with occasional double-blinks
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const scheduleBlink = () => {
      const delay = Math.random() * 3200 + 1800;
      timeout = setTimeout(() => {
        setBlink(true);
        setTimeout(() => {
          setBlink(false);
          // 30% chance of double blink
          if (Math.random() < 0.3) {
            setTimeout(() => {
              setBlink(true);
              setTimeout(() => {
                setBlink(false);
                scheduleBlink();
              }, 110);
            }, 90);
          } else {
            scheduleBlink();
          }
        }, 150);
      }, delay);
    };
    scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  // Smooth real-time Lip-sync based on audio level & speaking state
  useEffect(() => {
    let animFrame: number;
    const updateLip = () => {
      if (activityState === 'speaking') {
        const target = Math.min(1.0, Math.max(0.12, audioLevel * 3.5));
        setMouthOpen((prev) => prev + (target - prev) * 0.45);
      } else if (activityState === 'listening') {
        // slight parted lips when listening intently
        setMouthOpen(0.06);
      } else {
        setMouthOpen((prev) => prev * 0.75);
      }
      animFrame = requestAnimationFrame(updateLip);
    };
    animFrame = requestAnimationFrame(updateLip);
    return () => cancelAnimationFrame(animFrame);
  }, [activityState, audioLevel]);

  // Subtle breathing and 3D sway physics reacting to gaze
  useEffect(() => {
    let frame: number;
    const startTime = performance.now();
    const loop = (t: number) => {
      const elapsed = (t - startTime) / 1000;
      const breath = Math.sin(elapsed * 1.6) * 3.5;
      const tilt = Math.sin(elapsed * 0.8) * 1.0;
      const gazeInfluenceX = (gaze.x || 0) * 10;
      const gazeInfluenceY = (gaze.y || 0) * 6;
      setSwayOffset({
        x: gazeInfluenceX,
        y: breath + gazeInfluenceY,
        rot: tilt + (gaze.x || 0) * 2.2,
      });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [gaze.x, gaze.y]);

  // Expression moods
  const isHappy = mood === 'happy' || mood === 'playful' || companionMode === 'tsundere' || companionMode === 'cheerful_friend';
  const isCaring = mood === 'comfort' || mood === 'warm' || companionMode === 'wife';
  const isSleepy = mood === 'sleepy' || gaze.fatigueScore > 0.6;
  const isThinking = activityState === 'thinking' || companionMode === 'strict_dev';

  // Eye gaze offsets (clamped)
  const pupilOffsetX = Math.max(-14, Math.min(14, (gaze.x || 0) * 16));
  const pupilOffsetY = Math.max(-9, Math.min(9, (gaze.y || 0) * 11));

  return (
    <div
      onClick={onAvatarClick}
      className="relative w-full max-w-[620px] aspect-[9/16] max-h-[88vh] flex items-end justify-center cursor-pointer select-none"
      style={{
        transform: `perspective(1200px) rotateY(${(gaze.x || 0) * 8}deg) rotateX(${-(gaze.y || 0) * 5}deg) translate3d(${swayOffset.x}px, ${swayOffset.y}px, ${activityState === 'speaking' ? 20 : 0}px)`,
        transformStyle: 'preserve-3d',
        transition: 'transform 0.12s ease-out',
      }}
    >
      {/* 3D Anime Character SVG mirroring exact user reference artwork */}
      <svg
        viewBox="0 0 540 960"
        className="w-full h-full drop-shadow-[0_24px_50px_rgba(0,0,0,0.7)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Eyes Gradient */}
          <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FF3355" />
            <stop offset="55%" stopColor="#C9142E" />
            <stop offset="100%" stopColor="#4A0512" />
          </radialGradient>

          {/* Hair Gradient */}
          <linearGradient id="hairGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#25242A" />
            <stop offset="45%" stopColor="#151419" />
            <stop offset="100%" stopColor="#0B0B0E" />
          </linearGradient>

          {/* Kimono Sleeve Red Gradient */}
          <linearGradient id="sleeveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#F5ECE9" />
            <stop offset="78%" stopColor="#D94152" />
            <stop offset="100%" stopColor="#87121F" />
          </linearGradient>

          {/* Red Obi / Crimson Skirt */}
          <linearGradient id="crimsonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#B31A2B" />
            <stop offset="100%" stopColor="#7E0E1B" />
          </linearGradient>

          {/* Grey Pinstriped Skirt Pattern */}
          <pattern id="pinstripe" width="8" height="8" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#D1CEC7" strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* --- Back Hair (Flowing past waist) --- */}
        <path
          d="M 170 200 C 120 340 100 560 140 760 C 160 760 190 620 210 520 C 330 520 350 620 380 760 C 420 560 400 340 370 200 Z"
          fill="url(#hairGrad)"
        />

        {/* --- Legs & Feet --- */}
        {/* Left Leg */}
        <path d="M 235 590 L 230 760 L 255 760 L 260 590 Z" fill="#FCEEE2" stroke="#E8D5C4" strokeWidth="1.5" />
        {/* Right Leg */}
        <path d="M 280 590 L 285 760 L 310 760 L 305 590 Z" fill="#FCEEE2" stroke="#E8D5C4" strokeWidth="1.5" />

        {/* Footwear & Socks based on Outfit */}
        {outfitStyle === 'outfit_1' ? (
          // Cyber Coder: Black mid-calf socks & Cyber sneakers with red accents
          <>
            <path d="M 229 710 L 228 785 L 256 785 L 257 710 Z" fill="#181820" />
            <path d="M 284 710 L 283 785 L 311 785 L 312 710 Z" fill="#181820" />
            {/* Sneaker bases */}
            <rect x="224" y="780" width="36" height="18" rx="6" fill="#24232C" stroke="#A3202B" strokeWidth="1.5" />
            <rect x="279" y="780" width="36" height="18" rx="6" fill="#24232C" stroke="#A3202B" strokeWidth="1.5" />
            <path d="M 224 792 L 260 792" stroke="#FFFFFF" strokeWidth="2.5" />
            <path d="M 279 792 L 315 792" stroke="#FFFFFF" strokeWidth="2.5" />
          </>
        ) : outfitStyle === 'outfit_2' ? (
          // School Cardigan: Dark navy knee socks & Brown polished loafers
          <>
            <path d="M 230 650 L 229 785 L 256 785 L 258 650 Z" fill="#141C2E" />
            <path d="M 282 650 L 283 785 L 310 785 L 309 650 Z" fill="#141C2E" />
            {/* Brown Loafers */}
            <rect x="225" y="782" width="35" height="16" rx="5" fill="#422517" stroke="#2B160C" strokeWidth="1.5" />
            <rect x="280" y="782" width="35" height="16" rx="5" fill="#422517" stroke="#2B160C" strokeWidth="1.5" />
            <ellipse cx="242" cy="787" rx="9" ry="3" fill="#693B24" />
            <ellipse cx="297" cy="787" rx="9" ry="3" fill="#693B24" />
          </>
        ) : (
          // Default: White Tabi Socks & Geta Sandals
          <>
            <path d="M 230 750 L 230 790 L 255 790 L 255 750 Z" fill="#FFFFFF" stroke="#DCD8D0" strokeWidth="1.5" />
            <path d="M 285 750 L 285 790 L 310 790 L 310 750 Z" fill="#FFFFFF" stroke="#DCD8D0" strokeWidth="1.5" />
            <rect x="226" y="788" width="33" height="12" rx="4" fill="#1C1B1F" />
            <rect x="281" y="788" width="33" height="12" rx="4" fill="#1C1B1F" />
            <path d="M 235 788 L 242 783 L 250 788" stroke="#FFFFFF" strokeWidth="2.5" fill="none" />
            <path d="M 290 788 L 297 783 L 305 788" stroke="#FFFFFF" strokeWidth="2.5" fill="none" />
          </>
        )}

        {/* --- Skirt / Lower Outfit --- */}
        {outfitStyle === 'outfit_1' ? (
          // Cyber Coder: Dark pleated tech skirt with glowing crimson seam
          <>
            <path
              d="M 210 440 L 330 440 L 338 580 L 202 580 Z"
              fill="#22212B"
              stroke="#15141C"
              strokeWidth="2"
            />
            {/* Pleats */}
            <path d="M 235 440 L 230 580" stroke="#131218" strokeWidth="2" />
            <path d="M 260 440 L 258 580" stroke="#131218" strokeWidth="2" />
            <path d="M 280 440 L 282 580" stroke="#131218" strokeWidth="2" />
            <path d="M 305 440 L 310 580" stroke="#131218" strokeWidth="2" />
            {/* Crimson Cyber Circuit Stripe */}
            <path d="M 205 565 L 335 565" stroke="#FF2E4D" strokeWidth="2.5" opacity="0.85" />
          </>
        ) : outfitStyle === 'outfit_2' ? (
          // School Cardigan: Classic Pleated Navy Skirt
          <>
            <path
              d="M 212 435 L 328 435 L 335 575 L 205 575 Z"
              fill="#1C2742"
              stroke="#131C30"
              strokeWidth="2"
            />
            <path d="M 236 435 L 232 575" stroke="#0E1626" strokeWidth="2" />
            <path d="M 260 435 L 258 575" stroke="#0E1626" strokeWidth="2" />
            <path d="M 280 435 L 282 575" stroke="#0E1626" strokeWidth="2" />
            <path d="M 304 435 L 308 575" stroke="#0E1626" strokeWidth="2" />
          </>
        ) : (
          // Default: Two-Tone Wrapped Skirt
          <>
            <path d="M 215 440 L 270 440 L 255 600 L 210 570 Z" fill="#EBE7DF" />
            <path d="M 215 440 L 270 440 L 255 600 L 210 570 Z" fill="url(#pinstripe)" />
            <path d="M 265 440 L 330 440 L 325 570 L 255 600 Z" fill="url(#crimsonGrad)" stroke="#680A14" strokeWidth="1.5" />
          </>
        )}

        {/* --- Torso & Sleeves --- */}
        {outfitStyle === 'outfit_1' ? (
          // Cyber Coder: Oversized Charcoal Tech Hoodie with neon accents
          <>
            <path
              d="M 190 310 C 190 310 270 330 270 330 C 270 330 350 310 350 310 L 342 450 L 198 450 Z"
              fill="#1C1C26"
              stroke="#111018"
              strokeWidth="2"
            />
            {/* Hoodie Collar & Drawstrings */}
            <path d="M 240 315 Q 270 340 300 315" stroke="#31303E" strokeWidth="4" fill="none" />
            <path d="M 258 335 L 256 390" stroke="#FF2E4D" strokeWidth="2" strokeLinecap="round" />
            <path d="M 282 335 L 284 390" stroke="#FF2E4D" strokeWidth="2" strokeLinecap="round" />
            {/* Tech Sleeves */}
            <path
              d="M 195 315 C 170 365 160 430 172 490 C 190 495 210 470 216 430 L 205 345 Z"
              fill="#1C1C26"
              stroke="#111018"
              strokeWidth="2"
            />
            <path
              d="M 345 315 C 370 365 380 430 368 490 C 350 495 330 470 324 430 L 335 345 Z"
              fill="#1C1C26"
              stroke="#111018"
              strokeWidth="2"
            />
            {/* Cyber Arm Accents */}
            <line x1="178" y1="380" x2="173" y2="450" stroke="#FF2E4D" strokeWidth="2.5" />
            <line x1="362" y1="380" x2="367" y2="450" stroke="#FF2E4D" strokeWidth="2.5" />
            {/* Hands */}
            <path d="M 172 485 C 168 505 178 525 186 520 C 190 512 190 495 186 485 Z" fill="#FCEEE2" />
            <path d="M 368 485 C 372 505 362 525 354 520 C 350 512 350 495 354 485 Z" fill="#FCEEE2" />
          </>
        ) : outfitStyle === 'outfit_2' ? (
          // School Cardigan: Cream oversized knit cardigan over white shirt with crimson bow
          <>
            <path
              d="M 192 310 C 192 310 270 325 270 325 C 270 325 348 310 348 310 L 340 455 L 200 455 Z"
              fill="#EFE8D6"
              stroke="#DDD2BA"
              strokeWidth="2"
            />
            {/* V-neck showing white shirt & red ribbon */}
            <path d="M 245 310 L 270 365 L 295 310 Z" fill="#FFFFFF" stroke="#E2DCCE" strokeWidth="1.5" />
            {/* Crimson Ribbon Bow */}
            <path d="M 262 335 C 254 328 254 345 262 340 Z" fill="#A3202B" />
            <path d="M 278 335 C 286 328 286 345 278 340 Z" fill="#A3202B" />
            <circle cx="270" cy="336" r="3.5" fill="#7D131C" />
            <path d="M 268 340 L 264 358" stroke="#A3202B" strokeWidth="2.2" />
            <path d="M 272 340 L 276 358" stroke="#A3202B" strokeWidth="2.2" />
            {/* Cardigan Buttons */}
            <circle cx="270" cy="380" r="3" fill="#6B533E" />
            <circle cx="270" cy="405" r="3" fill="#6B533E" />
            <circle cx="270" cy="430" r="3" fill="#6B533E" />
            {/* Soft Cardigan Sleeves */}
            <path
              d="M 195 315 C 168 370 155 435 168 495 C 188 500 210 475 218 435 L 205 345 Z"
              fill="#EFE8D6"
              stroke="#DDD2BA"
              strokeWidth="2"
            />
            <path
              d="M 345 315 C 372 370 385 435 372 495 C 352 500 330 475 322 435 L 335 345 Z"
              fill="#EFE8D6"
              stroke="#DDD2BA"
              strokeWidth="2"
            />
            {/* Hands */}
            <path d="M 168 490 C 164 510 174 530 182 525 C 186 517 186 500 182 490 Z" fill="#FCEEE2" />
            <path d="M 372 490 C 376 510 366 530 358 525 C 354 517 354 500 358 490 Z" fill="#FCEEE2" />
          </>
        ) : (
          // Default: Kimono Top & Wide Gradient Sleeves & Obi Bow
          <>
            <path d="M 200 310 L 270 380 L 340 310 L 350 440 L 190 440 Z" fill="#FFFFFF" stroke="#E2DDD5" strokeWidth="2" />
            <path d="M 235 310 L 270 375 L 250 440" stroke="#DCD6CB" strokeWidth="2" fill="none" />
            <path d="M 305 310 L 270 375 L 290 440" stroke="#DCD6CB" strokeWidth="2" fill="none" />
            <path d="M 195 310 C 160 370 145 440 160 510 C 185 520 210 490 220 440 L 205 350 Z" fill="url(#sleeveGradient)" stroke="#C8C0B5" strokeWidth="2" />
            <path d="M 345 310 C 380 370 395 440 380 510 C 355 520 330 490 320 440 L 335 350 Z" fill="url(#sleeveGradient)" stroke="#C8C0B5" strokeWidth="2" />
            <path d="M 165 490 C 160 515 170 535 180 530 C 185 520 185 500 180 490 Z" fill="#FCEEE2" stroke="#E8D5C4" />
            <path d="M 375 490 C 380 515 370 535 360 530 C 355 520 355 500 360 490 Z" fill="#FCEEE2" stroke="#E8D5C4" />
            <rect x="210" y="385" width="120" height="48" rx="4" fill="url(#crimsonGrad)" stroke="#660A13" strokeWidth="2" />
            <rect x="210" y="405" width="120" height="8" fill="#FFFFFF" />
            <path d="M 252 400 C 238 392 238 418 252 410 Z" fill="#FFFFFF" stroke="#D6D0C7" strokeWidth="1.5" />
            <path d="M 288 400 C 302 392 302 418 288 410 Z" fill="#FFFFFF" stroke="#D6D0C7" strokeWidth="1.5" />
            <rect x="262" y="399" width="16" height="12" rx="3" fill="#FFFFFF" stroke="#D6D0C7" strokeWidth="1" />
            <path d="M 266 411 L 264 435 L 273 433 L 272 411 Z" fill="#FFFFFF" />
            <path d="M 274 411 L 276 438 L 285 436 L 280 411 Z" fill="#FFFFFF" />
          </>
        )}

        {/* --- Neck & Collarbone --- */}
        <path d="M 248 260 L 248 315 L 292 315 L 292 260 Z" fill="#FCEEE2" />
        <path d="M 252 308 Q 270 316 288 308" stroke="#E5D0BF" strokeWidth="1.5" fill="none" />

        {/* --- Head Base Shape --- */}
        <path
          d="M 205 180 C 205 110 335 110 335 180 C 335 240 305 285 270 295 C 235 285 205 240 205 180 Z"
          fill="#FFF6EB"
        />

        {/* --- Soft Anime Blushing Cheeks --- */}
        <ellipse
          cx="235"
          cy="235"
          rx="18"
          ry="8"
          fill="#FF6B7A"
          opacity={isHappy || blush ? '0.55' : '0.22'}
        />
        <ellipse
          cx="305"
          cy="235"
          rx="18"
          ry="8"
          fill="#FF6B7A"
          opacity={isHappy || blush ? '0.55' : '0.22'}
        />

        {/* --- Delicate Nose --- */}
        <path d="M 269 228 Q 270 234 272 232" stroke="#DDA895" strokeWidth="2" strokeLinecap="round" />

        {/* --- Eyebrows --- */}
        {isHappy ? (
          <>
            <path d="M 226 175 Q 242 166 258 178" stroke="#25242A" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M 314 175 Q 298 166 282 178" stroke="#25242A" strokeWidth="3" strokeLinecap="round" fill="none" />
          </>
        ) : (
          <>
            <path d="M 226 176 Q 242 170 258 178" stroke="#25242A" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M 314 176 Q 298 170 282 178" stroke="#25242A" strokeWidth="3" strokeLinecap="round" fill="none" />
          </>
        )}

        {/* --- Left Eye with Blinking & Gaze Tracking --- */}
        <g id="leftEye">
          {blink ? (
            <path
              d="M 226 206 Q 242 216 258 206"
              stroke="#1C1822"
              strokeWidth="4.5"
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            <>
              <ellipse cx="242" cy="204" rx="16" ry="13" fill="#FFFFFF" />
              <g transform={`translate(${pupilOffsetX}, ${pupilOffsetY})`}>
                <ellipse cx="242" cy="204" rx="11" ry="12" fill="url(#eyeGlow)" />
                <ellipse cx="242" cy="204" rx="5" ry="7" fill="#1A0207" />
                <circle cx="239" cy="199" r="3.5" fill="#FFFFFF" />
                <circle cx="246" cy="207" r="1.8" fill="#FFFFFF" opacity="0.8" />
              </g>
              <path
                d="M 224 203 C 234 191 252 191 260 203"
                stroke="#1B1622"
                strokeWidth="4.5"
                strokeLinecap="round"
                fill="none"
              />
              <path d="M 258 200 L 263 196" stroke="#1B1622" strokeWidth="3" strokeLinecap="round" />
            </>
          )}
        </g>

        {/* --- Right Eye with Blinking & Gaze Tracking --- */}
        <g id="rightEye">
          {blink ? (
            <path
              d="M 282 206 Q 298 216 314 206"
              stroke="#1C1822"
              strokeWidth="4.5"
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            <>
              <ellipse cx="298" cy="204" rx="16" ry="13" fill="#FFFFFF" />
              <g transform={`translate(${pupilOffsetX}, ${pupilOffsetY})`}>
                <ellipse cx="298" cy="204" rx="11" ry="12" fill="url(#eyeGlow)" />
                <ellipse cx="298" cy="204" rx="5" ry="7" fill="#1A0207" />
                <circle cx="295" cy="199" r="3.5" fill="#FFFFFF" />
                <circle cx="302" cy="207" r="1.8" fill="#FFFFFF" opacity="0.8" />
              </g>
              <path
                d="M 280 203 C 290 191 308 191 316 203"
                stroke="#1B1622"
                strokeWidth="4.5"
                strokeLinecap="round"
                fill="none"
              />
              <path d="M 314 200 L 319 196" stroke="#1B1622" strokeWidth="3" strokeLinecap="round" />
            </>
          )}
        </g>

        {/* --- Mouth with Real-time Lip-Sync --- */}
        <g id="mouth">
          {mouthOpen > 0.15 ? (
            <path
              d={`M 260 252 Q 270 ${252 + mouthOpen * 26} 280 252 Q 270 ${252 + mouthOpen * 10} 260 252 Z`}
              fill="#941829"
              stroke="#D63A4D"
              strokeWidth="1.8"
            />
          ) : isHappy ? (
            <path
              d="M 261 251 Q 270 258 279 251"
              stroke="#8B2D3B"
              strokeWidth="2.8"
              strokeLinecap="round"
              fill="none"
            />
          ) : (
            <path
              d="M 264 253 Q 270 255 276 253"
              stroke="#8B2D3B"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          )}
        </g>

        {/* --- Developer / Coder Glasses in Cyber Outfit or Strict Dev --- */}
        {(outfitStyle === 'outfit_1' || companionMode === 'strict_dev') && (
          <g id="devGlasses" opacity="0.95">
            {/* Left & Right Rim Frames */}
            <rect x="220" y="190" width="44" height="28" rx="8" fill="rgba(120, 200, 255, 0.12)" stroke="#1B1622" strokeWidth="2.8" />
            <rect x="276" y="190" width="44" height="28" rx="8" fill="rgba(120, 200, 255, 0.12)" stroke="#1B1622" strokeWidth="2.8" />
            {/* Bridge */}
            <path d="M 264 202 L 276 202" stroke="#1B1622" strokeWidth="2.8" />
            {/* Temples */}
            <path d="M 220 200 L 206 195" stroke="#1B1622" strokeWidth="2.4" />
            <path d="M 320 200 L 334 195" stroke="#1B1622" strokeWidth="2.4" />
            {/* Modern Anti-reflective Glint */}
            <path d="M 226 195 L 244 195" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
            <path d="M 282 195 L 300 195" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
          </g>
        )}

        {/* --- Front Anime Bangs & Middle Parting --- */}
        {/* Left Side Bangs */}
        <path
          d="M 205 170 C 200 120 270 120 270 160 C 265 180 250 215 240 245 C 235 230 230 190 220 185 Z"
          fill="url(#hairGrad)"
        />
        {/* Right Side Bangs */}
        <path
          d="M 335 170 C 340 120 270 120 270 160 C 275 180 290 215 300 245 C 305 230 310 190 320 185 Z"
          fill="url(#hairGrad)"
        />

        {/* Center Forehead Wisps */}
        <path d="M 268 150 Q 270 178 266 195" stroke="#1B1A20" strokeWidth="2" strokeLinecap="round" />
        <path d="M 272 150 Q 271 180 275 198" stroke="#1B1A20" strokeWidth="2" strokeLinecap="round" />

        {/* Front Long Chest Hair Strands */}
        {/* Left chest strand */}
        <path
          d="M 215 190 C 195 260 190 360 215 420 C 220 380 225 310 230 250 Z"
          fill="url(#hairGrad)"
        />
        {/* Right chest strand */}
        <path
          d="M 325 190 C 345 260 350 360 325 420 C 320 380 315 310 310 250 Z"
          fill="url(#hairGrad)"
        />
      </svg>

      {/* Speaking Soundwaves Aura */}
      {activityState === 'speaking' && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none transition-all duration-150 -z-10"
          style={{
            background: `radial-gradient(circle, rgba(230, 39, 57, ${Math.min(
              0.45,
              audioLevel * 1.6
            )}) 0%, transparent 70%)`,
            transform: `scale(${1 + Math.min(0.28, audioLevel * 0.9)})`,
          }}
        />
      )}
    </div>
  );
};
