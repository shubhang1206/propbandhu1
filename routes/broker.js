const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Apply broker auth middleware to all routes
router.use(requireAuth('broker'));

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 20
  },
  fileFilter: function (req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// ========== BROKER DASHBOARD ==========
router.get('/dashboard', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const Commission = require('../models/Commission');
    const User = require('../models/user');
    
    // Get broker's properties (both added and assigned)
    const addedProperties = await Property.find({
      'added_by.user': req.user.id,
      'added_by.role': 'broker'
    });
    
    const assignedProperties = await Property.find({
      broker: req.user.id
    });
    
    const allProperties = [...addedProperties, ...assignedProperties];
    const uniqueProperties = Array.from(new Set(allProperties.map(p => p._id.toString())))
      .map(id => allProperties.find(p => p._id.toString() === id));
    
    // Get commissions
    const commissions = await Commission.find({ broker: req.user.id })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('property', 'title price')
      .lean();
    
    // Calculate stats
    const commissionSummary = await Commission.getBrokerTotal(req.user.id);
    
    const stats = {
      totalProperties: uniqueProperties.length,
      soldProperties: uniqueProperties.filter(p => p.status === 'sold').length,
      inCartProperties: uniqueProperties.filter(p => p.cart_status?.in_cart).length,
      totalCommission: commissionSummary.paid ? commissionSummary.paid.amount : 0,
      pendingCommission: commissionSummary.pending ? commissionSummary.pending.amount : 0,
      approvedCommission: commissionSummary.approved ? commissionSummary.approved.amount : 0,
      totalCommissions: Object.values(commissionSummary).reduce((sum, item) => sum + (item.count || 0), 0)
    };

    res.render('broker/dashboard', {
      title: 'Broker Dashboard',
      user: req.user,
      commissions: commissions,
      stats: stats,
      token: req.session.token || '',
      activePage: 'broker'
    });
  } catch (error) {
    console.error('Broker dashboard error:', error);
    res.render('broker/dashboard', {
      title: 'Broker Dashboard',
      user: req.user,
      commissions: [],
      stats: {
        totalProperties: 0,
        soldProperties: 0,
        inCartProperties: 0,
        totalCommission: 0,
        pendingCommission: 0,
        approvedCommission: 0,
        totalCommissions: 0
      },
      token: req.session.token || '',
      activePage: 'broker'
    });
  }
});

// ========== BROKER PROPERTIES ==========
router.get('/properties', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const Commission = require('../models/Commission');
    
    // Get query parameters
    const { status, type, sort = 'createdAt', order = 'desc' } = req.query;
    
    // Build query
    const query = {
      $or: [
        { 'added_by.user': req.user.id, 'added_by.role': 'broker' },
        { broker: req.user.id }
      ]
    };
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (type && type !== 'all') {
      if (type === 'added') {
        query['added_by.user'] = req.user.id;
        query['added_by.role'] = 'broker';
      } else if (type === 'assigned') {
        query.broker = req.user.id;
        query['added_by.role'] = { $ne: 'broker' };
      }
    }
    
    // Get properties
    const properties = await Property.find(query)
      .populate('seller', 'name phone')
      .populate('added_by.user', 'name')
      .sort({ [sort]: order === 'desc' ? -1 : 1 })
      .lean();
    
    // Get commissions for these properties
    const propertyIds = properties.map(p => p._id);
    const commissions = await Commission.find({
      property: { $in: propertyIds },
      broker: req.user.id
    }).lean();
    
    // Map commissions to properties
    const propertiesWithCommissions = properties.map(property => {
      const propertyObj = new Property(property);
      const propertyCommissions = commissions.filter(c => c.property.toString() === property._id.toString());
      
      return {
        ...property,
        formatted_price: propertyObj.formatted_price,
        full_address: propertyObj.full_address,
        primary_image: propertyObj.primary_image,
        isVisitPending: propertyObj.isVisitPending(),
        isBookingWindowActive: propertyObj.isBookingWindowActive(),
        isAvailableForSale: propertyObj.isAvailableForSale(),
        commissions: propertyCommissions,
        totalCommission: propertyCommissions.reduce((sum, c) => sum + c.amount, 0),
        pendingCommission: propertyCommissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + c.amount, 0),
        addedByMe: property.added_by.user.toString() === req.user.id && property.added_by.role === 'broker'
      };
    });

    res.render('broker/properties', {
      title: 'My Properties',
      user: req.user,
      properties: propertiesWithCommissions,
      filters: { status, type, sort, order },
      token: req.session.token || '',
      activePage: 'broker'
    });
  } catch (error) {
    console.error('Broker properties error:', error);
    res.render('broker/properties', {
      title: 'My Properties',
      user: req.user,
      properties: [],
      filters: {},
      token: req.session.token || '',
      activePage: 'broker'
    });
  }
});

// ========== ADD PROPERTY (BROKER MODE) ==========
router.get('/properties/add', (req, res) => {
  res.render('broker/add-property', {
    title: 'Add Property as Broker',
    user: req.user,
    token: req.session.token || '',
    activePage: 'broker'
  });
});

router.post('/properties/add', upload.array('images', 20), async (req, res) => {
  try {
    const Property = require('../models/Property');
    const User = require('../models/user');
    
    // Validate required fields
    const requiredFields = ['title', 'price', 'property_type', 'seller'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          success: false,
          message: `${field.replace('_', ' ')} is required`
        });
      }
    }

    // Verify seller exists
    const seller = await User.findOne({
      _id: req.body.seller,
      role: 'seller'
    });

    if (!seller) {
      return res.status(400).json({
        success: false,
        message: 'Invalid seller selected'
      });
    }

    // Handle images upload
    const imageUploads = [];
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const result = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'propbandhu/properties/broker',
              public_id: `broker_${req.user.id}_${Date.now()}_${i}`,
              transformation: [
                { width: 1200, height: 800, crop: 'limit' },
                { quality: 'auto' }
              ]
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          
          uploadStream.end(file.buffer);
        });
        
        imageUploads.push({
          url: result.secure_url,
          public_id: result.public_id,
          caption: `Image ${i + 1}`,
          is_primary: i === 0,
          order: i
        });
      }
    }

    if (imageUploads.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Minimum 3 images are required'
      });
    }

    // Parse numeric fields
    const parseNumber = (value) => {
      if (!value || value === '') return undefined;
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;
    };

    // Extract address
    const address = {
      street: req.body['address[street]'] || req.body.street || '',
      landmark: req.body['address[landmark]'] || req.body.landmark || '',
      area: req.body['address[area]'] || req.body.area || '',
      city: req.body['address[city]'] || req.body.city || '',
      state: req.body['address[state]'] || req.body.state || '',
      pincode: req.body['address[pincode]'] || req.body.pincode || ''
    };

    if (!address.city || !address.state) {
      return res.status(400).json({
        success: false,
        message: 'City and State are required'
      });
    }

    // Handle amenities
    let amenities = [];
    if (req.body.amenities) {
      if (Array.isArray(req.body.amenities)) {
        amenities = req.body.amenities;
      } else if (typeof req.body.amenities === 'string') {
        amenities = [req.body.amenities];
      }
    }

    // Create property
    const propertyData = {
      title: req.body.title.trim(),
      description: req.body.description?.trim() || 'No description provided',
      short_description: (req.body.short_description || '').trim(),
      property_type: req.body.property_type,
      sub_type: req.body.sub_type || 'Apartment',
      price: parseFloat(req.body.price),
      price_type: req.body.price_type || 'fixed',
      bedrooms: parseNumber(req.body.bedrooms),
      bathrooms: parseNumber(req.body.bathrooms),
      balconies: parseNumber(req.body.balconies),
      built_up_area: parseNumber(req.body.built_up_area),
      area_unit: req.body.area_unit || 'sqft',
      carpet_area: parseNumber(req.body.carpet_area),
      floor_number: parseNumber(req.body.floor_number),
      total_floors: parseNumber(req.body.total_floors),
      age_of_property: parseNumber(req.body.age_of_property),
      furnishing: req.body.furnishing || 'unfurnished',
      facing: req.body.facing || '',
      address: address,
      amenities: amenities,
      images: imageUploads,
      seller: req.body.seller,
      broker: req.user.id,
      added_by: {
        user: req.user.id,
        role: 'broker'
      },
      commission: {
        adder_rate: 1.5, // Default adder rate for broker
        seller_rate: 2.5  // Default seller rate
      },
      status: 'pending_approval'
    };

    const property = await Property.create(propertyData);

    res.json({
      success: true,
      message: 'Property added successfully! Awaiting admin approval.',
      property: {
        id: property._id,
        title: property.title,
        status: property.status
      }
    });

  } catch (error) {
    console.error('Add property error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add property'
    });
  }
});

// ========== PROPERTY DETAILS ==========
router.get('/properties/:id', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const Commission = require('../models/Commission');
    const User = require('../models/user');
    
    const property = await Property.findOne({
      _id: req.params.id,
      $or: [
        { 'added_by.user': req.user.id, 'added_by.role': 'broker' },
        { broker: req.user.id }
      ]
    })
    .populate('seller', 'name phone email')
    .populate('added_by.user', 'name');

    if (!property) {
      return res.status(404).render('error', {
        title: 'Property Not Found',
        message: 'Property not found or you do not have access.',
        user: req.user,
        activePage: 'broker'
      });
    }

    // Get commissions for this property
    const commissions = await Commission.find({
      property: property._id,
      broker: req.user.id
    }).sort({ createdAt: -1 });

    // Format property data
    const propertyObj = new Property(property);
    const propertyData = {
      ...property.toObject(),
      formatted_price: propertyObj.formatted_price,
      full_address: propertyObj.full_address,
      primary_image: propertyObj.primary_image,
      isVisitPending: propertyObj.isVisitPending(),
      isBookingWindowActive: propertyObj.isBookingWindowActive(),
      isAvailableForSale: propertyObj.isAvailableForSale(),
      addedByMe: property.added_by.user.toString() === req.user.id && property.added_by.role === 'broker'
    };

    res.render('broker/property-details', {
      title: property.title,
      user: req.user,
      property: propertyData,
      commissions: commissions,
      token: req.session.token || '',
      activePage: 'broker'
    });
  } catch (error) {
    console.error('Property details error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load property details.',
      user: req.user,
      activePage: 'broker'
    });
  }
});

// ========== COMMISSIONS ==========
router.get('/commissions', async (req, res) => {
  try {
    const Commission = require('../models/Commission');
    const Property = require('../models/Property');
    
    // Get query parameters
    const { status, type, month, year, sort = 'createdAt', order = 'desc' } = req.query;
    
    // Build query
    const query = { broker: req.user.id };
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (type && type !== 'all') {
      query.commission_type = type;
    }
    
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      query.createdAt = { $gte: startDate, $lt: endDate };
    }
    
    // Get commissions
    const commissions = await Commission.find(query)
      .populate('property', 'title price')
      .populate('approved_by', 'name')
      .populate('paid_by', 'name')
      .sort({ [sort]: order === 'desc' ? -1 : 1 })
      .lean();
    
    // Calculate totals
    const totals = commissions.reduce((acc, commission) => {
      acc.totalAmount += commission.amount;
      acc.totalCount += 1;
      
      if (commission.status === 'pending') {
        acc.pendingAmount += commission.amount;
        acc.pendingCount += 1;
      } else if (commission.status === 'approved') {
        acc.approvedAmount += commission.amount;
        acc.approvedCount += 1;
      } else if (commission.status === 'paid') {
        acc.paidAmount += commission.amount;
        acc.paidCount += 1;
      }
      
      return acc;
    }, {
      totalAmount: 0,
      totalCount: 0,
      pendingAmount: 0,
      pendingCount: 0,
      approvedAmount: 0,
      approvedCount: 0,
      paidAmount: 0,
      paidCount: 0
    });

    // Get monthly summary
    const currentYear = new Date().getFullYear();
    const monthlySummary = await Commission.getMonthlySummary(req.user.id, year || currentYear);

    res.render('broker/commissions', {
      title: 'My Commissions',
      user: req.user,
      commissions: commissions,
      totals: totals,
      monthlySummary: monthlySummary,
      filters: { status, type, month, year, sort, order },
      token: req.session.token || '',
      activePage: 'broker'
    });
  } catch (error) {
    console.error('Commissions error:', error);
    res.render('broker/commissions', {
      title: 'My Commissions',
      user: req.user,
      commissions: [],
      totals: {
        totalAmount: 0,
        totalCount: 0,
        pendingAmount: 0,
        pendingCount: 0,
        approvedAmount: 0,
        approvedCount: 0,
        paidAmount: 0,
        paidCount: 0
      },
      monthlySummary: [],
      filters: {},
      token: req.session.token || '',
      activePage: 'broker'
    });
  }
});

// ========== VISITS MANAGEMENT ==========
router.get('/visits', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const Cart = require('../models/Cart');
    
    // Get properties where broker is assigned
    const properties = await Property.find({
      broker: req.user.id,
      status: 'live'
    }).lean();
    
    const propertyIds = properties.map(p => p._id);
    
    // Get carts with these properties
    const carts = await Cart.find({
      'items.property': { $in: propertyIds },
      'items.status': 'active'
    })
    .populate({
      path: 'items.property',
      match: { _id: { $in: propertyIds } },
      populate: [
        { path: 'seller', select: 'name phone' },
        { path: 'buyer', select: 'name phone' }
      ]
    })
    .populate('buyer', 'name phone email');
    
    // Flatten visit items
    let visits = [];
    carts.forEach(cart => {
      cart.items.forEach(item => {
        if (item.property && propertyIds.includes(item.property._id.toString())) {
          visits.push({
            ...item.toObject(),
            buyer: cart.buyer,
            cart: cart._id
          });
        }
      });
    });

    // Filter by visit status if specified
    const { status } = req.query;
    if (status && status !== 'all') {
      visits = visits.filter(visit => visit.visit_status === status);
    }

    res.render('broker/visits', {
      title: 'Property Visits',
      user: req.user,
      visits: visits,
      filters: { status },
      token: req.session.token || '',
      activePage: 'broker'
    });
  } catch (error) {
    console.error('Visits error:', error);
    res.render('broker/visits', {
      title: 'Property Visits',
      user: req.user,
      visits: [],
      filters: {},
      token: req.session.token || '',
      activePage: 'broker'
    });
  }
});

// ========== CONFIRM VISIT (BROKER) ==========
router.post('/api/visits/:propertyId/confirm', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const Cart = require('../models/Cart');
    const Commission = require('../models/Commission');
    
    const { propertyId } = req.params;
    const { method = 'manual', notes } = req.body;
    
    // Get property
    const property = await Property.findOne({
      _id: propertyId,
      broker: req.user.id
    });
    
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found or you are not the assigned broker'
      });
    }
    
    // Find cart with this property
    const cart = await Cart.findOne({
      'items.property': propertyId,
      'items.status': 'active'
    });
    
    if (!cart) {
      return res.status(400).json({
        success: false,
        message: 'Property not found in any active cart'
      });
    }
    
    const cartItem = cart.items.find(item => 
      item.property.toString() === propertyId && item.status === 'active'
    );
    
    if (!cartItem) {
      return res.status(400).json({
        success: false,
        message: 'Cart item not found'
      });
    }
    
    // Check visit window
    const addedDate = new Date(cartItem.added_at);
    const visitExpiry = new Date(addedDate);
    visitExpiry.setDate(visitExpiry.getDate() + 7);
    
    if (new Date() > visitExpiry) {
      return res.status(400).json({
        success: false,
        message: 'Visit window has expired'
      });
    }
    
    // Update cart item
    cartItem.visit_status = 'confirmed';
    cartItem.visit_confirmed_at = new Date();
    cartItem.confirmed_by = req.user.id;
    cartItem.confirmation_method = method;
    cartItem.booking_window_start = new Date();
    cartItem.booking_window_end = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    cartItem.notes = notes;
    
    await cart.save();
    
    // Update property
    property.cart_status.visit_confirmed = true;
    property.cart_status.visit_confirmed_at = new Date();
    property.cart_status.booking_window_start = new Date();
    property.cart_status.booking_window_end = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    
    await property.save();
    
    // Create seller commission if broker sold the property
    if (property.added_by.user.toString() !== req.user.id.toString() || 
        property.added_by.role !== 'broker') {
      
      const commissionData = Commission.calculateCommission(
        property.price,
        'seller',
        property.commission?.adder_rate || 1.5,
        property.commission?.seller_rate || 2.5
      );
      
      await Commission.create({
        broker: req.user.id,
        property: property._id,
        property_price: property.price,
        commission_type: 'seller',
        rate: commissionData.rate,
        amount: commissionData.amount,
        status: 'pending',
        notes: `Visit confirmed by broker for property sale`,
        created_by: req.user.id
      });
    }
    
    res.json({
      success: true,
      message: 'Visit confirmed successfully. Commission recorded.',
      booking_window_end: cartItem.booking_window_end
    });
    
  } catch (error) {
    console.error('Confirm visit error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to confirm visit'
    });
  }
});

// ========== SCHEDULE VISIT ==========
router.get('/visits/schedule/:propertyId', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const Cart = require('../models/Cart');
    
    const property = await Property.findOne({
      _id: req.params.propertyId,
      broker: req.user.id,
      status: 'live'
    })
    .populate('seller', 'name phone');
    
    if (!property) {
      return res.status(404).render('error', {
        title: 'Property Not Found',
        message: 'Property not found or you are not the assigned broker.',
        user: req.user,
        activePage: 'broker'
      });
    }
    
    // Check if property is in cart
    const cart = await Cart.findOne({
      'items.property': property._id,
      'items.status': 'active'
    }).populate('buyer', 'name phone email');
    
    if (!cart) {
      return res.status(400).render('error', {
        title: 'Not in Cart',
        message: 'Property must be in a buyer\'s cart to schedule a visit.',
        user: req.user,
        activePage: 'broker'
      });
    }
    
    const cartItem = cart.items.find(item => 
      item.property.toString() === property._id.toString()
    );
    
    if (!cartItem) {
      return res.status(400).render('error', {
        title: 'Cart Item Not Found',
        message: 'Property not found in cart.',
        user: req.user,
        activePage: 'broker'
      });
    }
    
    // Calculate days left
    const addedDate = new Date(cartItem.added_at);
    const visitExpiry = new Date(addedDate);
    visitExpiry.setDate(visitExpiry.getDate() + 7);
    const daysLeft = Math.ceil((visitExpiry - new Date()) / (1000 * 60 * 60 * 24));
    
    res.render('broker/schedule-visit', {
      title: 'Schedule Visit',
      user: req.user,
      property: property,
      buyer: cart.buyer,
      cartItem: cartItem,
      daysLeft: daysLeft,
      visitExpiry: visitExpiry,
      token: req.session.token || '',
      activePage: 'broker'
    });
  } catch (error) {
    console.error('Schedule visit error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load schedule visit page.',
      user: req.user,
      activePage: 'broker'
    });
  }
});

// ========== API: GET SELLERS FOR BROKER ==========
router.get('/api/sellers', async (req, res) => {
  try {
    const User = require('../models/user');
    
    const sellers = await User.find({
      role: 'seller',
      is_active: true
    }).select('name email phone _id').limit(50);
    
    res.json({
      success: true,
      sellers: sellers
    });
  } catch (error) {
    console.error('Get sellers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sellers'
    });
  }
});

// ========== API: GET BROKER STATS ==========
router.get('/api/stats', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const Commission = require('../models/Commission');
    
    // Get property counts
    const addedProperties = await Property.countDocuments({
      'added_by.user': req.user.id,
      'added_by.role': 'broker'
    });
    
    const assignedProperties = await Property.countDocuments({
      broker: req.user.id,
      'added_by.role': { $ne: 'broker' }
    });
    
    const soldProperties = await Property.countDocuments({
      $or: [
        { 'added_by.user': req.user.id, 'added_by.role': 'broker', status: 'sold' },
        { broker: req.user.id, status: 'sold' }
      ]
    });
    
    const inCartProperties = await Property.countDocuments({
      $or: [
        { 'added_by.user': req.user.id, 'added_by.role': 'broker', 'cart_status.in_cart': true },
        { broker: req.user.id, 'cart_status.in_cart': true }
      ]
    });
    
    // Get commission summary
    const commissionSummary = await Commission.getBrokerTotal(req.user.id);
    
    res.json({
      success: true,
      stats: {
        totalProperties: addedProperties + assignedProperties,
        addedProperties,
        assignedProperties,
        soldProperties,
        inCartProperties,
        totalCommission: commissionSummary.paid ? commissionSummary.paid.amount : 0,
        pendingCommission: commissionSummary.pending ? commissionSummary.pending.amount : 0,
        approvedCommission: commissionSummary.approved ? commissionSummary.approved.amount : 0,
        totalCommissionCount: Object.values(commissionSummary).reduce((sum, item) => sum + (item.count || 0), 0)
      }
    });
  } catch (error) {
    console.error('Get broker stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch stats'
    });
  }
});

module.exports = router;