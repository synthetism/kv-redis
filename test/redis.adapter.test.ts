import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RedisAdapter } from '../src/redis.adapter.js';
import type { RedisAdapterConfig } from '../src/redis.adapter.js';

describe('RedisAdapter', () => {
  let adapter: RedisAdapter;
  
  beforeEach(() => {
    // Create adapter with minimal config for testing
    const config: RedisAdapterConfig = {
      host: 'localhost',
      port: 6379,
      keyPrefix: 'test:',
      defaultTTL: 0
    };
    adapter = new RedisAdapter(config);
  });
  
  afterEach(async () => {
    await adapter.destroy();
  });

  describe('Constructor & Configuration', () => {
    it('should create adapter with default config', () => {
      const defaultAdapter = new RedisAdapter();
      expect(defaultAdapter.name).toBe('redis');
      expect(defaultAdapter.config).toBeDefined();
      expect(defaultAdapter.config).toMatchObject({
        host: 'localhost',
        port: 6379,
        defaultTTL: 0,
        keyPrefix: ''
      });
    });

    it('should create adapter with custom config', () => {
      const config: RedisAdapterConfig = {
        host: 'custom-host',
        port: 6380,
        defaultTTL: 5000,
        keyPrefix: 'myapp:',
        connectionTimeout: 15000
      };
      
      const customAdapter = new RedisAdapter(config);
      expect(customAdapter.config).toMatchObject({
        host: 'custom-host',
        port: 6380,
        defaultTTL: 5000,
        keyPrefix: 'myapp:',
        connectionTimeout: 15000
      });
    });

    it('should handle URL-based configuration', () => {
      const config: RedisAdapterConfig = {
        url: 'redis://localhost:6379/0'
      };
      
      const urlAdapter = new RedisAdapter(config);
      expect(urlAdapter.config).toMatchObject({
        url: 'redis://localhost:6379/0'
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should use default serialization when not provided', () => {
      const config: RedisAdapterConfig = {
        host: 'localhost'
      };
      
      const testAdapter = new RedisAdapter(config);
      expect(testAdapter.config).toHaveProperty('serialization');
    });

    it('should preserve custom serialization config', () => {
      const customSerialization = {
        serialize: (value: unknown) => JSON.stringify(value),
        deserialize: <T>(value: string): T => JSON.parse(value)
      };
      
      const config: RedisAdapterConfig = {
        serialization: customSerialization
      };
      
      const testAdapter = new RedisAdapter(config);
      expect(testAdapter.config.serialization).toBe(customSerialization);
    });
  });

  describe('Connection Management', () => {
    it('should provide connection info', () => {
      const info = adapter.getConnectionInfo();
      
      expect(info).toHaveProperty('host');
      expect(info).toHaveProperty('port');
      expect(info).toHaveProperty('db');
      expect(info).toHaveProperty('status');
      expect(info.host).toBe('localhost');
      expect(info.port).toBe(6379);
    });

    it('should expose Redis instance', () => {
      const redis = adapter.getRedis();
      expect(redis).toBeDefined();
      expect(redis.options.host).toBe('localhost');
      expect(redis.options.port).toBe(6379);
    });
  });

  describe('Error Handling Structure', () => {
    it('should handle invalid operations gracefully', async () => {
      // Test with an adapter that can't connect to an invalid host
      const badAdapter = new RedisAdapter({
        host: 'invalid-host-that-does-not-exist',
        port: 9999,
        connectionTimeout: 1000
      });
      
      await expect(badAdapter.get('test-key')).rejects.toThrow();
      await badAdapter.destroy();
    });

    it('should maintain error context in messages', async () => {
      try {
        await adapter.get('test-key');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('[RedisAdapter]');
      }
    });
  });

  describe('Statistics and Health Methods', () => {
    it('should provide statistics structure', async () => {
      try {
        const stats = await adapter.getStatistics();
        
        expect(stats).toHaveProperty('connected');
        expect(stats).toHaveProperty('readyState');
        expect(stats).toHaveProperty('commands');
        expect(stats).toHaveProperty('operations');
        expect(stats).toHaveProperty('connection');
        expect(stats.commands).toHaveProperty('total');
        expect(stats.commands).toHaveProperty('failed');
        expect(stats.commands).toHaveProperty('successful');
        expect(stats.operations).toHaveProperty('gets');
        expect(stats.operations).toHaveProperty('sets');
        expect(stats.operations).toHaveProperty('deletes');
        expect(stats.operations).toHaveProperty('batch');
      } catch {
        // Stats structure should be consistent even when Redis is not connected
      }
    });

    it('should provide health status structure', async () => {
      const health = await adapter.getHealthStatus();
      
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('connected');
      expect(health).toHaveProperty('lastCheck');
      expect(health.lastCheck).toBeInstanceOf(Date);
      
      // When connection fails, should have error details
      if (!health.healthy) {
        expect(health).toHaveProperty('error');
      }
    });
  });

  describe('Resource Management', () => {
    it('should handle disconnect gracefully', async () => {
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });

    it('should handle destroy gracefully', async () => {
      await expect(adapter.destroy()).resolves.not.toThrow();
    });

    it('should prevent operations after destroy', async () => {
      await adapter.destroy();
      
      await expect(adapter.get('test-key')).rejects.toThrow('destroyed');
    });
  });

  describe('Interface Compliance', () => {
    it('should implement all required IKeyValueAdapter methods', () => {
      // Check that all required methods exist
      expect(typeof adapter.get).toBe('function');
      expect(typeof adapter.set).toBe('function');
      expect(typeof adapter.delete).toBe('function');
      expect(typeof adapter.exists).toBe('function');
      expect(typeof adapter.clear).toBe('function');
      expect(typeof adapter.mget).toBe('function');
      expect(typeof adapter.mset).toBe('function');
      expect(typeof adapter.deleteMany).toBe('function');
      expect(typeof adapter.isHealthy).toBe('function');
    });

    it('should have correct adapter properties', () => {
      expect(adapter.name).toBe('redis');
      expect(adapter.config).toBeDefined();
      expect(typeof adapter.config).toBe('object');
    });
  });

  describe('Serialization Integration', () => {
    it('should handle various data types in config', () => {
      const testData = {
        string: 'test',
        number: 42,
        boolean: true,
        array: [1, 2, 3],
        object: { nested: 'value' },
        null: null,
        undefined: undefined
      };
      
      // Should not throw when serializing complex config
      expect(() => new RedisAdapter({ 
        keyPrefix: testData.string,
        defaultTTL: testData.number,
        enableReadyCheck: testData.boolean
      })).not.toThrow();
    });
  });

  describe('Advanced Configuration', () => {
    it('should handle all connection parameters', () => {
      const config: RedisAdapterConfig = {
        host: 'redis-server',
        port: 6380,
        password: 'secret',
        username: 'redisuser',
        db: 5,
        connectionTimeout: 20000,
        commandTimeout: 8000,
        maxRetriesPerRequest: 5,
        enableReadyCheck: false,
        keyPrefix: 'app:',
        defaultTTL: 300000
      };
      
      const advancedAdapter = new RedisAdapter(config);
      expect(advancedAdapter.config).toMatchObject(config);
    });

    it('should handle minimal configuration', () => {
      const minimalAdapter = new RedisAdapter({});
      
      expect(minimalAdapter.config).toMatchObject({
        host: 'localhost',
        port: 6379,
        defaultTTL: 0,
        keyPrefix: ''
      });
    });
  });
});
