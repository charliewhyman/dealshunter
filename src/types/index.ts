//Supabase types

export interface User {
    id: string;
    email: string;
    username: string;
    avatar_url?: string;
  }

  export interface Deal {
    id: string;
    title: string;
    description: string;
    url: string;
    price: number;
    original_price: number;
    discount_percentage: number;
    image_url: string;
    votes: number;
    created_at: string;
    user_id: string;
  }