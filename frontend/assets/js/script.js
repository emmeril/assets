const API_BASE_URL = "http://localhost:3000";
const LOGIN_PAGE_URL = "index.html";
const PROTECTED_PAGES = ["app.html"];

function auth() {
  return {
    form: { username: "", password: "" },

    async submit() {
      if (!this.form.username || this.form.username.trim().length < 3) {
        this.showToast(
          "Username harus diisi dan minimal 3 karakter.",
          "danger"
        );
        return;
      }
      if (!this.form.password || this.form.password.trim().length < 6) {
        this.showToast(
          "Password harus diisi dan minimal 6 karakter.",
          "danger"
        );
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.form),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Gagal login.");

        localStorage.setItem("token", data.token);
        localStorage.setItem("username", this.form.username);
        window.location.href = "app.html";
      } catch (error) {
        this.showToast(
          error.message || "Terjadi kesalahan, coba lagi.",
          "danger"
        );
      }
    },

    showToast(message, type = "success") {
      const toast = document.getElementById("toast");
      if (toast) {
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 3000);
      }
    },
  };
}

function isValidToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    return !payload.exp || payload.exp >= currentTime;
  } catch {
    return false;
  }
}

function checkAuthentication() {
  const token = localStorage.getItem("token");
  if (!token || !isValidToken(token)) {
    alert("Sesi Anda telah kedaluwarsa atau belum login.");
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    window.location.href = LOGIN_PAGE_URL;
  }
}

function isProtectedPage(pathname) {
  return PROTECTED_PAGES.some((page) => pathname.endsWith(page));
}

if (isProtectedPage(window.location.pathname)) {
  checkAuthentication();
}

// === Fetch API ===
async function fetchCategories() {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/get-categories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data.categories;
}

async function fetchAssets() {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/get-assets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data.assets;
}

async function addAsset(asset) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/add-asset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(asset),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data.asset;
}

async function updateAsset(id, asset) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/update-asset/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(asset),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data.asset;
}

async function deleteAsset(id) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/delete-asset/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data.message;
}

// === Category API ===
async function addCategory(nameCategory) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/add-category`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ nameCategory }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data.category;
}

async function updateCategory(id, nameCategory) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/update-category/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ nameCategory }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data.category;
}

async function deleteCategory(id) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/delete-category/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message);
  return data.message;
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
  }
}

function reminderApp() {
  return {
    username: localStorage.getItem("username"),
    allCategories: [],
    assets: [],
    photoFile: null,
    assetForm: {
      id: null,
      nameCategory: "",
      purchaseDate: "",
      division: "",
      username: "",
      brand: "",
      description: "",
      serialNumber: "",
      quantity: 1,
      price: 0,
      processor: "",
      ram: "",
      hdd: "",
      os: "",
    },

    categoryForm: {
      id: null,
      nameCategory: "",
    },

    searchQuery: "",
    filters: {
      nameCategory: "",
      kodeAsset: "",
      brand: "",
      serialNumber: "",
      purchaseDate: "",
      division: "",
      username: "",
    },

    perPageOptions: [10, 25, 50, 100],
    perPage: 10,
    currentPage: 1,

    async init() {
      try {
        await this.fetchCategories();
        await this.fetchAssets();
      } catch (error) {
        showToast("Gagal memuat data awal", "danger");
      }
    },

    async fetchCategories() {
      this.allCategories = (await fetchCategories()) || [];
    },

    async fetchAssets() {
      this.assets = (await fetchAssets()) || [];
    },

    // async submitAssetForm() {
    //   try {
    //     if (!this.assetForm.nameCategory || !this.assetForm.description || !this.assetForm.serialNumber) {
    //       showToast("Semua kolom harus diisi!", "danger");
    //       return;
    //     }

    //     if (this.assetForm.id) {
    //       await updateAsset(this.assetForm.id, this.assetForm);
    //       showToast("Aset diperbarui", "success");
    //     } else {
    //       await addAsset(this.assetForm);
    //       showToast("Aset ditambahkan", "success");
    //     }

    //     await this.fetchAssets();
    //     this.resetAssetForm();
    //   } catch (error) {
    //     showToast(error.message, "danger");
    //   }
    // },

    // async submitAssetForm() {
    //   try {
    //     const isEdit = !!this.assetForm.id;

    //     const payload = {
    //       nameCategory: this.assetForm.nameCategory,
    //       description: this.assetForm.description,
    //       serialNumber: this.assetForm.serialNumber,
    //       quantity: this.assetForm.quantity,
    //       price: this.assetForm.price,
    //     };

    //     if (
    //       !payload.nameCategory ||
    //       !payload.description ||
    //       !payload.serialNumber
    //     ) {
    //       showToast("Semua kolom harus diisi!", "danger");
    //       return;
    //     }

    //     if (isEdit) {
    //       await updateAsset(this.assetForm.id, payload);
    //       showToast("Aset berhasil diperbarui", "success");
    //     } else {
    //       await addAsset(payload); // TANPA ID
    //       showToast("Aset berhasil ditambahkan", "success");
    //     }

    //     await this.fetchAssets();
    //     this.resetAssetForm();
    //   } catch (error) {
    //     showToast(error.message, "danger");
    //   }
    // },
    async submitAssetForm() {
      try {
        const isEdit = !!this.assetForm.id;
        const formData = new FormData();

        formData.append("nameCategory", this.assetForm.nameCategory);
        formData.append("description", this.assetForm.description);
        formData.append("serialNumber", this.assetForm.serialNumber);
        formData.append("quantity", this.assetForm.quantity);
        formData.append("price", this.assetForm.price);
        formData.append("purchaseDate", this.assetForm.purchaseDate);
        formData.append("division", this.assetForm.division);
        formData.append("username", this.assetForm.username);
        formData.append("brand", this.assetForm.brand);

        const type = this.assetForm.nameCategory?.toLowerCase();
        const needsSpec = ["laptop", "komputer"].includes(type);

        if (needsSpec) {
          formData.append("processor", this.assetForm.processor);
          formData.append("ram", this.assetForm.ram);
          formData.append("hdd", this.assetForm.hdd);
          formData.append("os", this.assetForm.os);
        }

        if (this.photoFile) formData.append("photo", this.photoFile);

        const token = localStorage.getItem("token");
        const url = isEdit
          ? `${API_BASE_URL}/update-asset/${this.assetForm.id}`
          : `${API_BASE_URL}/add-asset`;

        const response = await fetch(url, {
          method: isEdit ? "PUT" : "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        showToast(
          data.message || (isEdit ? "Aset diperbarui" : "Aset ditambahkan"),
          "success"
        );

        await this.fetchAssets();
        this.resetAssetForm();
      } catch (error) {
        showToast(error.message, "danger");
      }
    },

    editAsset(asset) {
      this.assetForm = { ...asset };
    },

    async deleteAsset(id) {
      if (confirm("Yakin ingin menghapus aset ini?")) {
        await deleteAsset(id);
        showToast("Aset dihapus", "success");
        await this.fetchAssets();
      }
    },

    handlePhotoUpload(event) {
      const file = event.target.files[0];
      if (file && file.type.startsWith("image/")) {
        this.photoFile = file;
      } else {
        showToast("Hanya file gambar yang diperbolehkan.", "danger");
        event.target.value = "";
      }
    },

    resetAssetForm() {
      this.assetForm = {
        id: null,
        nameCategory: "",
        purchaseDate: "",
        division: "",
        username: "",
        brand: "",
        description: "",
        serialNumber: "",
        quantity: 1,
        price: 0,
        processor: "",
        ram: "",
        hdd: "",
        os: "",
      };
      this.photoFile = null;
    },

    async submitCategoryForm() {
      try {
        const name = this.categoryForm.nameCategory.trim();
        if (!name) {
          showToast("Nama kategori harus diisi!", "danger");
          return;
        }

        if (this.categoryForm.id) {
          await updateCategory(this.categoryForm.id, name);
          showToast("Kategori diperbarui", "success");
        } else {
          await addCategory(name);
          showToast("Kategori ditambahkan", "success");
        }

        await this.fetchCategories();
        this.resetCategoryForm();
      } catch (error) {
        showToast(error.message, "danger");
      }
    },

    editCategory(cat) {
      this.categoryForm = { ...cat };
    },

    async deleteCategory(id) {
      if (confirm("Yakin ingin menghapus kategori ini?")) {
        await deleteCategory(id);
        showToast("Kategori dihapus", "success");
        await this.fetchCategories();
      }
    },

    excelFile: null,

    handleExcelFile(event) {
      this.excelFile = event.target.files[0];
    },

    async importExcel() {
      if (!this.excelFile)
        return showToast("Pilih file terlebih dahulu.", "danger");

      const formData = new FormData();
      formData.append("file", this.excelFile);

      const token = localStorage.getItem("token");

      try {
        const res = await fetch(`${API_BASE_URL}/import-assets`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        showToast("Impor berhasil!", "success");
        await this.fetchAssets();
      } catch (err) {
        showToast(err.message, "danger");
      }
    },

    async exportExcel() {
      const token = localStorage.getItem("token");

      try {
        const res = await fetch(`${API_BASE_URL}/export-assets`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "assets.xlsx";
        link.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        showToast("Gagal mengekspor data!", "danger");
      }
    },

    get filteredAssets() {
      return this.assets.filter((asset) => {
        const query = this.searchQuery.toLowerCase();

        // Filter berdasarkan input spesifik
        if (
          this.filters.nameCategory &&
          asset.nameCategory !== this.filters.nameCategory
        )
          return false;
        if (
          this.filters.kodeAsset &&
          !asset.kodeAsset
            ?.toLowerCase()
            .includes(this.filters.kodeAsset.toLowerCase())
        )
          return false;
        if (
          this.filters.brand &&
          !asset.brand?.toLowerCase().includes(this.filters.brand.toLowerCase())
        )
          return false;
        if (
          this.filters.serialNumber &&
          !asset.serialNumber
            ?.toLowerCase()
            .includes(this.filters.serialNumber.toLowerCase())
        )
          return false;
        if (
          this.filters.purchaseDate &&
          asset.purchaseDate !== this.filters.purchaseDate
        )
          return false;
        if (
          this.filters.division &&
          !asset.division
            ?.toLowerCase()
            .includes(this.filters.division.toLowerCase())
        )
          return false;
        if (
          this.filters.username &&
          !asset.username
            ?.toLowerCase()
            .includes(this.filters.username.toLowerCase())
        )
          return false;

        // Pencarian global
        if (query) {
          const haystack = [
            asset.nameCategory,
            asset.kodeAsset,
            asset.brand,
            asset.serialNumber,
            asset.purchaseDate,
            asset.division,
            asset.username,
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        }

        return true;
      });
    },

    get paginatedAssets() {
      const start = (this.currentPage - 1) * this.perPage;
      const end = start + this.perPage;

      // Jika "Lihat Semua"
      if (this.perPage === -1) return this.filteredAssets;

      return this.filteredAssets.slice(start, end);
    },

    get totalPages() {
      if (this.perPage === -1) return 1;
      return Math.ceil(this.filteredAssets.length / this.perPage) || 1;
    },

    watch: {
      searchQuery() {
        this.currentPage = 1;
      },
      filters: {
        handler() {
          this.currentPage = 1;
        },
        deep: true,
      },
    },
    openScanModal() {
      const modal = new bootstrap.Modal(
        document.getElementById("barcodeScannerModal")
      );
      modal.show();

      const selectedDeviceId = null;
      const codeReader = new ZXing.BrowserMultiFormatReader();
      const videoElement = document.getElementById("scanner-video");

      codeReader
        .listVideoInputDevices()
        .then((videoInputDevices) => {
          const deviceId = videoInputDevices[0]?.deviceId;

          codeReader.decodeFromVideoDevice(
            deviceId,
            videoElement,
            (result, err) => {
              if (result) {
                this.searchQuery = result.getText();
                codeReader.reset();
                modal.hide();
              }
            }
          );
        })
        .catch((err) => {
          console.error("Camera error", err);
        });
    },

    printLabel(item) {
      const printWindow = window.open("", "_blank");
      const barcodeURL = `https://barcode.tec-it.com/barcode.ashx?data=${item.kodeAsset}&code=MobileQRCode&eclevel=L`;

      const labelHTML = `
    <html>
      <head>
        <title>Label Aset</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 10px;
          }
          .label {
            border: 1px dashed #333;
            padding: 10px;
            width: 250px;
            margin: auto;
            font-size: 14px;
          }
          .label img {
            width: 120px;
            margin-bottom: 5px;
          }
          .label div {
            margin-bottom: 4px;
          }
        </style>
      </head>
      <body>
        <div class="label">
          <img src="${barcodeURL}" alt="QR">
          <div><strong>Kode:</strong> ${item.kodeAsset}</div>
          <div><strong>Tanggal:</strong> ${item.purchaseDate}</div>
          <div><strong>Serial:</strong> ${item.serialNumber}</div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
    </html>
  `;

      printWindow.document.write(labelHTML);
      printWindow.document.close();
    },
    
    resetCategoryForm() {
      this.categoryForm = {
        id: null,
        nameCategory: "",
      };
    },

    logout() {
      localStorage.clear();
      window.location.href = LOGIN_PAGE_URL;
    },
  };
}
