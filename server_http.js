require("dotenv").config();
const express = require("express");
// const https = require("https");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const helmet = require("helmet");
const compression = require("compression");
const fs = require("fs").promises;
const path = require("path");
const app = express();
const multer = require("multer");
const XLSX = require("xlsx");
const uploadExcel = multer({ dest: "uploads/" });

// app.use(
//   cors({
//     origin: ["https://192.168.2.11:3000", "http://192.168.2.11:5500", "https://192.168.2.11" , "http://192.168.2.11"],
//     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//     maxAge: 600,
//   })
// );
// app.use(cors());
// async function startServer() {
// app.use(
//   cors({
//     origin: "https://192.168.2.11",
//     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//     credentials: true,
//   })
// );
// app.use(cors());
// app.options("*", cors());
app.use(express.json());
// app.use(helmet());
app.use(compression());
app.set("trust proxy", 1);
app.use("/uploads", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/cors-test", (req, res) => {
  res.json({ message: "CORS OK!" });
});

// Konfigurasi penyimpanan file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

// Inisialisasi middleware multer
const upload = multer({ storage });

let categories = new Map();
let assets = new Map();

// Simpan secret key JWT di .env
const JWT_SECRET = process.env.JWT_SECRET;

// Fungsi untuk menyimpan ke file JSON
const saveMapToFile = async (map, filePath) => {
  try {
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify([...map.values()], null, 2));
    console.log(`Data berhasil disimpan di ${filePath}`);
  } catch (error) {
    console.error(`Gagal menyimpan data ke file ${filePath}: ${error.message}`);
  }
};

// fungsi untuk meload data dari file JSON
const loadMapFromFile = async (filePath, validateFn) => {
  const map = new Map();
  try {
    await fs.access(filePath);
    const data = await fs.readFile(filePath, "utf-8");
    if (!data.trim()) return map;
    const parsed = JSON.parse(data);
    parsed.forEach((item) => {
      if (validateFn(item)) map.set(item.id, item);
      else console.warn(`Data tidak valid: ${JSON.stringify(item)}`);
    });
    console.log(`Data berhasil dimuat dari ${filePath}`);
  } catch (error) {
    console.error(`Gagal memuat data dari file ${filePath}: ${error.message}`);
  }
  return map;
};

// simpan file categori di database/categories.json
const categoriesFilePath = path.join(__dirname, "database", "categories.json");
// simpan file aset di database/assets.json
const assetsFilePath = path.join(__dirname, "database", "assets.json");

(async () => {
  categories = await loadMapFromFile(
    categoriesFilePath,
    (c) => c.id && c.nameCategory
  );
  assets = await loadMapFromFile(
    assetsFilePath,
    (a) =>
      a.id &&
      a.nameCategory &&
      a.description &&
      a.serialNumber &&
      a.quantity &&
      a.price
  );

  await saveMapToFile(categories, categoriesFilePath);
  await saveMapToFile(assets, assetsFilePath);
})();

// Middleware
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Token tidak ditemukan atau format salah" });
    }

    const token = authHeader.split(" ")[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        const errorMessage =
          err.name === "TokenExpiredError"
            ? "Token telah kedaluwarsa"
            : "Token tidak valid";
        return res.status(403).json({ message: errorMessage });
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.error("Error di middleware authenticateToken:", error.message);
    return res.status(500).json({ message: "Terjadi kesalahan pada server" });
  }
};

// Schemas untuk user login dan register
const userSchema = Joi.object({
  username: Joi.string().min(3).required(),
  password: Joi.string().min(6).required(),
});

// Schema validasi untuk Kategori
const categorySchema = Joi.object({
  nameCategory: Joi.string().required(),
});

// Schema validasi menggunakan data Asset
const assetSchema = Joi.object({
  nameCategory: Joi.string().required(),
  kodeAsset: Joi.string().required(),
  description: Joi.string().required(),
  serialNumber: Joi.string().required(),
  quantity: Joi.number().min(1).required(),
  price: Joi.number().min(0).required(),
  purchaseDate: Joi.string().required(), // format: yyyy-mm-dd (dari input[type=date])
  division: Joi.string().required(),
  username: Joi.string().required(),
  brand: Joi.string().required(),

  // Field opsional — hanya untuk non-printer
  processor: Joi.string().allow("", null),
  ram: Joi.string().allow("", null),
  hdd: Joi.string().allow("", null),
  os: Joi.string().allow("", null),

  photo: Joi.string().optional(),
});

// Fungsi untuk membuat kode aset berdasarkan kategori
function generateAssetCode(assets, nameCategory) {
  const prefix = nameCategory.substring(0, 3).toUpperCase();
  const filtered = assets.filter((a) => a.kodeAsset?.startsWith(prefix));

  const lastNumber = filtered.reduce((max, asset) => {
    const match = asset.kodeAsset?.match(/\d+$/);
    const num = match ? parseInt(match[0], 10) : 0;
    return Math.max(max, num);
  }, 0);

  const nextNumber = (lastNumber + 1).toString().padStart(4, "0");
  return `${prefix}-${nextNumber}`;
}

// Endpoint untuk mendapatkan daftar kategori
app.get("/get-categories", authenticateToken, async (req, res) => {
  try {
    // Load categories from file or database
    const categoriesFilePath = path.join(
      __dirname,
      "database",
      "categories.json"
    );
    const categoriesData = await fs.readFile(categoriesFilePath, "utf-8");
    const categories = JSON.parse(categoriesData || "[]");

    res.json({ categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});
// Endpoint untuk menambahkan kategori
app.post("/add-category", authenticateToken, async (req, res) => {
  const { error, value } = categorySchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { nameCategory } = value;
  const id = Date.now(); // ID unik menggunakan timestamp
  const category = { id, nameCategory };

  // Simpan kategori ke file JSON
  const categoriesFilePath = path.join(
    __dirname,
    "database",
    "categories.json"
  );
  try {
    await fs.access(categoriesFilePath);
    const data = await fs.readFile(categoriesFilePath, "utf-8");
    const categories = JSON.parse(data || "[]");
    categories.push(category);
    await fs.writeFile(categoriesFilePath, JSON.stringify(categories, null, 2));
    res.json({ message: "Kategori berhasil ditambahkan!", category });
  } catch (error) {
    console.error("Error saving category:", error);
    res.status(500).json({ message: "Failed to save category" });
  }
});

// endpoint untuk mendapatkan daftar kategori berdasarkan ID
app.get("/get-category/:id", authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id, 10); // Pastikan ID berupa integer

  try {
    // Load categories from file or database
    const categoriesFilePath = path.join(
      __dirname,
      "database",
      "categories.json"
    );
    const categoriesData = await fs.readFile(categoriesFilePath, "utf-8");
    const categories = JSON.parse(categoriesData || "[]");

    // Find category by ID
    const category = categories.find((c) => c.id === id);
    if (!category) {
      return res.status(404).json({ message: "Kategori tidak ditemukan!" });
    }

    res.json({ category });
  } catch (error) {
    console.error("Error fetching category by ID:", error);
    res.status(500).json({ message: "Failed to fetch category by ID" });
  }
});
// Endpoint untuk memperbarui kategori berdasarkan ID
app.put("/update-category/:id", authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id, 10); // Pastikan ID berupa integer
  const { error, value } = categorySchema.validate(req.body);

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { nameCategory } = value;

  // Load categories from file or database
  const categoriesFilePath = path.join(
    __dirname,
    "database",
    "categories.json"
  );
  try {
    await fs.access(categoriesFilePath);
    const data = await fs.readFile(categoriesFilePath, "utf-8");
    const categories = JSON.parse(data || "[]");

    // Find category by ID
    const categoryIndex = categories.findIndex((c) => c.id === id);
    if (categoryIndex === -1) {
      return res.status(404).json({ message: "Kategori tidak ditemukan!" });
    }

    // Update category
    categories[categoryIndex].nameCategory = nameCategory;

    // Save updated categories to file
    await fs.writeFile(categoriesFilePath, JSON.stringify(categories, null, 2));
    res.json({
      message: "Kategori berhasil diperbarui!",
      category: categories[categoryIndex],
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ message: "Failed to update category" });
  }
});
// Endpoint untuk menghapus kategori berdasarkan ID
app.delete("/delete-category/:id", authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id, 10); // Pastikan ID berupa integer

  // Load categories from file or database
  const categoriesFilePath = path.join(
    __dirname,
    "database",
    "categories.json"
  );
  try {
    await fs.access(categoriesFilePath);
    const data = await fs.readFile(categoriesFilePath, "utf-8");
    const categories = JSON.parse(data || "[]");

    // Find category by ID
    const categoryIndex = categories.findIndex((c) => c.id === id);
    if (categoryIndex === -1) {
      return res.status(404).json({ message: "Kategori tidak ditemukan!" });
    }

    // Remove category
    categories.splice(categoryIndex, 1);

    // Save updated categories to file
    await fs.writeFile(categoriesFilePath, JSON.stringify(categories, null, 2));
    res.json({ message: "Kategori berhasil dihapus!" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ message: "Failed to delete category" });
  }
});

// endpoint untuk mendapatkan daftar aset
app.get("/get-assets", authenticateToken, async (req, res) => {
  try {
    // Load assets from file or database
    const assetsFilePath = path.join(__dirname, "database", "assets.json");
    const assetsData = await fs.readFile(assetsFilePath, "utf-8");
    const assets = JSON.parse(assetsData || "[]");

    res.json({ assets });
  } catch (error) {
    console.error("Error fetching assets:", error);
    res.status(500).json({ message: "Failed to fetch assets" });
  }
});
// Endpoint untuk menambahkan aset

app.post(
  "/add-asset",
  upload.single("photo"),
  authenticateToken,
  async (req, res) => {
    const { error, value } = assetSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const {
      nameCategory,
      kodeAsset: submittedKodeAsset, // renamed to avoid conflict
      description,
      serialNumber,
      quantity,
      price,
      purchaseDate,
      division,
      username,
      brand,
      processor,
      ram,
      hdd,
      os,
    } = req.body;

    const type = nameCategory.toLowerCase();
    const needsSpec = ["laptop", "komputer"].includes(type);

    const requiredFields = [
      nameCategory,
      description,
      serialNumber,
      quantity,
      price,
      purchaseDate,
      division,
      username,
      brand,
    ];

    if (needsSpec) {
      requiredFields.push(processor, ram, hdd, os);
    }

    if (requiredFields.some((field) => !field)) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const assetsFilePath = path.join(__dirname, "database", "assets.json");
    const id = Date.now();
    const photo = req.file?.filename;

    try {
      await fs.access(assetsFilePath);
      const data = await fs.readFile(assetsFilePath, "utf-8");
      const assets = JSON.parse(data || "[]");

      // ✅ Gunakan kode dari frontend jika ada, atau generate otomatis
      const finalKodeAsset =
        submittedKodeAsset || generateAssetCode(assets, nameCategory);

      const asset = {
        id,
        kodeAsset: finalKodeAsset,
        nameCategory,
        description,
        serialNumber,
        quantity: Number(quantity),
        price: Number(price),
        purchaseDate,
        division,
        username,
        brand,
        photo,
        processor: needsSpec ? processor : undefined,
        ram: needsSpec ? ram : undefined,
        hdd: needsSpec ? hdd : undefined,
        os: needsSpec ? os : undefined,
      };

      assets.push(asset);
      await fs.writeFile(assetsFilePath, JSON.stringify(assets, null, 2));
      res.json({ message: "Aset berhasil ditambahkan!", asset });
    } catch (error) {
      console.error("Error saving asset:", error);
      res.status(500).json({ message: "Gagal menyimpan aset." });
    }
  }
);

// Endpoint untuk mendapatkan daftar aset berdasarkan kategori
// app.get(
//   "/get-assets-by-category/:category",
//   authenticateToken,
//   async (req, res) => {
//     const category = req.params.category;

//     try {
//       // Load assets from file or database
//       const assetsFilePath = path.join(__dirname, "database", "assets.json");
//       const assetsData = await fs.readFile(assetsFilePath, "utf-8");
//       const assets = JSON.parse(assetsData || "[]");

//       // Filter assets by category
//       const filteredAssets = assets.filter(
//         (asset) => asset.nameCategory === category
//       );

//       res.json({ assets: filteredAssets });
//     } catch (error) {
//       console.error("Error fetching assets by category:", error);
//       res.status(500).json({ message: "Failed to fetch assets by category" });
//     }
//   }
// );
// Endpoint untuk mendapatkan daftar aset berdasarkan ID
app.get("/get-asset/:id", authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id, 10); // Pastikan ID berupa integer

  try {
    // Load assets from file or database
    const assetsFilePath = path.join(__dirname, "database", "assets.json");
    const assetsData = await fs.readFile(assetsFilePath, "utf-8");
    const assets = JSON.parse(assetsData || "[]");

    // Find asset by ID
    const asset = assets.find((a) => a.id === id);
    if (!asset) {
      return res.status(404).json({ message: "Aset tidak ditemukan!" });
    }

    res.json({ asset });
  } catch (error) {
    console.error("Error fetching asset by ID:", error);
    res.status(500).json({ message: "Failed to fetch asset by ID" });
  }
});
// endpoint untuk memperbarui aset berdasarkan ID
app.put(
  "/update-asset/:id",
  authenticateToken,
  upload.single("photo"),
  async (req, res) => {
    const id = parseInt(req.params.id, 10);

    const {
      nameCategory,
      kodeAsset,
      description,
      serialNumber,
      quantity,
      price,
      purchaseDate,
      division,
      username,
      brand,
      processor,
      ram,
      hdd,
      os,
    } = req.body;

    const type = nameCategory.toLowerCase();
    const needsSpec = ["laptop", "komputer"].includes(type);

    const requiredFields = [
      nameCategory,
      description,
      serialNumber,
      quantity,
      price,
      purchaseDate,
      division,
      username,
      brand,
    ];

    if (needsSpec) {
      requiredFields.push(processor, ram, hdd, os);
    }

    if (requiredFields.some((field) => !field)) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const assetsFilePath = path.join(__dirname, "database", "assets.json");

    try {
      await fs.access(assetsFilePath);
      const data = await fs.readFile(assetsFilePath, "utf-8");
      const assets = JSON.parse(data || "[]");

      const assetIndex = assets.findIndex((a) => a.id === id);
      if (assetIndex === -1) {
        return res.status(404).json({ message: "Aset tidak ditemukan!" });
      }

      const oldAsset = assets[assetIndex];

      const updatedAsset = {
        id,
        // Gunakan kode dari form jika dikirim, atau pertahankan yang lama
        kodeAsset: kodeAsset || oldAsset.kodeAsset,
        nameCategory,
        description,
        serialNumber,
        quantity: Number(quantity),
        price: Number(price),
        purchaseDate,
        division,
        username,
        brand,
        photo: req.file ? req.file.filename : oldAsset.photo,
        processor: needsSpec ? processor : undefined,
        ram: needsSpec ? ram : undefined,
        hdd: needsSpec ? hdd : undefined,
        os: needsSpec ? os : undefined,
      };

      assets[assetIndex] = updatedAsset;

      await fs.writeFile(assetsFilePath, JSON.stringify(assets, null, 2));
      res.json({ message: "Aset berhasil diperbarui!", asset: updatedAsset });
    } catch (error) {
      console.error("Error updating asset:", error);
      res.status(500).json({ message: "Gagal memperbarui aset." });
    }
  }
);

// Endpoint untuk menghapus aset berdasarkan ID
app.delete("/delete-asset/:id", authenticateToken, async (req, res) => {
  const id = parseInt(req.params.id, 10); // Pastikan ID berupa integer

  // Load assets from file or database
  const assetsFilePath = path.join(__dirname, "database", "assets.json");
  try {
    await fs.access(assetsFilePath);
    const data = await fs.readFile(assetsFilePath, "utf-8");
    const assets = JSON.parse(data || "[]");

    // Find asset by ID
    const assetIndex = assets.findIndex((a) => a.id === id);
    if (assetIndex === -1) {
      return res.status(404).json({ message: "Aset tidak ditemukan!" });
    }

    // Remove asset
    assets.splice(assetIndex, 1);

    // Save updated assets to file
    await fs.writeFile(assetsFilePath, JSON.stringify(assets, null, 2));
    res.json({ message: "Aset berhasil dihapus!" });
  } catch (error) {
    console.error("Error deleting asset:", error);
    res.status(500).json({ message: "Failed to delete asset" });
  }
});

app.get("/export-assets", authenticateToken, async (req, res) => {
  const filePath = path.join(__dirname, "database", "assets.json");
  try {
    const jsonData = JSON.parse((await fs.readFile(filePath, "utf-8")) || "[]");

    const worksheet = XLSX.utils.json_to_sheet(jsonData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Assets");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", "attachment; filename=assets.xlsx");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ message: "Gagal ekspor data aset." });
  }
});

app.post(
  "/import-assets",
  authenticateToken,
  uploadExcel.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: "File tidak ditemukan." });
    }

    try {
      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      const filePath = path.join(__dirname, "database", "assets.json");
      await fs.writeFile(filePath, JSON.stringify(jsonData, null, 2));
      res.json({ message: "Data berhasil diimpor!" });
    } catch (err) {
      console.error("Import error:", err);
      res.status(500).json({ message: "Gagal impor data." });
    }
  }
);

/**
 * Endpoint for user login
 */
app.post("/login", async (req, res) => {
  // Validate input using Joi schema
  const { error, value } = userSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const { username, password } = value;

  // Retrieve environment variables
  const envUsername = process.env.ADMIN_USERNAME;
  const envPassword = process.env.ADMIN_PASSWORD;
  const jwtSecret = process.env.JWT_SECRET;

  if (!envUsername || !envPassword || !jwtSecret) {
    console.error("Missing required environment variables.");
    return res.status(500).json({
      message:
        "Server configuration error. Please check environment variables.",
    });
  }

  // Validate credentials
  if (username !== envUsername || password !== envPassword) {
    return res.status(401).json({ message: "Invalid username or password." });
  }

  // Create JWT token
  try {
    const token = jwt.sign({ username }, jwtSecret, {
      expiresIn: process.env.JWT_EXPIRATION || "1h", // Default to 1 hour if not set
    });
    return res.json({ token });
  } catch (err) {
    console.error("Error creating JWT token:", err);
    return res.status(500).json({ message: "Internal server error." });
  }
});

// Handle 404 untuk endpoint yang tidak ditemukan
// app.use((req, res) => {
//   res.status(404).json({ message: "Endpoint tidak ditemukan" });
// });

// Serve static frontend files from public/
app.use(express.static(path.join(__dirname, "frontend")));

// Root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "index.html"));
});


// const key = await fs.readFile("key.pem");
// const cert = await fs.readFile("cert.pem");
// const PORT = process.env.PORT;
// https.createServer({ key, cert }, app).listen(PORT, () => {
//   console.log(`🚀 Serverrunning on https://localhost:${PORT}`);
// });

app.listen(3000, () => {
  console.log("Server berjalan di port 3000");
});
// }
// startServer();

// Menginisialisasi klien WhatsApp
// whatsappClient.initialize();
