const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, './.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: {
    persistSession: false
}
});

async function insertLog(tableName, logData, mapLogData) {
    const mappedData = mapLogData(logData);
    const { data, error } = await supabase
        .from(tableName)
        .insert([mappedData]);

    if (error) throw error;
    return data;
}

module.exports = {
    insertLog,
};
