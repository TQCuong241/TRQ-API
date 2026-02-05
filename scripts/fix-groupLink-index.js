/**
 * Migration Script: Fix groupLink Index
 * 
 * Sửa lỗi duplicate key error trên groupLink index
 * Drop index cũ và tạo lại với sparse option
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function fixGroupLinkIndex() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/TRQ';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('conversations');

    // Drop index cũ nếu tồn tại
    try {
      await collection.dropIndex('groupLink_1');
      console.log('✅ Dropped old groupLink_1 index');
    } catch (error) {
      if (error.codeName === 'IndexNotFound') {
        console.log('⚠️ Index groupLink_1 not found, skipping drop');
      } else {
        throw error;
      }
    }

    // Tạo index mới với sparse (unique chỉ áp dụng cho non-null values)
    await collection.createIndex(
      { groupLink: 1 },
      {
        unique: true,
        sparse: true, // Chỉ index các giá trị không null
        name: 'groupLink_1'
      }
    );
    console.log('✅ Created new groupLink_1 index (unique, sparse)');

    // Verify index
    const indexes = await collection.indexes();
    const groupLinkIndex = indexes.find(idx => idx.name === 'groupLink_1');
    if (groupLinkIndex) {
      console.log('✅ Index verified:', JSON.stringify(groupLinkIndex, null, 2));
    } else {
      console.log('⚠️ Warning: Index not found after creation');
    }

    await mongoose.disconnect();
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
fixGroupLinkIndex();

