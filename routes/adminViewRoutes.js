const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const Property = require('../models/Property');
const User = require('../models/User');
const Commission = require('../models/Commission');
const mongoose = require('mongoose');

// Apply admin auth middleware to all routes
router.use(requireAuth('admin'));

// ========== ADMIN DASHBOARD ==========
router.get('/dashboard', async (req, res) => {
  try {
    // Get all stats
    const totalUsers = await User.countDocuments();
    const totalProperties = await Property.countDocuments();
    const pendingApprovals = await Property.countDocuments({ status: 'pending_approval' });
    const approvedProperties = await Property.countDocuments({ status: 'approved' });
    const liveProperties = await Property.countDocuments({ status: 'live' });
    
    // Get pending properties with details
    const pendingProperties = await Property.find({ status: 'pending_approval' })
      .populate('seller', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    
    // Get recent users
    const recentUsers = await User.find()
      .select('name email phone role is_active created_at')
      .sort({ created_at: -1 })
      .limit(5)
      .lean();
    
    // Get recent properties
    const recentProperties = await Property.find()
      .populate('seller', 'name email')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    
    const stats = {
      totalUsers,
      totalProperties,
      pendingApprovals,
      approvedProperties,
      liveProperties,
      pendingProperties,
      recentUsers,
      recentProperties
    };
    
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      user: req.user,
      stats: stats,
      activePage: 'dashboard'
    });
    
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      user: req.user,
      stats: {
        totalUsers: 0,
        totalProperties: 0,
        pendingApprovals: 0,
        approvedProperties: 0,
        liveProperties: 0,
        pendingProperties: [],
        recentUsers: [],
        recentProperties: []
      },
      activePage: 'dashboard'
    });
  }
});

// ========== APPROVALS MANAGEMENT ==========
router.get('/approvals', async (req, res) => {
  try {
    const { status, type, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    let filter = { status: 'pending_approval' };
    
    if (type && type !== 'all') {
      if (type === 'property') {
        filter = { status: 'pending_approval' };
      } else if (type === 'profile') {
        // Assuming you have a profile approval model
        filter = { status: 'pending' };
      }
    }
    
    const properties = await Property.find(filter)
      .populate('seller', 'name email phone')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const totalPending = await Property.countDocuments({ status: 'pending_approval' });
    const totalPages = Math.ceil(totalPending / limit);
    
    // Calculate reviewedToday - properties reviewed/approved today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const reviewedToday = await Property.countDocuments({
      $or: [
        { status: 'approved', updatedAt: { $gte: startOfToday } },
        { status: 'rejected', updatedAt: { $gte: startOfToday } }
      ]
    });
    
    // Get approved today count specifically
    const approvedToday = await Property.countDocuments({
      status: 'approved',
      updatedAt: { $gte: startOfToday }
    });
    
    // Get total approved properties count
    const totalApproved = await Property.countDocuments({ status: 'approved' });
    
    // Calculate average review time (in hours)
    const reviewedProperties = await Property.find({
      $or: [{ status: 'approved' }, { status: 'rejected' }],
      createdAt: { $exists: true },
      updatedAt: { $exists: true }
    }).select('createdAt updatedAt').lean();
    
    let averageTime = 0;
    if (reviewedProperties.length > 0) {
      const totalTime = reviewedProperties.reduce((sum, property) => {
        const reviewTime = property.updatedAt - property.createdAt;
        return sum + reviewTime;
      }, 0);
      averageTime = Math.round((totalTime / reviewedProperties.length) / (1000 * 60 * 60)); // Convert to hours
    }
    
    // Get pending commissions count
    const pendingCommissions = await Commission.countDocuments({ status: 'pending' });
    
    res.render('admin/approvals', {
      title: 'Approval Management',
      user: req.user,
      properties: properties,
      totalPending: totalPending,
      pendingCount: totalPending, // Add this for the template
      reviewedToday: reviewedToday,
      approvedToday: approvedToday, // Add this
      totalApproved: totalApproved, // Add this
      averageTime: averageTime,
      statusFilter: status || 'pending_approval',
      typeFilter: type || 'all',
      query: req.query,
      currentPage: parseInt(page),
      totalPages: totalPages,
      limit: parseInt(limit),
      pendingCommissions: pendingCommissions,
      activePage: 'approvals'
    });
    
  } catch (error) {
    console.error('Approvals management error:', error);
    
    // Calculate pendingCommissions with error handling
    const pendingCommissions = await Commission.countDocuments({ status: 'pending' }).catch(() => 0);
    
    res.render('admin/approvals', {
      title: 'Approval Management',
      user: req.user,
      properties: [],
      totalPending: 0,
      pendingCount: 0,
      reviewedToday: 0,
      approvedToday: 0,
      totalApproved: 0,
      averageTime: 0,
      statusFilter: '',
      typeFilter: 'all',
      query: req.query,
      currentPage: 1,
      totalPages: 0,
      limit: 10,
      pendingCommissions: pendingCommissions,
      activePage: 'approvals'
    });
  }
});

// ========== USERS MANAGEMENT ==========
router.get('/users', async (req, res) => {
  try {
    const { role, status, search, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    let filter = {};
    if (role && role !== 'all') filter.role = role;
    if (status && status !== 'all') {
      if (status === 'active') filter.is_active = true;
      else if (status === 'inactive') filter.is_active = false;
      else if (status === 'pending') filter.email_verified = false;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const users = await User.find(filter)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    // Get property counts for each user
    for (let user of users) {
      user.propertyCount = await Property.countDocuments({ seller: user._id });
    }
    
    const totalUsers = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalUsers / limit);
    
    // Get role counts
    const roleCounts = {
      admin: await User.countDocuments({ role: 'admin' }),
      seller: await User.countDocuments({ role: 'seller' }),
      broker: await User.countDocuments({ role: 'broker' }),
      buyer: await User.countDocuments({ role: 'buyer' })
    };
    
    const activeUsers = await User.countDocuments({ is_active: true });
    
    res.render('admin/users', {
      title: 'User Management',
      user: req.user,
      users: users,
      totalUsers: totalUsers,
      activeUsers: activeUsers,
      roleCounts: roleCounts,
      query: req.query,
      roleFilter: role,
      statusFilter: status,
      currentPage: parseInt(page),
      totalPages: totalPages,
      limit: parseInt(limit),
      activePage: 'users'
    });
    
  } catch (error) {
    console.error('User management error:', error);
    res.render('admin/users', {
      title: 'User Management',
      user: req.user,
      users: [],
      totalUsers: 0,
      activeUsers: 0,
      roleCounts: { admin: 0, seller: 0, broker: 0, buyer: 0 },
      query: req.query,
      roleFilter: '',
      statusFilter: '',
      currentPage: 1,
      totalPages: 0,
      limit: 10,
      activePage: 'users'
    });
  }
});

// ========== USER DETAIL VIEW ==========
router.get('/users/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).render('error', {
        title: 'Invalid ID',
        message: 'Invalid user ID format.',
        user: req.user
      });
    }
    
    const user = await User.findById(req.params.id)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .lean();
    
    if (!user) {
      return res.status(404).render('error', {
        title: 'Not Found',
        message: 'User not found.',
        user: req.user
      });
    }
    
    // Get user's properties
    const userProperties = await Property.find({ seller: user._id })
      .populate('approved_by', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    
    // Get user's commissions if they're a broker
    let userCommissions = [];
    if (user.role === 'broker') {
      userCommissions = await Commission.find({ broker: user._id })
        .populate('property', 'title price')
        .sort({ created_at: -1 })
        .lean();
    }
    
    // Get activity stats
    const propertyCount = await Property.countDocuments({ seller: user._id });
    const approvedProperties = await Property.countDocuments({ 
      seller: user._id, 
      status: 'approved' 
    });
    const pendingProperties = await Property.countDocuments({ 
      seller: user._id, 
      status: 'pending_approval' 
    });
    
    res.render('admin/user-details', {
      title: `User Details - ${user.name}`,
      user: req.user,
      userData: user,
      userProperties: userProperties,
      userCommissions: userCommissions,
      stats: {
        propertyCount,
        approvedProperties,
        pendingProperties
      },
      activePage: 'users'
    });
    
  } catch (error) {
    console.error('User details error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load user details.',
      user: req.user
    });
  }
});

// ========== PROPERTIES MANAGEMENT ==========
router.get('/properties', async (req, res) => {
  try {
    const { status, property_type, city, search, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    let filter = {};
    if (status && status !== 'all') filter.status = status;
    if (property_type && property_type !== 'all') filter.property_type = property_type;
    if (city && city !== 'all') filter['address.city'] = city;
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'address.city': { $regex: search, $options: 'i' } },
        { 'address.area': { $regex: search, $options: 'i' } }
      ];
    }
    
    const properties = await Property.find(filter)
      .populate('seller', 'name email phone')
      .populate('approved_by', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const totalProperties = await Property.countDocuments(filter);
    const totalPages = Math.ceil(totalProperties / limit);
    
    // Get counts for different statuses
    const pendingApprovals = await Property.countDocuments({ status: 'pending_approval' });
    const approvedProperties = await Property.countDocuments({ status: 'approved' });
    const liveProperties = await Property.countDocuments({ status: 'live' });
    const rejectedProperties = await Property.countDocuments({ status: 'rejected' });
    const suspendedProperties = await Property.countDocuments({ status: 'suspended' });
    
    // Get pending commissions count for the admin dashboard
    const pendingCommissions = await Commission.countDocuments({ status: 'pending' });
    
    // Get unique cities for filter dropdown
    const uniqueCities = await Property.distinct('address.city');
    
    res.render('admin/properties', {
      title: 'Property Management',
      user: req.user,
      properties: properties,
      totalProperties: totalProperties,
      pendingApprovals: pendingApprovals,
      approvedProperties: approvedProperties,
      liveProperties: liveProperties,
      rejectedProperties: rejectedProperties,
      suspendedProperties: suspendedProperties,
      pendingCommissions: pendingCommissions, // Added this line
      statusFilter: status,
      propertyTypeFilter: property_type,
      cityFilter: city,
      uniqueCities: uniqueCities.filter(Boolean).sort(),
      query: req.query,
      currentPage: parseInt(page),
      totalPages: totalPages,
      limit: parseInt(limit),
      activePage: 'properties'
    });
    
  } catch (error) {
    console.error('Properties management error:', error);
    
    // Also include pendingCommissions in error case to prevent template errors
    const pendingCommissions = await Commission.countDocuments({ status: 'pending' }).catch(() => 0);
    
    res.render('admin/properties', {
      title: 'Property Management',
      user: req.user,
      properties: [],
      totalProperties: 0,
      pendingApprovals: 0,
      approvedProperties: 0,
      liveProperties: 0,
      rejectedProperties: 0,
      suspendedProperties: 0,
      pendingCommissions: pendingCommissions, // Added this line
      statusFilter: '',
      propertyTypeFilter: '',
      cityFilter: '',
      uniqueCities: [],
      query: req.query,
      currentPage: 1,
      totalPages: 0,
      limit: 10,
      activePage: 'properties'
    });
  }
});

// ========== PROPERTY DETAIL VIEW ==========
router.get('/properties/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).render('error', {
        title: 'Invalid ID',
        message: 'Invalid property ID format.',
        user: req.user
      });
    }
    
    const property = await Property.findById(req.params.id)
      .populate('seller', 'name email phone verified created_at')
      .populate('added_by.user', 'name email role')
      .populate('broker', 'name email phone')
      .populate('approved_by', 'name email')
      .populate('rejected_by', 'name email')
      .populate('suspended_by', 'name email')
      .lean();
    
    if (!property) {
      return res.status(404).render('error', {
        title: 'Not Found',
        message: 'Property not found.',
        user: req.user
      });
    }
    
    // Get commission history for this property
    const commissions = await Commission.find({ property: property._id })
      .populate('broker', 'name email phone')
      .sort({ created_at: -1 })
      .lean();
    
    // Get similar properties
    const similarProperties = await Property.find({
      _id: { $ne: property._id },
      property_type: property.property_type,
      'address.city': property.address?.city,
      status: 'live'
    })
    .populate('seller', 'name')
    .limit(4)
    .lean();
    
    res.render('admin/property-details', {
      title: `Property Details - ${property.title}`,
      user: req.user,
      property: property,
      commissions: commissions,
      similarProperties: similarProperties,
      activePage: 'properties'
    });
    
  } catch (error) {
    console.error('Property details error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load property details.',
      user: req.user
    });
  }
});

// ========== COMMISSIONS MANAGEMENT ==========
router.get('/commissions', async (req, res) => {
  try {
    const { status, broker, commission_type, startDate, endDate, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    
    let filter = {};
    if (status && status !== 'all') filter.status = status;
    if (broker && broker !== 'all') filter.broker = broker;
    if (commission_type && commission_type !== 'all') filter.commission_type = commission_type;
    
    // Date range filter
    if (startDate || endDate) {
      filter.created_at = {};
      if (startDate) filter.created_at.$gte = new Date(startDate);
      if (endDate) filter.created_at.$lte = new Date(endDate);
    }
    
    const commissions = await Commission.find(filter)
      .populate('broker', 'name email phone')
      .populate('property', 'title price location')
      .populate('approved_by', 'name email')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();
    
    const totalCommissions = await Commission.countDocuments(filter);
    const totalPages = Math.ceil(totalCommissions / limit);
    
    // Get summary statistics
    const summary = await Commission.aggregate([
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          pendingAmount: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] 
            } 
          },
          approvedAmount: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] 
            } 
          },
          paidAmount: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] 
            } 
          },
          pendingCount: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] 
            } 
          },
          approvedCount: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] 
            } 
          },
          paidCount: { 
            $sum: { 
              $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] 
            } 
          }
        }
      }
    ]);
    
    // Get brokers for filter dropdown
    const brokers = await User.find({ role: 'broker' })
      .select('name email phone')
      .sort({ name: 1 })
      .lean();
    
    res.render('admin/commissions', {
      title: 'Commission Management',
      user: req.user,
      commissions: commissions,
      totalCommissions: totalCommissions,
      summary: summary[0] || {
        totalAmount: 0,
        pendingAmount: 0,
        approvedAmount: 0,
        paidAmount: 0,
        pendingCount: 0,
        approvedCount: 0,
        paidCount: 0
      },
      brokers: brokers,
      statusFilter: status,
      brokerFilter: broker,
      commissionTypeFilter: commission_type,
      startDate: startDate,
      endDate: endDate,
      query: req.query,
      currentPage: parseInt(page),
      totalPages: totalPages,
      limit: parseInt(limit),
      activePage: 'commissions'
    });
    
  } catch (error) {
    console.error('Commissions management error:', error);
    res.render('admin/commissions', {
      title: 'Commission Management',
      user: req.user,
      commissions: [],
      totalCommissions: 0,
      summary: {
        totalAmount: 0,
        pendingAmount: 0,
        approvedAmount: 0,
        paidAmount: 0,
        pendingCount: 0,
        approvedCount: 0,
        paidCount: 0
      },
      brokers: [],
      statusFilter: '',
      brokerFilter: '',
      commissionTypeFilter: '',
      startDate: '',
      endDate: '',
      query: req.query,
      currentPage: 1,
      totalPages: 0,
      limit: 10,
      activePage: 'commissions'
    });
  }
});

// ========== COMMISSION DETAIL VIEW ==========
router.get('/commissions/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).render('error', {
        title: 'Invalid ID',
        message: 'Invalid commission ID format.',
        user: req.user
      });
    }
    
    const commission = await Commission.findById(req.params.id)
      .populate('broker', 'name email phone bank_details')
      .populate('property', 'title price location seller')
      .populate('approved_by', 'name email')
      .populate('paid_by', 'name email')
      .lean();
    
    if (!commission) {
      return res.status(404).render('error', {
        title: 'Not Found',
        message: 'Commission not found.',
        user: req.user
      });
    }
    
    // Populate property seller
    if (commission.property && commission.property.seller) {
      const seller = await User.findById(commission.property.seller)
        .select('name email phone')
        .lean();
      commission.property.seller = seller;
    }
    
    // Get similar commissions
    const similarCommissions = await Commission.find({
      _id: { $ne: commission._id },
      broker: commission.broker._id,
      status: commission.status
    })
    .populate('property', 'title price')
    .limit(4)
    .lean();
    
    res.render('admin/commission-details', {
      title: `Commission Details - ${commission._id.toString().substring(18, 24).toUpperCase()}`,
      user: req.user,
      commission: commission,
      similarCommissions: similarCommissions,
      activePage: 'commissions'
    });
    
  } catch (error) {
    console.error('Commission details error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load commission details.',
      user: req.user
    });
  }
});

// ========== ANALYTICS PAGE ==========
router.get('/analytics', async (req, res) => {
  try {
    // Last 30 days data
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // User registration trend
    const userRegistrations = await User.aggregate([
      {
        $match: {
          created_at: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Property listing trend
    const propertyListings = await Property.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Property status distribution
    const propertyStatus = await Property.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // User role distribution
    const userRoles = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.render('admin/analytics', {
      title: 'Analytics Dashboard',
      user: req.user,
      analytics: {
        userRegistrations,
        propertyListings,
        propertyStatus,
        userRoles
      },
      activePage: 'analytics'
    });
    
  } catch (error) {
    console.error('Analytics error:', error);
    res.render('admin/analytics', {
      title: 'Analytics Dashboard',
      user: req.user,
      analytics: {
        userRegistrations: [],
        propertyListings: [],
        propertyStatus: [],
        userRoles: []
      },
      activePage: 'analytics'
    });
  }
});

// ========== REPORTS PAGE ==========
router.get('/reports', async (req, res) => {
  try {
    const { reportType = 'overview', startDate, endDate } = req.query;
    
    let filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    let reportData = {};
    let overview = {};
    let detailedStats = {};
    let chartData = {};
    let topSellers = [];
    let topProperties = [];
    
    switch (reportType) {
      case 'users':
        reportData = await User.find(filter)
          .select('name email phone role created_at is_active')
          .sort({ created_at: -1 })
          .lean();
        
        // User growth calculation
        const userGrowth = await User.aggregate([
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$created_at" } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } },
          { $limit: 6 }
        ]);
        
        chartData = {
          userLabels: userGrowth.map(item => item._id),
          userData: userGrowth.map(item => item.count)
        };
        break;
        
      case 'properties':
        reportData = await Property.find(filter)
          .populate('seller', 'name email')
          .sort({ createdAt: -1 })
          .lean();
        
        // Property growth calculation
        const propertyGrowth = await Property.aggregate([
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } },
          { $limit: 6 }
        ]);
        
        chartData = {
          propertyLabels: propertyGrowth.map(item => item._id),
          propertyData: propertyGrowth.map(item => item.count)
        };
        break;
        
      case 'financial':
        reportData = await Commission.find(filter)
          .populate('broker', 'name email')
          .populate('property', 'title price')
          .sort({ created_at: -1 })
          .lean();
        break;
        
      case 'performance':
        // Get top sellers
        topSellers = await Property.aggregate([
          {
            $group: {
              _id: '$seller',
              properties: { $sum: 1 },
              approvalRate: {
                $avg: {
                  $cond: [{ $eq: ['$status', 'approved'] }, 100, 0]
                }
              }
            }
          },
          { $sort: { properties: -1 } },
          { $limit: 5 }
        ]);
        
        // Populate seller names
        for (let seller of topSellers) {
          const user = await User.findById(seller._id).select('name').lean();
          seller.name = user?.name || 'Unknown Seller';
        }
        
        // Get top viewed properties
        topProperties = await Property.find({ views: { $gt: 0 } })
          .select('title location price views')
          .sort({ views: -1 })
          .limit(5)
          .lean();
        break;
        
      case 'overview':
      default:
        // Overview statistics
        const currentPeriodStart = new Date();
        currentPeriodStart.setDate(currentPeriodStart.getDate() - 30);
        const previousPeriodStart = new Date(currentPeriodStart);
        previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);
        
        // Current period stats
        const currentUsers = await User.countDocuments({
          created_at: { $gte: currentPeriodStart }
        });
        const currentProperties = await Property.countDocuments({
          createdAt: { $gte: currentPeriodStart }
        });
        const currentCommissions = await Commission.aggregate([
          {
            $match: { created_at: { $gte: currentPeriodStart } }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);
        
        // Previous period stats
        const previousUsers = await User.countDocuments({
          created_at: { $gte: previousPeriodStart, $lt: currentPeriodStart }
        });
        const previousProperties = await Property.countDocuments({
          createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart }
        });
        const previousCommissions = await Commission.aggregate([
          {
            $match: { 
              created_at: { 
                $gte: previousPeriodStart, 
                $lt: currentPeriodStart 
              } 
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]);
        
        // Approval rate
        const approvedCount = await Property.countDocuments({ status: 'approved' });
        const pendingCount = await Property.countDocuments({ status: 'pending_approval' });
        const approvalRate = totalProperties > 0 ? 
          Math.round((approvedCount / (approvedCount + pendingCount)) * 100) : 0;
        
        overview = {
          newUsers: currentUsers,
          newProperties: currentProperties,
          revenue: currentCommissions[0]?.total || 0,
          approvalRate: approvalRate,
          userGrowth: previousUsers > 0 ? 
            Math.round(((currentUsers - previousUsers) / previousUsers) * 100) : 0,
          propertyGrowth: previousProperties > 0 ? 
            Math.round(((currentProperties - previousProperties) / previousProperties) * 100) : 0,
          revenueGrowth: previousCommissions[0]?.total > 0 ? 
            Math.round(((currentCommissions[0]?.total - previousCommissions[0]?.total) / previousCommissions[0]?.total) * 100) : 0,
          approvalChange: 5 // Hardcoded for now
        };
        
        detailedStats = {
          totalUsers: await User.countDocuments(),
          previousTotalUsers: await User.countDocuments({
            created_at: { $lt: currentPeriodStart }
          }),
          userChange: currentUsers,
          
          totalProperties: await Property.countDocuments(),
          previousTotalProperties: await Property.countDocuments({
            createdAt: { $lt: currentPeriodStart }
          }),
          propertyChange: currentProperties,
          
          activeListings: await Property.countDocuments({ status: 'live' }),
          previousActiveListings: await Property.countDocuments({
            status: 'live',
            createdAt: { $lt: currentPeriodStart }
          }),
          listingChange: currentProperties,
          
          totalCommission: currentCommissions[0]?.total || 0,
          previousTotalCommission: previousCommissions[0]?.total || 0,
          commissionChange: (currentCommissions[0]?.total || 0) - (previousCommissions[0]?.total || 0),
          
          approvalRate: approvalRate,
          previousApprovalRate: 75, // Hardcoded for now
          approvalRateChange: 5 // Hardcoded for now
        };
        break;
    }
    
    res.render('admin/reports', {
      title: 'Reports & Analytics',
      user: req.user,
      reportType: reportType,
      reportData: reportData,
      overview: overview,
      detailedStats: detailedStats,
      chartData: chartData,
      topSellers: topSellers,
      topProperties: topProperties,
      startDate: startDate,
      endDate: endDate,
      activePage: 'reports'
    });
    
  } catch (error) {
    console.error('Reports error:', error);
    res.render('admin/reports', {
      title: 'Reports & Analytics',
      user: req.user,
      reportType: 'overview',
      reportData: [],
      overview: {},
      detailedStats: {},
      chartData: {},
      topSellers: [],
      topProperties: [],
      startDate: '',
      endDate: '',
      activePage: 'reports'
    });
  }
});

// ========== SETTINGS PAGE ==========
router.get('/settings', async (req, res) => {
  try {
    // Get system settings from database or config
    const systemSettings = {
      site_name: 'Propbandhu',
      commission_rate: 2.5,
      max_property_images: 10,
      auto_approve_verified_sellers: false,
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      smtp_enabled: true,
      notification_enabled: true,
      maintenance_mode: false
    };
    
    res.render('admin/settings', {
      title: 'System Settings',
      user: req.user,
      settings: systemSettings,
      activePage: 'settings'
    });
    
  } catch (error) {
    console.error('Settings error:', error);
    res.render('admin/settings', {
      title: 'System Settings',
      user: req.user,
      settings: {},
      activePage: 'settings'
    });
  }
});

// ========== PROFILE PAGE ==========
router.get('/profile', async (req, res) => {
  try {
    res.render('admin/profile', {
      title: 'Admin Profile',
      user: req.user,
      activePage: 'profile'
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.render('admin/profile', {
      title: 'Admin Profile',
      user: req.user,
      activePage: 'profile'
    });
  }
});
// ========== APPROVAL API ENDPOINTS ==========
router.post('/api/properties/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { autoGoLive } = req.body;
    
    console.log(`Approving property ${id}, autoGoLive: ${autoGoLive}`);
    
    const property = await Property.findById(id);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    property.status = 'approved';
    property.approved_at = new Date();
    property.approved_by = req.user._id;
    
    if (autoGoLive) {
      property.status = 'live';
      property.live_at = new Date();
    }
    
    await property.save();
    
    // Send notification to seller
    try {
      const Notification = require('../models/Notification');
      await Notification.create({
        user: property.seller,
        title: 'Property Approved',
        message: `Your property "${property.title}" has been approved${autoGoLive ? ' and is now live' : ''}.`,
        type: 'property_approved',
        related_to: 'property',
        related_id: property._id
      });
    } catch (notifError) {
      console.error('Failed to send notification:', notifError);
    }
    
    res.json({ 
      success: true, 
      message: 'Property approved successfully',
      status: property.status
    });
    
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to approve property',
      error: error.message 
    });
  }
});

router.post('/api/properties/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    console.log(`Rejecting property ${id}, reason: ${reason}`);
    
    const property = await Property.findById(id);
    if (!property) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
    
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    property.status = 'rejected';
    property.rejection_reason = reason;
    property.rejected_at = new Date();
    property.rejected_by = req.user._id;
    
    await property.save();
    
    // Send notification to seller
    try {
      const Notification = require('../models/Notification');
      await Notification.create({
        user: property.seller,
        title: 'Property Rejected',
        message: `Your property "${property.title}" was rejected. Reason: ${reason}`,
        type: 'property_rejected',
        related_to: 'property',
        related_id: property._id
      });
    } catch (notifError) {
      console.error('Failed to send notification:', notifError);
    }
    
    res.json({ 
      success: true, 
      message: 'Property rejected successfully' 
    });
    
  } catch (error) {
    console.error('Rejection error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to reject property',
      error: error.message 
    });
  }
});

// ========== BULK APPROVAL ACTIONS ==========
router.post('/api/properties/bulk-approve', async (req, res) => {
  try {
    const { propertyIds, autoGoLive } = req.body;
    
    if (!propertyIds || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No properties selected' });
    }
    
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    const results = [];
    
    for (const id of propertyIds) {
      try {
        const property = await Property.findById(id);
        if (property) {
          property.status = 'approved';
          property.approved_at = new Date();
          property.approved_by = req.user._id;
          
          if (autoGoLive) {
            property.status = 'live';
            property.live_at = new Date();
          }
          
          await property.save();
          
          // Send notification
          try {
            const Notification = require('../models/Notification');
            await Notification.create({
              user: property.seller,
              title: 'Property Approved',
              message: `Your property "${property.title}" has been approved${autoGoLive ? ' and is now live' : ''}.`,
              type: 'property_approved',
              related_to: 'property',
              related_id: property._id
            });
          } catch (notifError) {
            console.error('Failed to send notification:', notifError);
          }
          
          results.push({ id, success: true });
        } else {
          results.push({ id, success: false, message: 'Property not found' });
        }
      } catch (error) {
        results.push({ id, success: false, message: error.message });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({ 
      success: true, 
      message: `Successfully processed ${successCount} of ${propertyIds.length} properties`,
      results: results
    });
    
  } catch (error) {
    console.error('Bulk approval error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process bulk approval',
      error: error.message 
    });
  }
});

// ========== GET PENDING COUNT ==========
router.get('/api/pending-count', async (req, res) => {
  try {
    const pendingCount = await Property.countDocuments({ status: 'pending_approval' });
    res.json({ success: true, count: pendingCount });
  } catch (error) {
    console.error('Pending count error:', error);
    res.status(500).json({ success: false, count: 0, error: error.message });
  }
});

module.exports = router;