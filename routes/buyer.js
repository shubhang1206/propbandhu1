const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

// Apply buyer auth middleware to all routes
router.use(requireAuth('buyer'));

// ========== BUYER DASHBOARD ==========
router.get('/dashboard', async (req, res) => {
  try {
    console.log('=== BUYER DASHBOARD REQUEST ===');
    console.log('Buyer ID:', req.user.id);
    console.log('Buyer Name:', req.user.name);
    
    // Import models inside route
    const Property = require('../models/Property');
    const Cart = require('../models/Cart');
    
    // Get buyer's cart
    const cart = await Cart.findOne({ buyer: req.user.id })
      .populate({
        path: 'items.property',
        select: 'title price location images address',
        populate: {
          path: 'seller',
          select: 'name phone'
        }
      });

    // Initialize cart items if cart doesn't exist
    const cartItems = cart ? cart.items.filter(item => item.status === 'active') : [];
    
    // Get recently viewed properties (live properties)
    const recentProperties = await Property.find({ 
      status: 'live',
      expires_at: { $gt: new Date() }
    })
    .limit(4)
    .populate('seller', 'name')
    .select('title price location address')
    .lean();
    
    // Calculate stats for buyer
    const visitsScheduled = cartItems.filter(item => item.visit_scheduled).length;
    const visitsPending = cartItems.filter(item => !item.visit_scheduled).length;
    
    const stats = {
      cartCount: cartItems.length,
      visitsScheduled: visitsScheduled,
      visitsPending: visitsPending,
      totalProperties: cartItems.length
    };

    // Format cart items for display
    const formattedCartItems = cartItems.map(item => {
      if (item.property) {
        const property = new Property(item.property);
        return {
          property: {
            _id: item.property._id.toString(),
            title: item.property.title || 'Untitled Property',
            price: item.property.price || 0,
            location: item.property.address ? 
              `${item.property.address.area || ''}, ${item.property.address.city || ''}`.trim() : 
              'Location not specified',
            formatted_price: property.formatted_price || `₹${(item.property.price || 0).toLocaleString()}`
          }
        };
      }
      return item;
    });

    // Format recent properties
    const formattedRecentProperties = recentProperties.map(property => {
      const propertyObj = new Property(property);
      return {
        _id: property._id.toString(),
        title: property.title || 'Untitled Property',
        price: property.price || 0,
        location: property.address ? 
          `${property.address.area || ''}, ${property.address.city || ''}`.trim() : 
          'Location not specified',
        formatted_price: propertyObj.formatted_price || `₹${(property.price || 0).toLocaleString()}`
      };
    });

    res.render('buyer/dashboard', {
      title: 'Buyer Dashboard',
      user: req.user,
      cart: {
        items: formattedCartItems,
        settings: cart ? cart.settings : { max_properties: 5 }
      },
      recentProperties: formattedRecentProperties,
      stats: stats,
      activePage: 'dashboard'
    });
  } catch (error) {
    console.error('Buyer dashboard error:', error);
    res.render('buyer/dashboard', {
      title: 'Buyer Dashboard',
      user: req.user,
      cart: { items: [] },
      recentProperties: [],
      stats: {
        cartCount: 0,
        visitsScheduled: 0,
        visitsPending: 0,
        totalProperties: 0
      },
      activePage: 'dashboard'
    });
  }
});

// ========== BROWSE PROPERTIES PAGE ==========
router.get('/properties', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const Cart = require('../models/Cart');
    
    // Get search filters from query
    const { location, property_type, min_price, max_price, bedrooms } = req.query;
    
    // Build search query - only show live and available properties
    const query = { 
      status: { $in: ['live', 'approved'] },
      expires_at: { $gt: new Date() }
    };
    
    if (location) {
      query['$or'] = [
        { 'address.city': { $regex: location, $options: 'i' } },
        { 'address.area': { $regex: location, $options: 'i' } },
        { title: { $regex: location, $options: 'i' } }
      ];
    }
    
    if (property_type && property_type !== 'all') {
      query.property_type = property_type;
    }
    
    if (bedrooms && bedrooms !== 'all') {
      query.bedrooms = parseInt(bedrooms);
    }
    
    // Price range filter
    if (min_price || max_price) {
      query.price = {};
      if (min_price) query.price.$gte = parseInt(min_price);
      if (max_price) query.price.$lte = parseInt(max_price);
    }
    
    // Get properties
    const properties = await Property.find(query)
      .populate('seller', 'name phone')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    
    // Get buyer's cart to check which properties are already in cart
    const cart = await Cart.findOne({ buyer: req.user.id });
    const cartPropertyIds = cart ? cart.items
      .filter(item => item.status === 'active')
      .map(item => item.property?.toString())
      .filter(Boolean) : [];
    
    // Format properties for display
    const formattedProperties = properties.map(property => {
      const propertyObj = new Property(property);
      return {
        ...property,
        _id: property._id.toString(),
        formatted_price: propertyObj.formatted_price,
        location: property.address ? 
          `${property.address.area || ''}, ${property.address.city || ''}`.trim() : 
          'Location not specified',
        primary_image: property.images && property.images.length > 0 ? property.images[0].url : '/images/placeholder.jpg',
        isInCart: cartPropertyIds.includes(property._id.toString()),
        isAvailable: !property.cart_status?.in_cart
      };
    });
    
    // Get cart count
    const cartCount = cart ? cart.items.filter(item => item.status === 'active').length : 0;
    
    // Get unique values for filters
    const cities = await Property.distinct('address.city');
    const propertyTypes = await Property.distinct('property_type');
    
    res.render('buyer/properties', {
      title: 'Browse Properties',
      user: req.user,
      properties: formattedProperties,
      cartCount: cartCount,
      cities: cities.filter(Boolean).sort(),
      propertyTypes: propertyTypes.filter(Boolean).sort(),
      query: req.query,
      activePage: 'properties'
    });
  } catch (error) {
    console.error('Properties page error:', error);
    res.render('buyer/properties', {
      title: 'Browse Properties',
      user: req.user,
      properties: [],
      cartCount: 0,
      cities: [],
      propertyTypes: [],
      query: req.query,
      activePage: 'properties'
    });
  }
});

// ========== PROPERTY DETAILS ==========
router.get('/properties/:id', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const Cart = require('../models/Cart');
    
    const property = await Property.findById(req.params.id)
      .populate('seller', 'name phone email')
      .populate('broker', 'name phone')
      .populate('approved_by', 'name');

    if (!property) {
      return res.status(404).render('error', {
        title: 'Property Not Found',
        message: 'The requested property does not exist.',
        user: req.user,
        activePage: 'properties'
      });
    }

    // Increment view count
    property.views = (property.views || 0) + 1;
    await property.save();

    // Check if property is in buyer's cart
    const cart = await Cart.findOne({ 
      buyer: req.user.id,
      'items.property': property._id,
      'items.status': 'active'
    });

    const isInCart = !!cart || property.cart_status?.in_cart;

    // Check if property is available for cart
    const isAvailableForCart = !property.cart_status?.in_cart && 
                              property.status === 'live' &&
                              (!property.expires_at || property.expires_at > new Date());

    // Format property data
    const propertyData = {
      ...property.toObject(),
      _id: property._id.toString(),
      formatted_price: new Property(property).formatted_price,
      full_address: property.address ? 
        `${property.address.street || ''} ${property.address.area || ''}, ${property.address.city || ''}, ${property.address.state || ''} - ${property.address.pincode || ''}`.trim() : 
        'Address not specified',
      primary_image: property.images && property.images.length > 0 ? property.images[0].url : null,
      amenities: property.amenities || [],
      features: property.features || [],
      isInCart: isInCart,
      isAvailableForCart: isAvailableForCart,
      daysLeftInCart: property.cart_status?.in_cart ? 
        Math.ceil((new Date(property.cart_status.added_at).getTime() + 7*24*60*60*1000 - Date.now()) / (1000*60*60*24)) : null
    };

    res.render('buyer/property-details', {
      title: property.title,
      user: req.user,
      property: propertyData,
      activePage: 'properties'
    });
  } catch (error) {
    console.error('Property details error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load property details.',
      user: req.user,
      activePage: 'properties'
    });
  }
});

// ========== BUYER CART ==========
router.get('/cart', async (req, res) => {
  try {
    const Cart = require('../models/Cart');
    const Property = require('../models/Property');
    
    const cart = await Cart.findOne({ buyer: req.user.id })
      .populate({
        path: 'items.property',
        populate: [
          { path: 'seller', select: 'name phone' },
          { path: 'broker', select: 'name phone' }
        ]
      });

    const cartItems = cart ? cart.items.filter(item => item.status === 'active') : [];
    
    // Format cart items
    const formattedCartItems = await Promise.all(cartItems.map(async (item) => {
      if (item.property) {
        const property = new Property(item.property);
        return {
          ...item.toObject(),
          property: {
            ...item.property.toObject(),
            _id: item.property._id.toString(),
            formatted_price: property.formatted_price,
            full_address: property.address ? 
              `${property.address.area || ''}, ${property.address.city || ''}`.trim() : 
              'Location not specified',
            primary_image: property.images && property.images.length > 0 ? property.images[0].url : null,
            days_left: item.added_at ? 
              Math.ceil((new Date(item.added_at).getTime() + 7*24*60*60*1000 - Date.now()) / (1000*60*60*24)) : 7
          }
        };
      }
      return item;
    }));

    res.render('buyer/cart', {
      title: 'My Cart',
      user: req.user,
      cartItems: formattedCartItems,
      cartSettings: cart ? cart.settings : { max_properties: 5 },
      activePage: 'cart'
    });
  } catch (error) {
    console.error('Cart error:', error);
    res.render('buyer/cart', {
      title: 'My Cart',
      user: req.user,
      cartItems: [],
      cartSettings: { max_properties: 5 },
      activePage: 'cart'
    });
  }
});

// ========== MY VISITS ==========
router.get('/visits', async (req, res) => {
  try {
    const Cart = require('../models/Cart');
    const Property = require('../models/Property');
    
    const cart = await Cart.findOne({ buyer: req.user.id })
      .populate({
        path: 'items.property',
        populate: [
          { path: 'seller', select: 'name phone' },
          { path: 'broker', select: 'name phone' }
        ]
      });

    const visits = cart ? cart.items.filter(item => 
      item.status === 'active' && (item.visit_scheduled || item.visit_date)
    ) : [];

    // Format visits
    const formattedVisits = await Promise.all(visits.map(async (item) => {
      if (item.property) {
        const property = new Property(item.property);
        return {
          ...item.toObject(),
          property: {
            ...item.property.toObject(),
            _id: item.property._id.toString(),
            formatted_price: property.formatted_price,
            full_address: property.address ? 
              `${property.address.area || ''}, ${property.address.city || ''}`.trim() : 
              'Location not specified',
            primary_image: property.images && property.images.length > 0 ? property.images[0].url : null,
            visit_status: item.visit_status || 'pending',
            visit_date: item.visit_date,
            visit_confirmed: item.visit_confirmed
          }
        };
      }
      return item;
    }));

    // Separate upcoming and past visits
    const now = new Date();
    const upcomingVisits = formattedVisits.filter(visit => 
      !visit.visit_date || new Date(visit.visit_date) > now
    );
    const pastVisits = formattedVisits.filter(visit => 
      visit.visit_date && new Date(visit.visit_date) <= now
    );

   res.render('buyer/visits', {
  title: 'My Visits',
  user: req.user,
  visits: [...upcomingVisits, ...pastVisits], // Combine all visits
  upcomingVisits: upcomingVisits,
  pastVisits: pastVisits,
  activePage: 'visits'
});
  } catch (error) {
    console.error('Visits error:', error);
    res.render('buyer/visits', {
      title: 'My Visits',
      user: req.user,
      upcomingVisits: [],
      pastVisits: [],
      activePage: 'visits'
    });
  }
});

// ========== SCHEDULE VISIT ==========
router.get('/schedule-visit/:propertyId', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const Cart = require('../models/Cart');
    
    const property = await Property.findById(req.params.propertyId)
      .populate('seller', 'name phone');

    if (!property) {
      return res.status(404).render('error', {
        title: 'Property Not Found',
        message: 'The requested property does not exist.',
        user: req.user,
        activePage: 'visits'
      });
    }

    // Check if property is in buyer's cart
    const cart = await Cart.findOne({ 
      buyer: req.user.id,
      'items.property': property._id,
      'items.status': 'active'
    });

    if (!cart) {
      return res.status(400).render('error', {
        title: 'Cannot Schedule Visit',
        message: 'Property must be in your cart to schedule a visit.',
        user: req.user,
        activePage: 'visits'
      });
    }

    const cartItem = cart.items.find(item => 
      item.property.toString() === property._id.toString()
    );

    if (!cartItem) {
      return res.status(400).render('error', {
        title: 'Cannot Schedule Visit',
        message: 'Property not found in your cart.',
        user: req.user,
        activePage: 'visits'
      });
    }

    // Check if 7-day window is still valid
    const addedDate = new Date(cartItem.added_at);
    const visitExpiry = new Date(addedDate);
    visitExpiry.setDate(visitExpiry.getDate() + 7);
    const daysLeft = Math.ceil((visitExpiry - new Date()) / (1000 * 60 * 60 * 24));
    
    if (daysLeft <= 0) {
      return res.status(400).render('error', {
        title: 'Visit Window Expired',
        message: 'The 7-day visit window has expired. Property has been removed from your cart.',
        user: req.user,
        activePage: 'visits'
      });
    }

    const propertyData = {
      ...property.toObject(),
      _id: property._id.toString(),
      formatted_price: new Property(property).formatted_price,
      full_address: property.address ? 
        `${property.address.area || ''}, ${property.address.city || ''}`.trim() : 
        'Location not specified',
      daysLeft: daysLeft,
      seller: property.seller
    };

    res.render('buyer/schedule-visit', {
      title: 'Schedule Visit - ' + property.title,
      user: req.user,
      property: propertyData,
      activePage: 'visits'
    });
  } catch (error) {
    console.error('Schedule visit error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load schedule visit page.',
      user: req.user,
      activePage: 'visits'
    });
  }
});

// ========== API ROUTES ==========

// Add to cart
router.post('/api/cart/add', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const Cart = require('../models/Cart');
    
    const { propertyId } = req.body;
    
    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: 'Property ID is required'
      });
    }
    
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }
    
    // Check if property is available
    if (property.cart_status?.in_cart) {
      return res.status(400).json({
        success: false,
        message: 'Property is already in another buyer\'s cart'
      });
    }
    
    if (property.status !== 'live') {
      return res.status(400).json({
        success: false,
        message: 'Property is not available for cart'
      });
    }
    
    let cart = await Cart.findOne({ buyer: req.user.id });
    if (!cart) {
      cart = new Cart({
        buyer: req.user.id,
        items: [],
        settings: {
          max_properties: 5,
          visit_window_days: 7,
          booking_window_days: 60
        }
      });
    }
    
    // Check cart limit
    const activeItems = cart.items.filter(item => item.status === 'active');
    if (activeItems.length >= cart.settings.max_properties) {
      return res.status(400).json({
        success: false,
        message: `Cart limit reached (max ${cart.settings.max_properties} properties)`
      });
    }
    
    // Check if already in cart
    const alreadyInCart = activeItems.find(item => 
      item.property.toString() === propertyId
    );
    
    if (alreadyInCart) {
      return res.status(400).json({
        success: false,
        message: 'Property is already in your cart'
      });
    }
    
    // Add to property cart status
    property.cart_status = {
      in_cart: true,
      buyer_id: req.user.id,
      added_at: new Date(),
      visit_confirmed: false
    };
    await property.save();
    
    // Add to cart
    cart.items.push({
      property: propertyId,
      added_at: new Date(),
      status: 'active',
      visit_status: 'pending'
    });
    
    await cart.save();
    
    const updatedActiveItems = cart.items.filter(item => item.status === 'active');
    
    res.json({
      success: true,
      message: 'Property added to cart. You have 7 days to schedule a visit.',
      cartCount: updatedActiveItems.length,
      property: {
        id: property._id,
        title: property.title,
        price: new Property(property).formatted_price
      }
    });
    
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add to cart'
    });
  }
});

// Remove from cart
router.post('/api/cart/remove', async (req, res) => {
  try {
    const Cart = require('../models/Cart');
    const Property = require('../models/Property');
    
    const { propertyId } = req.body;
    
    if (!propertyId) {
      return res.status(400).json({
        success: false,
        message: 'Property ID is required'
      });
    }
    
    const cart = await Cart.findOne({ buyer: req.user.id });
    if (!cart) {
      return res.status(400).json({
        success: false,
        message: 'Cart not found'
      });
    }
    
    const itemIndex = cart.items.findIndex(item => 
      item.property.toString() === propertyId && item.status === 'active'
    );
    
    if (itemIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'Property not found in cart'
      });
    }
    
    // Mark as removed
    cart.items[itemIndex].status = 'removed';
    await cart.save();
    
    // Update property status
    const property = await Property.findById(propertyId);
    if (property) {
      property.cart_status = {
        in_cart: false,
        buyer_id: null,
        added_at: null,
        visit_confirmed: false
      };
      await property.save();
    }
    
    const activeItems = cart.items.filter(item => item.status === 'active');
    
    res.json({
      success: true,
      message: 'Property removed from cart',
      cartCount: activeItems.length
    });
    
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove from cart'
    });
  }
});

// Schedule visit
router.post('/api/visit/schedule', async (req, res) => {
  try {
    const Cart = require('../models/Cart');
    const Property = require('../models/Property');
    
    const { propertyId, visitDate, visitTime, notes } = req.body;
    
    if (!propertyId || !visitDate || !visitTime) {
      return res.status(400).json({
        success: false,
        message: 'Visit date and time are required'
      });
    }
    
    const cart = await Cart.findOne({ buyer: req.user.id });
    if (!cart) {
      return res.status(400).json({
        success: false,
        message: 'Cart not found'
      });
    }
    
    const cartItem = cart.items.find(item => 
      item.property.toString() === propertyId && item.status === 'active'
    );
    
    if (!cartItem) {
      return res.status(400).json({
        success: false,
        message: 'Property not found in cart'
      });
    }
    
    // Schedule the visit
    cartItem.visit_scheduled = true;
    cartItem.visit_date = new Date(`${visitDate}T${visitTime}`);
    cartItem.visit_notes = notes;
    cartItem.visit_status = 'scheduled';
    
    await cart.save();
    
    res.json({
      success: true,
      message: 'Visit scheduled successfully',
      visitDate: cartItem.visit_date
    });
    
  } catch (error) {
    console.error('Schedule visit error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule visit'
    });
  }
});

// Get cart count
router.get('/api/cart/count', async (req, res) => {
  try {
    const Cart = require('../models/Cart');
    const cart = await Cart.findOne({ buyer: req.user.id });
    
    const cartCount = cart ? cart.items.filter(item => item.status === 'active').length : 0;
    
    res.json({
      success: true,
      cartCount: cartCount
    });
  } catch (error) {
    console.error('Cart count error:', error);
    res.json({
      success: true,
      cartCount: 0
    });
  }
});

module.exports = router;