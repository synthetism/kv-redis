import { Redis, type RedisOptions, type Pipeline } from 'ioredis';
import type { IKeyValueAdapter } from '@synet/kv';
import { defaultSerialize, defaultDeserialize, type SerializationAdapter } from '@synet/kv';

/**
 * Redis adapter configuration
 */
export interface RedisAdapterConfig {
  /** Redis connection URL */
  url?: string;
  /** Redis host */
  host?: string;
  /** Redis port */
  port?: number;
  /** Redis password */
  password?: string;
  /** Redis database number */
  db?: number;
  /** Redis username */
  username?: string;
  /** Redis instance (if you want to provide your own) */
  redisInstance?: Redis;
  /** Default TTL in milliseconds (0 = no default TTL) */
  defaultTTL?: number;
  /** Key prefix for all operations */
  keyPrefix?: string;
  /** Serialization adapter for custom serialization logic */
  serialization?: SerializationAdapter;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Command timeout in milliseconds */
  commandTimeout?: number;
  /** Max retries per request */
  maxRetriesPerRequest?: number;
  /** Whether to enable ready check */
  enableReadyCheck?: boolean;
  /** Pool size for connections */
  poolSize?: number;
}

/**
 * Redis connection statistics
 */
export interface RedisStatistics {
  connected: boolean;
  readyState: string;
  commands: {
    total: number;
    failed: number;
    successful: number;
  };
  operations: {
    gets: number;
    sets: number;
    deletes: number;
    batch: number;
  };
  memory?: {
    used: number;
    peak: number;
  };
  connection: {
    host: string;
    port: number;
    db: number;
  };
}

/**
 * Redis health status
 */
export interface RedisHealthStatus {
  healthy: boolean;
  connected: boolean;
  latency?: number;
  lastCheck: Date;
  error?: string;
}

/**
 * Redis connection statistics
 */
interface RedisStats {
  connected: boolean;
  readyState: string;
  commands: {
    total: number;
    failed: number;
  };
  memory?: {
    used: number;
    peak: number;
  };
}

/**
 * Redis Adapter for @synet/kv
 * 
 * Enhanced version learning from memory adapter and queue patterns:
 * - Robust connection management with proper lifecycle
 * - Efficient pipeline operations for batch processing  
 * - Comprehensive error handling and recovery
 * - Smart serialization with Buffer support
 * - Detailed statistics and health monitoring
 * - Resource cleanup and connection pooling
 * - Zero dependencies beyond ioredis
 * - Unit Architecture compliant
 */
export class RedisAdapter implements IKeyValueAdapter {
  readonly name = 'redis';
  readonly config: Record<string, unknown>;
  
  private redis!: Redis;
  private ownRedis!: boolean; // Track if we created the Redis instance
  private serialization: SerializationAdapter;
  private adapterConfig: RedisAdapterConfig;
  private isReady = false;
  private isDestroyed = false;
  
  // Enhanced statistics tracking
  private stats = {
    commands: { total: 0, failed: 0, successful: 0 },
    operations: { gets: 0, sets: 0, deletes: 0, batch: 0 },
    connection: { reconnects: 0, errors: 0 }
  };

  constructor(config: RedisAdapterConfig = {}) {
   
    this.adapterConfig = {
      host: 'localhost',
      port: 6379,
      defaultTTL: 0,
      keyPrefix: '',
      serialization: { serialize: defaultSerialize, deserialize: defaultDeserialize },
      connectionTimeout: 10000,
      commandTimeout: 5000,
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      ...config
    };

    this.config = { ...this.adapterConfig };
    this.serialization = this.adapterConfig.serialization || { serialize: defaultSerialize, deserialize: defaultDeserialize };

    // Initialize Redis connection
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection with robust error handling
   */
  private initializeRedis(): void {
    if (this.adapterConfig.redisInstance) {
      this.redis = this.adapterConfig.redisInstance;
      this.ownRedis = false;
      this.isReady = this.redis.status === 'ready';
    } else {
      // Build Redis options from config
      const redisOptions: RedisOptions = {
        host: this.adapterConfig.host,
        port: this.adapterConfig.port,
        password: this.adapterConfig.password,
        username: this.adapterConfig.username,
        db: this.adapterConfig.db || 0,
        connectTimeout: this.adapterConfig.connectionTimeout,
        commandTimeout: this.adapterConfig.commandTimeout,
        maxRetriesPerRequest: this.adapterConfig.maxRetriesPerRequest,
        keyPrefix: this.adapterConfig.keyPrefix,
        enableReadyCheck: this.adapterConfig.enableReadyCheck,
        lazyConnect: true, // Don't connect immediately
      };

      // Use URL if provided
      if (this.adapterConfig.url) {
        this.redis = new Redis(this.adapterConfig.url, redisOptions);
      } else {
        this.redis = new Redis(redisOptions);
      }
      
      this.ownRedis = true;
    }

    // Enhanced event handling
    this.redis.on('connect', () => {
      console.log('[RedisAdapter] Connected to Redis');
    });

    this.redis.on('ready', () => {
      console.log('[RedisAdapter] Redis connection ready');
      this.isReady = true;
    });

    this.redis.on('error', (error: Error) => {
      this.stats.connection.errors++;
      this.stats.commands.failed++;
      console.warn('[RedisAdapter] Redis error:', error.message);
    });

    this.redis.on('reconnecting', () => {
      this.stats.connection.reconnects++;
      console.log('[RedisAdapter] Reconnecting to Redis...');
    });

    this.redis.on('end', () => {
      this.isReady = false;
      console.log('[RedisAdapter] Redis connection ended');
    });
  }

  /**
   * Ensure Redis is connected and ready
   */
  private async ensureConnected(): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('[RedisAdapter] Adapter has been destroyed');
    }

    if (this.redis.status !== 'ready') {
      try {
        if (this.redis.status === 'wait') {
          await this.redis.connect();
        }
        // Wait for ready state
        let attempts = 0;
        while (this.redis.status !== 'ready' && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        if (this.redis.status !== 'ready') {
          throw new Error(`Connection timeout. Status: ${this.redis.status}`);
        }
      } catch (error) {
        throw new Error(`[RedisAdapter] Connection failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Execute Redis command with error handling and statistics
   */
  private async executeCommand<T>(
    operation: string,
    commandFn: () => Promise<T>
  ): Promise<T> {
    this.stats.commands.total++;
    
    try {
      await this.ensureConnected();
      const result = await commandFn();
      this.stats.commands.successful++;
      return result;
    } catch (error) {
      this.stats.commands.failed++;
      throw new Error(`[RedisAdapter] ${operation} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ===== Core IKeyValueAdapter Implementation =====

  async get<T>(key: string): Promise<T | null> {
    return this.executeCommand('get', async () => {
      this.stats.operations.gets++;
      const value = await this.redis.get(key);
      
      if (value === null) {
        return null;
      }
      
      return this.serialization.deserialize<T>(value);
    });
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    return this.executeCommand('set', async () => {
      this.stats.operations.sets++;
      const serialized = this.serialization.serialize(value);
      const effectiveTTL = ttl ?? (this.adapterConfig.defaultTTL || undefined);
      
      if (effectiveTTL && effectiveTTL > 0) {
        // TTL in Redis is in seconds, but we work with milliseconds
        const ttlSeconds = Math.ceil(effectiveTTL / 1000);
        await this.redis.setex(key, ttlSeconds, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.executeCommand('delete', async () => {
      this.stats.operations.deletes++;
      const result = await this.redis.del(key);
      return result > 0;
    });
  }

  async exists(key: string): Promise<boolean> {
    return this.executeCommand('exists', async () => {
      const result = await this.redis.exists(key);
      return result > 0;
    });
  }

  async clear(): Promise<void> {
    return this.executeCommand('clear', async () => {
      if (this.adapterConfig.keyPrefix) {
        // Delete only keys with our prefix using pattern
        const pattern = `${this.adapterConfig.keyPrefix}*`;
        
        // Use SCAN for better performance on large datasets
        const stream = this.redis.scanStream({
          match: pattern,
          count: 100
        });

        const pipeline = this.redis.pipeline();
        let keyCount = 0;

        for await (const keys of stream) {
          if (keys.length > 0) {
            pipeline.del(...keys);
            keyCount += keys.length;
          }
        }

        if (keyCount > 0) {
          await pipeline.exec();
        }
      } else {
        // Clear entire database (use with caution!)
        await this.redis.flushdb();
      }
    });
  }

  // ===== Enhanced Batch Operations with Pipelines =====

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return this.executeCommand('mget', async () => {
      this.stats.operations.batch++;
      
      if (keys.length === 0) return [];
      
      const values = await this.redis.mget(...keys);
      
      return values.map((value: string | null) => {
        if (value === null) return null;
        return this.serialization.deserialize<T>(value);
      });
    });
  }

  async mset<T>(entries: Array<[string, T]>, ttl?: number): Promise<void> {
    return this.executeCommand('mset', async () => {
      this.stats.operations.batch++;
      
      if (entries.length === 0) return;
      
      const effectiveTTL = ttl ?? (this.adapterConfig.defaultTTL || undefined);
      
      if (effectiveTTL && effectiveTTL > 0) {
        // Use pipeline for TTL sets
        const pipeline = this.redis.pipeline();
        const ttlSeconds = Math.ceil(effectiveTTL / 1000);
        
        for (const [key, value] of entries) {
          const serialized = this.serialization.serialize(value);
          pipeline.setex(key, ttlSeconds, serialized);
        }
        
        await pipeline.exec();
      } else {
        // Use mset for non-TTL batch sets
        const redisEntries: string[] = [];
        for (const [key, value] of entries) {
          const serialized = this.serialization.serialize(value);
          redisEntries.push(key, serialized);
        }
        
        await this.redis.mset(...redisEntries);
      }
    });
  }

  async deleteMany(keys: string[]): Promise<boolean> {
    return this.executeCommand('deleteMany', async () => {
      this.stats.operations.batch++;
      
      if (keys.length === 0) return false;
      
      // Use pipeline for large batch deletes
      if (keys.length > 100) {
        const pipeline = this.redis.pipeline();
        
        // Process in chunks to avoid memory issues
        for (let i = 0; i < keys.length; i += 100) {
          const chunk = keys.slice(i, i + 100);
          pipeline.del(...chunk);
        }
        
        const results = await pipeline.exec();
        return results ? results.some(([err, result]) => !err && Number(result) > 0) : false;
      }
      
      const result = await this.redis.del(...keys);
      return result > 0;
    });
  }

  // ===== Health Monitoring & Statistics =====

  async isHealthy(): Promise<boolean> {
    try {
      await this.ensureConnected();
      const start = Date.now();
      const result = await this.redis.ping();
      const latency = Date.now() - start;
      
      // Consider healthy if ping succeeds and latency is reasonable
      return result === 'PONG' && latency < 1000;
    } catch {
      return false;
    }
  }

  /**
   * Wait for the adapter to be ready
   */
  async waitUntilReady(timeout = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkReady = () => {
        if (this.redis.status === 'ready' && !this.isDestroyed) {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`[RedisAdapter] Timeout waiting for Redis to be ready. Current status: ${this.redis.status}`));
        } else {
          setTimeout(checkReady, 100);
        }
      };
      
      checkReady();
    });
  }

  /**
   * Get comprehensive Redis statistics
   */
  async getStatistics(): Promise<RedisStatistics> {
    try {
      await this.ensureConnected();
      
      const info = await this.redis.info('memory');
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const peakMatch = info.match(/used_memory_peak:(\d+)/);
      
      return {
        connected: this.isReady,
        readyState: this.redis.status,
        commands: { ...this.stats.commands },
        operations: { ...this.stats.operations },
        memory: {
          used: memoryMatch ? Number.parseInt(memoryMatch[1]) : 0,
          peak: peakMatch ? Number.parseInt(peakMatch[1]) : 0,
        },
        connection: {
          host: this.redis.options.host || 'localhost',
          port: this.redis.options.port || 6379,
          db: this.redis.options.db || 0,
        }
      };
    } catch {
      return {
        connected: false,
        readyState: this.redis.status,
        commands: { ...this.stats.commands },
        operations: { ...this.stats.operations },
        connection: {
          host: this.redis.options.host || 'localhost',
          port: this.redis.options.port || 6379,
          db: this.redis.options.db || 0,
        }
      };
    }
  }

  /**
   * Get current health status with latency check
   */
  async getHealthStatus(): Promise<RedisHealthStatus> {
    const startTime = Date.now();
    let latency: number | undefined;
    let error: string | undefined;
    let healthy = false;

    try {
      await this.ensureConnected();
      const result = await this.redis.ping();
      latency = Date.now() - startTime;
      healthy = result === 'PONG' && latency < 1000;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    return {
      healthy,
      connected: this.isReady,
      latency,
      lastCheck: new Date(),
      error
    };
  }

  /**
   * Test connection with actual round-trip
   */
  async ping(): Promise<string> {
    return this.executeCommand('ping', async () => {
      return await this.redis.ping();
    });
  }

  /**
   * Get underlying Redis instance for advanced operations
   */
  getRedis(): Redis {
    return this.redis;
  }

  /**
   * Get connection information
   */
  getConnectionInfo(): { host: string; port: number; db: number; status: string } {
    return {
      host: this.redis.options.host || 'localhost',
      port: this.redis.options.port || 6379,
      db: this.redis.options.db || 0,
      status: this.redis.status
    };
  }

  // ===== Resource Management =====

  /**
   * Disconnect from Redis gracefully
   */
  async disconnect(): Promise<void> {
    if (this.ownRedis && this.redis.status !== 'end') {
      await this.redis.disconnect();
      this.isReady = false;
    }
  }

  /**
   * Destroy adapter and cleanup all resources
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) return;
    
    this.isDestroyed = true;
    this.isReady = false;
    
    if (this.ownRedis) {
      try {
        await this.redis.quit();
      } catch (error) {
        console.warn('[RedisAdapter] Error during cleanup:', error);
        // Force disconnect if quit fails
        await this.redis.disconnect();
      }
    }
  }
}
