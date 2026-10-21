// components/FilterButton.tsx
import type { ReactNode } from 'react';

type FilterButtonProps = {
  onClick: () => void;
  children: ReactNode;
};

export function FilterButton({ onClick, children }: FilterButtonProps) {
  return (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  );
}