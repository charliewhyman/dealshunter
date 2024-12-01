import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://arykyvofzxhxbfviccyo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyeWt5dm9menhoeGJmdmljY3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMwNjcxNjMsImV4cCI6MjA0ODY0MzE2M30.bQTiVAM84qzqyfL6FmEpzWauOLFpba8ZtK3DZSGj4rc';

export const supabase = createClient(supabaseUrl, supabaseKey);