require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const helmet = require("helmet");
const compression = require("compression");
const fs = require("fs").promises;
const path = require("path");
const multer = require("multer");
const XLSX = require("xlsx");

const app = express();

// Konfigurasi
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DATABASE_DIR = path.join(__dirname, "database");
const CATEGORIES_FILE = path.join(DATABASE_DIR, "categories.json");
const ASSETS_FILE = path.join(DATABASE_DIR, "assets.json");

// Middleware
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());
app.set("trust proxy", 1);

// Static files
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "frontend")));

// Konfigurasi Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });
const uploadExcel = multer({ dest: "uploads/" });

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
  photo: Joi.string().optional(),
});

// Utility Functions
const saveMapToFile = async (map, filePath) => {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify([...map.values()], null, 2));
    console.log(`Data berhasil disimpan di ${filePath}`);
  } catch (error) {
    console.error(`Gagal menyimpan data: ${error.message}`);
  }
};

const loadMapFromFile = async (filePath, validateFn) => {
  const map = new Map();
  try {
    const data = await fs.readFile(filePath, "utf-8");
    if (!data.trim()) return map;
    
    JSON.parse(data).forEach((item) => {
      if (validateFn(item)) map.set(item.id, item);
      else console.warn(`Data tidak valid: ${JSON.stringify(item)}`);
    });
    
    console.log(`Data berhasil dimuat dari ${filePath}`);
  } catch (error) {
    console.error(`Gagal memuat data: ${error.message}`);
  }
  return map;
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
let categories = new Map();
let assets = new Map();

// Middleware
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token tidak ditemukan atau format salah" });
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        const errorMessage = err.name === "TokenExpiredError" 
          ? "Token telah kedaluwarsa" 
          : "Token tidak valid";
        return res.status(403).json({ message: errorMessage });
      }
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
  categories = await loadMapFromFile(CATEGORIES_FILE, (c) => c.id && c.nameCategory);
  assets = await loadMapFromFile(ASSETS_FILE, (a) => 
    a.id && a.nameCategory && a.description && a.serialNumber && a.quantity && a.price
  );

  await saveMapToFile(categories, CATEGORIES_FILE);
  await saveMapToFile(assets, ASSETS_FILE);
};

// Routes
app.get("/cors-test", (req, res) => {
  res.json({ message: "CORS OK!" });
});

// Category Routes
app.get("/get-categories", authenticateToken, async (req, res) => {
  try {
    const categoriesData = await fs.readFile(CATEGORIES_FILE, "utf-8");
    res.json({ categories: JSON.parse(categoriesData || "[]") });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

app.post("/add-category", authenticateToken, async (req, res) => {
  const { error, value } = categorySchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const categories = JSON.parse(await fs.readFile(CATEGORIES_FILE, "utf-8") || "[]");
    const category = { id: Date.now(), ...value };
    
    categories.push(category);
    await fs.writeFile(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
    
    res.json({ message: "Kategori berhasil ditambahkan!", category });
  } catch (error) {
    console.error("Error saving category:", error);
    res.status(500).json({ message: "Failed to save category" });
  }
});

app.get("/get-category/:id", authenticateToken, async (req, res) => {
  try {
    const categories = JSON.parse(await fs.readFile(CATEGORIES_FILE, "utf-8") || "[]");
    const category = categories.find((c) => c.id === parseInt(req.params.id));
    
    if (!category) return res.status(404).json({ message: "Kategori tidak ditemukan!" });
    res.json({ category });
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({ message: "Failed to fetch category" });
  }
});

app.put("/update-category/:id", authenticateToken, async (req, res) => {
  const { error, value } = categorySchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const categories = JSON.parse(await fs.readFile(CATEGORIES_FILE, "utf-8") || "[]");
    const categoryIndex = categories.findIndex((c) => c.id === parseInt(req.params.id));
    
    if (categoryIndex === -1) return res.status(404).json({ message: "Kategori tidak ditemukan!" });
    
    categories[categoryIndex] = { ...categories[categoryIndex], ...value };
    await fs.writeFile(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
    
    res.json({ message: "Kategori berhasil diperbarui!", category: categories[categoryIndex] });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ message: "Failed to update category" });
  }
});

app.delete("/delete-category/:id", authenticateToken, async (req, res) => {
  try {
    const categories = JSON.parse(await fs.readFile(CATEGORIES_FILE, "utf-8") || "[]");
    const filteredCategories = categories.filter((c) => c.id !== parseInt(req.params.id));
    
    if (categories.length === filteredCategories.length) {
      return res.status(404).json({ message: "Kategori tidak ditemukan!" });
    }
    
    await fs.writeFile(CATEGORIES_FILE, JSON.stringify(filteredCategories, null, 2));
    res.json({ message: "Kategori berhasil dihapus!" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ message: "Failed to delete category" });
  }
});

// Asset Routes
app.get("/get-assets", authenticateToken, async (req, res) => {
  try {
    const assetsData = await fs.readFile(ASSETS_FILE, "utf-8");
    res.json({ assets: JSON.parse(assetsData || "[]") });
  } catch (error) {
    console.error("Error fetching assets:", error);
    res.status(500).json({ message: "Failed to fetch assets" });
  }
});

app.post("/add-asset", upload.single("photo"), authenticateToken, async (req, res) => {
  const { error, value } = assetSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  try {
    const assets = JSON.parse(await fs.readFile(ASSETS_FILE, "utf-8") || "[]");
    const { nameCategory, kodeAsset: submittedKodeAsset, ...assetData } = value;
    
    const type = nameCategory.toLowerCase();
    const needsSpec = ["laptop", "komputer"].includes(type);
    
    // Validasi field required
    const requiredFields = ['description', 'serialNumber', 'quantity', 'price', 
                           'purchaseDate', 'division', 'username', 'brand'];
    if (needsSpec) requiredFields.push('processor', 'ram', 'hdd', 'os');
    
    if (requiredFields.some(field => !assetData[field])) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const asset = {
      id: Date.now(),
      kodeAsset: submittedKodeAsset || generateAssetCode(assets, nameCategory),
      nameCategory,
      ...assetData,
      quantity: Number(assetData.quantity),
      price: Number(assetData.price),
      photo: req.file?.filename,
      processor: needsSpec ? assetData.processor : undefined,
      ram: needsSpec ? assetData.ram : undefined,
      hdd: needsSpec ? assetData.hdd : undefined,
      os: needsSpec ? assetData.os : undefined,
    };

    assets.push(asset);
    await fs.writeFile(ASSETS_FILE, JSON.stringify(assets, null, 2));
    
    res.json({ message: "Aset berhasil ditambahkan!", asset });
  } catch (error) {
    console.error("Error saving asset:", error);
    res.status(500).json({ message: "Gagal menyimpan aset." });
  }
});

app.get("/get-asset/:id", authenticateToken, async (req, res) => {
  try {
    const assets = JSON.parse(await fs.readFile(ASSETS_FILE, "utf-8") || "[]");
    const asset = assets.find((a) => a.id === parseInt(req.params.id));
    
    if (!asset) return res.status(404).json({ message: "Aset tidak ditemukan!" });
    res.json({ asset });
  } catch (error) {
    console.error("Error fetching asset:", error);
    res.status(500).json({ message: "Failed to fetch asset" });
  }
});

app.put("/update-asset/:id", authenticateToken, upload.single("photo"), async (req, res) => {
  try {
    const assets = JSON.parse(await fs.readFile(ASSETS_FILE, "utf-8") || "[]");
    const assetIndex = assets.findIndex((a) => a.id === parseInt(req.params.id));
    
    if (assetIndex === -1) return res.status(404).json({ message: "Aset tidak ditemukan!" });

    const oldAsset = assets[assetIndex];
    const { nameCategory, ...updateData } = req.body;
    const type = nameCategory.toLowerCase();
    const needsSpec = ["laptop", "komputer"].includes(type);

    // Validasi field required
    const requiredFields = ['description', 'serialNumber', 'quantity', 'price', 
                           'purchaseDate', 'division', 'username', 'brand'];
    if (needsSpec) requiredFields.push('processor', 'ram', 'hdd', 'os');
    
    if (requiredFields.some(field => !updateData[field])) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const updatedAsset = {
      ...oldAsset,
      nameCategory,
      ...updateData,
      quantity: Number(updateData.quantity),
      price: Number(updateData.price),
      photo: req.file?.filename || oldAsset.photo,
      processor: needsSpec ? updateData.processor : undefined,
      ram: needsSpec ? updateData.ram : undefined,
      hdd: needsSpec ? updateData.hdd : undefined,
      os: needsSpec ? updateData.os : undefined,
    };

    assets[assetIndex] = updatedAsset;
    await fs.writeFile(ASSETS_FILE, JSON.stringify(assets, null, 2));
    
    res.json({ message: "Aset berhasil diperbarui!", asset: updatedAsset });
  } catch (error) {
    console.error("Error updating asset:", error);
    res.status(500).json({ message: "Gagal memperbarui aset." });
  }
});

app.delete("/delete-asset/:id", authenticateToken, async (req, res) => {
  try {
    const assets = JSON.parse(await fs.readFile(ASSETS_FILE, "utf-8") || "[]");
    const filteredAssets = assets.filter((a) => a.id !== parseInt(req.params.id));
    
    if (assets.length === filteredAssets.length) {
      return res.status(404).json({ message: "Aset tidak ditemukan!" });
    }
    
    await fs.writeFile(ASSETS_FILE, JSON.stringify(filteredAssets, null, 2));
    res.json({ message: "Aset berhasil dihapus!" });
  } catch (error) {
    console.error("Error deleting asset:", error);
    res.status(500).json({ message: "Failed to delete asset" });
  }
});

// Export/Import Routes
app.get("/export-assets", authenticateToken, async (req, res) => {
  try {
    const jsonData = JSON.parse(await fs.readFile(ASSETS_FILE, "utf-8") || "[]");
    const worksheet = XLSX.utils.json_to_sheet(jsonData);
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
    
    await fs.writeFile(ASSETS_FILE, JSON.stringify(jsonData, null, 2));
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

// Start server
const startServer = async () => {
  await initializeData();
  app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
  });
};

startServer().catch(console.error);