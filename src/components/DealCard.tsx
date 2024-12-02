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
            <div className="flex-grow">
                <div className="flex items-center justify-between">
                    <h2 className='text-gray-900'>
                        {deal.title}
                    </h2>
                    <a
                        href={deal.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                        >
                            Link
                        </a>
                </div>
            </div>
        <button 
        onClick={() => onVote(deal.id)}
        >
        </button>
        </div>
    </div>
);
}