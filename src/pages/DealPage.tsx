import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Deal, CommentWithUser } from '../types';
import { ExternalLink } from 'lucide-react';
import CommentsList from '../components/CommentsList';

function DealPage() {

  const { dealId } = useParams<{ dealId: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [comments, setComments] = useState<CommentWithUser[]>([]); // Updated to CommentWithUser[]
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

        // Query the  view
        // Query to get comment data and parent comment's text for replies
        let { data: commentsData, error: commentsError } = await supabase
          .from('comments')
          .select(`
            *,
            deals (
              id
            ),
            profiles (
              username
            ),
            parent_comment: reply_of (
              comment_text,
              profiles (
                username
              )
            )
          `)
          .eq('deals.id', dealId);

        if (commentsError) throw commentsError;

        setComments(commentsData as CommentWithUser[]);
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
    <div className="p-6">
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
              className="relative flex items-center justify-center gap-2 px-3 py-1 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 w-1/3"
            >
              <span className="flex-1 text-center">Get Deal</span>
              <ExternalLink className="w-5 h-5 text-white" />
            </a>
          </div>
        </div>

        {/* Comments Section */}
        <div className="container mx-auto mt-8">
          <h1 className="text-2xl font-bold mb-4">Comments</h1>
          <CommentsList comments={comments} />
          </div>
      </div>
    </div>
  );
}

export default DealPage;
