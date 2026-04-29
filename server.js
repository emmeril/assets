require("dotenv").config();

const express = require("express");
const http = require("http");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const compression = require("compression");
const fs = require("fs").promises;
const path = require("path");
const multer = require("multer");
const XLSX = require("xlsx");
const { Sequelize, DataTypes } = require("sequelize");
const mysql = require("mysql2/promise");

const app = express();
const DATABASE_DIR = path.join(__dirname, "database");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const CATEGORIES_JSON = path.join(DATABASE_DIR, "categories.json");
const ASSETS_JSON = path.join(DATABASE_DIR, "assets.json");

const uploadExcel = multer({ dest: UPLOAD_DIR });
const JWT_SECRET = process.env.JWT_SECRET;

function createSequelize() {
  const dialect = process.env.DB_DIALECT || "sqlite";

  if (dialect === "sqlite") {
    return new Sequelize({
      dialect,
      storage: process.env.DB_STORAGE || path.join(DATABASE_DIR, "assets.sqlite"),
      logging: false,
    });
  }

  return new Sequelize(
    process.env.DB_NAME || "asset_management",
    process.env.DB_USER || "root",
    process.env.DB_PASSWORD || "",
    {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      dialect,
      logging: false,
    }
  );
}

const sequelize = createSequelize();

async function ensureDatabaseExists() {
  const dialect = process.env.DB_DIALECT || "sqlite";
  if (dialect !== "mysql") return;

  const database = process.env.DB_NAME || "asset_management";
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  try {
    const safeDatabaseName = database.replace(/`/g, "``");
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${safeDatabaseName}\``);
  } finally {
    await connection.end();
  }
}

const Category = sequelize.define(
  "Category",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      allowNull: false,
    },
    nameCategory: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: "categories",
    timestamps: false,
  }
);

const Asset = sequelize.define(
  "Asset",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      allowNull: false,
    },
    kodeAsset: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nameCategory: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    serialNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    price: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
    purchaseDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    division: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    brand: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    photo: DataTypes.STRING,
    processor: DataTypes.STRING,
    ram: DataTypes.STRING,
    hdd: DataTypes.STRING,
    os: DataTypes.STRING,
  },
  {
    tableName: "assets",
    timestamps: false,
  }
);

function toPlain(record) {
  if (!record) return null;
  const data = record.get ? record.get({ plain: true }) : record;
  if (data.id !== undefined) data.id = Number(data.id);
  if (data.quantity !== undefined) data.quantity = Number(data.quantity);
  if (data.price !== undefined) data.price = Number(data.price);
  return data;
}

async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Gagal membaca ${filePath}: ${error.message}`);
    }
    return [];
  }
}

async function seedDatabaseFromJson() {
  const categoryCount = await Category.count();
  if (categoryCount === 0) {
    const categories = (await readJsonArray(CATEGORIES_JSON))
      .filter((item) => item.id && item.nameCategory)
      .map((item) => ({
        id: item.id,
        nameCategory: item.nameCategory,
      }));

    if (categories.length) {
      await Category.bulkCreate(categories, { ignoreDuplicates: true });
      console.log(`Migrasi ${categories.length} kategori dari JSON berhasil.`);
    }
  }

  const assetCount = await Asset.count();
  if (assetCount === 0) {
    const assets = (await readJsonArray(ASSETS_JSON))
      .filter(
        (item) =>
          item.id &&
          item.kodeAsset &&
          item.nameCategory &&
          item.description &&
          item.serialNumber
      )
      .map(normalizeAssetForDb);

    if (assets.length) {
      await Asset.bulkCreate(assets, { ignoreDuplicates: true });
      console.log(`Migrasi ${assets.length} aset dari JSON berhasil.`);
    }
  }
}

async function initializeDatabase() {
  await fs.mkdir(DATABASE_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await ensureDatabaseExists();
  await sequelize.authenticate();
  await sequelize.sync();
  await seedDatabaseFromJson();
}

function normalizeAssetForDb(item, fallbackId = Date.now()) {
  return {
    id: item.id || fallbackId,
    kodeAsset: item.kodeAsset,
    nameCategory: item.nameCategory,
    description: item.description,
    serialNumber: item.serialNumber,
    quantity: Number(item.quantity || 1),
    price: Number(item.price || 0),
    purchaseDate: item.purchaseDate,
    division: item.division,
    username: item.username,
    brand: item.brand,
    photo: item.photo || null,
    processor: item.processor || null,
    ram: item.ram || null,
    hdd: item.hdd || null,
    os: item.os || null,
  };
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
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

const userSchema = Joi.object({
  username: Joi.string().min(3).required(),
  password: Joi.string().min(6).required(),
});

const categorySchema = Joi.object({
  nameCategory: Joi.string().required(),
});

const assetSchema = Joi.object({
  nameCategory: Joi.string().required(),
  kodeAsset: Joi.string().allow("", null),
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

function generateAssetCode(assets, nameCategory) {
  const prefix = nameCategory.substring(0, 3).toUpperCase();
  const filtered = assets.filter((asset) => asset.kodeAsset?.startsWith(prefix));
  const lastNumber = filtered.reduce((max, asset) => {
    const match = asset.kodeAsset?.match(/\d+$/);
    const num = match ? parseInt(match[0], 10) : 0;
    return Math.max(max, num);
  }, 0);

  const nextNumber = (lastNumber + 1).toString().padStart(4, "0");
  return `${prefix}-${nextNumber}`;
}

function buildAssetPayload(body, currentAsset = {}, file) {
  const type = body.nameCategory.toLowerCase();
  const needsSpec = ["laptop", "komputer"].includes(type);
  const requiredFields = [
    body.nameCategory,
    body.description,
    body.serialNumber,
    body.quantity,
    body.price,
    body.purchaseDate,
    body.division,
    body.username,
    body.brand,
  ];

  if (needsSpec) {
    requiredFields.push(body.processor, body.ram, body.hdd, body.os);
  }

  if (requiredFields.some((field) => field === undefined || field === null || field === "")) {
    return { error: "Semua field wajib diisi." };
  }

  return {
    data: {
      kodeAsset: body.kodeAsset || currentAsset.kodeAsset,
      nameCategory: body.nameCategory,
      description: body.description,
      serialNumber: body.serialNumber,
      quantity: Number(body.quantity),
      price: Number(body.price),
      purchaseDate: body.purchaseDate,
      division: body.division,
      username: body.username,
      brand: body.brand,
      photo: file ? file.filename : currentAsset.photo || null,
      processor: needsSpec ? body.processor : null,
      ram: needsSpec ? body.ram : null,
      hdd: needsSpec ? body.hdd : null,
      os: needsSpec ? body.os : null,
    },
  };
}

async function startServer() {
  app.use(express.json());
  app.use(compression());
  app.set("trust proxy", 1);
  app.use("/uploads", (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  });
  app.use("/uploads", express.static(UPLOAD_DIR));

  app.get("/cors-test", (req, res) => {
    res.json({ message: "CORS OK!" });
  });

  app.get("/get-categories", authenticateToken, async (req, res) => {
    try {
      const categories = (await Category.findAll({ order: [["id", "ASC"]] })).map(toPlain);
      res.json({ categories });
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/add-category", authenticateToken, async (req, res) => {
    const { error, value } = categorySchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    try {
      const category = await Category.create({
        id: Date.now(),
        nameCategory: value.nameCategory,
      });
      res.json({ message: "Kategori berhasil ditambahkan!", category: toPlain(category) });
    } catch (error) {
      console.error("Error saving category:", error);
      res.status(500).json({ message: "Failed to save category" });
    }
  });

  app.get("/get-category/:id", authenticateToken, async (req, res) => {
    try {
      const category = await Category.findByPk(req.params.id);
      if (!category) return res.status(404).json({ message: "Kategori tidak ditemukan!" });
      res.json({ category: toPlain(category) });
    } catch (error) {
      console.error("Error fetching category by ID:", error);
      res.status(500).json({ message: "Failed to fetch category by ID" });
    }
  });

  app.put("/update-category/:id", authenticateToken, async (req, res) => {
    const { error, value } = categorySchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    try {
      const category = await Category.findByPk(req.params.id);
      if (!category) return res.status(404).json({ message: "Kategori tidak ditemukan!" });

      await category.update({ nameCategory: value.nameCategory });
      res.json({
        message: "Kategori berhasil diperbarui!",
        category: toPlain(category),
      });
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  app.delete("/delete-category/:id", authenticateToken, async (req, res) => {
    try {
      const deleted = await Category.destroy({ where: { id: req.params.id } });
      if (!deleted) return res.status(404).json({ message: "Kategori tidak ditemukan!" });
      res.json({ message: "Kategori berhasil dihapus!" });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  app.get("/get-assets", authenticateToken, async (req, res) => {
    try {
      const assets = (await Asset.findAll({ order: [["id", "ASC"]] })).map(toPlain);
      res.json({ assets });
    } catch (error) {
      console.error("Error fetching assets:", error);
      res.status(500).json({ message: "Failed to fetch assets" });
    }
  });

  app.post("/add-asset", upload.single("photo"), authenticateToken, async (req, res) => {
    const { error } = assetSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    try {
      const existingAssets = (await Asset.findAll()).map(toPlain);
      const payload = buildAssetPayload(
        {
          ...req.body,
          kodeAsset: req.body.kodeAsset || generateAssetCode(existingAssets, req.body.nameCategory),
        },
        {},
        req.file
      );

      if (payload.error) return res.status(400).json({ message: payload.error });

      const asset = await Asset.create({
        id: Date.now(),
        ...payload.data,
      });

      res.json({ message: "Aset berhasil ditambahkan!", asset: toPlain(asset) });
    } catch (error) {
      console.error("Error saving asset:", error);
      res.status(500).json({ message: "Gagal menyimpan aset." });
    }
  });

  app.get("/get-asset/:id", authenticateToken, async (req, res) => {
    try {
      const asset = await Asset.findByPk(req.params.id);
      if (!asset) return res.status(404).json({ message: "Aset tidak ditemukan!" });
      res.json({ asset: toPlain(asset) });
    } catch (error) {
      console.error("Error fetching asset by ID:", error);
      res.status(500).json({ message: "Failed to fetch asset by ID" });
    }
  });

  app.put("/update-asset/:id", authenticateToken, upload.single("photo"), async (req, res) => {
    try {
      const asset = await Asset.findByPk(req.params.id);
      if (!asset) return res.status(404).json({ message: "Aset tidak ditemukan!" });

      if (!req.body.nameCategory) {
        return res.status(400).json({ message: "Semua field wajib diisi." });
      }

      const currentAsset = toPlain(asset);
      const payload = buildAssetPayload(req.body, currentAsset, req.file);
      if (payload.error) return res.status(400).json({ message: payload.error });

      await asset.update(payload.data);
      res.json({ message: "Aset berhasil diperbarui!", asset: toPlain(asset) });
    } catch (error) {
      console.error("Error updating asset:", error);
      res.status(500).json({ message: "Gagal memperbarui aset." });
    }
  });

  app.delete("/delete-asset/:id", authenticateToken, async (req, res) => {
    try {
      const deleted = await Asset.destroy({ where: { id: req.params.id } });
      if (!deleted) return res.status(404).json({ message: "Aset tidak ditemukan!" });
      res.json({ message: "Aset berhasil dihapus!" });
    } catch (error) {
      console.error("Error deleting asset:", error);
      res.status(500).json({ message: "Failed to delete asset" });
    }
  });

  app.get("/export-assets", authenticateToken, async (req, res) => {
    try {
      const assets = (await Asset.findAll({ order: [["id", "ASC"]] })).map(toPlain);
      const worksheet = XLSX.utils.json_to_sheet(assets);
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

  app.post("/import-assets", authenticateToken, uploadExcel.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "File tidak ditemukan." });

    try {
      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      const assets = rows
        .filter(
          (item) =>
            item.kodeAsset &&
            item.nameCategory &&
            item.description &&
            item.serialNumber &&
            item.purchaseDate &&
            item.division &&
            item.username &&
            item.brand
        )
        .map((item, index) => normalizeAssetForDb(item, Date.now() + index));

      await sequelize.transaction(async (transaction) => {
        await Asset.destroy({ where: {}, truncate: true, transaction });
        if (assets.length) await Asset.bulkCreate(assets, { transaction });
      });

      await fs.unlink(req.file.path).catch(() => {});
      res.json({ message: "Data berhasil diimpor!" });
    } catch (err) {
      console.error("Import error:", err);
      res.status(500).json({ message: "Gagal impor data." });
    }
  });

  app.post("/login", async (req, res) => {
    const { error, value } = userSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { username, password } = value;
    const envUsername = process.env.ADMIN_USERNAME;
    const envPassword = process.env.ADMIN_PASSWORD;
    const jwtSecret = process.env.JWT_SECRET;

    if (!envUsername || !envPassword || !jwtSecret) {
      console.error("Missing required environment variables.");
      return res.status(500).json({
        message: "Server configuration error. Please check environment variables.",
      });
    }

    if (username !== envUsername || password !== envPassword) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    try {
      const token = jwt.sign({ username }, jwtSecret, {
        expiresIn: process.env.JWT_EXPIRATION || "1h",
      });
      return res.json({ token });
    } catch (err) {
      console.error("Error creating JWT token:", err);
      return res.status(500).json({ message: "Internal server error." });
    }
  });

  app.use(express.static(path.join(__dirname, "frontend")));

  app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "index.html"));
  });

  await initializeDatabase();

  const PORT = process.env.PORT || 3100;
  http.createServer(app).listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Gagal menjalankan server:", error);
  process.exit(1);
});
