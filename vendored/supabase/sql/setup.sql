-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Function to enable pgvector extension (used by the SupabaseVectorStore)
CREATE OR REPLACE FUNCTION enable_pgvector_extension()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
END;
$$;

-- Function to execute arbitrary SQL (used by the SupabaseVectorStore for initialization)
CREATE OR REPLACE FUNCTION execute_sql(query text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE query;
END;
$$;

-- Function to create a memory table with appropriate policies
CREATE OR REPLACE FUNCTION create_memory_table_with_policies(table_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create the table if it doesn't exist
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )', table_name);
    
  -- Enable Row Level Security
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  
  -- First, drop any existing policies to avoid conflicts when recreating
  BEGIN
    EXECUTE format('DROP POLICY IF EXISTS "Allow all users to read from %I" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Allow service_role to insert into %I" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Allow service_role to update %I" ON %I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Allow service_role to delete from %I" ON %I', table_name, table_name);
  EXCEPTION
    WHEN OTHERS THEN
      -- Ignore errors from dropping non-existent policies
      NULL;
  END;
  
  -- Create policies
  -- Allow all users to read
  EXECUTE format('
    CREATE POLICY "Allow all users to read from %I" 
    ON %I 
    FOR SELECT 
    TO authenticated, anon 
    USING (true)', table_name, table_name);
    
  -- Allow only service_role to insert
  EXECUTE format('
    CREATE POLICY "Allow service_role to insert into %I" 
    ON %I 
    FOR INSERT 
    TO service_role 
    WITH CHECK (true)', table_name, table_name);
    
  -- Allow only service_role to update
  EXECUTE format('
    CREATE POLICY "Allow service_role to update %I" 
    ON %I 
    FOR UPDATE 
    TO service_role 
    WITH CHECK (true)', table_name, table_name);
    
  -- Allow only service_role to delete
  EXECUTE format('
    CREATE POLICY "Allow service_role to delete from %I" 
    ON %I 
    FOR DELETE 
    TO service_role 
    USING (true)', table_name, table_name);
    
  RAISE NOTICE 'Created memory table % with security policies', table_name;
END;
$$;

-- Example table creation (this is done programmatically in the SupabaseVectorStore)
-- CREATE TABLE IF NOT EXISTS embeddings (
--   id TEXT PRIMARY KEY,
--   content TEXT,
--   embedding VECTOR(1536),
--   metadata JSONB
-- );

-- Example similarity search function (this is created programmatically in the SupabaseVectorStore)
-- CREATE OR REPLACE FUNCTION match_embeddings(
--   query_embedding VECTOR(1536),
--   match_threshold FLOAT,
--   match_count INT,
--   filter_metadata JSONB DEFAULT NULL,
--   filter_ids TEXT[] DEFAULT NULL
-- ) 
-- RETURNS TABLE (
--   id TEXT,
--   content TEXT,
--   metadata JSONB,
--   similarity FLOAT
-- )
-- LANGUAGE plpgsql
-- AS $$
-- BEGIN
--   RETURN QUERY
--   SELECT
--     t.id,
--     t.content,
--     t.metadata,
--     1 - (t.embedding <=> query_embedding) as similarity
--   FROM embeddings t
--   WHERE
--     (filter_metadata IS NULL OR t.metadata @> filter_metadata) AND
--     (filter_ids IS NULL OR t.id = ANY(filter_ids)) AND
--     1 - (t.embedding <=> query_embedding) > match_threshold
--   ORDER BY similarity DESC
--   LIMIT match_count;
-- END;
-- $$; 