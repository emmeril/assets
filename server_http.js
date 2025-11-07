require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const compression = require("compression");
const fs = require("fs").promises;
const path = require("path");
const multer = require("multer");
const XLSX = require("xlsx");
const cors = require("cors");

const app = express();

// Konfigurasi
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATABASE_DIR = path.join(__dirname, "database");
const CATEGORIES_FILE = path.join(DATABASE_DIR, "categories.json");
const ASSETS_FILE = path.join(DATABASE_DIR, "assets.json");

// Middleware CORS - DIPERBAIKI
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Handle preflight requests
app.options('*', cors());

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files - pastikan direktori uploads ada
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "frontend")));

// Pastikan direktori uploads dan database ada
const ensureDirectories = async () => {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(DATABASE_DIR, { recursive: true });
    console.log("Directories ensured");
  } catch (error) {
    console.error("Error creating directories:", error);
  }
};

// Konfigurasi Multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureDirectories();
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar yang diizinkan!'), false);
    }
  }
});

const uploadExcel = multer({ 
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Validasi Schemas
const userSchema = Joi.object({
  username: Joi.string().min(3).required(),
  password: Joi.string().min(6).required(),
});

const categorySchema = Joi.object({
  nameCategory: Joi.string().required(),
});

const assetSchema = Joi.object({
  nameCategory: Joi.string().required(),
  kodeAsset: Joi.string().required(),
  description: Joi.string().required(),
  serialNumber: Joi.string().required(),
  quantity: Joi.number().min(1).required(),
  price: Joi.number().min(0).required(),
  purchaseDate: Joi.string().required(),
  division: Joi.string().required(),
  username: Joi.string().required(),
  brand: Joi.string().required(),
  processor: Joi.string().allow("", null),
  ram: Joi.string().allow("", null),
  hdd: Joi.string().allow("", null),
  os: Joi.string().allow("", null),
  photo: Joi.string().optional().allow(''),
});

// Utility Functions
const ensureDirectoryExists = async (filePath) => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
};

const saveDataToFile = async (data, filePath) => {
  try {
    await ensureDirectoryExists(filePath);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Data berhasil disimpan di ${filePath}`);
  } catch (error) {
    console.error(`Gagal menyimpan data: ${error.message}`);
    throw error;
  }
};

const loadDataFromFile = async (filePath, validateFn) => {
  try {
    await fs.access(filePath);
    const data = await fs.readFile(filePath, 'utf8');
    if (!data.trim()) return [];
    
    const parsed = JSON.parse(data);
    const validData = parsed.filter(validateFn);
    
    console.log(`Data berhasil dimuat dari ${filePath}`);
    return validData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`File ${filePath} tidak ditemukan, membuat yang baru`);
      return [];
    }
    console.error(`Gagal memuat data: ${error.message}`);
    return [];
  }
};

const generateAssetCode = (assets, nameCategory) => {
  const prefix = nameCategory.substring(0, 3).toUpperCase();
  const filtered = assets.filter((a) => a.kodeAsset?.startsWith(prefix));
  const lastNumber = filtered.reduce((max, asset) => {
    const match = asset.kodeAsset?.match(/\d+$/);
    return Math.max(max, match ? parseInt(match[0], 10) : 0);
  }, 0);

  return `${prefix}-${(lastNumber + 1).toString().padStart(4, "0")}`;
};

// Data Storage
let categories = [];
let assets = [];

// Middleware Authentication - DIPERBAIKI
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    console.log('🔐 Auth Header:', authHeader);
    console.log('🌐 Request Method:', req.method);
    console.log('📝 Request Path:', req.path);
    
    if (!authHeader) {
      console.log('❌ No authorization header');
      return res.status(401).json({ message: "Token tidak ditemukan" });
    }

    if (!authHeader.startsWith("Bearer ")) {
      console.log('❌ Invalid authorization format');
      return res.status(401).json({ message: "Format token salah. Harus diawali dengan 'Bearer '" });
    }

    const token = authHeader.split(" ")[1];
    
    if (!token) {
      console.log('❌ No token after Bearer');
      return res.status(401).json({ message: "Token tidak ditemukan setelah 'Bearer'" });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        console.log('❌ Token verification failed:', err.message);
        const errorMessage = err.name === "TokenExpiredError" 
          ? "Token telah kedaluwarsa" 
          : "Token tidak valid";
        return res.status(403).json({ message: errorMessage });
      }
      
      console.log('✅ Token verified for user:', user.username);
      req.user = user;
      next();
    });
  } catch (error) {
    console.error("Error di middleware authenticateToken:", error.message);
    res.status(500).json({ message: "Terjadi kesalahan pada server" });
  }
};

// Inisialisasi Data
const initializeData = async () => {
  try {
    categories = await loadDataFromFile(CATEGORIES_FILE, (c) => c.id && c.nameCategory);
    assets = await loadDataFromFile(ASSETS_FILE, (a) => 
      a.id && a.nameCategory && a.description && a.serialNumber && a.quantity && a.price
    );

    await saveDataToFile(categories, CATEGORIES_FILE);
    await saveDataToFile(assets, ASSETS_FILE);
    
    console.log("Data initialization completed");
  } catch (error) {
    console.error("Data initialization failed:", error);
  }
};

// Routes
app.get("/cors-test", (req, res) => {
  res.json({ message: "CORS OK!" });
});

// Category Routes
app.get("/get-categories", authenticateToken, async (req, res) => {
  try {
    const categories = await loadDataFromFile(CATEGORIES_FILE, (c) => c.id && c.nameCategory);
    res.json({ categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

app.post("/add-category", async (req, res) => {
  const { error, value } = categorySchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const categories = await loadDataFromFile(CATEGORIES_FILE, (c) => c.id && c.nameCategory);
    const category = { id: Date.now(), ...value };
    
    categories.push(category);
    await saveDataToFile(categories, CATEGORIES_FILE);
    
    res.json({ message: "Kategori berhasil ditambahkan!", category });
  } catch (error) {
    console.error("Error saving category:", error);
    res.status(500).json({ message: "Failed to save category" });
  }
});

app.get("/get-category/:id", authenticateToken, async (req, res) => {
  try {
    const categories = await loadDataFromFile(CATEGORIES_FILE, (c) => c.id && c.nameCategory);
    const category = categories.find((c) => c.id === parseInt(req.params.id));
    
    if (!category) return res.status(404).json({ message: "Kategori tidak ditemukan!" });
    res.json({ category });
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({ message: "Failed to fetch category" });
  }
});

app.put("/update-category/:id",  async (req, res) => {
  const { error, value } = categorySchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const categories = await loadDataFromFile(CATEGORIES_FILE, (c) => c.id && c.nameCategory);
    const categoryIndex = categories.findIndex((c) => c.id === parseInt(req.params.id));
    
    if (categoryIndex === -1) return res.status(404).json({ message: "Kategori tidak ditemukan!" });
    
    categories[categoryIndex] = { ...categories[categoryIndex], ...value };
    await saveDataToFile(categories, CATEGORIES_FILE);
    
    res.json({ message: "Kategori berhasil diperbarui!", category: categories[categoryIndex] });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ message: "Failed to update category" });
  }
});

app.delete("/delete-category/:id", authenticateToken, async (req, res) => {
  try {
    const categories = await loadDataFromFile(CATEGORIES_FILE, (c) => c.id && c.nameCategory);
    const filteredCategories = categories.filter((c) => c.id !== parseInt(req.params.id));
    
    if (categories.length === filteredCategories.length) {
      return res.status(404).json({ message: "Kategori tidak ditemukan!" });
    }
    
    await saveDataToFile(filteredCategories, CATEGORIES_FILE);
    res.json({ message: "Kategori berhasil dihapus!" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ message: "Failed to delete category" });
  }
});

// Asset Routes
app.get("/get-assets", authenticateToken, async (req, res) => {
  try {
    const assets = await loadDataFromFile(ASSETS_FILE, (a) => 
      a.id && a.nameCategory && a.description && a.serialNumber && a.quantity && a.price
    );
    res.json({ assets });
  } catch (error) {
    console.error("Error fetching assets:", error);
    res.status(500).json({ message: "Failed to fetch assets" });
  }
});

app.post("/add-asset", authenticateToken, async (req, res) => {
  upload.single('photo')(req, res, async function(err) {
    if (err) {
      console.error('Upload error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'Ukuran file terlalu besar. Maksimal 5MB.' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ message: 'Field upload tidak sesuai.' });
        }
      }
      return res.status(400).json({ message: err.message });
    }

    try {
      const requiredFields = {
        nameCategory: req.body.nameCategory,
        description: req.body.description,
        serialNumber: req.body.serialNumber,
        quantity: req.body.quantity,
        price: req.body.price,
        purchaseDate: req.body.purchaseDate,
        division: req.body.division,
        username: req.body.username,
        brand: req.body.brand
      };

      const missingFields = Object.entries(requiredFields)
        .filter(([key, value]) => !value || value.trim() === '')
        .map(([key]) => key);

      if (missingFields.length > 0) {
        return res.status(400).json({ 
          message: `Field berikut harus diisi: ${missingFields.join(', ')}` 
        });
      }

      if (isNaN(req.body.quantity) || parseInt(req.body.quantity) < 1) {
        return res.status(400).json({ message: "Quantity harus angka dan minimal 1" });
      }

      if (isNaN(req.body.price) || parseFloat(req.body.price) < 0) {
        return res.status(400).json({ message: "Price harus angka dan minimal 0" });
      }

      const assets = await loadDataFromFile(ASSETS_FILE, (a) => 
        a.id && a.nameCategory && a.description && a.serialNumber && a.quantity && a.price
      );
      
      const { nameCategory, kodeAsset: submittedKodeAsset, ...assetData } = req.body;
      
      const type = nameCategory.toLowerCase();
      const needsSpec = ["laptop", "komputer"].includes(type);
      
      if (needsSpec) {
        const specFields = ['processor', 'ram', 'hdd', 'os'];
        const missingSpecs = specFields.filter(field => !req.body[field] || req.body[field].trim() === '');
        
        if (missingSpecs.length > 0) {
          return res.status(400).json({ 
            message: `Untuk kategori ${nameCategory}, field berikut harus diisi: ${missingSpecs.join(', ')}` 
          });
        }
      }

      const finalKodeAsset = submittedKodeAsset || generateAssetCode(assets, nameCategory);

      const asset = {
        id: Date.now(),
        kodeAsset: finalKodeAsset,
        nameCategory,
        ...assetData,
        quantity: parseInt(assetData.quantity),
        price: parseFloat(assetData.price),
        photo: req.file?.filename || null,
        processor: needsSpec ? assetData.processor : undefined,
        ram: needsSpec ? assetData.ram : undefined,
        hdd: needsSpec ? assetData.hdd : undefined,
        os: needsSpec ? assetData.os : undefined,
      };

      assets.push(asset);
      await saveDataToFile(assets, ASSETS_FILE);
      
      res.json({ message: "Aset berhasil ditambahkan!", asset });
    } catch (error) {
      console.error("Error saving asset:", error);
      res.status(500).json({ message: "Gagal menyimpan aset." });
    }
  });
});

app.get("/get-asset/:id", authenticateToken, async (req, res) => {
  try {
    const assets = await loadDataFromFile(ASSETS_FILE, (a) => 
      a.id && a.nameCategory && a.description && a.serialNumber && a.quantity && a.price
    );
    const asset = assets.find((a) => a.id === parseInt(req.params.id));
    
    if (!asset) return res.status(404).json({ message: "Aset tidak ditemukan!" });
    res.json({ asset });
  } catch (error) {
    console.error("Error fetching asset:", error);
    res.status(500).json({ message: "Failed to fetch asset" });
  }
});

app.put("/update-asset/:id", authenticateToken, async (req, res) => {
  upload.single('photo')(req, res, async function(err) {
    if (err) {
      console.error('Upload error:', err);
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'Ukuran file terlalu besar. Maksimal 5MB.' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ message: 'Field upload tidak sesuai.' });
        }
      }
      return res.status(400).json({ message: err.message });
    }

    try {
      const requiredFields = {
        nameCategory: req.body.nameCategory,
        description: req.body.description,
        serialNumber: req.body.serialNumber,
        quantity: req.body.quantity,
        price: req.body.price,
        purchaseDate: req.body.purchaseDate,
        division: req.body.division,
        username: req.body.username,
        brand: req.body.brand
      };

      const missingFields = Object.entries(requiredFields)
        .filter(([key, value]) => !value || value.trim() === '')
        .map(([key]) => key);

      if (missingFields.length > 0) {
        return res.status(400).json({ 
          message: `Field berikut harus diisi: ${missingFields.join(', ')}` 
        });
      }

      if (isNaN(req.body.quantity) || parseInt(req.body.quantity) < 1) {
        return res.status(400).json({ message: "Quantity harus angka dan minimal 1" });
      }

      if (isNaN(req.body.price) || parseFloat(req.body.price) < 0) {
        return res.status(400).json({ message: "Price harus angka dan minimal 0" });
      }

      const assets = await loadDataFromFile(ASSETS_FILE, (a) => 
        a.id && a.nameCategory && a.description && a.serialNumber && a.quantity && a.price
      );
      const assetIndex = assets.findIndex((a) => a.id === parseInt(req.params.id));
      
      if (assetIndex === -1) return res.status(404).json({ message: "Aset tidak ditemukan!" });

      const oldAsset = assets[assetIndex];
      const { nameCategory, ...updateData } = req.body;
      const type = nameCategory.toLowerCase();
      const needsSpec = ["laptop", "komputer"].includes(type);

      if (needsSpec) {
        const specFields = ['processor', 'ram', 'hdd', 'os'];
        const missingSpecs = specFields.filter(field => !req.body[field] || req.body[field].trim() === '');
        
        if (missingSpecs.length > 0) {
          return res.status(400).json({ 
            message: `Untuk kategori ${nameCategory}, field berikut harus diisi: ${missingSpecs.join(', ')}` 
          });
        }
      }

      const updatedAsset = {
        ...oldAsset,
        nameCategory,
        ...updateData,
        quantity: parseInt(updateData.quantity),
        price: parseFloat(updateData.price),
        photo: req.file?.filename || oldAsset.photo,
        processor: needsSpec ? updateData.processor : undefined,
        ram: needsSpec ? updateData.ram : undefined,
        hdd: needsSpec ? updateData.hdd : undefined,
        os: needsSpec ? updateData.os : undefined,
      };

      assets[assetIndex] = updatedAsset;
      await saveDataToFile(assets, ASSETS_FILE);
      
      res.json({ message: "Aset berhasil diperbarui!", asset: updatedAsset });
    } catch (error) {
      console.error("Error updating asset:", error);
      res.status(500).json({ message: "Gagal memperbarui aset." });
    }
  });
});

app.delete("/delete-asset/:id", authenticateToken, async (req, res) => {
  try {
    const assets = await loadDataFromFile(ASSETS_FILE, (a) => 
      a.id && a.nameCategory && a.description && a.serialNumber && a.quantity && a.price
    );
    const filteredAssets = assets.filter((a) => a.id !== parseInt(req.params.id));
    
    if (assets.length === filteredAssets.length) {
      return res.status(404).json({ message: "Aset tidak ditemukan!" });
    }
    
    await saveDataToFile(filteredAssets, ASSETS_FILE);
    res.json({ message: "Aset berhasil dihapus!" });
  } catch (error) {
    console.error("Error deleting asset:", error);
    res.status(500).json({ message: "Failed to delete asset" });
  }
});

// Export/Import Routes
app.get("/export-assets", authenticateToken, async (req, res) => {
  try {
    const assets = await loadDataFromFile(ASSETS_FILE, (a) => 
      a.id && a.nameCategory && a.description && a.serialNumber && a.quantity && a.price
    );
    const worksheet = XLSX.utils.json_to_sheet(assets);
    const workbook = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(workbook, worksheet, "Assets");
    
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    
    res.setHeader("Content-Disposition", "attachment; filename=assets.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ message: "Gagal ekspor data aset." });
  }
});

app.post("/import-assets", authenticateToken, uploadExcel.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "File tidak ditemukan." });

  try {
    const workbook = XLSX.readFile(req.file.path);
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    
    const validatedData = jsonData.filter(item => 
      item.id && item.nameCategory && item.description && item.serialNumber && item.quantity && item.price
    );
    
    await saveDataToFile(validatedData, ASSETS_FILE);
    
    await fs.unlink(req.file.path);
    
    res.json({ message: "Data berhasil diimpor!" });
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({ message: "Gagal impor data." });
  }
});

// Auth Routes
app.post("/login", async (req, res) => {
  const { error, value } = userSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  const { username, password } = value;
  const envUsername = process.env.ADMIN_USERNAME;
  const envPassword = process.env.ADMIN_PASSWORD;

  if (!envUsername || !envPassword || !JWT_SECRET) {
    console.error("Missing environment variables");
    return res.status(500).json({ message: "Server configuration error" });
  }

  if (username !== envUsername || password !== envPassword) {
    return res.status(401).json({ message: "Invalid username or password" });
  }

  try {
    const token = jwt.sign({ username }, JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRATION || "1h",
    });
    res.json({ token });
  } catch (error) {
    console.error("Error creating token:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});

app.get("/app", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "app.html"));
});

// Health check route
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({ message: "Endpoint tidak ditemukan" });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Ukuran file terlalu besar. Maksimal 5MB.' });
    }
  }
  
  res.status(500).json({ message: 'Terjadi kesalahan internal server' });
});

// Start server
const startServer = async () => {
  try {
    await ensureDirectories();
    await ensureDirectoryExists(CATEGORIES_FILE);
    await ensureDirectoryExists(ASSETS_FILE);
    
    await initializeData();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server berjalan di http://0.0.0.0:${PORT}`);
      console.log(`📱 Akses melalui: http://192.168.2.11:${PORT}`);
      console.log(`💻 Atau localhost: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();