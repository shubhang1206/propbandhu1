require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cartCleanupService = require('./services/cartCleanupService');
const simpleCleanupService = require('./services/simpleCleanupService');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/propbandhu', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'propbandhu-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/propbandhu',
    collectionName: 'sessions'
  }),
  cookie: { 
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ========== IMPORT MIDDLEWARE ==========
const { authenticateSession, requireAuth, redirectToDashboard } = require('./middleware/auth');

// ========== CUSTOM MIDDLEWARE ==========

// Set active page for navigation
app.use((req, res, next) => {
  let activePage = 'home';
  const currentPath = req.path.toLowerCase();
  
  if (currentPath.includes('admin')) activePage = 'admin';
  else if (currentPath.includes('seller')) activePage = 'seller';
  else if (currentPath.includes('buyer')) activePage = 'buyer';
  else if (currentPath.includes('broker')) activePage = 'broker';
  else if (currentPath.includes('properties')) activePage = 'properties';
  else if (currentPath.includes('login')) activePage = 'login';
  else if (currentPath.includes('register')) activePage = 'register';
  
  res.locals.activePage = activePage;
  next();
});

// Apply auth middleware to get user from session
app.use(authenticateSession);

// Get user from session for templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.token = req.session.token || null;
  next();
});

// Start cleanup service
simpleCleanupService.start();

// Graceful shutdown
process.on('SIGINT', () => {
  simpleCleanupService.stop();
  process.exit(0);
});


// ========== PUBLIC ROUTES ==========

if (process.env.NODE_ENV !== 'test') {
  cartCleanupService.start();
}

// Graceful shutdown
process.on('SIGINT', () => {
  cartCleanupService.stop();
  process.exit(0);
});

// Home page
app.get('/', async (req, res) => {
  try {
    // If user is logged in, redirect to their dashboard
    if (req.session.user) {
      const dashboardUrls = {
        'admin': '/admin/dashboard',
        'seller': '/seller/dashboard',
        'buyer': '/buyer/dashboard',
        'broker': '/broker/dashboard'
      };
      return res.redirect(dashboardUrls[req.session.user.role] || '/');
    }
    
    // Show homepage for non-logged in users
    res.render('index', {
      title: 'Propbandhu - Find Your Perfect Property',
      user: req.session.user,
      activePage: 'home'
    });
  } catch (error) {
    console.error('Homepage error:', error);
    res.render('index', {
      title: 'Propbandhu - Find Your Perfect Property',
      user: req.session.user,
      activePage: 'home'
    });
  }
});

// Login page
app.get('/login', redirectToDashboard, (req, res) => {
  res.render('auth/login', {
    title: 'Login',
    user: req.session.user,
    activePage: 'login'
  });
});

// Register page
app.get('/register', redirectToDashboard, (req, res) => {
  res.render('auth/register', {
    title: 'Register',
    user: req.session.user,
    activePage: 'register'
  });
});

// ========== AUTH API ROUTES ==========

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const User = require(../models/user');
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }
    
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }
    
    user.last_login = new Date();
    await user.save();
    
    // Store user in session
    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone
    };
    
    req.session.token = 'token-' + Date.now();
    
    // Determine dashboard URL based on role
    let dashboardUrl = '/';
    if (user.role === 'seller') {
      dashboardUrl = '/seller/dashboard';
    } else if (user.role === 'buyer') {
      dashboardUrl = '/buyer/dashboard';
    } else if (user.role === 'broker') {
      dashboardUrl = '/broker/dashboard';
    } else if (user.role === 'admin') {
      dashboardUrl = '/admin/dashboard';
    }
    
    res.json({
      success: true,
      message: 'Login successful!',
      token: req.session.token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone
      },
      dashboard: dashboardUrl
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, phone, password, role = 'buyer' } = req.body;
    
    const User = require(../models/user');
    
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }
    
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'Phone number already exists'
      });
    }
    
    const user = new User({
      name,
      email,
      phone,
      password: password,
      role
    });
    
    await user.save();
    
    // Store user in session
    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone
    };
    
    req.session.token = 'token-' + Date.now();
    
    // Determine dashboard URL based on role
    let dashboardUrl = '/';
    if (user.role === 'seller') {
      dashboardUrl = '/seller/dashboard';
    }
    
    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token: req.session.token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      dashboard: dashboardUrl
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed: ' + error.message
    });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ========== IMPORT ROUTE FILES ==========

// Import route files
const sellerRoutes = require('./routes/seller');
const buyerRoutes = require('./routes/buyer');
const brokerRoutes = require('./routes/broker');
const adminViewRoutes = require('./routes/adminViewRoutes');
const adminApiRoutes = require('./routes/admin'); // Your existing API routes

// Mount route files
app.use('/seller', sellerRoutes);
app.use('/buyer', buyerRoutes);
app.use('/broker', brokerRoutes);
app.use('/admin', adminViewRoutes); // For admin view pages
app.use('/admin/api', adminApiRoutes); // For admin API endpoints


// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { 
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
    user: req.session.user || null,
    token: req.session.token || '',
    activePage: 'error'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('💥 Server error:', err.stack);
  
  res.status(500).render('error', { 
    title: 'Server Error',
    message: 'Something went wrong! Please try again later.',
    user: req.session.user || null,
    token: req.session.token || '',
    activePage: 'error'
  });
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`
🚀 Server started: http://localhost:${PORT}

📊 ROLE-BASED DASHBOARDS:
   👑 Admin:     /admin/dashboard
   👤 Buyer:     /buyer/dashboard  
   🏠 Seller:    /seller/dashboard
   🤝 Broker:    /broker/dashboard

🔐 AUTHENTICATION:
   📝 Register:  /register
   🔑 Login:     /login
   🚪 Logout:    /logout

💡 How to use:
   1. Go to /register to create an account
   2. Choose "seller" as your role
   3. Login with your credentials
   4. You'll be redirected to /seller/dashboard
`);
});