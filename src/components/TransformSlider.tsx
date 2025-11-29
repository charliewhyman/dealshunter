import React, { useEffect, useRef } from 'react';

type TransformSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onFinalChange: (values: number[]) => void;
};

function clamp(n: number, a: number, b: number) {
  return Math.min(Math.max(n, a), b);
}

function toNearestStep(value: number, step: number, min: number) {
  const relative = value - min;
  const rounded = Math.round(relative / step) * step;
  return min + rounded;
}

export default function TransformSlider({ min, max, step = 1, value, onFinalChange }: TransformSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const leftThumbRef = useRef<HTMLDivElement | null>(null);
  const rightThumbRef = useRef<HTMLDivElement | null>(null);
  const rangeFillRef = useRef<HTMLDivElement | null>(null);

  // Utility to set thumb positions (in percent) and fill
  const setPositions = React.useCallback((low: number, high: number) => {
    const percentLow = ((low - min) / (max - min)) * 100;
    const percentHigh = ((high - min) / (max - min)) * 100;
    if (leftThumbRef.current) {
      leftThumbRef.current.style.left = `${percentLow}%`;
      leftThumbRef.current.style.transform = 'translateX(-50%)';
    }
    if (rightThumbRef.current) {
      rightThumbRef.current.style.left = `${percentHigh}%`;
      rightThumbRef.current.style.transform = 'translateX(-50%)';
    }
    if (rangeFillRef.current) {
      rangeFillRef.current.style.left = `${percentLow}%`;
      rangeFillRef.current.style.width = `${Math.max(0, percentHigh - percentLow)}%`;
    }
  }, [min, max]);

  // Initialize positions from props
  useEffect(() => {
    setPositions(value[0], value[1]);
  }, [value, setPositions]);

  useEffect(() => {
    let activeThumb: 'min' | 'max' | null = null;
    let pointerId: number | null = null;
    let trackRect: DOMRect | null = null;

    function getValueFromEvent(ev: PointerEvent) {
      const track = trackRef.current;
      if (!track) return null;
      const rect = trackRect ?? track.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const percent = clamp(x / (rect.width || 1), 0, 1);
      const rawValue = min + percent * (max - min);
      const stepped = toNearestStep(rawValue, step, min);
      return clamp(stepped, min, max);
    }

    function onPointerMove(ev: PointerEvent) {
      if (pointerId !== null && ev.pointerId !== pointerId) return;
      ev.preventDefault();
      const val = getValueFromEvent(ev);
      if (val === null) return;
      if (!activeThumb) return;

      let low = value[0];
      let high = value[1];

      if (activeThumb === 'min') {
        low = Math.min(val, high - step);
      } else {
        high = Math.max(val, low + step);
      }

      // Update visuals directly without React state
      setPositions(low, high);

      // store to dataset for commit on pointerup
      if (trackRef.current) {
        trackRef.current.dataset.pendingLow = String(low);
        trackRef.current.dataset.pendingHigh = String(high);
      }
    }

    function onPointerUp(ev: PointerEvent) {
      if (pointerId !== null && ev.pointerId !== pointerId) return;
      ev.preventDefault();
      // commit values
      const track = trackRef.current;
      if (track) {
        const low = track.dataset.pendingLow ? parseFloat(track.dataset.pendingLow) : value[0];
        const high = track.dataset.pendingHigh ? parseFloat(track.dataset.pendingHigh) : value[1];
        onFinalChange([Math.min(low, high), Math.max(low, high)]);
        delete track.dataset.pendingLow;
        delete track.dataset.pendingHigh;
      }

      activeThumb = null;
      if (pointerId !== null) {
        window.removeEventListener('pointermove', onPointerMove as unknown as EventListener);
        window.removeEventListener('pointerup', onPointerUp as unknown as EventListener);
        window.removeEventListener('pointercancel', onPointerUp as unknown as EventListener);
        pointerId = null;
      }
    }

    function startPointerCapture(ev: PointerEvent, thumb: 'min' | 'max') {
      const t = ev.target as Element;
      try {
        (t as HTMLElement).setPointerCapture(ev.pointerId);
      } catch (err) { void err; }
      activeThumb = thumb;
      pointerId = ev.pointerId;
      // Cache track rect once at pointerdown to avoid layout reads on every move
      if (trackRef.current) trackRect = trackRef.current.getBoundingClientRect();
      window.addEventListener('pointermove', onPointerMove as unknown as EventListener, { passive: false });
      window.addEventListener('pointerup', onPointerUp as unknown as EventListener);
      window.addEventListener('pointercancel', onPointerUp as unknown as EventListener);
    }

    function onThumbPointerDown(ev: PointerEvent) {
      startPointerCapture(ev, (ev.currentTarget === leftThumbRef.current) ? 'min' : 'max');
    }

    function onTrackPointerDown(ev: PointerEvent) {
      // click on track: move nearest thumb and commit
      // compute rect once for this click
      if (trackRef.current) trackRect = trackRef.current.getBoundingClientRect();
      const val = getValueFromEvent(ev);
      if (val === null) return;
      const distToLow = Math.abs(val - value[0]);
      const distToHigh = Math.abs(val - value[1]);
      const useThumb: 'min' | 'max' = distToLow <= distToHigh ? 'min' : 'max';
      let low = value[0];
      let high = value[1];
      if (useThumb === 'min') {
        low = Math.min(val, high - step);
      } else {
        high = Math.max(val, low + step);
      }
      setPositions(low, high);
      onFinalChange([Math.min(low, high), Math.max(low, high)]);
    }

    const leftThumb = leftThumbRef.current;
    const rightThumb = rightThumbRef.current;
    const track = trackRef.current;
    if (leftThumb) leftThumb.addEventListener('pointerdown', onThumbPointerDown as EventListener);
    if (rightThumb) rightThumb.addEventListener('pointerdown', onThumbPointerDown as EventListener);
    if (track) track.addEventListener('pointerdown', onTrackPointerDown as EventListener);

    return () => {
      if (leftThumb) leftThumb.removeEventListener('pointerdown', onThumbPointerDown as EventListener);
      if (rightThumb) rightThumb.removeEventListener('pointerdown', onThumbPointerDown as EventListener);
      if (track) track.removeEventListener('pointerdown', onTrackPointerDown as EventListener);
      window.removeEventListener('pointermove', onPointerMove as unknown as EventListener);
      window.removeEventListener('pointerup', onPointerUp as unknown as EventListener);
      window.removeEventListener('pointercancel', onPointerUp as unknown as EventListener);
    };
  }, [min, max, step, value, onFinalChange]);

  return (
    <div className="w-full px-1">
      <div
        ref={trackRef}
        className="relative h-2 rounded-full bg-gray-200"
        style={{ touchAction: 'none' }}
      >
        <div ref={rangeFillRef} className="absolute h-full bg-blue-600 rounded-full" style={{ left: 0, width: 0 }} />
        <div
          ref={leftThumbRef}
          role="slider"
          aria-label="Minimum price"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value[0]}
          tabIndex={0}
          className="absolute -top-2 w-4 h-4 bg-white border border-gray-300 rounded-full shadow-sm"
          style={{ transform: 'translateX(-50%)', willChange: 'transform' }}
        />
        <div
          ref={rightThumbRef}
          role="slider"
          aria-label="Maximum price"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value[1]}
          tabIndex={0}
          className="absolute -top-2 w-4 h-4 bg-white border border-gray-300 rounded-full shadow-sm"
          style={{ transform: 'translateX(-50%)', willChange: 'transform' }}
        />
      </div>
    </div>
  );
}
