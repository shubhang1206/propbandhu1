const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  broker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  property: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Property',
    required: true
  },
  property_price: {
    type: Number,
    required: true,
    min: 0
  },
  commission_type: {
    type: String,
    enum: ['adder', 'seller', 'adder_seller'],
    required: true
  },
  rate: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'paid', 'cancelled'],
    default: 'pending'
  },
  payment_date: Date,
  payment_method: {
    type: String,
    enum: ['bank_transfer', 'cheque', 'cash', 'online']
  },
  transaction_id: String,
  notes: String,
  
  // For audit trail
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  paid_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Commission override (admin can manually set)
  is_override: {
    type: Boolean,
    default: false
  },
  original_rate: Number,
  override_reason: String,
  
  // Timeline
  approved_at: Date,
  paid_at: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
commissionSchema.index({ broker: 1, status: 1 });
commissionSchema.index({ property: 1 });
commissionSchema.index({ status: 1, created_at: 1 });
commissionSchema.index({ broker: 1, payment_date: 1 });
commissionSchema.index({ commission_type: 1, status: 1 });

// Virtual for formatted amount
commissionSchema.virtual('formatted_amount').get(function() {
  return `₹${this.amount.toLocaleString('en-IN')}`;
});

// Virtual for formatted property price
commissionSchema.virtual('formatted_property_price').get(function() {
  if (!this.property_price) return 'Price not set';
  
  if (this.property_price >= 10000000) {
    return `₹${(this.property_price / 10000000).toFixed(2)} Cr`;
  } else if (this.property_price >= 100000) {
    return `₹${(this.property_price / 100000).toFixed(2)} L`;
  } else {
    return `₹${this.property_price.toLocaleString('en-IN')}`;
  }
});

// Method to calculate commission
commissionSchema.statics.calculateCommission = function(propertyPrice, commissionType, adderRate = 1.5, sellerRate = 2.5) {
  let rate = 0;
  
  switch (commissionType) {
    case 'adder':
      rate = adderRate;
      break;
    case 'seller':
      rate = sellerRate;
      break;
    case 'adder_seller':
      rate = adderRate + sellerRate;
      break;
    default:
      throw new Error('Invalid commission type');
  }
  
  const amount = (propertyPrice * rate) / 100;
  return { rate, amount };
};

// Method to approve commission
commissionSchema.methods.approve = async function(approvedBy, notes) {
  if (this.status !== 'pending') {
    throw new Error(`Commission is already ${this.status}`);
  }
  
  this.status = 'approved';
  this.approved_by = approvedBy;
  this.approved_at = new Date();
  if (notes) this.notes = notes;
  
  return this.save();
};

// Method to mark as paid
commissionSchema.methods.markAsPaid = async function(paidBy, paymentMethod, transactionId, notes) {
  if (this.status !== 'approved') {
    throw new Error('Commission must be approved before marking as paid');
  }
  
  this.status = 'paid';
  this.paid_by = paidBy;
  this.paid_at = new Date();
  this.payment_date = new Date();
  this.payment_method = paymentMethod;
  this.transaction_id = transactionId;
  if (notes) this.notes = notes;
  
  return this.save();
};

// Method to override commission (admin only)
commissionSchema.methods.override = async function(newRate, reason, updatedBy) {
  if (!this.is_override) {
    this.original_rate = this.rate;
    this.is_override = true;
  }
  
  this.rate = newRate;
  this.amount = (this.property_price * newRate) / 100;
  this.override_reason = reason;
  this.notes = `Commission overridden by ${updatedBy}: ${reason}`;
  
  return this.save();
};

// Static method to get broker's total commission
commissionSchema.statics.getBrokerTotal = async function(brokerId, status = null) {
  const query = { broker: brokerId };
  if (status) {
    query.status = status;
  }
  
  const result = await this.aggregate([
    { $match: query },
    { $group: {
      _id: '$status',
      totalAmount: { $sum: '$amount' },
      count: { $sum: 1 }
    }}
  ]);
  
  return result.reduce((acc, curr) => {
    acc[curr._id] = {
      amount: curr.totalAmount,
      count: curr.count
    };
    return acc;
  }, {});
};

// Static method to get commission summary by month
commissionSchema.statics.getMonthlySummary = async function(brokerId, year = new Date().getFullYear()) {
  return this.aggregate([
    {
      $match: {
        broker: mongoose.Types.ObjectId(brokerId),
        status: 'paid',
        paid_at: {
          $gte: new Date(`${year}-01-01`),
          $lt: new Date(`${year + 1}-01-01`)
        }
      }
    },
    {
      $group: {
        _id: { $month: '$paid_at' },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { '_id': 1 }
    }
  ]);
};

module.exports = mongoose.model('Commission', commissionSchema);