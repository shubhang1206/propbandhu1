const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: [true, 'Property title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Property description is required'],
    minlength: [50, 'Description must be at least 50 characters'],
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  short_description: {
    type: String,
    maxlength: [200, 'Short description cannot exceed 200 characters']
  },
  
  // Location Details
  address: {
    street: {
      type: String,
      trim: true
    },
    landmark: {
      type: String,
      trim: true
    },
    area: {
      type: String,
      trim: true
    },
    city: { 
      type: String, 
      trim: true
    },
    state: { 
      type: String, 
      trim: true
    },
    pincode: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^\d{6}$/.test(v);
        },
        message: 'Pincode must be 6 digits'
      },
      trim: true
    },
    coordinates: {
      lat: {
        type: Number,
        min: -90,
        max: 90
      },
      lng: {
        type: Number,
        min: -180,
        max: 180
      }
    }
  },
  
  // Property Details
  property_type: {
    type: String,
    enum: ['Residential', 'Commercial', 'Plot', 'Agricultural', 'Industrial'],
    required: [true, 'Property type is required']
  },
  sub_type: {
    type: String,
    required: [true, 'Property sub-type is required'],
    trim: true
  },
  
  // ===== STATUS MANAGEMENT - CRITICAL FOR ADMIN APPROVAL =====
  status: {
    type: String,
    enum: [
      'draft',           // Initial state when creating
      'pending_approval', // Submitted for admin review (DEFAULT)
      'approved',        // Admin approved, but not yet live
      'live',            // Live and visible to all users
      'rejected',        // Admin rejected with reason
      'suspended',       // Admin temporarily suspended
      'sold',            // Property sold
      'rented',          // Property rented
      'expired'          // Listing expired
    ],
    default: 'pending_approval' // Changed from 'draft' - REQUIRES ADMIN APPROVAL
  },
  
  // Approval tracking fields
  approval_status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'needs_revision'],
    default: 'pending'
  },
  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approved_at: Date,
  rejection_reason: {
    type: String,
    trim: true
  },
  rejected_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejected_at: Date,
  suspension_reason: {
    type: String,
    trim: true
  },
  suspended_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  suspended_at: Date,
  suspension_end: Date,
  
  // ===== VISIBILITY CONTROL =====
  visibility: {
    type: String,
    enum: ['public', 'private', 'hidden'],
    default: 'hidden' // Hidden until admin approves
  },
  is_visible: {
    type: Boolean,
    default: false // Will be true only when status is 'live'
  },
  is_active: {
    type: Boolean,
    default: true
  },
  
  // ===== OWNERSHIP & ROLES =====
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Seller is required']
  },
  added_by: {
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: [true, 'Added by user is required']
    },
    role: { 
      type: String, 
      enum: ['seller', 'broker'],
      required: [true, 'Added by role is required']
    }
  },
  broker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    validate: {
      validator: async function(v) {
        if (!v) return true;
        const User = mongoose.model('User');
        const user = await User.findById(v);
        return user && user.role === 'broker';
      },
      message: 'Broker must be a valid broker user'
    }
  },
  
  // Price Details
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [1000, 'Price must be at least ₹1000']
  },
  price_type: {
    type: String,
    enum: ['fixed', 'negotiable', 'auction'],
    default: 'fixed'
  },
  maintenance_charges: {
    type: Number,
    min: 0
  },
  security_deposit: {
    type: Number,
    min: 0
  },
  
  // Property Specifications
  bedrooms: {
    type: Number,
    min: 0,
    max: 50
  },
  bathrooms: {
    type: Number,
    min: 0,
    max: 50
  },
  balconies: {
    type: Number,
    min: 0,
    max: 20
  },
  built_up_area: {
    type: Number,
    required: [true, 'Built-up area is required'],
    min: [1, 'Built-up area must be positive']
  },
  carpet_area: {
    type: Number,
    min: 0
  },
  area_unit: {
    type: String,
    enum: ['sqft', 'sqm', 'acre', 'hectare'],
    default: 'sqft'
  },
  floor_number: {
    type: Number,
    min: 0,
    validate: {
      validator: function(v) {
        if (!v || !this.total_floors) return true;
        return v <= this.total_floors;
      },
      message: 'Floor number cannot exceed total floors'
    }
  },
  total_floors: {
    type: Number,
    min: 0
  },
  age_of_property: {
    type: Number,
    min: 0,
    max: 100
  },
  furnishing: {
    type: String,
    enum: ['unfurnished', 'semi_furnished', 'fully_furnished'],
    default: 'unfurnished'
  },
  facing: {
    type: String,
    enum: ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West', '']
  },
  
  // Amenities & Features
  amenities: {
    type: [String],
    default: []
  },
  features: {
    type: [String],
    default: []
  },
  
  // Media
  images: {
    type: [{
      url: { 
        type: String, 
        required: true 
      },
      caption: String,
      is_primary: { 
        type: Boolean, 
        default: false 
      },
      order: { 
        type: Number, 
        default: 0 
      },
      approved: {
        type: Boolean,
        default: false // Images also need approval
      },
      rejection_reason: String
    }],
    default: []
  },
  videos: [{
    url: String,
    type: {
      type: String,
      enum: ['youtube', 'vimeo', 'direct']
    },
    approved: {
      type: Boolean,
      default: false
    }
  }],
  documents: [{
    name: String,
    url: String,
    type: {
      type: String,
      enum: ['ownership', 'plan', 'certificate', 'tax', 'other']
    },
    approved: {
      type: Boolean,
      default: false
    },
    verified: {
      type: Boolean,
      default: false
    }
  }],
  
  // Edit Permissions (Admin Controlled)
  edit_permissions: {
    enabled: { 
      type: Boolean, 
      default: false 
    },
    allowed_fields: [String],
    start_time: Date,
    end_time: Date,
    reason: String,
    granted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    granted_at: Date
  },
  
  // Cart & Timeline Tracking
  cart_status: {
    in_cart: { 
      type: Boolean, 
      default: false 
    },
    buyer_id: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    added_at: Date,
    visit_confirmed: { 
      type: Boolean, 
      default: false 
    },
    visit_confirmed_at: Date,
    confirmed_by: {
      user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
      },
      role: {
        type: String,
        enum: ['broker', 'admin', 'seller']
      },
      method: {
        type: String,
        enum: ['otp', 'qr', 'manual']
      }
    },
    booking_window_start: Date,
    booking_window_end: Date
  },
  
  // Commission Details
  commission: {
    adder_rate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    seller_rate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    adder_paid: { 
      type: Boolean, 
      default: false 
    },
    seller_paid: { 
      type: Boolean, 
      default: false 
    },
    adder_paid_at: Date,
    seller_paid_at: Date
  },
  
  // View & Activity Tracking
  views: { 
    type: Number, 
    default: 0 
  },
  inquiries: { 
    type: Number, 
    default: 0 
  },
  
  // Status Flags
  is_featured: { 
    type: Boolean, 
    default: false 
  },
  is_verified: { 
    type: Boolean, 
    default: false 
  },
  is_premium: {
    type: Boolean,
    default: false
  },
  is_urgent: {
    type: Boolean,
    default: false
  },
  
  // Timestamps
  submitted_at: {
    type: Date,
    default: Date.now
  },
  live_at: Date,
  expires_at: {
    type: Date,
    default: function() {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 90);
      return expiry;
    }
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===== MIDDLEWARE FOR AUTO-STATUS MANAGEMENT =====

// Generate slug before saving
propertySchema.pre('save', async function(next) {
  if (!this.isModified('title')) return next();
  
  let baseSlug = this.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
    
  const Property = this.constructor;
  let slug = baseSlug;
  let counter = 1;
  
  while (await Property.findOne({ slug, _id: { $ne: this._id } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  this.slug = slug;
  next();
});

// Auto-update visibility based on status
propertySchema.pre('save', function(next) {
  // Update is_visible based on status
  if (this.status === 'live') {
    this.is_visible = true;
    this.visibility = 'public';
  } else if (this.status === 'approved') {
    this.is_visible = false;
    this.visibility = 'private';
  } else {
    this.is_visible = false;
    this.visibility = 'hidden';
  }
  
  // Update approval_status based on status
  if (['draft', 'pending_approval'].includes(this.status)) {
    this.approval_status = 'pending';
  } else if (this.status === 'approved') {
    this.approval_status = 'approved';
  } else if (this.status === 'rejected') {
    this.approval_status = 'rejected';
  }
  
  // Auto-set live_at when status becomes 'live'
  if (this.isModified('status') && this.status === 'live' && !this.live_at) {
    this.live_at = new Date();
  }
  
  // Auto-set approved_at when status becomes 'approved'
  if (this.isModified('status') && this.status === 'approved' && !this.approved_at) {
    this.approved_at = new Date();
  }
  
  next();
});

// Validation hook for images
propertySchema.pre('validate', function(next) {
  // Ensure at least one primary image if images exist
  if (this.images && this.images.length > 0) {
    const primaryImages = this.images.filter(img => img.is_primary);
    if (primaryImages.length === 0) {
      this.images[0].is_primary = true;
    } else if (primaryImages.length > 1) {
      let foundFirst = false;
      this.images.forEach(img => {
        if (img.is_primary) {
          if (!foundFirst) {
            foundFirst = true;
          } else {
            img.is_primary = false;
          }
        }
      });
    }
    
    // Set order if not set
    this.images.forEach((img, index) => {
      if (img.order === undefined || img.order === null) {
        img.order = index;
      }
    });
    
    this.images.sort((a, b) => a.order - b.order);
  }
  
  next();
});

// ===== VIRTUAL PROPERTIES =====

propertySchema.virtual('formatted_price').get(function() {
  if (!this.price) return 'Price not set';
  
  if (this.price >= 10000000) {
    return `₹${(this.price / 10000000).toFixed(2)} Cr`;
  } else if (this.price >= 100000) {
    return `₹${(this.price / 100000).toFixed(2)} L`;
  } else {
    return `₹${this.price.toLocaleString('en-IN')}`;
  }
});

propertySchema.virtual('full_address').get(function() {
  const parts = [
    this.address.street,
    this.address.landmark,
    this.address.area,
    this.address.city,
    this.address.state,
    this.address.pincode
  ].filter(Boolean);
  return parts.join(', ');
});

propertySchema.virtual('primary_image').get(function() {
  if (!this.images || this.images.length === 0) return null;
  const primary = this.images.find(img => img.is_primary);
  return primary ? primary.url : this.images[0].url;
});

propertySchema.virtual('approved_images').get(function() {
  if (!this.images) return [];
  return this.images.filter(img => img.approved);
});

propertySchema.virtual('pending_images').get(function() {
  if (!this.images) return [];
  return this.images.filter(img => !img.approved);
});

propertySchema.virtual('is_approved').get(function() {
  return this.status === 'approved' || this.status === 'live';
});

propertySchema.virtual('is_pending').get(function() {
  return this.status === 'pending_approval';
});

propertySchema.virtual('is_rejected').get(function() {
  return this.status === 'rejected';
});

propertySchema.virtual('is_suspended').get(function() {
  return this.status === 'suspended';
});

// ===== INSTANCE METHODS =====

// Method to submit for admin approval
propertySchema.methods.submitForApproval = function() {
  if (this.status !== 'draft') {
    throw new Error('Only draft properties can be submitted for approval');
  }
  
  this.status = 'pending_approval';
  this.submitted_at = new Date();
  return this.save();
};

// Method for admin to approve property
propertySchema.methods.approve = function(adminId, options = {}) {
  if (this.status !== 'pending_approval') {
    throw new Error('Only pending properties can be approved');
  }
  
  this.status = 'approved';
  this.approved_by = adminId;
  this.approved_at = new Date();
  
  // Auto-approve images if option is set
  if (options.autoApproveImages && this.images) {
    this.images.forEach(img => {
      img.approved = true;
    });
  }
  
  // Set live automatically if option is set
  if (options.autoGoLive) {
    this.status = 'live';
    this.live_at = new Date();
  }
  
  return this.save();
};

// Method for admin to reject property
propertySchema.methods.reject = function(adminId, reason) {
  if (this.status !== 'pending_approval') {
    throw new Error('Only pending properties can be rejected');
  }
  
  if (!reason || reason.trim().length < 10) {
    throw new Error('Rejection reason must be at least 10 characters');
  }
  
  this.status = 'rejected';
  this.rejection_reason = reason.trim();
  this.rejected_by = adminId;
  this.rejected_at = new Date();
  
  return this.save();
};

// Method for admin to suspend property
propertySchema.methods.suspend = function(adminId, reason, suspensionEnd = null) {
  if (!['approved', 'live'].includes(this.status)) {
    throw new Error('Only approved or live properties can be suspended');
  }
  
  if (!reason || reason.trim().length < 10) {
    throw new Error('Suspension reason must be at least 10 characters');
  }
  
  this.status = 'suspended';
  this.suspension_reason = reason.trim();
  this.suspended_by = adminId;
  this.suspended_at = new Date();
  this.suspension_end = suspensionEnd;
  
  return this.save();
};

// Method to unsuspend property
propertySchema.methods.unsuspend = function(adminId) {
  if (this.status !== 'suspended') {
    throw new Error('Only suspended properties can be unsuspended');
  }
  
  // Revert to previous status (store previous status in a field or default to 'approved')
  this.status = this.previous_status || 'approved';
  this.suspension_reason = undefined;
  this.suspended_by = undefined;
  this.suspended_at = undefined;
  this.suspension_end = undefined;
  
  return this.save();
};

// Method to make property live
propertySchema.methods.makeLive = function() {
  if (this.status !== 'approved') {
    throw new Error('Only approved properties can be made live');
  }
  
  this.status = 'live';
  this.live_at = new Date();
  return this.save();
};

// Method to check if property is visible to public
propertySchema.methods.isVisibleToPublic = function() {
  return this.is_visible && 
         this.is_active && 
         this.status === 'live' && 
         this.visibility === 'public' &&
         new Date() < this.expires_at;
};

// Method to check if property is editable by seller
propertySchema.methods.canSellerEdit = function(sellerId) {
  // Seller can edit if:
  // 1. They own the property
  // 2. Property is not in cart
  // 3. Property is in draft, rejected, or needs revision state
  // 4. No edit permissions restrictions
  return this.seller.toString() === sellerId.toString() &&
         !this.cart_status.in_cart &&
         ['draft', 'rejected', 'pending_approval'].includes(this.status) &&
         !this.edit_permissions.enabled;
};

// Method to check if property can be viewed by user
propertySchema.methods.canView = function(user) {
  // Always visible to admin
  if (user && user.role === 'admin') return true;
  
  // Always visible to owner
  if (user && this.seller.toString() === user._id.toString()) return true;
  
  // Check if property is visible to public
  return this.isVisibleToPublic();
};

// Method to get approval history
propertySchema.methods.getApprovalHistory = async function() {
  // In a real app, you might have a separate ApprovalHistory model
  const history = [];
  
  if (this.submitted_at) {
    history.push({
      action: 'submitted',
      at: this.submitted_at,
      by: this.seller
    });
  }
  
  if (this.approved_at) {
    history.push({
      action: 'approved',
      at: this.approved_at,
      by: this.approved_by
    });
  }
  
  if (this.rejected_at) {
    history.push({
      action: 'rejected',
      at: this.rejected_at,
      by: this.rejected_by,
      reason: this.rejection_reason
    });
  }
  
  if (this.suspended_at) {
    history.push({
      action: 'suspended',
      at: this.suspended_at,
      by: this.suspended_by,
      reason: this.suspension_reason
    });
  }
  
  if (this.live_at) {
    history.push({
      action: 'went_live',
      at: this.live_at
    });
  }
  
  return history;
};

// ===== STATIC METHODS =====

// Find properties visible to public
propertySchema.statics.findPublic = function(query = {}) {
  return this.find({
    ...query,
    status: 'live',
    is_visible: true,
    is_active: true,
    expires_at: { $gt: new Date() }
  });
};

// Find properties pending approval
propertySchema.statics.findPendingApproval = function(query = {}) {
  return this.find({
    ...query,
    status: 'pending_approval'
  });
};

// Find properties by seller with status
propertySchema.statics.findBySeller = function(sellerId, status = null) {
  const query = { seller: sellerId };
  if (status) query.status = status;
  return this.find(query);
};

// Find properties for admin dashboard
propertySchema.statics.getDashboardStats = async function() {
  const [
    totalProperties,
    pendingApproval,
    approvedProperties,
    liveProperties,
    rejectedProperties,
    suspendedProperties
  ] = await Promise.all([
    this.countDocuments(),
    this.countDocuments({ status: 'pending_approval' }),
    this.countDocuments({ status: 'approved' }),
    this.countDocuments({ status: 'live' }),
    this.countDocuments({ status: 'rejected' }),
    this.countDocuments({ status: 'suspended' })
  ]);
  
  return {
    total: totalProperties,
    pending: pendingApproval,
    approved: approvedProperties,
    live: liveProperties,
    rejected: rejectedProperties,
    suspended: suspendedProperties
  };
};

// ===== INDEXES =====

propertySchema.index({ seller: 1, status: 1 });
propertySchema.index({ status: 1, is_visible: 1, expires_at: 1 });
propertySchema.index({ 'address.city': 1, 'address.area': 1 });
propertySchema.index({ price: 1, property_type: 1 });
propertySchema.index({ slug: 1 }, { unique: true });
propertySchema.index({ createdAt: -1 });
propertySchema.index({ 
  status: 1,
  is_active: 1,
  is_visible: 1,
  createdAt: -1 
});
propertySchema.index({ 
  'address.coordinates': '2dsphere',
  sparse: true 
});

module.exports = mongoose.model('Property', propertySchema);