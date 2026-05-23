const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function runMigrations() {
  try {
    console.log('Running migrations...');
    
    // Enable pgcrypto extension for UUID generation
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    console.log('✅ pgcrypto extension enabled');
    
    // ============ MESSAGE TABLE ============
    await prisma.$executeRawUnsafe(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "reactions" TEXT;`);
    console.log('✅ reactions column ready');
    
    await prisma.$executeRawUnsafe(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP;`);
    console.log('✅ deliveredAt column ready');
    
    // ============ POST TABLE ============
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "isShared" BOOLEAN DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "originalPostId" TEXT;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;`);
    console.log('✅ Post table columns ready');
    
    // ============ COMMENT TABLE ============
    await prisma.$executeRawUnsafe(`ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN DEFAULT false;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;`);
    console.log('✅ Comment table columns ready');
    
    // ============ USER TABLE ============
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "followersCount" INTEGER DEFAULT 0;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "followingCount" INTEGER DEFAULT 0;`);
    console.log('✅ User table columns ready');
    
    // ============ FOLLOW TABLE ============
    // Drop existing Follow table if exists (to recreate with correct schema)
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "Follow" CASCADE;`);
    
    // Create Follow table with UUID generation using gen_random_uuid()
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "Follow" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "followerId" TEXT NOT NULL,
        "followingId" TEXT NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Follow table created');
    
    // Add foreign key constraints
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" 
      FOREIGN KEY ("followerId") REFERENCES "User"(id) ON DELETE CASCADE;
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" 
      FOREIGN KEY ("followingId") REFERENCES "User"(id) ON DELETE CASCADE;
    `);
    
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_followingId_key" 
      UNIQUE ("followerId", "followingId");
    `);
    console.log('✅ Follow table constraints added');
    
    console.log('🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runMigrations();