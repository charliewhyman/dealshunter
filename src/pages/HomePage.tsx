import React, { useEffect, useState } from 'react';
import { Deal } from '../types';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';
import { DealCard } from '../components/DealCard';

export function HomePage() {
    const [deals, setDeals] = useState<Deal[]>([]);
    const [loading, setLoading] = useState(true);


    useEffect(() => {
        fetchDeals();
      }, []);
    
    // Function to fetch deals from Supabase
    async function fetchDeals() {
    try {
        const { data, error } = await supabase
        .from('deals')
        .select('*')
        .order('votes', { ascending: false });

        if (error) throw error;
        setDeals(data || []);
    } catch (error) {
        console.error('Error fetching deals:', error);
    } finally {
        setLoading(false);
    }
    }
  
    // Function to handle voting
    async function handleVote(dealId: string) {
        try {
          const { error } = await supabase.rpc('increment_votes', {
            deal_id: dealId
          });
    
          if (error) throw error;
          await fetchDeals();
        } catch (error) {
          console.error('Error voting:', error);
        }
      }

    // handle loading
    if (loading) {
        return (
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        );
      }
    
    // map through deals and render DealCard components
    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
          {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            onVote={handleVote}
          />
        ))}
          </div>
        </div>
      );
}