const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
const requestRoutes = require('./routes/requests');
const commentRoutes = require('./routes/comments');
const conditionReportRoutes = require('./routes/conditionReports');
const gradeGroupsRoutes = require('./routes/gradeGroups');
const adminRoutes = require('./routes/admin');


const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
const canonicalFrontendUrl = process.env.CLIENT_URL || 'https://wsa2l-el-2daa7.vercel.app';
const allowedOrigins = [
  canonicalFrontendUrl,
  'http://localhost:5173'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.trim();

    try {
      const parsedOrigin = new URL(normalizedOrigin).origin;

      if (allowedOrigins.includes(parsedOrigin)) {
        return callback(null, true);
      }
    } catch (error) {
      return callback(new Error('Not allowed by CORS'));
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
  maxAge: 86400 
};

app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'church-inventory-api' });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/gradegroups', gradeGroupsRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/requests', commentRoutes);
app.use('/api/requests', conditionReportRoutes);
app.use('/api/admin', adminRoutes);

// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
