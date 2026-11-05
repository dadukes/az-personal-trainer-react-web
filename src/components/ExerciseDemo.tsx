import { Dumbbell, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getExerciseDetail, type ExerciseDetail } from '@/lib/api';

/** The exercise's ExerciseDB picture, playing its video on a click when there is one. */
export function ExerciseDemo({
  exerciseId,
  name,
  accessToken,
  onCues,
  showName = true,
  heightClass = 'h-[180px]',
}: {
  exerciseId?: string;
  name: string;
  accessToken?: string;
  onCues: (cues: string[]) => void;
  /** Off where the name is already right above the card. */
  showName?: boolean;
  heightClass?: string;
}) {
  const [fetchedImageUrl, setImageUrl] = useState<string | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const [loadedImageUrl, setLoadedImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  // A failed picture counts as none: catalog files can be missing, and a network can block them.
  const imageUrl = fetchedImageUrl !== failedImageUrl ? fetchedImageUrl : null;
  const imageLoaded = imageUrl !== null && imageUrl === loadedImageUrl;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onCuesRef = useRef(onCues);
  onCuesRef.current = onCues;

  useEffect(() => {
    let active = true;
    setImageUrl(null);
    setVideoUrl(null);
    setPlaying(false);
    if (!exerciseId || !accessToken) return;

    void (async () => {
      try {
        const result = await getExerciseDetail(accessToken, exerciseId);
        if (!active) return;
        const ex: ExerciseDetail = result.exercise;
        setImageUrl(ex.image_url ?? ex.gif_url ?? null);
        setVideoUrl(ex.video_url);
        // v2 `tips` read as short form cues; fall back to step instructions.
        const source = ex.tips.length > 0 ? ex.tips : ex.instructions;
        onCuesRef.current(source.slice(0, 4));
      } catch {
        // Catalog unavailable — keep the placeholder.
      }
    })();
    return () => {
      active = false;
    };
  }, [exerciseId, accessToken]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!videoUrl || !el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play();
      setPlaying(true);
    }
  }, [videoUrl, playing]);

  return (
    <button
      onClick={togglePlay}
      disabled={!videoUrl}
      className={`relative flex ${heightClass} w-full items-end overflow-hidden rounded-[18px] disabled:cursor-default ${imageLoaded || playing ? 'bg-white' : ''}`}
      style={{ background: imageLoaded || playing ? undefined : 'var(--bg-subtle)', border: '1px solid var(--border-base)' }}
    >
      {/* Placeholder, until a picture has arrived */}
      {!imageLoaded && !playing ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--bg-subtle)' }}>
          <Dumbbell size={34} color="var(--accent)" />
        </div>
      ) : null}

      {/* Poster */}
      {imageUrl && !playing ? (
        <img
          src={imageUrl}
          alt=""
          onLoad={() => setLoadedImageUrl(imageUrl)}
          onError={() => setFailedImageUrl(imageUrl)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : null}

      {/* Video (kept mounted so playback controls work; hidden until playing) */}
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-contain"
          style={{ opacity: playing ? 1 : 0 }}
        />
      ) : null}

      {/* Play affordance */}
      {videoUrl && !playing ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.92)' }}>
            <Play size={22} color="var(--on-aqua)" fill="var(--on-aqua)" />
          </div>
        </div>
      ) : null}

      <span
        className="absolute left-3 top-3 rounded-md px-2 py-1 text-[10px] font-extrabold tracking-[0.08em] text-white"
        style={{ background: 'var(--scrim)' }}
      >
        FORM DEMO
      </span>

      {!playing && showName ? (
        // Scrim chip, matching the FORM DEMO badge. A bare text-shadow is not
        // enough here: the poster is `object-contain`, so the bottom-left corner
        // this label sits in is letterboxed card background, not image — and with
        // no catalog match there is no image at all. White-on-light either way.
        <span
          className="relative m-3.5 max-w-[calc(100%-28px)] truncate rounded-lg px-2.5 py-1 text-[18px] font-extrabold text-white"
          style={{ background: 'var(--scrim)' }}
        >
          {name}
        </span>
      ) : null}
    </button>
  );
}
