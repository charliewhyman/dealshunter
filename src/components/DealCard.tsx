import { ArrowBigUp, ExternalLink, MessageCircle } from 'lucide-react';
import { Deal, Comment } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { redirect } from 'react-router-dom';

interface DealCardProps {
    deal: Deal;
    comment: Comment;
    onVote: (dealId: string) => void;
  }

  export function DealCard({ deal, onVote, comment }: DealCardProps) {
    return (
        <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <div className="flex gap-4 flex-wrap">
                <div className="flex-shrink-0">
                    <img
                        src={deal.image_url}
                        alt={deal.title}
                        className="w-24 h-24 object-cover rounded-lg"
                    />
                </div>

                <div className="flex-grow">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-gray-900">
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
                    <p className="text-gray-600 mt-2">{deal.description}</p>

                    <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-green-600">
                                ${deal.price}
                            </span>
                            <span className="text-sm text-gray-500 line-through">
                                ${deal.original_price}
                            </span>
                            <span className="text-sm font-medium text-green-600">
                                {deal.discount_percentage}% off
                            </span>
                        </div>
                        <div className="flex gap-4">
                        <button
                            onClick={() => onVote(deal.id)}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-400 hover:bg-gray-200 transition-colors"
                        >
                            <ArrowBigUp className="w-4 h-4" />
                            <span>{deal.votes}</span>
                        </button>
                        <button
                            onClick={() => redirect(`/deals/${deal.id}`)}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-400 hover:bg-gray-200 transition-colors"
                        >
                            <MessageCircle className="w-4 h-4" />
                            <span>{deal.comments}</span>
                        </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-2 text-sm text-gray-500">
                Posted {formatDistanceToNow(new Date(deal.created_at))} ago
            </div>
        </div>
    );
}
