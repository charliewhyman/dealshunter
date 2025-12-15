import React, { useEffect, useState } from 'react';
import { Range } from 'react-range';

type TransformSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onFinalChange: (values: number[]) => void;
};

export default function TransformSlider({ min, max, step = 1, value, onFinalChange }: TransformSliderProps) {
  const [internalValues, setInternalValues] = useState<[number, number]>([value[0], value[1]]);

  // Keep internal UI values in sync when parent value changes
  useEffect(() => {
    setInternalValues([value[0], value[1]]);
  }, [value[0], value[1]]);

  return (
    <div className="w-full px-1">
      <Range
        step={step}
        min={min}
        max={max}
        values={[internalValues[0], internalValues[1]]}
        onChange={(vals) => setInternalValues([vals[0], vals[1]])}
        onFinalChange={(vals) => {
          setInternalValues([vals[0], vals[1]]);
          onFinalChange(vals);
        }}
        renderTrack={({ props, children }) => {
          const { key: trackKey, style: trackStyle, ...trackProps } = props as any;
          return (
            <div
              key={trackKey}
              {...trackProps}
              className="relative h-2 rounded-full bg-gray-200 w-full"
              style={{ ...trackStyle }}
              aria-hidden
            >
              <div
                className="absolute h-full bg-blue-600 rounded-full"
                style={{
                  left: `${((internalValues[0] - min) / (max - min)) * 100}%`,
                  width: `${((internalValues[1] - internalValues[0]) / (max - min)) * 100}%`,
                }}
              />
              {children}
            </div>
          );
        }}
        renderThumb={({ props, index }) => {
          const { key: thumbKey, style: thumbStyle, ...thumbProps } = props as any;
          const valNow = index === 0 ? internalValues[0] : internalValues[1];
          return (
            <div
              key={thumbKey}
              {...thumbProps}
              role="slider"
              aria-label={index === 0 ? 'Minimum price' : 'Maximum price'}
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={valNow}
              className="w-4 h-4 bg-white border border-gray-300 rounded-full shadow-sm flex items-center justify-center"
              style={{ ...thumbStyle }}
            >
              <div className="sr-only">{index === 0 ? `Min ${valNow}` : `Max ${valNow}`}</div>
            </div>
          );
        }}
      />
    </div>
  );
}
