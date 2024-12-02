import React from 'react';
import { Deal } from '../types';

interface DealCardProps {
    deal: Deal;
    onVote: (dealId: string) => void;
  }

export function DealCard({ deal, onVote }: DealCardProps) {
return (
    <div>
    <h1>{deal.title}</h1>
    <button
            onClick={() => onVote(deal.id)}
        >
    </button>
    </div>
);
}