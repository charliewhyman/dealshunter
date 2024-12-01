import React, { useEffect, useState } from 'react';
import { Deal } from '../types';
import { supabase } from '../lib/supabase';


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

    // handle loading

    // map through deals and render DealCard components
}