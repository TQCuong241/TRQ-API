import mongoose, { Schema, Document } from 'mongoose';
import bcryptjs from 'bcryptjs';

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  phone?: string;
  displayName?: string;
  bio?: string;
  isVerified: boolean;
  emailVerifyToken?: string;
  emailVerifyExpires?: Date;
  loginOtp?: string;
  loginOtpExpires?: Date;
  resetPasswordOtp?: string;
  resetPasswordOtpExpires?: Date;
  changePasswordOtp?: string;
  changePasswordOtpExpires?: Date;
  avatar?: string;
  coverPhoto?: string;
  lastSeenAt?: Date;
  onlineStatus: 'online' | 'recently' | 'last_week' | 'long_ago';
  isBlocked: boolean;
  allowCalls: boolean;
  allowMessagesFrom: 'everyone' | 'contacts';
  privacy: {
    lastSeen: 'everyone' | 'contacts' | 'nobody';
    profilePhoto: 'everyone' | 'contacts' | 'nobody';
    calls: 'everyone' | 'contacts' | 'nobody';
  };
  currentLocation?: string;
  hometown?: string;
  dateOfBirth?: Date;
  maritalStatus?: 'single' | 'married' | 'divorced' | 'widowed' | 'in_relationship' | 'prefer_not_to_say';
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  work?: {
    company?: string;
    position?: string;
  };
  education?: {
    school?: string;
    major?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: false, // Không required vì sẽ tự động generate
      unique: true,
      trim: true,
      minlength: [3, 'Tên đăng nhập phải có ít nhất 3 ký tự'],
      maxlength: [30, 'Tên đăng nhập không được quá 30 ký tự'],
      match: [/^[a-zA-Z0-9_]+$/, 'Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới'],
      lowercase: true
    },
    email: {
      type: String,
      required: [true, 'Vui lòng nhập email'],
      unique: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Vui lòng nhập email hợp lệ']
    },
    password: {
      type: String,
      required: [true, 'Vui lòng nhập mật khẩu'],
      minlength: [6, 'Mật khẩu phải có ít nhất 6 ký tự'],
      select: false
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    emailVerifyToken: {
      type: String,
      select: false
    },
    emailVerifyExpires: {
      type: Date,
      select: false
    },
    loginOtp: {
      type: String,
      select: false
    },
    loginOtpExpires: {
      type: Date,
      select: false
    },
    resetPasswordOtp: {
      type: String,
      select: false
    },
    resetPasswordOtpExpires: {
      type: Date,
      select: false
    },
    changePasswordOtp: {
      type: String,
      select: false
    },
    changePasswordOtpExpires: {
      type: Date,
      select: false
    },
    avatar: {
      type: String,
      default: null
    },
    coverPhoto: {
      type: String,
      default: null
    },
    phone: {
      type: String,
      default: null,
      sparse: true
    },
    displayName: {
      type: String,
      default: null
    },
    bio: {
      type: String,
      default: null,
      maxlength: [500, 'Bio không được quá 500 ký tự']
    },
    lastSeenAt: {
      type: Date,
      default: null
    },
    onlineStatus: {
      type: String,
      enum: ['online', 'recently', 'last_week', 'long_ago'],
      default: 'long_ago'
    },
    isBlocked: {
      type: Boolean,
      default: false
    },
    allowCalls: {
      type: Boolean,
      default: true
    },
    allowMessagesFrom: {
      type: String,
      enum: ['everyone', 'contacts'],
      default: 'everyone'
    },
    privacy: {
      lastSeen: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone'
      },
      profilePhoto: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone'
      },
      calls: {
        type: String,
        enum: ['everyone', 'contacts', 'nobody'],
        default: 'everyone'
      }
    },
    currentLocation: {
      type: String,
      default: null,
      maxlength: [200, 'Nơi ở hiện tại không được quá 200 ký tự']
    },
    hometown: {
      type: String,
      default: null,
      maxlength: [200, 'Quê quán không được quá 200 ký tự']
    },
    dateOfBirth: {
      type: Date,
      default: null
    },
    maritalStatus: {
      type: String,
      enum: ['single', 'married', 'divorced', 'widowed', 'in_relationship', 'prefer_not_to_say'],
      default: undefined,
      sparse: true
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say'],
      default: undefined,
      sparse: true
    },
    work: {
      company: {
        type: String,
        default: null,
        maxlength: [200, 'Tên công ty không được quá 200 ký tự']
      },
      position: {
        type: String,
        default: null,
        maxlength: [200, 'Chức vụ không được quá 200 ký tự']
      }
    },
    education: {
      school: {
        type: String,
        default: null,
        maxlength: [200, 'Tên trường không được quá 200 ký tự']
      },
      major: {
        type: String,
        default: null,
        maxlength: [200, 'Chuyên ngành không được quá 200 ký tự']
      }
    }
  },
  { timestamps: true }
);

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcryptjs.genSalt(10);
    this.password = await bcryptjs.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return await bcryptjs.compare(candidatePassword, this.password);
};

// Indexes để tối ưu tìm kiếm
userSchema.index({ username: 1 }); // Index cho username search
userSchema.index({ email: 1 }); // Index cho email search (đã có unique index)
userSchema.index({ displayName: 1 }); // Index cho displayName search
userSchema.index({ isVerified: 1 }); // Index cho filter isVerified
userSchema.index({ isVerified: 1, username: 1 }); // Compound index cho search với isVerified
userSchema.index({ isVerified: 1, displayName: 1 }); // Compound index cho search với isVerified
userSchema.index({ isVerified: 1, email: 1 }); // Compound index cho search với isVerified

export default mongoose.model<IUser>('User', userSchema);
