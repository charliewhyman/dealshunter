import React, { useState } from 'react';


export function SubmitDealPage() {
  const [loading, setLoading] = useState(false);
 
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Submit a New Deal</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
      </form>
    </div>
  );
}