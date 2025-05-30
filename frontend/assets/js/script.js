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
      description: "",
      serialNumber: "",
      quantity: 1,
      price: 0,
    },
    categoryForm: {
      id: null,
      nameCategory: "",
    },

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
        description: "",
        serialNumber: "",
        quantity: 1,
        price: 0,
        photoFile: null,
      };
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
