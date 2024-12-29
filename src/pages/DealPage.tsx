import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Deal, Comment } from '../types';
import { ExternalLink } from 'lucide-react';

function DealPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDealData = async () => {
      try {
        const { data: dealData, error: dealError } = await supabase
          .from('deals')
          .select('*')
          .eq('id', dealId)
          .single();

        if (dealError) throw dealError;
        setDeal(dealData);

        const { data: commentsData, error: commentsError } = await supabase
          .from('comments')
          .select('*')
          .eq('deal_id', dealId)
          .order('created_at', { ascending: false });

        if (commentsError) throw commentsError;
        setComments(commentsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (dealId) fetchDealData();
  }, [dealId]);

  if (loading) return <p className="text-gray-900">Loading...</p>;
  if (!deal) return <p className="text-gray-900">Deal not found.</p>;

  return (
    <div className="text-gray-900">
      <div className="flex gap-6 items-center">
        {/* Photo Section */}
        <img
          src={deal.image_url}
          alt={deal.title}
          className="w-1/3 object-cover rounded-md"
        />

        {/* Deal Details */}
        <div className="flex-1 flex flex-col gap-4">
          <h1 className="text-2xl font-bold">{deal.title}</h1>
          <span className="text-2xl font-bold text-green-600">${deal.price.toFixed(2)}</span>
          {deal.original_price && (
            <p className="text-sm text-gray-500 line-through">
              ${deal.original_price.toFixed(2)}
            </p>
          )}
          <p className="text-lg">{deal.description}</p>
          <a
            href={deal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 hover:text-white w-1/3"
          >
            <span className="flex-1 text-center">Get Deal</span>
            <ExternalLink className="w-5 h-5 text-white" />
          </a>
        </div>
      </div>

      {/* Comments Section */}
      <h2 className="text-lg font-semibold mt-6">Comments</h2>
      {comments.length > 0 ? (
        <ul>
          {comments.map((comment) => (
            <li key={comment.id} className="mb-4">
              <p>
                <strong>User {comment.user_id ?? 'Anonymous'}:</strong> {comment.comment_text}
              </p>
              <small>Posted on {new Date(comment.created_at).toLocaleString()}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p>No comments yet.</p>
      )}
    </div>
  );
}

export default DealPage;
