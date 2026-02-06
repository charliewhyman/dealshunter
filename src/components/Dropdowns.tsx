import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronsUpDown, X } from 'lucide-react';

// Types
interface Option {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  options: (string | Option)[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  isLoading?: boolean;
  label?: string;
}

interface SingleSelectDropdownProps {
  options: Option[];
  selected: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// Multi-select dropdown for shops and sizes
const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ 
  options, 
  selected, 
  onChange, 
  placeholder = "Select options",
  isLoading = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleOptionToggle = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter(item => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const removeItem = (value: string) => {
    onChange(selected.filter(item => item !== value));
  };

  return (
    <div ref={dropdownRef} className="relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[36px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 cursor-pointer flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
      >
        <div className="flex-1 flex flex-wrap gap-1">
          {selected.length > 0 ? (
            selected.map((item) => {
              // find label for selected value from options
              const opt = options.find(o => (typeof o === 'string' ? o === item : o.value === item));
              const labelNode: React.ReactNode = typeof opt === 'string' ? opt : opt ? opt.label : (typeof (item) === 'string' ? item : String(item));

              // If options are still loading and we don't have a label, show a neutral loading label
              const displayLabel = (!opt && (typeof (labelNode) === 'string') && labelNode === String(item) && isLoading)
                ? 'Loading…'
                : labelNode;

              return (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs rounded-md"
                >
                  {displayLabel}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeItem(item);
                    }}
                    className="hover:text-red-500 dark:hover:text-red-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })
          ) : (
            <span className="text-gray-500 dark:text-gray-400 text-sm">
              {placeholder}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-[60] max-h-60 overflow-y-auto">
          {options.length > 0 ? (
            options.map((option) => {
              const value = typeof option === 'string' ? option : option.value;
              const label = typeof option === 'string' ? option : option.label;
              const isSelected = selected.includes(value);
              
              return (
                <div
                  key={value}
                  onClick={() => handleOptionToggle(value)}
                  className={`px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{label}</span>
                    {isSelected && (
                      <div className="h-2 w-2 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400 text-sm">
              No options available
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Single select dropdown for sorting
const SingleSelectDropdown: React.FC<SingleSelectDropdownProps> = ({ 
  options, 
  selected, 
  onChange, 
  placeholder = "Select option",
  className,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleOptionSelect = (value: string) => {
    onChange(value);
    setIsOpen(false);
  };

  const selectedOption = options.find(option => option.value === selected);

  return (
    <div ref={dropdownRef} className="relative">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[34px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 cursor-pointer flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ChevronsUpDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className={`text-gray-900 dark:text-gray-100 text-sm ${className || ''}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-[60] max-h-60 overflow-y-auto">
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => handleOptionSelect(option.value)}
              className={`px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm ${
                selected === option.value 
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' 
                  : 'text-gray-900 dark:text-gray-100'
              }`}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export { MultiSelectDropdown, SingleSelectDropdown };
export type { Option, MultiSelectDropdownProps, SingleSelectDropdownProps };