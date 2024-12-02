import { ArrowBigUp, ExternalLink } from 'lucide-react';
import { Deal } from '../types';
import { formatDistanceToNow } from 'date-fns';

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
                        <ExternalLink className="w-5 h-5" />
                    </a>
                </div>
            </div>
            <p className="text-gray-600 mt-2">{deal.description}</p>
            <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-green-600">
                    ${deal.price}
                </span>
                <span className="text-sm text-gray-500 line-through">
                    ${deal.original_price}
                </span>
                <span className="text-sm font-medium text-green-600">
                    {deal.discount_percentage}% OFF
                </span>
                </div>
            </div>
        <button
            onClick={() => onVote(deal.id)}
            className="flex items-center gap-1 px-3 py-1 rounded-full bg-gray-400 hover:bg-gray-200 transition-colors"
        >
            <ArrowBigUp className="w-4 h-4" />
            <span>{deal.votes}</span>
        </button>
        </div>
        <div className="mt-2 text-sm text-gray-500">
            Posted {formatDistanceToNow(new Date(deal.created_at))} ago
          </div>
    </div>
);
}