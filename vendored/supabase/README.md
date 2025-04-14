# @daydreamsai/supabase

Supabase implementation of the MemoryStore interface for DaydreamsAI.

## Installation

```bash
# If using npm
npm install @daydreamsai/supabase

# If using yarn
yarn add @daydreamsai/supabase

# If using pnpm
pnpm add @daydreamsai/supabase

# If using bun
bun add @daydreamsai/supabase
```

## Setup

Before using this package, you need to set up a Supabase project:

1. Create a new project at [supabase.com](https://supabase.com)
2. Get your project URL and API key from the project settings
3. Create the required Postgres function in your Supabase SQL editor:

```sql
-- This function allows automatic table creation
CREATE OR REPLACE FUNCTION create_table_if_not_exists(table_name TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  ', table_name);
END;
$$ LANGUAGE plpgsql;
```

The package will automatically create tables as needed by calling this function.

## Usage

```typescript
import { createSupabaseMemoryStore } from '@daydreamsai/supabase';

// Create and initialize the store
const store = await createSupabaseMemoryStore({
  url: 'https://your-project-id.supabase.co',
  apiKey: 'your-supabase-api-key',
  tableName: 'my_conversations' // Optional, defaults to "conversations"
  // autoCreateTable: true, // Optional, defaults to true
});

// Use in your application
await store.set('user123', { messages: [...] });
const data = await store.get('user123');
```

### Integration with DaydreamsAI

```typescript
import { createDreams } from '@daydreamsai/core';
import { createSupabaseMemoryStore } from '@daydreamsai/supabase';
import { createVectorStore } from 'some-vector-store';

const supabaseStore = await createSupabaseMemoryStore({
  url: process.env.SUPABASE_URL!,
  apiKey: process.env.SUPABASE_API_KEY!,
  tableName: 'dreams'
});

const vectorStore = createVectorStore({
  // vector store configuration
});

const agent = createDreams({
  memory: {
    store: supabaseStore,
    vector: vectorStore,
  },
  // other configuration
});
```

## Table Naming

The package automatically sanitizes table names to be PostgreSQL compatible:
- Hyphens and special characters are replaced with underscores
- Table names that don't start with a letter are prefixed with `t_`

For example:
- `agent-1-collection` becomes `agent_1_collection`
- `1agent` becomes `t_1agent`

## API

### `createSupabaseMemoryStore(options: SupabaseMemoryOptions): Promise<MemoryStore>`

Creates and initializes a Supabase memory store implementation.

#### Options

- `url`: Supabase project URL
- `apiKey`: Supabase API key
- `tableName` (optional): Name of the Supabase table to use (defaults to "conversations")
- `autoCreateTable` (optional): Whether to automatically create tables if they don't exist (defaults to true)

### Methods

- `get<T>(key: string): Promise<T | null>` - Retrieve a value by key
- `set<T>(key: string, value: T): Promise<void>` - Store a value by key
- `delete(key: string): Promise<void>` - Remove a value by key
- `clear(): Promise<void>` - Remove all values from the store

## License

MIT 