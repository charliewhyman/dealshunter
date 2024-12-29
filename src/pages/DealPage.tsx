import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Deal, Comment } from '../types';

function DealPage() {
  const { dealId } = useParams<{ dealId: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDealData = async () => {
      try {
        // Fetch deal details
        const { data: dealData, error: dealError } = await supabase
          .from('deals')
          .select('*')
          .eq('id', dealId)
          .single();

        if (dealError) throw dealError;
        setDeal(dealData);

        // Fetch comments for the deal
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
      <h1 className="text-xl font-bold">{deal.title}</h1>
      <img src={deal.image_url} alt={deal.title} className="my-4" />
      <p>{deal.description}</p>
      <p>Price: ${deal.price}</p>
      <p>Delivery Price: ${deal.delivery_price ?? 'Free'}</p>
      <a
        href={deal.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 underline"
      >
        View Deal
      </a>

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
