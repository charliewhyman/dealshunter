import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';


export function SubmitDealPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        url: '',
        price: '',
        original_price: '',
        image_url: '',
    });

  // Check if user is logged in
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-center text-gray-600">
          Please sign in to submit a deal.
        </p>
      </div>
    );
  }

  // function to handle form submission to supabase
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const price = parseFloat(formData.price);
    const original_price = parseFloat(formData.original_price);
    const discount_percentage = Math.round(
      ((original_price - price) / original_price) * 100
    );

    try {
      const { error } = await supabase.from('deals').insert([{
        ...formData,
        price,
        original_price,
        discount_percentage,
        user_id: user!.id,
        votes: 0,
      }]);

      if (error) throw error;
      navigate('/');
    } catch (error) {
      console.error('Error submitting deal:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Submit a New Deal</h1>
      <form className="space-y-6">
      <div>
          <label className="block text-sm font-medium text-gray-700">
            Title
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Description
          </label>
          <textarea
            name="description"
            value={formData.description}
            rows={3}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Deal URL
          </label>
          <input
            type="url"
            name="url"
            value={formData.url}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Deal Price ($)
            </label>
            <input
              type="number"
              name="price"
              value={formData.price}
              step="0.01"
              min="0"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Original Price ($)
            </label>
            <input
              type="number"
              name="original_price"
              value={formData.original_price}
              step="0.01"
              min="0"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Image URL
          </label>
          <input
            type="url"
            name="image_url"
            value={formData.image_url}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white rounded-md py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Submitting...' : 'Submit Deal'}
        </button>
      </form>
    </div>
  );
}