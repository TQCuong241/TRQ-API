import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/TRQ';
    
    await mongoose.connect(mongoURI);
    
    console.log('MongoDB đã kết nối thành công');
    
    return mongoose.connection;
  } catch (error) {
    console.error('Kết nối MongoDB thất bại:', error);
    process.exit(1);
  }
};

export default connectDB;
