const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function runMigrations() {
  try {
    console.log('Running migrations...');
    
    // Add reactions column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "reactions" TEXT;`);
    console.log('✅ reactions column ready');
    
    // Add deliveredAt column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP;`);
    console.log('✅ deliveredAt column ready');
    
    // Add isShared column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "isShared" BOOLEAN DEFAULT false;`);
    console.log('✅ isShared column ready');
    
    // Add originalPostId column
    await prisma.$executeRawUnsafe(`ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "originalPostId" TEXT;`);
    console.log('✅ originalPostId column ready');
    
    console.log('🎉 All migrations completed!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runMigrations();