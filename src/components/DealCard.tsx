import { Deal } from '../types';

interface DealCardProps {
    deal: Deal;
    onVote: (dealId: string) => void;
  }

export function DealCard({ deal, onVote }: DealCardProps) {
return (
    <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
        <div className="flex gap-4">
            <div className="flex-shrink-0">
                <img
                    src={deal.image_url}
                    alt={deal.title}
                    className="w-24 h-24 object-cover rounded-lg"
                />
            </div>
            <h2 className='text-gray-900'>
                {deal.title}
            </h2>
        <button 
        onClick={() => onVote(deal.id)}
        >
        </button>
        </div>
    </div>
);
}