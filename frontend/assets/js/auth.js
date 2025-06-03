const API_BASE_URL = "http://192.168.2.11:3000";
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
        window.location.href = "/dashboard";
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
