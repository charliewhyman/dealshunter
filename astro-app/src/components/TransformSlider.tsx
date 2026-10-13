import { useEffect, useState } from 'react';
import { Range } from 'react-range';

type TransformSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange?: (values: [number, number]) => void;
  onFinalChange?: (values: [number, number]) => void;
  formatLabel?: (value: number) => string;
};

export default function TransformSlider({ 
  min, 
  max, 
  step = 1, 
  value, 
  onChange,
  onFinalChange 
}: TransformSliderProps) {
  const minVal = value[0];
  const maxVal = value[1];

  const [internalValues, setInternalValues] = useState<[number, number]>([minVal, maxVal]);

  // Keep internal UI values in sync when parent value changes
  useEffect(() => {
    setInternalValues([minVal, maxVal]);
  }, [minVal, maxVal]);

  const handleChange = (vals: number[]) => {
    const newValues = [vals[0], vals[1]] as [number, number];
    setInternalValues(newValues);
    if (onChange) {
      onChange(newValues);
    }
  };

  const handleFinalChange = (vals: number[]) => {
    const newValues = [vals[0], vals[1]] as [number, number];
    setInternalValues(newValues);
    if (onFinalChange) {
      onFinalChange(newValues);
    }
  };

  return (
    <div className="w-full px-1">
      <Range
        step={step}
        min={min}
        max={max}
        values={[internalValues[0], internalValues[1]]}
        onChange={handleChange}
        onFinalChange={handleFinalChange}
        renderTrack={({ props, children }) => {
          const { style: trackStyle, ...trackProps } = props;
          return (
            <div
              {...trackProps}
              className="relative h-2 rounded-full bg-gray-200 w-full"
              style={{ ...trackStyle }}
            >
              <div
                className="absolute h-full bg-blue-600 rounded-full"
                style={{
                  left: 0,
                  width: '100%',
                  transformOrigin: 'left center',
                  transform: `translateX(${((internalValues[0] - min) / (max - min)) * 100}%) scaleX(${((internalValues[1] - internalValues[0]) / (max - min))})`,
                  willChange: 'transform',
                }}
              />
              {children}
            </div>
          );
        }}
        renderThumb={({ props, index }) => {
          const { style: thumbStyle, key: thumbKey, ...thumbProps } = props;
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
            </div>
          );
        }}
      />
    </div>
  );
}
