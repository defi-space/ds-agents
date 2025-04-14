# @daydreamsai/firebase

Firebase Firestore implementation of the MemoryStore interface for DaydreamsAI.

## Installation

```bash
# If using npm
npm install @daydreamsai/firebase

# If using yarn
yarn add @daydreamsai/firebase

# If using pnpm
pnpm add @daydreamsai/firebase

# If using bun
bun add @daydreamsai/firebase
```

## Usage

### Basic Usage with Environment Variables

Firebase Admin SDK can automatically use credentials from environment variables:

```typescript
import { createFirebaseMemoryStore } from '@daydreamsai/firebase';

// Create and initialize the store
const store = await createFirebaseMemoryStore({
  collectionName: 'my_conversations' // Optional, defaults to "conversations"
});

// Use in your application
await store.set('user123', { messages: [...] });
const data = await store.get('user123');
```

### With Service Account Credentials

If you prefer to specify credentials directly:

```typescript
import { createFirebaseMemoryStore } from '@daydreamsai/firebase';

const store = await createFirebaseMemoryStore({
  serviceAccount: {
    projectId: 'your-project-id',
    clientEmail: 'your-client-email@project.iam.gserviceaccount.com',
    privateKey: 'YOUR_PRIVATE_KEY'
  },
  collectionName: 'my_conversations' // Optional
});

// Use in your application
await store.set('key1', { data: 'value' });
const value = await store.get('key1');
```

### Integration with DaydreamsAI

```typescript
import { createDreams } from '@daydreamsai/core';
import { createFirebaseMemoryStore } from '@daydreamsai/firebase';
import { createVectorStore } from 'some-vector-store';

const firebaseStore = await createFirebaseMemoryStore({
  collectionName: 'dreams'
});

const vectorStore = createVectorStore({
  // vector store configuration
});

const agent = createDreams({
  memory: {
    store: firebaseStore,
    vector: vectorStore,
  },
  // other configuration
});
```

## API

### `createFirebaseMemoryStore(options: FirebaseMemoryOptions): Promise<MemoryStore>`

Creates and initializes a Firebase Firestore memory store implementation.

#### Options

- `serviceAccount` (optional): Service account credentials
  - `projectId`: Firebase project ID
  - `clientEmail`: Service account client email
  - `privateKey`: Service account private key
- `collectionName` (optional): Name of the Firestore collection to use (defaults to "conversations")

### Methods

- `get<T>(key: string): Promise<T | null>` - Retrieve a value by key
- `set<T>(key: string, value: T): Promise<void>` - Store a value by key
- `delete(key: string): Promise<void>` - Remove a value by key
- `clear(): Promise<void>` - Remove all values from the store

## License

MIT 