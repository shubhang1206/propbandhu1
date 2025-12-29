const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'property_approved',
      'property_rejected',
      'property_added_to_cart',
      'visit_reminder',
      'booking_window_expiring',
      'cart_item_expired',
      'commission_earned',
      'edit_permission_granted',
      'property_lock',
      'property_unlock',
      'system_alert',
      'payment_received'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  data: {
    property_id: mongoose.Schema.Types.ObjectId,
    cart_item_id: mongoose.Schema.Types.ObjectId,
    commission_amount: Number,
    expiry_date: Date,
    action_url: String
  },
  is_read: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  read_at: Date
}, {
  timestamps: true
});

// Mark as read
notificationSchema.methods.markAsRead = function() {
  this.is_read = true;
  this.read_at = new Date();
  return this.save();
};

// Create notification
notificationSchema.statics.createNotification = async function(userId, type, title, message, data = {}) {
  return await this.create({
    user: userId,
    type,
    title,
    message,
    data
  });
};

module.exports = mongoose.model('Notification', notificationSchema);