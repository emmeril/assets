// Define a base API URL
const API_BASE_URL = "http://202.70.133.37:3000";
// Define a configurable login page URL
const LOGIN_PAGE_URL = "index.html";
// List of protected pages
const PROTECTED_PAGES = ["app.html"];

// Authentication Logic
function auth() {
  return {
    form: { username: "", password: "" },

    async submit() {
      // Client-side validation
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

        // Store token and username in localStorage
        localStorage.setItem("token", data.token);
        localStorage.setItem("username", this.form.username);

        // Redirect to app page
        window.location.href = "app.html";
      } catch (error) {
        console.error("Login error:", error);
        this.showToast(
          error.message || "Terjadi kesalahan, coba lagi.",
          "danger"
        );
      }
    },

    // Display a toast message
    showToast(message, type = "success") {
      const toast = document.getElementById("toast");
      if (toast) {
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add("show");

        setTimeout(() => {
          toast.classList.remove("show");
        }, 3000);
      }
    },
  };
}

async function fetchData(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message);
  }
  return response.json();
}

// Function to check if user is authenticated
function checkAuthentication() {
  const token = localStorage.getItem("token");

  // Check if token exists
  if (!token) {
    alert("Anda belum login. Silakan login terlebih dahulu.");
    window.location.href = LOGIN_PAGE_URL;
    return;
  }

  // Optional: Validate token structure (basic validation for JWT)
  if (!isValidToken(token)) {
    alert("Sesi Anda telah kedaluwarsa. Silakan login kembali.");
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    window.location.href = LOGIN_PAGE_URL;
    return;
  }

  console.log("Authentication check passed.");
}

// Helper function to validate the structure of the token (JWT)
function isValidToken(token) {
  try {
    // JWT tokens have 3 parts separated by dots
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    // Decode the payload (second part of the JWT) and check its expiry
    const payload = JSON.parse(atob(parts[1]));
    const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds

    // Check if the token has expired
    if (payload.exp && payload.exp < currentTime) {
      console.warn("Token has expired.");
      return false;
    }

    return true; // Token is valid
  } catch (error) {
    console.error("Invalid token structure:", error);
    return false;
  }
}

// Function to check if the current page requires authentication
function isProtectedPage(pathname) {
  return PROTECTED_PAGES.some((page) => pathname.endsWith(page));
}

// Call authentication check for protected pages
if (isProtectedPage(window.location.pathname)) {
  try {
    checkAuthentication();
    console.log(`Authentication check passed for ${window.location.pathname}.`);
  } catch (error) {
    console.error(
      `Authentication check failed on ${window.location.pathname}:`,
      error
    );
  }
}

function reminderApp() {
  return {
    token: localStorage.getItem("token"),
    username: localStorage.getItem("username"),

    // Data form reminder
    form: {
      phoneNumber: "",
      paymentDate: "",
      reminderTime: "",
      message: "",
      reminderId: "",
    },

    // Data form kontak
    contactForm: {
      name: "",
      phoneNumber: "",
      id: "",
    },

    // Data reminders
    allReminders: [],
    reminders: [],
    currentPage: 1,
    limit: 5,
    totalPages: 1,

    // Data kontak
    allContacts: [],
    contacts: [],
    currentPageContacts: 1,
    limitContacts: 5,
    totalPagesContacts: 1,

    // Data kontak yang sudah dikirim
    sentReminders: [],
    currentPageSentReminders: 1,
    limitSentReminders: 5,
    totalPagesSentReminders: 1,

    searchQueryReminders: "",
    searchQueryContacts: "",

    // Template pesan
    messageTemplates: [
      {
        name: "Member Rp 100.000",
        content:
          "Hai [Nama], jangan lupa bayar tagihan Emmeril Hotspot untuk bulan [Bulan], [Tanggal] sebesar Rp 100.000, pembayaran bisa melalui transfer ke BCA 134-266-9497 a/n Hafriyanto. konfirmasi pembayaran ke nomor ini ya. Terima kasih.",
      },
      {
        name: "Member Rp 80.000",
        content:
          "Hai [Nama], jangan lupa bayar tagihan Emmeril Hotspot untuk bulan [Bulan], [Tanggal] sebesar Rp 80.000, pembayaran bisa melalui transfer ke BCA 134-266-9497 a/n Hafriyanto. konfirmasi pembayaran ke nomor ini ya. Terima kasih.",
      },
      {
        name: "Member Rp 40.000",
        content:
          "Hai [Nama], jangan lupa bayar tagihan Emmeril Hotspot untuk bulan [Bulan], [Tanggal] sebesar Rp 40.000, pembayaran bisa melalui transfer ke BCA 134-266-9497 a/n Hafriyanto. konfirmasi pembayaran ke nomor ini ya. Terima kasih.",
      },
      // {
      //   name: "Pembayaran Cicilan",
      //   content:
      //     "Pengingat pembayaran cicilan ke-[Angka] sebesar Rp [Jumlah] jatuh tempo [Tanggal].",
      // },
      // {
      //   name: "Tagihan Air",
      //   content:
      //     "Pengingat pembayaran tagihan air bulan [Bulan] sebesar Rp [Jumlah].",
      // },
    ],

    // State dropdown
    isDropdownOpen: false,
    isContactDropdownOpen: false,

    showQrModal: false,
    qrStatus: "Memuat QR Code...",
    qrInterval: null,

    init() {
      try {
        // Check for authentication
        if (!this.token) {
          console.warn("Token not found. Redirecting to login page.");
          window.location.href = "index.html";
          return;
        }

        // Initialize the application
        console.log("Initializing application...");
        Promise.all([
          this.checkWhatsAppStatus(),
          this.fetchContacts(),
          this.fetchReminders(),
          this.fetchSentReminders(),
          this.fetchAllContacts(),
          this.fetchAllReminders(),
        ])
          .then(() => {
            console.log("Initialization complete. Data fetched successfully.");
          })
          .catch((error) => {
            console.error("Error during initialization:", error);
            this.showToast(
              "Terjadi kesalahan saat memuat data awal aplikasi. Silakan coba lagi.",
              "danger"
            );
          });

        // Auto-refresh every 5 minutes
        this.startAutoRefresh(300000); // 5 minutes in milliseconds
      } catch (error) {
        console.error("Unexpected error during initialization:", error);
      }
    },

    // Start auto-refresh 
    startAutoRefresh(interval) {
      if (this.autoRefreshInterval) {
        clearInterval(this.autoRefreshInterval);
      }

      this.autoRefreshInterval = setInterval(async () => {
        try {
          console.log("Auto-refreshing...");
          await this.fetchContacts(); // Fetch paginated contacts
          await this.fetchReminders(); // Fetch paginated reminders
          await this.fetchSentReminders(); // Fetch sent reminders
          await this.fetchAllContacts(); // Fetch all contacts
          await this.fetchAllReminders(); // Fetch all reminders
        } catch (error) {
          console.error("Error during auto-refresh:", error);
        }
      }, interval);
    },

    // Di dalam function app() - script.js
    async checkWhatsAppStatus() {
      try {
        // Fetch the WhatsApp status from the server
        const status = await fetchData(`${API_BASE_URL}/whatsapp-status`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });

        // Handle unauthenticated state
        if (!status.authenticated) {
          this.handleUnauthenticatedStatus(status);
          return { authenticated: false };
        }

        // Handle authenticated state
        this.handleAuthenticatedStatus();
        return { authenticated: true };
      } catch (error) {
        console.error("Error checking WhatsApp status:", error);
        this.showToast(
          "Gagal memeriksa status WhatsApp. Silakan coba lagi.",
          "danger"
        );
      }
    },

    // Handle unauthenticated status
    handleUnauthenticatedStatus(status) {
      this.showQrModal = true;

      // Update QR status message
      if (status.qrCode) {
        this.generateQRCode(status.qrCode);
        this.qrStatus = "Scan QR Code untuk melanjutkan";
      } else {
        this.qrStatus = "Menghubungkan ke WhatsApp...";
      }

      // Start interval to retry authentication check
      if (!this.qrInterval) {
        this.qrInterval = setInterval(async () => {
          const newStatus = await this.checkWhatsAppStatus();
          if (newStatus?.authenticated) {
            this.handleAuthenticatedStatus();
          }
        }, this.retryInterval || 2000); // Use configurable retry interval
      }
    },

    // Handle authenticated status
    handleAuthenticatedStatus() {
      this.showQrModal = false;
      clearInterval(this.qrInterval);
      this.qrInterval = null;
      this.$nextTick(() => {
        this.showToast("WhatsApp terhubung! Silahkan lanjutkan.", "success");
      });
    },

    generateQRCode(qrData) {
      try {
        // Validate QR data
        if (!qrData || typeof qrData !== "string") {
          throw new Error("QR data is invalid or missing.");
        }

        // Get the container element
        const container = document.getElementById("qrCodeContainer");
        if (!container) {
          throw new Error("QR code container element not found.");
        }

        // Clear the container
        container.innerHTML = "";

        // Configure QR code options
        const qrCodeOptions = {
          text: qrData,
          width: this.qrCodeWidth || 256, // Default to 256 if not set
          height: this.qrCodeHeight || 256, // Default to 256 if not set
          colorDark: this.qrCodeColorDark || "#000000", // Default to black
          colorLight: this.qrCodeColorLight || "#ffffff", // Default to white
          correctLevel: QRCode.CorrectLevel.H, // High error correction level
        };

        // Generate the QR code
        new QRCode(container, qrCodeOptions);
        console.log("QR code successfully generated.");
      } catch (error) {
        console.error("Failed to generate QR code:", error.message);
        this.showToast(
          "Gagal menghasilkan QR Code. Silakan coba lagi.",
          "danger"
        );
      }
    },

    /* ------------------------ METHOD UNTUK REMINDER ------------------------ */

    // Ambil data reminders
    async fetchReminders() {
      try {
        // Validate pagination inputs
        if (this.currentPage <= 0 || this.limit <= 0) {
          throw new Error("Invalid pagination parameters.");
        }

        const response = await fetch(
          `${API_BASE_URL}/get-reminders?page=${this.currentPage}&limit=${this.limit}`,
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || "Gagal mengambil data pengingat dari server."
          );
        }

        const result = await response.json();

        // Ensure response has valid data
        this.reminders = Array.isArray(result.reminders)
          ? result.reminders.sort(
              (a, b) =>
                new Date(b.reminderDateTime) - new Date(a.reminderDateTime)
            )
          : [];

        this.totalPages = result.totalPagesReminders || 1;
        console.log("Data pengingat berhasil diambil:", this.reminders);
      } catch (error) {
        console.error("Error saat mengambil pengingat:", error);
        this.showToast(
          error.message || "Terjadi kesalahan saat mengambil data pengingat.",
          "danger"
        );
      }
    },

    async fetchAllReminders() {
      try {
        // Set loading state
        this.isLoadingAllReminders = true;

        // Send API request for all contacts (no pagination)
        const response = await fetch(`${API_BASE_URL}/get-all-reminders`, {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        // Check if the response is successful
        if (!response.ok) {
          let errorMessage = "Failed to fetch all reminders";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            // Ignore JSON parsing errors
          }
          throw new Error(errorMessage);
        }

        // Parse response JSON
        const result = await response.json();

        // Update contacts data with all contacts
        this.allReminders = Array.isArray(result.allReminders)
          ? result.allReminders.sort(
              (a, b) =>
                new Date(b.reminderDateTime) - new Date(a.reminderDateTime)
            )
          : [];

        console.log("All contacts fetched successfully:", this.allReminders);
      } catch (error) {
        console.error("Failed to fetch allReminders:", error);
        this.showToast(
          error.message || "Terjadi kesalahan saat mengambil semua pengingat",
          "danger"
        );
      } finally {
        // Reset loading state
        this.isLoadingAllReminders = false;
      }
    },

    // Submit form reminder
    async submitForm() {
      try {
        // Validate input
        if (!this.validateForm()) {
          this.showToast("Semua data harus diisi dengan benar.", "danger");
          return;
        }

        // Determine the URL and method
        const isUpdate = Boolean(this.form.reminderId);
        const url = `${API_BASE_URL}/${
          isUpdate ? `update-reminder/${this.form.reminderId}` : "add-reminder"
        }`;
        const method = isUpdate ? "PUT" : "POST";

        // Prepare the request payload
        const data = {
          phoneNumber: this.form.phoneNumber,
          paymentDate: this.form.paymentDate,
          reminderTime: this.form.reminderTime,
          message: this.form.message,
        };

        // Indicate loading state
        this.isLoading = true;

        // Send the request
        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify(data),
        });

        // Check the response status
        if (!response.ok) {
          let errorMessage = "Gagal menyimpan pengingat";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            // Ignore JSON parsing errors
          }
          throw new Error(errorMessage);
        }

        // Process the successful response
        const result = await response.json();
        this.showToast(
          result.message || "Pengingat berhasil disimpan!",
          "success"
        );

        // Refresh reminders list and reset form
        await this.fetchReminders();
        await this.fetchAllReminders(); // Add this line
        this.resetForm();
      } catch (error) {
        console.error("Error saat menyimpan pengingat:", error);
        this.showToast(
          error.message || "Terjadi kesalahan, coba lagi.",
          "danger"
        );
      } finally {
        // Reset loading state
        this.isLoading = false;
      }
    },

    // Helper function to validate form data
    validateForm() {
      return (
        this.form.phoneNumber &&
        /^\d+$/.test(this.form.phoneNumber) && // Ensure phone number is numeric
        this.form.paymentDate &&
        this.form.reminderTime &&
        this.form.message.trim().length > 0
      );
    },

    // Reset form reminder
    resetForm() {
      // Use a single source of truth for default form values
      this.form = this.getDefaultFormValues();
    },

    // Helper function to define default form values
    getDefaultFormValues() {
      return {
        phoneNumber: "",
        paymentDate: "",
        reminderTime: "",
        message: "",
        reminderId: null,
      };
    },

    // Batalkan update reminder
    cancelUpdate() {
      this.resetForm();
    },

    // Handle update reminder
    handleUpdate(reminder) {
      try {
        // Validate input
        if (!reminder || !reminder.reminderDateTime) {
          throw new Error("Reminder data is invalid or incomplete.");
        }

        // Parse reminderDateTime only once
        const reminderDate = new Date(reminder.reminderDateTime);
        if (isNaN(reminderDate.getTime())) {
          throw new Error("Invalid reminder date format.");
        }

        // Populate form fields
        this.form = {
          phoneNumber: reminder.phoneNumber || "",
          paymentDate: this.formatDate(reminderDate),
          reminderTime: this.formatTime(reminderDate),
          message: reminder.message || "",
          reminderId: reminder.id || null,
        };
      } catch (error) {
        console.error("Error in handleUpdate:", error);
        this.showToast(
          "Gagal memuat data pengingat. Periksa kembali data.",
          "danger"
        );
      }
    },

    // Helper method to format date as YYYY-MM-DD
    formatDate(date) {
      return date.toISOString().split("T")[0];
    },

    // Helper method to format time as HH:mm
    formatTime(date) {
      return date.toTimeString().split(" ")[0].substring(0, 5);
    },

    // Hapus reminder
    async handleDelete(id) {
      try {
        // Validate the ID
        if (!id) {
          throw new Error("ID pengingat tidak valid.");
        }

        // Send DELETE request
        const response = await fetch(`${API_BASE_URL}/delete-reminder/${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        // Check for success
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || "Gagal menghapus pengingat. Silakan coba lagi."
          );
        }

        const result = await response.json();

        // Show success message and refresh reminders
        this.showToast(
          result.message || "Pengingat berhasil dihapus!",
          "success"
        );
        await this.fetchReminders();
      } catch (error) {
        console.error("Error saat menghapus pengingat:", error);
        this.showToast(
          error.message || "Terjadi kesalahan saat menghapus pengingat.",
          "danger"
        );
      }
    },

    searchReminders() {
      const query = this.searchQueryReminders.trim().toLowerCase();

      if (query === "") {
        // Jika pencarian kosong, tampilkan data dari halaman aktif
        this.fetchReminders();
      } else {
        // Filter kontak berdasarkan nama atau nomor telepon
        // Filter kontak berdasarkan pesan atau nomor telepon
        this.reminders = this.allReminders.filter(
          (reminder) =>
            reminder.message.toLowerCase().includes(query) ||
            reminder.phoneNumber.toLowerCase().includes(query)
        );
      }

      console.log("Hasil pencarian pengingat:", this.reminders);
    },

    /* ------------------------ METHOD UNTUK KONTAK ------------------------ */

    // Fetch data kontak dengan pagination yang benar
    async fetchContacts() {
      try {
        // Validate pagination inputs
        if (this.currentPageContacts <= 0 || this.limitContacts <= 0) {
          throw new Error("Invalid pagination parameters.");
        }

        // Set loading state
        this.isLoadingContacts = true;

        // Send API request
        const response = await fetch(
          `${API_BASE_URL}/get-contacts?page=${this.currentPageContacts}&limit=${this.limitContacts}`,
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
            },
          }
        );

        // Check if the response is successful
        if (!response.ok) {
          let errorMessage = "Failed to fetch contacts";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            // Ignore JSON parsing errors
          }
          throw new Error(errorMessage);
        }

        // Parse response JSON
        const result = await response.json();

        // Update contacts data
        this.contacts = Array.isArray(result.contacts)
          ? result.contacts.sort((a, b) =>
              a.name.localeCompare(b.name, "id", { sensitivity: "base" })
            )
          : [];

        this.totalPagesContacts = result.totalPagesContacts || 1;

        console.log("Contacts fetched successfully:", this.contacts);
      } catch (error) {
        console.error("Failed to fetch contacts:", error);
        this.showToast(
          error.message || "Terjadi kesalahan saat mengambil daftar kontak",
          "danger"
        );
      } finally {
        // Reset loading state
        this.isLoadingContacts = false;
      }
    },

    async fetchAllContacts() {
      try {
        // Set loading state
        this.isLoadingAllContacts = true;

        // Send API request for all contacts (no pagination)
        const response = await fetch(`${API_BASE_URL}/get-all-contacts`, {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        // Check if the response is successful
        if (!response.ok) {
          let errorMessage = "Failed to fetch all contacts";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            // Ignore JSON parsing errors
          }
          throw new Error(errorMessage);
        }

        // Parse response JSON
        const result = await response.json();

        // Update contacts data with all contacts
        this.allContacts = Array.isArray(result.allContacts)
          ? result.allContacts.sort((a, b) =>
              a.name.localeCompare(b.name, "id", { sensitivity: "base" })
            )
          : [];

        console.log("All contacts fetched successfully:", this.allContacts);
      } catch (error) {
        console.error("Failed to fetch all contacts:", error);
        this.showToast(
          error.message || "Terjadi kesalahan saat mengambil semua kontak",
          "danger"
        );
      } finally {
        // Reset loading state
        this.isLoadingAllContacts = false;
      }
    },

    // Format nomor telepon
    formatPhoneNumber(input) {
      try {
        // Validate input
        if (typeof input !== "string" || input.trim() === "") {
          throw new Error("Nomor telepon tidak valid.");
        }

        // Remove all non-digit characters except '+'
        let cleaned = input.replace(/[^\d+]/g, "");

        // Handle prefixes
        if (cleaned.startsWith("0")) {
          // Replace leading '0' with '62' (Indonesia country code)
          cleaned = "62" + cleaned.slice(1);
        } else if (cleaned.startsWith("8") && !cleaned.startsWith("62")) {
          // Add '62' for numbers starting with '8'
          cleaned = "62" + cleaned;
        } else if (cleaned.startsWith("+62")) {
          // Remove the '+' sign
          cleaned = cleaned.slice(1);
        }

        // Validate length (Indonesia numbers are typically 10-13 digits after country code)
        if (cleaned.length < 10 || cleaned.length > 15) {
          throw new Error("Nomor telepon memiliki panjang yang tidak valid.");
        }

        return cleaned;
      } catch (error) {
        console.error("Error in formatPhoneNumber:", error.message);
        return null; // Return null for invalid inputs
      }
    },

    // Submit form kontak
    async submitContactForm() {
      try {
        // Validate form inputs
        if (!this.validateContactForm()) {
          this.showToast(
            "Nama dan nomor telepon harus diisi dengan benar.",
            "danger"
          );
          return;
        }

        // Format phone number
        this.contactForm.phoneNumber = this.formatPhoneNumber(
          this.contactForm.phoneNumber
        );

        // Determine if this is an add or update operation
        const isUpdate = Boolean(this.contactForm.id);
        const url = `${API_BASE_URL}/${
          isUpdate ? `update-contact/${this.contactForm.id}` : "add-contact"
        }`;
        const method = isUpdate ? "PUT" : "POST";

        // Send the request
        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
          },
          body: JSON.stringify({
            name: this.contactForm.name,
            phoneNumber: this.contactForm.phoneNumber,
          }),
        });

        // Check if the response is successful
        if (!response.ok) {
          let errorMessage = "Gagal menyimpan kontak.";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            // Ignore JSON parsing errors
          }
          throw new Error(errorMessage);
        }

        // Parse the response
        const result = await response.json();

        // Show success message
        this.showToast(
          result.message ||
            (isUpdate
              ? "Kontak berhasil diperbarui!"
              : "Kontak berhasil ditambahkan!"),
          "success"
        );

        // Refresh the contact list and reset the form
        await this.fetchContacts();
        await this.fetchAllContacts(); // Add this line
        this.resetContactForm();
      } catch (error) {
        console.error("Failed to submit contact form:", error);
        this.showToast(
          error.message || "Terjadi kesalahan saat menyimpan kontak.",
          "danger"
        );
      }
    },

    // Helper function to validate contact form inputs
    validateContactForm() {
      return (
        this.contactForm.name &&
        this.contactForm.name.trim().length > 0 &&
        this.contactForm.phoneNumber &&
        /^\d+$/.test(this.formatPhoneNumber(this.contactForm.phoneNumber)) // Ensure phone number is numeric
      );
    },

    // Helper function to reset contact form to its default state
    resetContactForm() {
      this.contactForm = {
        id: null, // Include id for update operations
        name: "",
        phoneNumber: "",
      };
    },

    // Handle update reminder
    handleUpdateContact(contact) {
      try {
        // Validate input
        if (!contact || !contact.id) {
          throw new Error("Reminder data is invalid or incomplete.");
        }

        // Populate form fields
        this.contactForm = {
          name: contact.name || "",
          phoneNumber: contact.phoneNumber || "",
          id: contact.id || null,
        };
      } catch (error) {
        console.error("Error in handleUpdate:", error);
        this.showToast(
          "Gagal memuat data pengingat. Periksa kembali data.",
          "danger"
        );
      }
    },

    // Hapus kontak
    async handleDeleteContact(id) {
      try {
        // Validate ID
        if (!id) {
          throw new Error("ID kontak tidak valid.");
        }

        // Show confirmation prompt before deleting
        const confirmation = window.confirm(
          "Apakah Anda yakin ingin menghapus kontak ini?"
        );
        if (!confirmation) return;

        // Send DELETE request
        const response = await fetch(`${API_BASE_URL}/delete-contact/${id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });

        // Check if the response is successful
        if (!response.ok) {
          let errorMessage = "Gagal menghapus kontak.";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            // Ignore JSON parsing errors
          }
          throw new Error(errorMessage);
        }

        const result = await response.json();

        // Show success message and refresh contacts
        this.showToast(result.message || "Kontak berhasil dihapus!", "success");
        await this.fetchContacts();
      } catch (error) {
        console.error("Failed to delete contact:", error);
        this.showToast(
          error.message || "Terjadi kesalahan saat menghapus kontak.",
          "danger"
        );
      }
    },
    // Pilih kontak dari dropdown
    selectContact(contact) {
      this.form.phoneNumber = contact.phoneNumber;
      this.isContactDropdownOpen = false;
    },

    // Template pesan
    applyTemplate(template) {
      // Validasi: Pastikan semua input diisi
      if (!this.form.phoneNumber || !this.form.paymentDate) {
        this.showToast(
          "Lengkapi semua data sebelum menggunakan template.",
          "danger"
        );
        return;
      }

      // Cari kontak berdasarkan nomor telepon yang dipilih
      const selectedContact = this.allContacts.find(
        (contact) => contact.phoneNumber === this.form.phoneNumber
      );

      // Jika kontak ditemukan, ganti placeholder dengan data aktual
      if (selectedContact) {
        this.form.message = template.content
          .replace("[Nama]", selectedContact.name)
          .replace("[Jumlah]", "[Jumlah]") // Tetap sebagai placeholder
          .replace("[Tanggal]", this.form.paymentDate)
          .replace(
            "[Bulan]",
            new Date(this.form.paymentDate).toLocaleString("id-ID", {
              month: "long",
            })
          );
      } else {
        // Jika kontak tidak ditemukan, beri peringatan
        this.showToast(
          "Pilih kontak terlebih dahulu dari dropdown!",
          "warning"
        );
      }

      this.isDropdownOpen = false;
    },

    searchContacts() {
      const query = this.searchQueryContacts.trim().toLowerCase();

      if (query === "") {
        // Jika pencarian kosong, tampilkan data dari halaman aktif
        this.fetchContacts();
      } else {
        // Filter kontak berdasarkan nama atau nomor telepon
        this.contacts = this.allContacts.filter(
          (contact) =>
            contact.name.toLowerCase().includes(query) ||
            contact.phoneNumber.toLowerCase().includes(query)
        );
      }
    },
    /* ------------------------ METHOD UNTUK REMINDER YANG SUDAH DIKIRIM ------------------------ */

    async fetchSentReminders() {
      try {
        // Validate pagination inputs
        if (
          this.currentPageSentReminders <= 0 ||
          this.limitSentReminders <= 0
        ) {
          throw new Error("Invalid pagination parameters.");
        }

        // Retrieve token from centralized state or localStorage
        const token = this.token || localStorage.getItem("token");
        if (!token) {
          throw new Error("Authorization token is missing. Please log in.");
        }

        // Send API request
        const response = await fetch(
          `${API_BASE_URL}/get-sent-reminders?page=${this.currentPageSentReminders}&limit=${this.limitSentReminders}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        // Check response status
        if (!response.ok) {
          let errorMessage = "Failed to fetch sent reminders.";
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch {
            // Ignore JSON parsing errors
          }
          throw new Error(errorMessage);
        }

        // Parse response JSON
        const data = await response.json();

        // Update state with fetched data
        this.sentReminders = Array.isArray(data.sentReminders)
          ? data.sentReminders.sort(
              (a, b) =>
                new Date(b.reminderDateTime) - new Date(a.reminderDateTime)
            )
          : [];

        this.totalPagesSentReminders = data.totalPagesSentReminders || 1;

        console.log("Sent reminders fetched successfully:", this.sentReminders);
      } catch (error) {
        console.error("Failed to fetch sent reminders:", error);
        this.showToast(
          error.message ||
            "Terjadi kesalahan saat mengambil pengingat terkirim.",
          "danger"
        );
      }
    },

    // res
    async rescheduleReminder(reminder) {
      try {
        // Validate the reminder object
        if (!reminder || !reminder.id) {
          throw new Error("Reminder data is invalid or missing.");
        }

        // Retrieve token
        const token = this.token || localStorage.getItem("token");
        if (!token) {
          throw new Error("Authorization token is missing. Please log in.");
        }

        // Send API request
        const response = await fetch(
          `${API_BASE_URL}/reschedule-reminder/${reminder.id}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );

        // Parse response
        let data;
        try {
          data = await response.json();
        } catch {
          throw new Error("Failed to parse server response.");
        }

        if (response.ok) {
          // Refresh reminders data
          await Promise.all([this.fetchReminders(), this.fetchSentReminders()]);

          // Show success message
          this.showToast(
            data.message || "Reminder successfully rescheduled!",
            "success"
          );
        } else {
          // Show server error message
          throw new Error(data.message || "Failed to reschedule reminder.");
        }
      } catch (error) {
        console.error("Failed to reschedule reminder:", error);
        this.showToast(
          error.message || "Failed to reschedule reminder.",
          "danger"
        );
      }
    },
    /* ------------------------ FITUR TAMBAHAN ------------------------ */

    // Pagination reminder
    prevPage() {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.fetchReminders();
      }
    },

    nextPage() {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        this.fetchReminders();
      }
    },

    goToPage(page) {
      if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
        this.currentPage = page;
        this.fetchReminders();
      }
    },

    get visiblePages() {
      const total = this.totalPages; // Total halaman
      const current = this.currentPage; // Halaman saat ini
      const range = 5; // Jumlah maksimal halaman yang ditampilkan dalam paginasi

      // Hitung start dan end untuk rentang halaman
      let start = Math.max(1, current - Math.floor(range / 2));
      let end = Math.min(total, start + range - 1);

      // Jika ada lebih sedikit halaman dari range yang diminta, sesuaikan rentangnya
      if (end - start + 1 < range) {
        start = Math.max(1, end - range + 1);
      }

      // Buat array untuk rentang halaman yang terlihat
      const pages = [];
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      return pages;
    },

    // Navigasi pagination kontak
    prevPageContacts() {
      if (this.currentPageContacts > 1) {
        this.currentPageContacts--;
        this.fetchContacts();
      }
    },

    nextPageContacts() {
      if (this.currentPageContacts < this.totalPagesContacts) {
        this.currentPageContacts++;
        this.fetchContacts();
      }
    },

    goToPageContacts(page) {
      if (
        page >= 1 &&
        page <= this.totalPagesContacts &&
        page !== this.currentPageContacts
      ) {
        this.currentPageContacts = page;
        this.fetchContacts();
      }
    },

    get visiblePagesContacts() {
      const total = this.totalPagesContacts; // Total halaman kontak
      const current = this.currentPageContacts; // Halaman saat ini
      const range = 5; // Jumlah maksimal halaman yang ditampilkan

      // Hitung rentang halaman (start dan end)
      let start = Math.max(1, current - Math.floor(range / 2));
      let end = Math.min(total, start + range - 1);

      // Sesuaikan jika range kurang dari nilai yang diinginkan
      if (end - start + 1 < range) {
        start = Math.max(1, end - range + 1);
      }

      // Buat array halaman yang terlihat
      const pages = [];
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      return pages;
    },

    // Pagination sent reminders
    prevPageSentReminders() {
      if (this.currentPageSentReminders > 1) {
        this.currentPageSentReminders--;
        this.fetchSentReminders();
      }
    },

    nextPageSentReminders() {
      if (this.currentPageSentReminders < this.totalPagesSentReminders) {
        this.currentPageSentReminders++;
        this.fetchSentReminders();
      }
    },

    goToPageSentReminders(page) {
      if (
        page >= 1 &&
        page <= this.totalPagesSentReminders &&
        page !== this.currentPageSentReminders
      ) {
        this.currentPageSentReminders = page;
        this.fetchSentReminders();
      }
    },

    get visiblePagesSentReminders() {
      const total = this.totalPagesSentReminders; // Total jumlah halaman
      const current = this.currentPageSentReminders; // Halaman saat ini
      const range = 5; // Jumlah halaman yang terlihat dalam paginasi

      // Hitung awal (start) dan akhir (end) dari rentang halaman
      let start = Math.max(1, current - Math.floor(range / 2));
      let end = Math.min(total, start + range - 1);

      // Jika rentang halaman kurang dari range, sesuaikan awal (start)
      if (end - start + 1 < range) {
        start = Math.max(1, end - range + 1);
      }

      // Buat daftar halaman untuk ditampilkan
      const pages = [];
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      return pages;
    },

    // Toast Function
    showToast(message, type = "success") {
      const toast = document.getElementById("toast");
      toast.textContent = message;
      toast.className = `toast ${type}`;
      toast.classList.add("show");

      setTimeout(() => {
        toast.classList.remove("show");
      }, 3000);
    },

    // Toggle dropdown
    toggleDropdown() {
      this.isDropdownOpen = !this.isDropdownOpen;
    },
    toggleContactDropdown() {
      this.isContactDropdownOpen = !this.isContactDropdownOpen;
    },

    // Logout
    logout() {
      localStorage.removeItem("token");
      localStorage.removeItem("username");
      window.location.href = "index.html";
    },
  };
}

// Toast Element
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  if (toast) {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }
}
