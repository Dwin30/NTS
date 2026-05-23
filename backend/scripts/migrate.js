const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function runMigrations() {
  try {
    console.log('Running migrations...');
    
    // ============ MESSAGE TABLE ============
    // Add reactions column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "reactions" TEXT;`);
    console.log('✅ reactions column ready');
    
    // Add deliveredAt column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP;`);
    console.log('✅ deliveredAt column ready');
    
    // ============ POST TABLE ============
    // Add isShared column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "isShared" BOOLEAN DEFAULT false;`);
    console.log('✅ isShared column ready');
    
    // Add originalPostId column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "originalPostId" TEXT;`);
    console.log('✅ originalPostId column ready');
    
    // Add isDeleted column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN DEFAULT false;`);
    console.log('✅ isDeleted column ready (Post)');
    
    // Add deletedAt column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;`);
    console.log('✅ deletedAt column ready (Post)');
    
    // ============ COMMENT TABLE ============
    // Add isDeleted column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN DEFAULT false;`);
    console.log('✅ isDeleted column ready (Comment)');
    
    // Add deletedAt column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;`);
    console.log('✅ deletedAt column ready (Comment)');
    
    // ============ USER TABLE ============
    // Add followersCount column
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "followersCount" INTEGER DEFAULT 0;`);
    console.log('✅ followersCount column ready');
    
    // Add followingCount column
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "followingCount" INTEGER DEFAULT 0;`);
    console.log('✅ followingCount column ready');
    
    // ============ FOLLOW TABLE ============
    // Create Follow table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Follow" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "followerId" TEXT NOT NULL,
        "followingId" TEXT NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Follow table created');
    
    // Add foreign key constraints
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Follow_followerId_fkey') THEN
          ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" 
          FOREIGN KEY ("followerId") REFERENCES "User"(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Follow_followingId_fkey') THEN
          ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" 
          FOREIGN KEY ("followingId") REFERENCES "User"(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    console.log('✅ Follow table foreign keys added');
    
    // Add unique constraint
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Follow_followerId_followingId_key') THEN
          ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_followingId_key" 
          UNIQUE ("followerId", "followingId");
        END IF;
      END $$;
    `);
    console.log('✅ Follow table unique constraint added');
    
    console.log('🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runMigrations();