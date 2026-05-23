const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function runMigrations() {
  try {
    console.log('Running migrations...');
    
    // Add reactions column to Message table
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name='Message' AND column_name='reactions') 
          THEN 
            ALTER TABLE "Message" ADD COLUMN "reactions" TEXT;
          END IF;
        END $$;
      `);
      console.log('✅ Added reactions column');
    } catch (e) { console.log('reactions column may already exist'); }
    
    // Add deliveredAt column to Message table
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name='Message' AND column_name='deliveredAt') 
          THEN 
            ALTER TABLE "Message" ADD COLUMN "deliveredAt" TIMESTAMP;
          END IF;
        END $$;
      `);
      console.log('✅ Added deliveredAt column');
    } catch (e) { console.log('deliveredAt column may already exist'); }
    
    // Add isShared column to Post table
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name='Post' AND column_name='isShared') 
          THEN 
            ALTER TABLE "Post" ADD COLUMN "isShared" BOOLEAN DEFAULT false;
          END IF;
        END $$;
      `);
      console.log('✅ Added isShared column');
    } catch (e) { console.log('isShared column may already exist'); }
    
    // Add originalPostId column to Post table
    try {
      await prisma.$executeRawUnsafe(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name='Post' AND column_name='originalPostId') 
          THEN 
            ALTER TABLE "Post" ADD COLUMN "originalPostId" TEXT;
          END IF;
        END $$;
      `);
      console.log('✅ Added originalPostId column');
    } catch (e) { console.log('originalPostId column may already exist'); }
    
    console.log('🎉 All migrations completed!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runMigrations();