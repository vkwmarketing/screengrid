const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  SUPABASE_URL / SUPABASE_SERVICE_KEY not set — running in limited mode (no database).');
  module.exports = null;
} else {
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  console.log('✅ Supabase connected');
  module.exports = supabase;
}
