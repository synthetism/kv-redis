/**
 * @synet/kv-redis - Redis adapter for SYNET KeyValue Unit
 * 
 * Provides distributed key-value storage using Redis with:
 * - Pipeline operations for efficient batch processing
 * - Native Redis TTL support for automatic expiration
 * - Connection management with auto-retry capabilities
 * - Health monitoring and statistics
 * - Full serialization support for complex types
 * 
 * @example
 * ```typescript
 * import { KeyValue } from '@synet/kv';
 * import { RedisAdapter } from '@synet/kv-redis';
 * 
 * const adapter = RedisAdapter.create({
 *   host: 'localhost',
 *   port: 6379,
 *   keyPrefix: 'myapp:'
 * });
 * 
 * const kv = KeyValue.create({ adapter });
 * 
 * await kv.set('key', { complex: 'data' });
 * const value = await kv.get('key');
 * ```
 */

export { RedisAdapter } from './redis.adapter.js';
export type {
  RedisAdapterConfig,
  RedisStatistics,
  RedisHealthStatus
} from './redis.adapter.js';
