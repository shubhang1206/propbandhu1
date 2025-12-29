const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Apply seller auth middleware to all routes
router.use(requireAuth('seller'));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 20 // Max 20 files
  },
  fileFilter: function (req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});
// ========== SELLER DASHBOARD ==========
router.get('/dashboard', async (req, res) => {
  try {
    console.log('=== SELLER DASHBOARD REQUEST ===');
    console.log('User ID:', req.user.id);
    console.log('User Name:', req.user.name);
    
    const Property = require('../models/Property');
    
    // Get ALL seller's properties (no status filter)
    const properties = await Property.find({ seller: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    console.log('Found properties:', properties.length);
    
    // Debug log all properties with status
    properties.forEach((p, i) => {
      console.log(`Property ${i+1}: ${p.title} - Status: ${p.status} - ID: ${p._id}`);
    });

    // Format properties for display
    const formattedProperties = properties.map(property => {
      const propertyObj = new Property(property);
      return {
        ...property,
        _id: property._id.toString(),
        formatted_price: formatPrice(property.price),
        location: property.address ? 
          `${property.address.area || ''}, ${property.address.city || ''}`.trim() || 'Location not specified' : 
          'Location not specified',
        images: property.images || [],
        cart_status: property.cart_status || { in_cart: false },
        edit_permissions: property.edit_permissions || { enabled: false, allowed_fields: [] },
        status: property.status || 'draft',
        views: property.views || 0,
        inquiries: property.inquiries || 0,
        price: property.price || 0,
        bedrooms: property.bedrooms || 0,
        bathrooms: property.bathrooms || 0,
        area: property.built_up_area || property.carpet_area || 0,
        area_unit: property.area_unit || 'sq ft',
        isVisitPending: propertyObj.isVisitPending && propertyObj.isVisitPending(),
        isBookingWindowActive: propertyObj.isBookingWindowActive && propertyObj.isBookingWindowActive(),
        isAvailableForSale: propertyObj.isAvailableForSale && propertyObj.isAvailableForSale()
      };
    });

    console.log('Formatted properties count:', formattedProperties.length);
    
    // Calculate stats - FIXED: Include approved and live as "active" properties
    const totalProperties = formattedProperties.length;
    const approvedProperties = formattedProperties.filter(p => p.status === 'approved').length;
    const liveProperties = formattedProperties.filter(p => p.status === 'live').length;
    const activeProperties = approvedProperties + liveProperties; // Both are considered active
    const lockedProperties = formattedProperties.filter(p => p.cart_status?.in_cart).length;
    const totalViews = formattedProperties.reduce((sum, p) => sum + (p.views || 0), 0);
    
    console.log('Dashboard Stats:');
    console.log('- Total Properties:', totalProperties);
    console.log('- Approved Properties:', approvedProperties);
    console.log('- Live Properties:', liveProperties);
    console.log('- Active Properties (approved + live):', activeProperties);
    console.log('- Locked Properties:', lockedProperties);
    console.log('- Total Views:', totalViews);

    // Status breakdown for debug
    const statusBreakdown = {
      draft: formattedProperties.filter(p => p.status === 'draft').length,
      pending: formattedProperties.filter(p => p.status === 'pending_approval').length,
      approved: approvedProperties,
      live: liveProperties,
      sold: formattedProperties.filter(p => p.status === 'sold').length,
      rejected: formattedProperties.filter(p => p.status === 'rejected').length
    };
    console.log('Status Breakdown:', statusBreakdown);

    res.render('seller/dashboard', {
      title: 'Seller Dashboard',
      user: req.user,
      properties: formattedProperties,
      stats: {
        totalProperties: totalProperties,
        activeProperties: activeProperties, // Use this instead of just liveProperties
        approvedProperties: approvedProperties,
        liveProperties: liveProperties,
        lockedProperties: lockedProperties,
        pendingProperties: formattedProperties.filter(p => p.status === 'pending_approval').length,
        totalViews: totalViews,
        totalInquiries: formattedProperties.reduce((sum, p) => sum + (p.inquiries || 0), 0)
      },
      token: req.session.token || '',
      activePage: 'seller'
    });
    
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    console.error('Error stack:', error.stack);
    res.render('seller/dashboard', {
      title: 'Seller Dashboard',
      user: req.user,
      properties: [],
      stats: {
        totalProperties: 0,
        activeProperties: 0,
        approvedProperties: 0,
        liveProperties: 0,
        lockedProperties: 0,
        pendingProperties: 0,
        totalViews: 0,
        totalInquiries: 0
      },
      token: req.session.token || '',
      activePage: 'seller'
    });
  }
});

// Helper function to format price
function formatPrice(price) {
  if (!price || price === 0) return '₹0';
  
  if (price >= 10000000) {
    return '₹' + (price / 10000000).toFixed(2) + ' Cr';
  } else if (price >= 100000) {
    return '₹' + (price / 100000).toFixed(2) + ' L';
  } else {
    return '₹' + price.toLocaleString('en-IN');
  }
}

// ========== ADD PROPERTY ==========
router.get('/properties/add', (req, res) => {
  res.render('seller/add-property', {
    title: 'Add New Property',
    user: req.user,
    token: req.session.token || '',
    activePage: 'seller'
  });
});
// ========== ADD PROPERTY ==========
router.get('/properties/add', (req, res) => {
  res.render('seller/add-property', {
    title: 'Add New Property',
    user: req.user,
    token: req.session.token || '',
    activePage: 'seller'
  });
});

router.post('/properties/add', upload.array('images', 10), async (req, res) => {
  console.log('=== ADD PROPERTY API CALLED ===');
  console.log('User:', req.user ? `${req.user.id} (${req.user.name})` : 'No user');
  console.log('Files received:', req.files ? req.files.length : 0);
  console.log('Request Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const Property = require('../models/Property');
    
    // Validate required fields
    if (!req.body.title || !req.body.title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Property title is required'
      });
    }

    if (!req.body.price || parseFloat(req.body.price) < 1000) {
      return res.status(400).json({
        success: false,
        message: 'Valid price (minimum ₹1000) is required'
      });
    }

    // Extract and validate address
    const address = {
      street: req.body['address[street]'] || req.body.street || '',
      landmark: req.body['address[landmark]'] || req.body.landmark || '',
      area: req.body['address[area]'] || req.body.area || '',
      city: req.body['address[city]'] || req.body.city || '',
      state: req.body['address[state]'] || req.body.state || '',
      pincode: req.body['address[pincode]'] || req.body.pincode || ''
    };

    // Handle amenities
    let amenities = [];
    if (req.body.amenities) {
      if (Array.isArray(req.body.amenities)) {
        amenities = req.body.amenities;
      } else if (typeof req.body.amenities === 'string') {
        amenities = [req.body.amenities];
      }
    }

    // Handle features
    let features = [];
    if (req.body.features) {
      if (Array.isArray(req.body.features)) {
        features = req.body.features;
      } else if (typeof req.body.features === 'string') {
        features = [req.body.features];
      }
    }

    // Handle MULTIPLE image uploads to Cloudinary
    const imageUploads = [];
    if (req.files && req.files.length > 0) {
      console.log(`Processing ${req.files.length} image(s)...`);
      
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        try {
          console.log(`Uploading image ${i+1}: ${file.originalname} (${file.mimetype})`);
          
          // Upload to Cloudinary
          const result = await cloudinary.uploader.upload(file.path, {
            folder: 'propbandhu/properties',
            public_id: `property_${req.user.id}_${Date.now()}_${i}`,
            transformation: [
              { width: 1200, height: 800, crop: 'limit' },
              { quality: 'auto' }
            ]
          });
          
          console.log(`✅ Image ${i+1} uploaded: ${result.secure_url}`);
          
          imageUploads.push({
            url: result.secure_url,
            public_id: result.public_id,
            caption: `Property Image ${i + 1}`,
            is_primary: i === 0, // First image is primary
            order: i
          });
          
        } catch (uploadError) {
          console.error(`❌ Failed to upload image ${i+1}:`, uploadError.message);
        }
      }
    } else {
      console.log('No images uploaded - property will be created without images');
    }

    // Parse numeric fields
    const parseNumber = (value, defaultValue = undefined) => {
      if (!value || value === '' || value === 'null' || value === 'undefined') {
        return defaultValue;
      }
      const num = parseFloat(value);
      return isNaN(num) ? defaultValue : num;
    };

    // Create property object with ALL required fields
    const propertyData = {
      title: req.body.title.trim(),
      description: req.body.description?.trim() || 'No description provided',
      short_description: (req.body.short_description || '').trim(),
      property_type: req.body.property_type || 'Residential',
      sub_type: req.body.sub_type || 'Apartment',
      status: 'pending_approval',
      approval_status: 'pending',
      price: parseFloat(req.body.price),
      price_type: req.body.price_type || 'fixed',
      bedrooms: parseNumber(req.body.bedrooms, 0),
      bathrooms: parseNumber(req.body.bathrooms, 0),
      balconies: parseNumber(req.body.balconies, 0),
      built_up_area: parseNumber(req.body.built_up_area, 0),
      area_unit: req.body.area_unit || 'sqft',
      carpet_area: parseNumber(req.body.carpet_area),
      floor_number: parseNumber(req.body.floor_number),
      total_floors: parseNumber(req.body.total_floors),
      age_of_property: parseNumber(req.body.age_of_property),
      furnishing: req.body.furnishing || 'unfurnished',
      facing: req.body.facing || '',
      address: address,
      amenities: amenities,
      features: features,
      images: imageUploads,
      seller: req.user.id,
      added_by: {
        user: req.user.id,
        role: req.user.role || 'seller'
      },
      commission: {
        adder_rate: 0,
        seller_rate: 0,
        adder_paid: false,
        seller_paid: false
      },
      cart_status: {
        in_cart: false
      }
    };

    // Log the data being saved
    console.log('💾 Property data to save:', JSON.stringify({
      title: propertyData.title,
      price: propertyData.price,
      status: propertyData.status,
      seller: propertyData.seller,
      images_count: propertyData.images.length
    }, null, 2));

    console.log('💾 Saving property to database...');
    
    // Save to database
    const property = await Property.create(propertyData);
    
    console.log(`✅ Property created: ${property._id}`);
    console.log(`✅ Property Status: ${property.status}`);
    console.log(`✅ Property Seller: ${property.seller}`);

    // Create a notification for admin (optional)
    try {
      // You can add notification logic here
      console.log('📢 Property submitted for admin approval');
    } catch (notifError) {
      console.error('Notification error:', notifError.message);
    }

    res.json({
      success: true,
      message: 'Property submitted successfully! It will be reviewed by admin.',
      property: {
        id: property._id,
        title: property.title,
        status: property.status,
        images: property.images.length
      }
    });

  } catch (error) {
    console.error('❌ Add property error:', error);
    console.error('Error stack:', error.stack);
    
    let errorMessage = 'Failed to add property';
    if (error.name === 'ValidationError') {
      errorMessage = 'Validation error: ' + Object.values(error.errors).map(e => e.message).join(', ');
    } else if (error.code === 11000) {
      errorMessage = 'Duplicate property detected';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// ========== EDIT PROPERTY ==========
router.get('/properties/:id/edit', async (req, res) => {
  try {
    const Property = require('../models/Property');
    
    const property = await Property.findOne({
      _id: req.params.id,
      seller: req.user.id
    });

    if (!property) {
      return res.status(404).render('error', {
        title: 'Not Found',
        message: 'Property not found or you do not have permission to edit it.',
        user: req.user,
        activePage: 'seller'
      });
    }

    // Check edit permissions
    if (property.cart_status?.in_cart) {
      return res.render('seller/edit-locked', {
        title: 'Edit Property - Locked',
        user: req.user,
        property: property,
        token: req.session.token || '',
        activePage: 'seller'
      });
    }

    res.render('seller/edit-property', {
      title: 'Edit Property',
      user: req.user,
      property: property,
      token: req.session.token || '',
      activePage: 'seller'
    });
  } catch (error) {
    console.error('Edit property error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load property for editing.',
      user: req.user,
      activePage: 'seller'
    });
  }
});

router.post('/properties/:id/update', upload.array('images', 20), async (req, res) => {
  try {
    const Property = require('../models/Property');
    
    const property = await Property.findOne({
      _id: req.params.id,
      seller: req.user.id
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Check if property is locked in cart
    if (property.cart_status?.in_cart) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit property while it is in a buyer\'s cart'
      });
    }

    // Check edit permissions
    if (property.edit_permissions?.enabled) {
      const allowedFields = property.edit_permissions.allowed_fields;
      const now = new Date();
      
      if (now > property.edit_permissions.end_time) {
        return res.status(400).json({
          success: false,
          message: 'Edit window has expired'
        });
      }
      
      // Filter only allowed fields
      const updates = {};
      Object.keys(req.body).forEach(field => {
        if (allowedFields.includes(field)) {
          updates[field] = req.body[field];
        }
      });
      
      // Apply updates
      Object.assign(property, updates);
    } else {
      // Handle image uploads if any
      if (req.files && req.files.length > 0) {
        const imageUploads = [];
        
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'propbandhu/properties',
                public_id: `property_${property._id}_${Date.now()}_${i}`
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
            caption: `Image ${property.images.length + i + 1}`,
            is_primary: property.images.length === 0 && i === 0,
            order: property.images.length + i
          });
        }

        // Add new images to existing ones
        property.images = [...property.images, ...imageUploads];
      }

      // Update other fields
      const updatableFields = [
        'title', 'description', 'short_description', 'price', 'price_type',
        'bedrooms', 'bathrooms', 'balconies', 'built_up_area', 'carpet_area',
        'floor_number', 'total_floors', 'age_of_property', 'furnishing', 'facing',
        'amenities'
      ];

      updatableFields.forEach(field => {
        if (req.body[field] !== undefined) {
          property[field] = req.body[field];
        }
      });

      // Update address fields
      if (req.body['address[street]']) property.address.street = req.body['address[street]'];
      if (req.body['address[landmark]']) property.address.landmark = req.body['address[landmark]'];
      if (req.body['address[area]']) property.address.area = req.body['address[area]'];
      if (req.body['address[city]']) property.address.city = req.body['address[city]'];
      if (req.body['address[state]']) property.address.state = req.body['address[state]'];
      if (req.body['address[pincode]']) property.address.pincode = req.body['address[pincode]'];
    }

    await property.save();

    res.json({
      success: true,
      message: 'Property updated successfully',
      property: {
        id: property._id,
        title: property.title
      }
    });

  } catch (error) {
    console.error('Update property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update property'
    });
  }
});

// ========== DELETE PROPERTY ==========
router.post('/properties/:id/delete', async (req, res) => {
  try {
    const Property = require('../models/Property');
    
    const property = await Property.findOne({
      _id: req.params.id,
      seller: req.user.id
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    // Check if property can be deleted
    if (property.cart_status?.in_cart) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete property while it is in a buyer\'s cart'
      });
    }

    // Delete images from Cloudinary
    if (property.images && property.images.length > 0) {
      for (const image of property.images) {
        if (image.public_id) {
          try {
            await cloudinary.uploader.destroy(image.public_id);
          } catch (error) {
            console.error('Failed to delete image from Cloudinary:', error);
          }
        }
      }
    }

    // Delete property from database
    await Property.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Property deleted successfully'
    });

  } catch (error) {
    console.error('Delete property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete property'
    });
  }
});

// ========== PROPERTY DETAILS ==========
router.get('/properties/:id', async (req, res) => {
  try {
    console.log('=== PROPERTY DETAILS REQUEST ===');
    console.log('User ID:', req.user.id);
    console.log('Property ID:', req.params.id);
    
    const Property = require('../models/Property');
    const User = require('../models/User');
    
    // Find property belonging to this seller
    const property = await Property.findOne({
      _id: req.params.id,
      seller: req.user.id
    })
    .populate('seller', 'name email phone')
    .populate('approved_by', 'name email')
    .populate('broker', 'name email phone')
    .populate('cart_status.buyer_id', 'name email phone');

    if (!property) {
      console.log('Property not found or unauthorized access');
      return res.status(404).render('error', {
        title: 'Property Not Found',
        message: 'The requested property does not exist or you do not have permission to view it.',
        user: req.user,
        activePage: 'seller'
      });
    }

    console.log('Property found:', property.title);
    console.log('Property status:', property.status);
    console.log('Property seller:', property.seller);
    
    // Helper functions
    const formatPrice = (price) => {
      if (!price || price === 0) return '₹0';
      
      if (price >= 10000000) {
        return '₹' + (price / 10000000).toFixed(2) + ' Cr';
      } else if (price >= 100000) {
        return '₹' + (price / 100000).toFixed(2) + ' L';
      } else {
        return '₹' + price.toLocaleString('en-IN');
      }
    };

    const getFullAddress = (address) => {
      if (!address) return 'Address not specified';
      
      const parts = [];
      if (address.street) parts.push(address.street);
      if (address.landmark) parts.push(address.landmark);
      if (address.area) parts.push(address.area);
      if (address.city) parts.push(address.city);
      if (address.state) parts.push(address.state);
      if (address.pincode) parts.push(address.pincode);
      
      return parts.join(', ') || 'Address not specified';
    };

    const getPrimaryImage = (images) => {
      if (!images || images.length === 0) {
        return null;
      }
      // Find primary image or first image
      const primary = images.find(img => img.is_primary);
      return primary ? primary.url : images[0].url;
    };

    // Calculate cart lock countdown
    let daysLeft = 0;
    let bookingWindowEnd = null;
    if (property.cart_status?.in_cart) {
      const addedDate = new Date(property.cart_status.added_at);
      const visitExpiry = new Date(addedDate);
      visitExpiry.setDate(visitExpiry.getDate() + 7);
      const now = new Date();
      daysLeft = Math.ceil((visitExpiry - now) / (1000 * 60 * 60 * 24));
      
      if (property.cart_status.visit_confirmed && property.cart_status.booking_window_end) {
        bookingWindowEnd = property.cart_status.booking_window_end;
      }
    }

    // Calculate expiry date (30 days from creation)
    const expiresAt = new Date(property.createdAt);
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Format property data for template
    const propertyData = {
      ...property.toObject(),
      _id: property._id.toString(),
      formatted_price: formatPrice(property.price),
      full_address: getFullAddress(property.address),
      primary_image: getPrimaryImage(property.images),
      is_featured: property.is_featured || false,
      is_verified: property.is_verified || false,
      price_type: property.price_type || 'fixed',
      property_type: property.property_type || 'Residential',
      sub_type: property.sub_type || 'Apartment',
      description: property.description || 'No description available',
      bedrooms: property.bedrooms || 0,
      bathrooms: property.bathrooms || 0,
      balconies: property.balconies || 0,
      built_up_area: property.built_up_area || property.carpet_area || 0,
      carpet_area: property.carpet_area || 0,
      area_unit: property.area_unit || 'sq ft',
      floor_number: property.floor_number || 0,
      total_floors: property.total_floors || 0,
      age_of_property: property.age_of_property || 0,
      furnishing: property.furnishing || 'Unfurnished',
      facing: property.facing || 'Not specified',
      amenities: property.amenities || [],
      features: property.features || [],
      documents: property.documents || [],
      images: property.images || [],
      status: property.status || 'draft',
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
      approved_at: property.approved_at,
      live_at: property.live_at,
      expires_at: expiresAt,
      views: property.views || 0,
      inquiries: property.inquiries || 0,
      cart_status: property.cart_status || { in_cart: false },
      cart_days_left: daysLeft,
      booking_window_end: bookingWindowEnd
    };

    console.log('Property data formatted successfully');
    console.log('Property images:', propertyData.images.length);
    console.log('Property amenities:', propertyData.amenities.length);

    // Render the property details page
    res.render('seller/property-details', {
      title: property.title + ' - Property Details',
      user: req.user,
      property: propertyData,
      activePage: 'seller'
    });

  } catch (error) {
    console.error('❌ Property details error:', error);
    console.error('Error stack:', error.stack);
    
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load property details. Please try again.',
      user: req.user,
      activePage: 'seller'
    });
  }
});

// ========== CART LOCK DETAILS ==========
router.get('/properties/:id/cart-details', async (req, res) => {
  try {
    const Property = require('../models/Property');
    const User = require('../models/User');
    
    const property = await Property.findOne({
      _id: req.params.id,
      seller: req.user.id
    }).populate('cart_status.buyer_id', 'name email phone');

    if (!property) {
      return res.status(404).render('error', {
        title: 'Property Not Found',
        message: 'The requested property does not exist.',
        user: req.user,
        activePage: 'seller'
      });
    }

    if (!property.cart_status?.in_cart) {
      return res.status(400).render('error', {
        title: 'Not in Cart',
        message: 'This property is not currently in any buyer\'s cart.',
        user: req.user,
        activePage: 'seller'
      });
    }

    // Calculate countdown times
    const addedDate = new Date(property.cart_status.added_at);
    const visitExpiry = new Date(addedDate);
    visitExpiry.setDate(visitExpiry.getDate() + 7);
    const now = new Date();
    const daysLeft = Math.ceil((visitExpiry - now) / (1000 * 60 * 60 * 24));
    
    let bookingDaysLeft = 0;
    if (property.cart_status.visit_confirmed && property.cart_status.booking_window_end) {
      bookingDaysLeft = Math.ceil((property.cart_status.booking_window_end - now) / (1000 * 60 * 60 * 24));
    }

    res.render('seller/cart-details', {
      title: 'Cart Lock Details - ' + property.title,
      user: req.user,
      property: property,
      buyer: property.cart_status.buyer_id,
      daysLeft: daysLeft,
      bookingDaysLeft: bookingDaysLeft,
      visitExpiry: visitExpiry,
      token: req.session.token || '',
      activePage: 'seller'
    });
  } catch (error) {
    console.error('Cart details error:', error);
    res.status(500).render('error', {
      title: 'Error',
      message: 'Failed to load cart details.',
      user: req.user,
      activePage: 'seller'
    });
  }
});

// ========== ANALYTICS ==========
router.get('/analytics', async (req, res) => {
  try {
    const Property = require('../models/Property');
    
    // Get seller's properties
    const properties = await Property.find({ seller: req.user.id });
    
    // Calculate analytics
    const totalProperties = properties.length;
    const liveProperties = properties.filter(p => p.status === 'live').length;
    const pendingProperties = properties.filter(p => p.status === 'pending_approval').length;
    const soldProperties = properties.filter(p => p.status === 'sold').length;
    const lockedProperties = properties.filter(p => p.cart_status?.in_cart).length;
    
    const totalViews = properties.reduce((sum, p) => sum + (p.views || 0), 0);
    const totalInquiries = properties.reduce((sum, p) => sum + (p.inquiries || 0), 0);
    const totalValue = properties.reduce((sum, p) => sum + (p.price || 0), 0);
    
    // Calculate performance metrics
    const performanceMetrics = {
      viewsPerProperty: totalProperties > 0 ? Math.round(totalViews / totalProperties) : 0,
      inquiryRate: totalViews > 0 ? ((totalInquiries / totalViews) * 100).toFixed(2) : 0,
      conversionRate: totalProperties > 0 ? ((soldProperties / totalProperties) * 100).toFixed(2) : 0,
      avgPrice: totalProperties > 0 ? Math.round(totalValue / totalProperties) : 0
    };

    // Get recent activity
    const recentActivity = properties
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 10)
      .map(p => ({
        title: p.title,
        action: getPropertyAction(p),
        date: p.updatedAt,
        status: p.status
      }));

    res.render('seller/analytics', {
      title: 'Analytics Dashboard',
      user: req.user,
      stats: {
        totalProperties,
        liveProperties,
        pendingProperties,
        soldProperties,
        lockedProperties,
        totalViews,
        totalInquiries,
        totalValue
      },
      performanceMetrics,
      recentActivity,
      token: req.session.token || '',
      activePage: 'seller'
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.render('seller/analytics', {
      title: 'Analytics Dashboard',
      user: req.user,
      stats: {
        totalProperties: 0,
        liveProperties: 0,
        pendingProperties: 0,
        soldProperties: 0,
        lockedProperties: 0,
        totalViews: 0,
        totalInquiries: 0,
        totalValue: 0
      },
      performanceMetrics: {
        viewsPerProperty: 0,
        inquiryRate: 0,
        conversionRate: 0,
        avgPrice: 0
      },
      recentActivity: [],
      token: req.session.token || '',
      activePage: 'seller'
    });
  }
});

router.get('/properties', (req, res) => {
  res.redirect('/seller/property-details');
});
// Helper function for property action
function getPropertyAction(property) {
  if (property.cart_status?.in_cart) {
    return property.cart_status.visit_confirmed ? 
      'Booking window active' : 
      'Added to buyer cart';
  }
  
  switch (property.status) {
    case 'live': return 'Property live on platform';
    case 'pending_approval': return 'Awaiting admin approval';
    case 'approved': return 'Approved by admin';
    case 'sold': return 'Property sold';
    case 'draft': return 'Draft saved';
    default: return 'Status updated';
  }
}

// ========== DOCUMENTS ==========
router.get('/documents', async (req, res) => {
  try {
    const Property = require('../models/Property');
    
    // Get seller's properties with documents
    const properties = await Property.find({ 
      seller: req.user.id,
      $or: [
        { documents: { $exists: true, $not: { $size: 0 } } },
        { 'images.url': { $exists: true } }
      ]
    });

    res.render('seller/documents', {
      title: 'Property Documents',
      user: req.user,
      properties: properties,
      token: req.session.token || '',
      activePage: 'seller'
    });
  } catch (error) {
    console.error('Documents error:', error);
    res.render('seller/documents', {
      title: 'Property Documents',
      user: req.user,
      properties: [],
      token: req.session.token || '',
      activePage: 'seller'
    });
  }
});

// ========== API ROUTES ==========

// Get cart lock status
router.get('/api/cart-locks', async (req, res) => {
  try {
    const Property = require('../models/Property');
    
    const properties = await Property.find({
      seller: req.user.id,
      'cart_status.in_cart': true
    }).populate('cart_status.buyer_id', 'name email phone');

    const lockedProperties = properties.map(property => {
      const propertyObj = new Property(property);
      return {
        id: property._id,
        title: property.title,
        price: property.price,
        buyer: property.cart_status.buyer_id,
        added_at: property.cart_status.added_at,
        visit_confirmed: property.cart_status.visit_confirmed,
        booking_window_end: property.cart_status.booking_window_end,
        can_sell_outside: !propertyObj.isVisitPending() && !propertyObj.isBookingWindowActive(),
        isVisitPending: propertyObj.isVisitPending(),
        isBookingWindowActive: propertyObj.isBookingWindowActive()
      };
    });

    res.json({
      success: true,
      lockedProperties: lockedProperties
    });
  } catch (error) {
    console.error('Get cart locks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cart lock status'
    });
  }
});

// Get property status
router.get('/api/properties/status', async (req, res) => {
  try {
    const Property = require('../models/Property');
    
    const properties = await Property.find({ seller: req.user.id });
    
    const statusCounts = {
      draft: properties.filter(p => p.status === 'draft').length,
      pending_approval: properties.filter(p => p.status === 'pending_approval').length,
      live: properties.filter(p => p.status === 'live').length,
      sold: properties.filter(p => p.status === 'sold').length,
      locked: properties.filter(p => p.cart_status?.in_cart).length
    };

    res.json({
      success: true,
      statusCounts: statusCounts,
      totalProperties: properties.length
    });
  } catch (error) {
    console.error('Property status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch property status'
    });
  }
});

// Unlock property from cart (admin/seller request)
router.post('/api/properties/:id/unlock', async (req, res) => {
  try {
    const Property = require('../models/Property');
    
    const property = await Property.findOne({
      _id: req.params.id,
      seller: req.user.id
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    if (!property.cart_status?.in_cart) {
      return res.status(400).json({
        success: false,
        message: 'Property is not locked in cart'
      });
    }

    // Check if visit window expired or booking window expired
    const propertyObj = new Property(property);
    if (propertyObj.isVisitPending() || propertyObj.isBookingWindowActive()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot unlock property while visit/booking window is active'
      });
    }

    // Unlock property
    property.cart_status = {
      in_cart: false,
      buyer_id: null,
      added_at: null,
      visit_confirmed: false
    };

    await property.save();

    res.json({
      success: true,
      message: 'Property unlocked successfully'
    });

  } catch (error) {
    console.error('Unlock property error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlock property'
    });
  }
});

// Upload document
router.post('/api/properties/:id/documents/upload', upload.single('document'), async (req, res) => {
  try {
    const Property = require('../models/Property');
    
    const property = await Property.findOne({
      _id: req.params.id,
      seller: req.user.id
    });

    if (!property) {
      return res.status(404).json({
        success: false,
        message: 'Property not found'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Upload document to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'propbandhu/documents',
          resource_type: 'auto',
          public_id: `doc_${property._id}_${Date.now()}`
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      uploadStream.end(req.file.buffer);
    });

    // Add document to property
    property.documents = property.documents || [];
    property.documents.push({
      name: req.body.name || req.file.originalname,
      url: result.secure_url,
      type: req.body.type || 'other',
      uploaded_at: new Date()
    });

    await property.save();

    res.json({
      success: true,
      message: 'Document uploaded successfully',
      document: {
        name: req.body.name || req.file.originalname,
        url: result.secure_url,
        type: req.body.type || 'other'
      }
    });

  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload document'
    });
  }
});


module.exports = router;