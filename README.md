# @synet/kv-redis

**Production-ready Redis adapter for @synet/kv with advanced features**

High-performance Redis adapter for [@synet/kv](https://github.com/synthetism/kv) that provides distributed key-value storage with Redis-native optimizations, pipeline operations, and comprehensive monitoring.

## ✨ Features

- **Redis Pipelines** - Efficient batch operations using Redis pipelines
- **Connection Management** - Robust connection handling with auto-retry
- **Native TTL** - Uses Redis native expiration for optimal performance
- **Health Monitoring** - Comprehensive statistics and health checks
- **Auto-Reconnection** - Automatic reconnection with configurable retry logic
- **Memory Optimization** - Smart memory usage tracking and management
- **Type Safety** - Full TypeScript support with generic preservation
- **Unit Architecture** - Compatible with SYNET Unit Architecture patterns

##  Installation

```bash
npm install @synet/kv-redis ioredis
```

## 🚀 Quick Start

```typescript
import { KeyValue } from '@synet/kv';
import { RedisAdapter } from '@synet/kv-redis';

// Create Redis adapter
const adapter = new RedisAdapter({
  host: 'localhost',
  port: 6379,
  keyPrefix: 'myapp:',
  defaultTTL: 3600000, // 1 hour
  connectionTimeout: 10000,
  maxRetriesPerRequest: 3
});

// Create KV instance
const kv = KeyValue.create({ adapter });

// Use same API as memory adapter
await kv.set('user:123', { name: 'Alice', email: 'alice@example.com' });
const user = await kv.get('user:123');
console.log(user); // { name: 'Alice', email: 'alice@example.com' }
```

## Configuration

### RedisAdapterConfig

```typescript
interface RedisAdapterConfig {
  // Connection Settings
  host?: string;                    // Redis host (default: 'localhost')
  port?: number;                    // Redis port (default: 6379)
  url?: string;                     // Redis URL (overrides host/port)
  password?: string;                // Redis password
  username?: string;                // Redis username (Redis 6+)
  db?: number;                      // Redis database number (default: 0)
  
  // Key Management
  keyPrefix?: string;               // Prefix for all keys (default: '')
  defaultTTL?: number;              // Default TTL in milliseconds
  
  // Connection Options
  connectionTimeout?: number;       // Connection timeout (default: 10000ms)
  commandTimeout?: number;          // Command timeout (default: 5000ms)
  maxRetriesPerRequest?: number;    // Max retries per request (default: 3)
  enableReadyCheck?: boolean;       // Enable ready check (default: false)
  
  // Advanced
  redisInstance?: Redis;            // Use existing Redis instance
  serialization?: SerializationAdapter; // Custom serialization
}
```

### Connection Examples

```typescript
// Basic connection
const adapter = new RedisAdapter({
  host: 'localhost',
  port: 6379
});

// URL-based connection
const adapter = new RedisAdapter({
  url: 'redis://username:password@localhost:6379/0'
});

// Production configuration
const adapter = new RedisAdapter({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  keyPrefix: process.env.APP_NAME + ':',
  defaultTTL: 3600000, // 1 hour
  connectionTimeout: 15000,
  commandTimeout: 8000,
  maxRetriesPerRequest: 5
});

// Cluster configuration
const adapter = new RedisAdapter({
  url: 'redis://cluster-endpoint:6379',
  enableReadyCheck: false,
  maxRetriesPerRequest: 3
});
```

## Advanced Usage

### Pipeline Operations

The Redis adapter automatically uses pipelines for batch operations to maximize performance:

```typescript
// Batch set - uses Redis pipeline internally
const entries: Array<[string, any]> = [
  ['user:1', { name: 'Alice' }],
  ['user:2', { name: 'Bob' }],
  ['user:3', { name: 'Charlie' }]
];

await kv.mset(entries, 1800000); // 30 minutes TTL

// Batch get - uses Redis MGET
const keys = ['user:1', 'user:2', 'user:3'];
const users = await kv.mget(keys);

// Large batch delete - automatically chunked with pipelines
const manyKeys = Array.from({ length: 1000 }, (_, i) => `temp:${i}`);
await kv.deleteMany(manyKeys);
```

### Health Monitoring

```typescript
// Basic health check
const isHealthy = await adapter.isHealthy();
console.log('Redis healthy:', isHealthy);

// Detailed health status
const health = await adapter.getHealthStatus();
console.log('Health Status:', {
  healthy: health.healthy,
  connected: health.connected,
  latency: health.latency + 'ms',
  lastCheck: health.lastCheck,
  error: health.error // if any
});

// Comprehensive statistics
const stats = await adapter.getStatistics();
console.log('Redis Statistics:', {
  connected: stats.connected,
  commands: stats.commands,
  operations: stats.operations,
  memory: stats.memory,
  connection: stats.connection
});
```

### Connection Management

```typescript
// Wait for Redis to be ready
await adapter.waitUntilReady(10000); // 10 second timeout

// Get connection information
const info = adapter.getConnectionInfo();
console.log('Connection:', {
  host: info.host,
  port: info.port,
  database: info.db,
  status: info.status
});

// Test connection
const pingResponse = await adapter.ping();
console.log('Ping:', pingResponse); // 'PONG'

// Access underlying Redis instance for advanced operations
const redis = adapter.getRedis();
await redis.eval('return redis.call("GET", KEYS[1])', 1, 'mykey');
```

### TTL Management

```typescript
// Set with TTL (Redis native expiration)
await kv.set('session:abc123', sessionData, 1800000); // 30 minutes

// Set with default TTL (configured in adapter)
await kv.set('cache:popular-posts', posts); // Uses defaultTTL

// Check if key exists (respects TTL)
const exists = await kv.exists('session:abc123');

// TTL is handled natively by Redis for optimal performance
```

### Error Handling

```typescript
try {
  await kv.set('mykey', 'myvalue');
} catch (error) {
  if (error.message.includes('[RedisAdapter]')) {
    // Handle Redis-specific errors
    console.error('Redis operation failed:', error.message);
    
    // Check if adapter is still healthy
    const healthy = await adapter.isHealthy();
    if (!healthy) {
      // Implement fallback or retry logic
    }
  }
}
```

## Production Deployment

### Docker Setup

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    environment:
      NODE_ENV: production
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      APP_NAME: myapp
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

### Environment Configuration

```typescript
// config/redis.ts
import { RedisAdapter } from '@synet/kv-redis';

export function createRedisAdapter() {
  return new RedisAdapter({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: (process.env.APP_NAME || 'app') + ':',
    defaultTTL: parseInt(process.env.DEFAULT_TTL || '3600000'), // 1 hour
    connectionTimeout: 15000,
    commandTimeout: 8000,
    maxRetriesPerRequest: 5
  });
}
```

### High Availability Setup

```typescript
// For Redis Cluster
const adapter = new RedisAdapter({
  url: process.env.REDIS_CLUSTER_URL,
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
  connectionTimeout: 20000
});

// For Redis Sentinel
const adapter = new RedisAdapter({
  // Configure for Sentinel setup
  host: process.env.REDIS_SENTINEL_HOST,
  port: parseInt(process.env.REDIS_SENTINEL_PORT || '26379'),
  maxRetriesPerRequest: 5
});
```

## Performance Optimization

### Batch Operations

```typescript
// Efficient bulk operations
const BATCH_SIZE = 100;

async function processBulkData(items: any[]) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const entries = batch.map((item, idx) => [
      `item:${i + idx}`,
      item
    ] as [string, any]);
    
    // Single pipeline operation for the batch
    await kv.mset(entries, 3600000); // 1 hour TTL
  }
}
```

### Memory Management

```typescript
// Monitor Redis memory usage
async function monitorMemory() {
  const stats = await adapter.getStatistics();
  
  if (stats.memory) {
    const usedMB = stats.memory.used / 1024 / 1024;
    const peakMB = stats.memory.peak / 1024 / 1024;
    
    console.log(`Redis Memory: ${usedMB.toFixed(2)}MB (Peak: ${peakMB.toFixed(2)}MB)`);
    
    // Alert if memory usage is too high
    if (usedMB > 1000) { // 1GB threshold
      console.warn('Redis memory usage is high!');
    }
  }
}

// Run monitoring every 5 minutes
setInterval(monitorMemory, 5 * 60 * 1000);
```

## Testing

```bash
# Run tests (requires Redis on port 6379)
npm test

# Run demo
npm run demo

# Run with coverage
npm run coverage
```

### Test with Docker

```bash
# Start Redis for testing
docker run -d --name redis-test -p 6379:6379 redis:7-alpine

# Run tests
npm test

# Cleanup
docker stop redis-test && docker rm redis-test
```

## 🔧 Troubleshooting

### Common Issues

**Connection Timeouts**
```typescript
// Increase timeout for slow networks
const adapter = new RedisAdapter({
  connectionTimeout: 30000, // 30 seconds
  commandTimeout: 15000     // 15 seconds
});
```

**Memory Issues**
```typescript
// Use shorter TTL for cache data
await kv.set('cache:data', data, 300000); // 5 minutes instead of 1 hour

// Monitor memory usage
const stats = await adapter.getStatistics();
console.log('Memory usage:', stats.memory);
```

**Performance Issues**
```typescript
// Use batch operations for multiple keys
await kv.mset(entries); // Instead of multiple set() calls

// Use appropriate key prefixes
const adapter = new RedisAdapter({
  keyPrefix: 'myapp:cache:' // Clear namespace
});
```

## Monitoring & Metrics

### Custom Monitoring

```typescript
class RedisMonitor {
  constructor(private adapter: RedisAdapter) {}

  async getMetrics() {
    const stats = await this.adapter.getStatistics();
    const health = await this.adapter.getHealthStatus();
    
    return {
      // Connection metrics
      connected: stats.connected,
      latency: health.latency,
      
      // Command metrics
      totalCommands: stats.commands.total,
      failedCommands: stats.commands.failed,
      successRate: stats.commands.successful / stats.commands.total,
      
      // Operation metrics
      operations: stats.operations,
      
      // Memory metrics
      memoryUsed: stats.memory?.used || 0,
      memoryPeak: stats.memory?.peak || 0
    };
  }

  async logMetrics() {
    const metrics = await this.getMetrics();
    console.log('Redis Metrics:', JSON.stringify(metrics, null, 2));
  }
}

const monitor = new RedisMonitor(adapter);
setInterval(() => monitor.logMetrics(), 60000); // Every minute
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](../../CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](../../LICENSE) file for details.

## 🔗 Related Packages

- [`@synet/kv`](https://github.com/synthetism/kv) - Core key-value storage with Unit Architecture
- [`@synet/unit`](https://github.com/synthetism/unit) - SYNET Unit Architecture framework

---

**Made with ❤️ by the SYNET Team**
