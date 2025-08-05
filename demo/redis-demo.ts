import { KeyValue } from "@synet/kv";
import { RedisAdapter } from '../src/index.js';

/**
 * Redis Adapter Demo
 * 
 * Demonstrates the enhanced Redis adapter with:
 * - Robust connection management
 * - Pipeline batch operations
 * - Health monitoring and statistics
 * - TTL support with Redis native expiration
 * - Comprehensive error handling
 */

async function runRedisDemo() {
  console.log('🚀 Redis KV Adapter Demo');
  console.log('========================\n');

  // Create Redis adapter with enhanced configuration
  console.log('📡 Creating Redis adapter...');
  const adapter = new RedisAdapter({
    host: 'localhost',
    port: 6370,
    keyPrefix: 'demo:',
    defaultTTL: 30000, // 30 seconds default TTL
    connectionTimeout: 5000,
    maxRetriesPerRequest: 3
  });

  // Create KV instance
  const kv = KeyValue.create({ adapter });

  try {
    // Try to connect immediately and test
    console.log('⏳ Testing Redis connection...');
    const ping = await adapter.ping();
    console.log('✅ Redis connected! Ping response:', ping);

    // Get connection info
    const connectionInfo = adapter.getConnectionInfo();
    console.log('🔗 Connection Info:', {
      host: connectionInfo.host,
      port: connectionInfo.port,
      db: connectionInfo.db,
      status: connectionInfo.status
    });

    // Test health check
    console.log('\n🏥 Health Check...');
    const healthStatus = await adapter.getHealthStatus();
    console.log('Health Status:', {
      healthy: healthStatus.healthy,
      connected: healthStatus.connected,
      latency: `${healthStatus.latency}ms`,
      lastCheck: healthStatus.lastCheck.toISOString()
    });

    // Basic operations
    console.log('\n📝 Basic Operations...');
    
    // Set various data types
    await kv.set('string', 'Hello Redis!');
    await kv.set('number', 42);
    await kv.set('boolean', true);
    await kv.set('array', [1, 2, 3, 4, 5]);
    await kv.set('object', { 
      name: 'SYNET Redis Demo', 
      version: '1.0.0',
      features: ['pipelines', 'ttl', 'health-monitoring']
    });

    // Set with TTL
    await kv.set('temp-data', 'This will expire soon', 5000); // 5 seconds

    // Get values back
    console.log('Retrieved values:');
    console.log('  string:', await kv.get('string'));
    console.log('  number:', await kv.get('number'));
    console.log('  boolean:', await kv.get('boolean'));
    console.log('  array:', await kv.get('array'));
    console.log('  object:', await kv.get('object'));
    console.log('  temp-data:', await kv.get('temp-data'));

    // Batch operations using Redis pipelines
    console.log('\n⚡ Batch Operations (Pipeline)...');
    
    const batchEntries: Array<[string, unknown]> = [
      ['batch:1', { id: 1, name: 'Item One' }],
      ['batch:2', { id: 2, name: 'Item Two' }],
      ['batch:3', { id: 3, name: 'Item Three' }],
      ['batch:4', { id: 4, name: 'Item Four' }],
      ['batch:5', { id: 5, name: 'Item Five' }]
    ];

    console.time('Batch Set');
    await kv.mset(batchEntries, 15000); // 15 seconds TTL
    console.timeEnd('Batch Set');

    console.time('Batch Get');
    const batchKeys = batchEntries.map(([key]) => key);
    const batchResults = await kv.mget(batchKeys);
    console.timeEnd('Batch Get');
    
    console.log('Batch results:', batchResults);

    // Statistics and monitoring
    console.log('\n📊 Statistics...');
    const stats = await adapter.getStatistics();
    console.log('Redis Statistics:', {
      connected: stats.connected,
      commands: stats.commands,
      operations: stats.operations,
      memory: stats.memory,
      connection: stats.connection
    });

    // Test error handling
    console.log('\n🚨 Error Handling Test...');
    try {
      // Try to get a key that doesn't exist
      const missing = await kv.get('does-not-exist');
      console.log('Missing key result:', missing);
    } catch (error) {
      console.log('Error handled:', (error as Error).message);
    }

    // TTL demonstration
    console.log('\n⏰ TTL Demonstration...');
    console.log('Setting key with 3 second TTL...');
    await kv.set('expiring-key', 'I will disappear!', 3000);
    
    console.log('Value immediately:', await kv.get('expiring-key'));
    console.log('Waiting 4 seconds...');
    
    await new Promise(resolve => setTimeout(resolve, 4000));
    console.log('Value after expiration:', await kv.get('expiring-key'));

    // Large batch test
    console.log('\n🔥 Large Batch Test...');
    const largeBatch: Array<[string, number]> = Array.from(
      { length: 100 }, 
      (_, i) => [`large:${i}`, i * i]
    );

    console.time('Large Batch Set (100 items)');
    await kv.mset(largeBatch);
    console.timeEnd('Large Batch Set (100 items)');

    console.time('Large Batch Delete (100 items)');
    const largeKeys = largeBatch.map(([key]) => key);
    await kv.deleteMany(largeKeys);
    console.timeEnd('Large Batch Delete (100 items)');

    // Final statistics
    console.log('\n📈 Final Statistics...');
    const finalStats = await adapter.getStatistics();
    console.log('Final Redis Statistics:', {
      commands: finalStats.commands,
      operations: finalStats.operations,
      memory: finalStats.memory
    });

    console.log('\n✨ Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    
    if (error instanceof Error && error.message.includes('Connection failed')) {
      console.log('\n💡 Make sure Redis is running:');
      console.log('   docker run -d -p 6379:6379 redis:alpine');
      console.log('   # or');
      console.log('   redis-server');
    }
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await adapter.destroy();
    console.log('✅ Cleanup complete!');
  }
}

// Handle errors gracefully
runRedisDemo().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
