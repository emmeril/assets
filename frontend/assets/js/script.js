// Configuration
class AssetManager {
    constructor() {
        this.token = localStorage.getItem('token');
        this.username = localStorage.getItem('username');
        this.assets = [];
        this.categories = [];
        this.currentPage = 1;
        this.perPage = 10;
        this.currentAssetId = null;
        this.currentPhotoFile = null;
        
        // Barcode scanning variables
        this.codeReader = null;
        this.isScanning = false;
        this.scanStream = null;
        
        this.initializeApp();
    }

    async initializeApp() {
        // Check authentication
        if (!this.checkAuth()) {
            return;
        }

        // Set username
        document.getElementById('username-display').textContent = this.username;

        // Setup mobile sidebar toggle
        this.setupMobileSidebar();

        // Load initial data
        await this.loadCategories();
        await this.loadAssets();

        // Setup event listeners
        this.setupEventListeners();

        // Show assets section by default
        this.showSection('aset');
    }

    setupMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('.main-content');
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebarCollapse = document.getElementById('sidebarCollapse');

        // Toggle sidebar on mobile
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.add('active');
                mainContent.classList.add('sidebar-active');
            });
        }

        if (sidebarCollapse) {
            sidebarCollapse.addEventListener('click', () => {
                sidebar.classList.remove('active');
                mainContent.classList.remove('sidebar-active');
            });
        }

        // Close sidebar when clicking on overlay (mobile)
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                !sidebar.contains(e.target) && 
                (!sidebarToggle || !sidebarToggle.contains(e.target)) &&
                sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
                mainContent.classList.remove('sidebar-active');
            }
        });

        // Close sidebar when clicking on a link (mobile)
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                    mainContent.classList.remove('sidebar-active');
                }
            });
        });
    }

    checkAuth() {
        this.token = localStorage.getItem('token');
        this.username = localStorage.getItem('username');

        if (!this.token || !this.username) {
            this.showToast('Silakan login kembali', 'warning');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
            return false;
        }

        // Verify token is still valid
        try {
            const payload = JSON.parse(atob(this.token.split('.')[1]));
            const currentTime = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp < currentTime) {
                this.showToast('Sesi telah kedaluwarsa', 'warning');
                this.logout();
                return false;
            }
            
            // Pastikan token memiliki format JWT yang benar
            if (!payload.username || !payload.iat) {
                this.showToast('Token tidak valid', 'danger');
                this.logout();
                return false;
            }
        } catch (e) {
            console.error('Token validation error:', e);
            this.showToast('Token tidak valid', 'danger');
            this.logout();
            return false;
        }

        return true;
    }

    async apiCall(endpoint, options = {}) {
        // Pastikan token tersedia dan valid
        if (!this.token) {
            this.showToast('Token tidak ditemukan', 'danger');
            this.logout();
            return null;
        }

        // Verifikasi token masih valid
        try {
            const payload = JSON.parse(atob(this.token.split('.')[1]));
            const currentTime = Math.floor(Date.now() / 1000);
            
            if (payload.exp && payload.exp < currentTime) {
                this.showToast('Sesi telah kedaluwarsa', 'warning');
                this.logout();
                return null;
            }
        } catch (e) {
            this.showToast('Token tidak valid', 'danger');
            this.logout();
            return null;
        }

        const config = {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                ...options.headers
            },
            ...options
        };

        // Jangan set Content-Type untuk FormData, biarkan browser yang handle
        if (options.body && options.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        try {
            console.log('📤 Making API call to:', endpoint);
            console.log('🔐 Token format:', config.headers.Authorization ? 'Bearer + token' : 'No token');
            
            const response = await fetch(endpoint, config);
            
            if (response.status === 401) {
                const errorData = await response.json();
                this.showToast(errorData.message || 'Sesi telah kedaluwarsa', 'warning');
                this.logout();
                return null;
            }

            if (response.status === 403) {
                const errorData = await response.json();
                this.showToast(errorData.message || 'Akses ditolak', 'danger');
                return null;
            }

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error(`API Error (${endpoint}):`, error);
            this.showToast(error.message, 'danger');
            throw error;
        }
    }

    async loadCategories() {
        try {
            this.showLoading('categoriesList', 'Memuat data kategori...');
            const data = await this.apiCall('/get-categories');
            if (data) {
                this.categories = data.categories || [];
                this.renderCategories();
                this.populateCategoryFilter();
                this.populateAssetCategorySelect();
            }
        } catch (error) {
            console.error('Error loading categories:', error);
            this.showError('categoriesList', 'Gagal memuat data kategori');
        }
    }

    async loadAssets() {
        try {
            this.showLoading('assetsTableBody', 'Memuat data aset...');
            const data = await this.apiCall('/get-assets');
            if (data) {
                this.assets = data.assets || [];
                this.renderAssets();
            }
        } catch (error) {
            console.error('Error loading assets:', error);
            this.showError('assetsTableBody', 'Gagal memuat data aset');
        }
    }

    showLoading(elementId, message = 'Memuat data...') {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fa-solid fa-spinner fa-spin fa-2x mb-2 d-block"></i>
                    ${message}
                </div>
            `;
        }
    }

    showError(elementId, message = 'Terjadi kesalahan') {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = `
                <div class="text-center text-danger py-4">
                    <i class="fa-solid fa-exclamation-triangle fa-2x mb-2 d-block"></i>
                    ${message}
                </div>
            `;
        }
    }

    renderCategories() {
        const categoriesList = document.getElementById('categoriesList');
        const categoriesCount = document.getElementById('categoriesCount');
        const categoriesCountBadge = document.getElementById('categories-count-badge');
        
        if (categoriesCount) categoriesCount.textContent = this.categories.length;
        if (categoriesCountBadge) {
            categoriesCountBadge.textContent = `${this.categories.length} kategori`;
        }

        if (this.categories.length === 0) {
            categoriesList.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fa-solid fa-tags fa-2x mb-2 d-block"></i>
                    Belum ada kategori yang ditambahkan
                    <br>
                    <small class="text-muted">Gunakan form di samping untuk menambahkan kategori baru</small>
                </div>
            `;
            return;
        }

        categoriesList.innerHTML = this.categories.map(category => `
            <div class="list-group-item d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center">
                    <span class="fa fa-tag text-primary me-2"></span>
                    <span class="fw-medium">${this.escapeHtml(category.nameCategory)}</span>
                </div>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-warning edit-category" data-id="${category.id}" title="Edit Kategori">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-outline-danger delete-category" data-id="${category.id}" title="Hapus Kategori">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // Add event listeners for category actions
        categoriesList.querySelectorAll('.edit-category').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const categoryId = e.currentTarget.dataset.id;
                this.editCategory(categoryId);
            });
        });

        categoriesList.querySelectorAll('.delete-category').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const categoryId = e.currentTarget.dataset.id;
                this.deleteCategory(categoryId);
            });
        });
    }

    populateCategoryFilter() {
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.innerHTML = '<option value="">Semua Kategori</option>' +
                this.categories.map(cat => 
                    `<option value="${this.escapeHtml(cat.nameCategory)}">${this.escapeHtml(cat.nameCategory)}</option>`
                ).join('');
        }
    }

    populateAssetCategorySelect() {
        const assetCategory = document.getElementById('assetCategory');
        if (assetCategory) {
            assetCategory.innerHTML = '<option value="" disabled selected>Pilih Kategori</option>' +
                this.categories.map(cat => 
                    `<option value="${this.escapeHtml(cat.nameCategory)}">${this.escapeHtml(cat.nameCategory)}</option>`
                ).join('');
        }
    }

    renderAssets() {
        const assetsTableBody = document.getElementById('assetsTableBody');
        const totalAssets = document.getElementById('total-assets');
        const totalAssetsMobile = document.getElementById('total-assets-mobile');
        const showingCount = document.getElementById('showing-count');
        const totalCount = document.getElementById('total-count');

        // Apply filters
        const filteredAssets = this.filterAssets();
        const paginatedAssets = this.paginateAssets(filteredAssets);

        if (totalAssets) totalAssets.textContent = `Total: ${this.assets.length}`;
        if (totalAssetsMobile) {
            totalAssetsMobile.textContent = `Total: ${this.assets.length}`;
        }
        if (showingCount) showingCount.textContent = paginatedAssets.length;
        if (totalCount) totalCount.textContent = filteredAssets.length;

        if (paginatedAssets.length === 0) {
            assetsTableBody.innerHTML = `
                <tr>
                    <td colspan="14" class="text-center text-muted py-4">
                        <i class="fa-solid fa-box-open fa-2x mb-2 d-block"></i>
                        Tidak ada data aset yang ditemukan
                        ${this.assets.length > 0 ? '<br><small class="text-muted">Coba ubah filter pencarian Anda</small>' : ''}
                    </td>
                </tr>
            `;
            return;
        }

        assetsTableBody.innerHTML = paginatedAssets.map((asset, index) => {
            const startIndex = (this.currentPage - 1) * this.perPage;
            const rowNumber = startIndex + index + 1;
            
            // Photo column
            let photoHtml = '<span class="text-muted">-</span>';
            if (asset.photo) {
                photoHtml = `
                    <div class="text-center">
                        <img src="/uploads/${asset.photo}" alt="Foto Aset" 
                             class="img-thumbnail" style="max-width: 60px; cursor: pointer;" 
                             onclick="assetManager.viewPhoto('${asset.photo}')"
                             title="Klik untuk melihat foto">
                    </div>
                `;
            }
            
            return `
                <tr>
                    <td class="text-center">${rowNumber}</td>
                    <td>${this.escapeHtml(asset.nameCategory)}</td>
                    <td><span class="fw-bold">${this.escapeHtml(asset.kodeAsset)}</span></td>
                    <td class="text-center">
                        <img src="https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(asset.kodeAsset)}&code=MobileQRCode&eclevel=L" 
                             alt="QR Code" class="qr-code" title="QR Code untuk ${this.escapeHtml(asset.kodeAsset)}">
                    </td>
                    <td>${this.escapeHtml(asset.brand)}</td>
                    <td>${this.escapeHtml(asset.description)}</td>
                    <td>${this.escapeHtml(asset.serialNumber)}</td>
                    <td>${this.formatDate(asset.purchaseDate)}</td>
                    <td>${this.escapeHtml(asset.division)}</td>
                    <td>${this.escapeHtml(asset.username)}</td>
                    <td class="text-center">${asset.quantity}</td>
                    <td class="text-end">${this.formatCurrency(asset.price)}</td>
                    <td class="text-center">${photoHtml}</td>
                    <td class="text-center">
                        <div class="btn-group btn-group-sm" role="group">
                            <button class="btn btn-outline-warning edit-asset" data-id="${asset.id}" title="Edit Aset">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="btn btn-outline-info view-asset" data-id="${asset.id}" title="Lihat Detail">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                            <button class="btn btn-outline-secondary print-label" data-id="${asset.id}" title="Print Label">
                                <i class="fa-solid fa-tag"></i>
                            </button>
                            <button class="btn btn-outline-danger delete-asset" data-id="${asset.id}" title="Hapus Aset">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Add event listeners for asset actions
        this.attachAssetEventListeners();
        this.updatePaginationControls(filteredAssets.length);
    }

    viewPhoto(photoFilename) {
        const photoUrl = `/uploads/${photoFilename}`;
        const newWindow = window.open('', '_blank');
        newWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Foto Aset</title>
                <style>
                    body { 
                        margin: 0; 
                        padding: 20px; 
                        text-align: center; 
                        background: #f8f9fa;
                    }
                    img { 
                        max-width: 90%; 
                        max-height: 85vh; 
                        border: 2px solid #dee2e6;
                        border-radius: 8px;
                        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                    }
                    .photo-info {
                        margin-top: 15px;
                        color: #6c757d;
                        font-family: Arial, sans-serif;
                    }
                </style>
            </head>
            <body>
                <img src="${photoUrl}" alt="Foto Aset" onerror="this.style.display='none'; document.getElementById('error').style.display='block'">
                <div id="error" style="display: none; color: #dc3545; font-family: Arial, sans-serif;">
                    <i class="fa-solid fa-exclamation-triangle"></i> Foto tidak dapat dimuat
                </div>
                <div class="photo-info">
                    <i class="fa-solid fa-image"></i> Foto Aset - ${photoFilename}
                </div>
                <script>
                    setTimeout(() => window.print(), 500);
                </script>
            </body>
            </html>
        `);
        newWindow.document.close();
    }

    attachAssetEventListeners() {
        const assetsTableBody = document.getElementById('assetsTableBody');
        if (!assetsTableBody) return;
        
        assetsTableBody.querySelectorAll('.edit-asset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const assetId = e.currentTarget.dataset.id;
                this.editAsset(assetId);
            });
        });

        assetsTableBody.querySelectorAll('.view-asset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const assetId = e.currentTarget.dataset.id;
                this.viewAsset(assetId);
            });
        });

        assetsTableBody.querySelectorAll('.print-label').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const assetId = e.currentTarget.dataset.id;
                this.printLabel(assetId);
            });
        });

        assetsTableBody.querySelectorAll('.delete-asset').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const assetId = e.currentTarget.dataset.id;
                this.deleteAsset(assetId);
            });
        });
    }

    filterAssets() {
        const searchInput = document.getElementById('searchInput');
        const categoryFilter = document.getElementById('categoryFilter');
        const codeFilter = document.getElementById('codeFilter');
        const brandFilter = document.getElementById('brandFilter');

        const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
        const categoryValue = categoryFilter ? categoryFilter.value : '';
        const codeValue = codeFilter ? codeFilter.value.toLowerCase() : '';
        const brandValue = brandFilter ? brandFilter.value.toLowerCase() : '';

        return this.assets.filter(asset => {
            // Search query filter
            if (searchQuery) {
                const searchable = [
                    asset.nameCategory,
                    asset.kodeAsset,
                    asset.brand,
                    asset.serialNumber,
                    asset.description,
                    asset.division,
                    asset.username
                ].join(' ').toLowerCase();
                
                if (!searchable.includes(searchQuery)) {
                    return false;
                }
            }

            // Category filter
            if (categoryValue && asset.nameCategory !== categoryValue) {
                return false;
            }

            // Code filter
            if (codeValue && !asset.kodeAsset.toLowerCase().includes(codeValue)) {
                return false;
            }

            // Brand filter
            if (brandValue && !asset.brand.toLowerCase().includes(brandValue)) {
                return false;
            }

            return true;
        });
    }

    paginateAssets(assets) {
        const startIndex = (this.currentPage - 1) * this.perPage;
        const endIndex = startIndex + this.perPage;
        return assets.slice(startIndex, endIndex);
    }

    updatePaginationControls(totalItems) {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');

        if (!prevBtn || !nextBtn) return;

        const totalPages = Math.ceil(totalItems / this.perPage);
        prevBtn.disabled = this.currentPage === 1;
        nextBtn.disabled = this.currentPage === totalPages || totalPages === 0;
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tab = e.currentTarget.dataset.tab;
                this.showSection(tab);
            });
        });

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }

        // Asset filters
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.currentPage = 1;
                this.renderAssets();
            });
        }

        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => {
                this.currentPage = 1;
                this.renderAssets();
            });
        }

        const codeFilter = document.getElementById('codeFilter');
        if (codeFilter) {
            codeFilter.addEventListener('input', () => {
                this.currentPage = 1;
                this.renderAssets();
            });
        }

        const brandFilter = document.getElementById('brandFilter');
        if (brandFilter) {
            brandFilter.addEventListener('input', () => {
                this.currentPage = 1;
                this.renderAssets();
            });
        }

        // Pagination
        const prevBtn = document.getElementById('prevBtn');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.renderAssets();
                }
            });
        }

        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalItems = this.filterAssets().length;
                const totalPages = Math.ceil(totalItems / this.perPage);
                
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.renderAssets();
                }
            });
        }

        // Category form
        const categoryForm = document.getElementById('categoryForm');
        if (categoryForm) {
            categoryForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitCategoryForm();
            });
        }

        const categoryCancelBtn = document.getElementById('categoryCancelBtn');
        if (categoryCancelBtn) {
            categoryCancelBtn.addEventListener('click', () => {
                this.resetCategoryForm();
            });
        }

        // Asset form
        const addAssetBtn = document.getElementById('addAssetBtn');
        if (addAssetBtn) {
            addAssetBtn.addEventListener('click', () => {
                this.openAssetModal();
            });
        }

        const assetForm = document.getElementById('assetForm');
        if (assetForm) {
            assetForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitAssetForm();
            });
        }

        const assetCategory = document.getElementById('assetCategory');
        if (assetCategory) {
            assetCategory.addEventListener('change', (e) => {
                this.toggleSpecifications(e.target.value);
                this.generateAssetCode();
            });
        }

        // Photo preview
        const assetPhoto = document.getElementById('assetPhoto');
        if (assetPhoto) {
            assetPhoto.addEventListener('change', (e) => {
                this.handlePhotoPreview(e);
            });
        }

        // Export/Import
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportAssets();
            });
        }

        const importForm = document.getElementById('importForm');
        if (importForm) {
            importForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.importAssets();
            });
        }

        // Scan functionality
        const scanBtn = document.getElementById('scanBtn');
        if (scanBtn) {
            scanBtn.addEventListener('click', () => {
                this.openScanModal();
            });
        }

        const startScanBtn = document.getElementById('startScanBtn');
        if (startScanBtn) {
            startScanBtn.addEventListener('click', () => {
                this.startScanning();
            });
        }

        const stopScanBtn = document.getElementById('stopScanBtn');
        if (stopScanBtn) {
            stopScanBtn.addEventListener('click', () => {
                this.stopScanning();
            });
        }

        const useScanResultBtn = document.getElementById('useScanResultBtn');
        if (useScanResultBtn) {
            useScanResultBtn.addEventListener('click', () => {
                this.useScanResult();
            });
        }

        // Close scan modal event
        const scanModal = document.getElementById('scanModal');
        if (scanModal) {
            scanModal.addEventListener('hidden.bs.modal', () => {
                this.stopScanning();
            });
        }
    }

    showSection(sectionName) {
        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });

        // Remove active class from all sidebar links
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.classList.remove('active');
        });

        // Show selected section
        const sectionElement = document.getElementById(`${sectionName}-section`);
        if (sectionElement) {
            sectionElement.classList.add('active');
        }
        
        // Activate sidebar link
        const sidebarLink = document.querySelector(`[data-tab="${sectionName}"]`);
        if (sidebarLink) {
            sidebarLink.classList.add('active');
        }

        // Reset page for assets section
        if (sectionName === 'aset') {
            this.currentPage = 1;
            this.renderAssets();
        }
    }

    // Category Methods
    async submitCategoryForm() {
        const categoryId = document.getElementById('categoryId');
        const categoryName = document.getElementById('categoryName');
        const submitBtn = document.getElementById('categorySubmitBtn');

        if (!categoryName || !submitBtn) return;

        const categoryNameValue = categoryName.value.trim();
        const categoryIdValue = categoryId ? categoryId.value : '';

        if (!categoryNameValue) {
            this.showToast('Nama kategori harus diisi!', 'warning');
            return;
        }

        // Check for duplicate category name
        const isDuplicate = this.categories.some(cat => 
            cat.nameCategory.toLowerCase() === categoryNameValue.toLowerCase() && 
            cat.id != categoryIdValue
        );

        if (isDuplicate) {
            this.showToast('Nama kategori sudah ada!', 'warning');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Menyimpan...';

        try {
            let response;
            if (categoryIdValue) {
                // Update existing category
                response = await this.apiCall(`/update-category/${categoryIdValue}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nameCategory: categoryNameValue })
                });
                this.showToast('Kategori berhasil diperbarui', 'success');
            } else {
                // Add new category
                response = await this.apiCall('/add-category', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nameCategory: categoryNameValue })
                });
                this.showToast('Kategori berhasil ditambahkan', 'success');
            }

            await this.loadCategories();
            this.resetCategoryForm();
        } catch (error) {
            console.error('Error saving category:', error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = categoryIdValue ? 'Update Kategori' : 'Tambah Kategori';
        }
    }

    editCategory(categoryId) {
        const category = this.categories.find(cat => cat.id == categoryId);
        if (!category) return;

        const categoryIdElement = document.getElementById('categoryId');
        const categoryName = document.getElementById('categoryName');
        const categoryFormTitle = document.getElementById('categoryFormTitle');
        const categorySubmitBtn = document.getElementById('categorySubmitBtn');
        const categoryCancelBtn = document.getElementById('categoryCancelBtn');

        if (categoryIdElement) categoryIdElement.value = category.id;
        if (categoryName) categoryName.value = category.nameCategory;
        if (categoryFormTitle) categoryFormTitle.innerHTML = '<i class="fa-solid fa-edit me-2"></i>Edit Kategori';
        if (categorySubmitBtn) categorySubmitBtn.innerHTML = 'Update Kategori';
        if (categoryCancelBtn) categoryCancelBtn.style.display = 'block';
        
        // Focus on the input field
        if (categoryName) categoryName.focus();
    }

    async deleteCategory(categoryId) {
        const category = this.categories.find(cat => cat.id == categoryId);
        if (!category) return;

        // Check if category is being used by any asset
        const isUsed = this.assets.some(asset => asset.nameCategory === category.nameCategory);
        
        if (isUsed) {
            this.showToast('Tidak dapat menghapus kategori karena sedang digunakan oleh beberapa aset', 'danger');
            return;
        }

        if (!confirm(`Yakin ingin menghapus kategori "${category.nameCategory}"?`)) return;

        try {
            await this.apiCall(`/delete-category/${categoryId}`, {
                method: 'DELETE'
            });
            
            this.showToast('Kategori berhasil dihapus', 'success');
            await this.loadCategories();
        } catch (error) {
            console.error('Error deleting category:', error);
        }
    }

    resetCategoryForm() {
        const categoryForm = document.getElementById('categoryForm');
        const categoryId = document.getElementById('categoryId');
        const categoryFormTitle = document.getElementById('categoryFormTitle');
        const categorySubmitBtn = document.getElementById('categorySubmitBtn');
        const categoryCancelBtn = document.getElementById('categoryCancelBtn');

        if (categoryForm) categoryForm.reset();
        if (categoryId) categoryId.value = '';
        if (categoryFormTitle) categoryFormTitle.innerHTML = '<i class="fa-solid fa-plus me-2"></i>Tambah Kategori';
        if (categorySubmitBtn) categorySubmitBtn.innerHTML = 'Tambah Kategori';
        if (categoryCancelBtn) categoryCancelBtn.style.display = 'none';
    }

    // Asset Methods
    openAssetModal(assetId = null) {
        this.currentAssetId = assetId;
        const modalElement = document.getElementById('assetModal');
        if (!modalElement) return;

        const modal = new bootstrap.Modal(modalElement);
        const modalTitle = document.getElementById('assetModalTitle');
        const submitBtn = document.getElementById('assetSubmitBtn');

        if (assetId) {
            // Edit mode
            const asset = this.assets.find(a => a.id == assetId);
            if (asset) {
                this.populateAssetForm(asset);
                if (modalTitle) modalTitle.textContent = 'Edit Aset';
                if (submitBtn) submitBtn.textContent = 'Update Aset';
            }
        } else {
            // Add mode
            this.resetAssetForm();
            if (modalTitle) modalTitle.textContent = 'Tambah Aset Baru';
            if (submitBtn) submitBtn.textContent = 'Simpan Aset';
        }

        modal.show();
    }

    populateAssetForm(asset) {
        const fields = {
            'assetCategory': asset.nameCategory,
            'assetCode': asset.kodeAsset,
            'assetBrand': asset.brand,
            'assetSerial': asset.serialNumber,
            'assetDescription': asset.description,
            'assetPurchaseDate': asset.purchaseDate,
            'assetQuantity': asset.quantity,
            'assetPrice': asset.price,
            'assetDivision': asset.division,
            'assetUsername': asset.username,
            'assetProcessor': asset.processor || '',
            'assetRam': asset.ram || '',
            'assetHdd': asset.hdd || '',
            'assetOs': asset.os || ''
        };

        Object.entries(fields).forEach(([fieldId, value]) => {
            const element = document.getElementById(fieldId);
            if (element) element.value = value;
        });

        this.toggleSpecifications(asset.nameCategory);
        this.showCurrentPhoto(asset.photo);
    }

    resetAssetForm() {
        const assetForm = document.getElementById('assetForm');
        if (assetForm) assetForm.reset();
        
        const purchaseDate = document.getElementById('assetPurchaseDate');
        if (purchaseDate) purchaseDate.value = new Date().toISOString().split('T')[0];
        
        const quantity = document.getElementById('assetQuantity');
        if (quantity) quantity.value = '1';
        
        this.toggleSpecifications('');
        this.hidePhotoPreview();
        this.currentAssetId = null;
        this.currentPhotoFile = null;
        
        // Generate initial asset code
        this.generateAssetCode();
    }

    toggleSpecifications(category) {
        const specsSection = document.getElementById('specsSection');
        if (!specsSection) return;

        const needsSpec = ['laptop', 'komputer'].includes(category?.toLowerCase());
        
        if (needsSpec) {
            specsSection.style.display = 'block';
            
            // Set required fields for specs
            const specFields = ['assetProcessor', 'assetRam', 'assetHdd', 'assetOs'];
            specFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.required = true;
                    const label = field.previousElementSibling;
                    if (label && !label.classList.contains('required')) {
                        label.classList.add('required');
                    }
                }
            });
        } else {
            specsSection.style.display = 'none';
            
            // Remove required from spec fields
            const specFields = ['assetProcessor', 'assetRam', 'assetHdd', 'assetOs'];
            specFields.forEach(fieldId => {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.required = false;
                    const label = field.previousElementSibling;
                    if (label) {
                        label.classList.remove('required');
                    }
                }
            });
        }
    }

    generateAssetCode() {
        const category = document.getElementById('assetCategory');
        const code = document.getElementById('assetCode');
        
        if (!category || !code || this.currentAssetId) return;

        const categoryValue = category.value;
        if (!categoryValue) return;

        const prefix = categoryValue.substring(0, 3).toUpperCase();
        const timestamp = Date.now().toString().slice(-4);
        const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        code.value = `${prefix}-${timestamp}${random}`;
    }

    handlePhotoPreview(event) {
        const file = event.target.files[0];
        const previewContainer = document.getElementById('photoPreviewContainer');
        const preview = document.getElementById('photoPreview');
        const currentPhotoInfo = document.getElementById('currentPhotoInfo');

        if (!file) {
            this.hidePhotoPreview();
            return;
        }

        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showToast('Hanya file gambar yang diizinkan!', 'warning');
            event.target.value = '';
            this.hidePhotoPreview();
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.showToast('Ukuran file maksimal 5MB!', 'warning');
            event.target.value = '';
            this.hidePhotoPreview();
            return;
        }

        this.currentPhotoFile = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = function(e) {
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = 'block';
            }
            if (previewContainer) {
                previewContainer.style.display = 'block';
            }
            if (currentPhotoInfo) {
                currentPhotoInfo.innerHTML = `
                    <div class="text-success">
                        <i class="fa-solid fa-check"></i> File siap diupload: ${file.name}
                    </div>
                `;
            }
        };
        reader.readAsDataURL(file);
    }

    showCurrentPhoto(photoFilename) {
        const previewContainer = document.getElementById('photoPreviewContainer');
        const preview = document.getElementById('photoPreview');
        const currentPhotoInfo = document.getElementById('currentPhotoInfo');

        if (photoFilename) {
            if (preview) {
                preview.src = `/uploads/${photoFilename}`;
                preview.style.display = 'block';
                preview.onerror = () => {
                    if (preview) preview.style.display = 'none';
                    if (currentPhotoInfo) {
                        currentPhotoInfo.innerHTML = `
                            <div class="text-warning">
                                <i class="fa-solid fa-exclamation-triangle"></i> Foto tidak ditemukan: ${photoFilename}
                            </div>
                        `;
                    }
                };
            }
            if (previewContainer) {
                previewContainer.style.display = 'block';
            }
            if (currentPhotoInfo) {
                currentPhotoInfo.innerHTML = `
                    <div class="text-info">
                        <i class="fa-solid fa-image"></i> Foto saat ini: ${photoFilename}
                    </div>
                `;
            }
        } else {
            this.hidePhotoPreview();
        }
    }

    hidePhotoPreview() {
        const previewContainer = document.getElementById('photoPreviewContainer');
        const preview = document.getElementById('photoPreview');
        const currentPhotoInfo = document.getElementById('currentPhotoInfo');

        if (previewContainer) previewContainer.style.display = 'none';
        if (preview) {
            preview.src = '#';
            preview.style.display = 'none';
        }
        if (currentPhotoInfo) currentPhotoInfo.innerHTML = '';
    }

    async submitAssetForm() {
        const submitBtn = document.getElementById('assetSubmitBtn');

        if (!submitBtn) return;

        // Validasi form manual
        const requiredFields = [
            'assetCategory', 'assetCode', 'assetBrand', 'assetSerial',
            'assetDescription', 'assetPurchaseDate', 'assetQuantity',
            'assetPrice', 'assetDivision', 'assetUsername'
        ];

        const missingFields = [];
        for (const fieldId of requiredFields) {
            const field = document.getElementById(fieldId);
            if (field && (!field.value || field.value.trim() === '')) {
                const fieldName = fieldId.replace('asset', '').replace(/([A-Z])/g, ' $1').toLowerCase();
                missingFields.push(fieldName);
            }
        }

        // Validasi spesifikasi untuk laptop/komputer
        const category = document.getElementById('assetCategory').value;
        const needsSpec = ['laptop', 'komputer'].includes(category?.toLowerCase());
        
        if (needsSpec) {
            const specFields = ['assetProcessor', 'assetRam', 'assetHdd', 'assetOs'];
            const missingSpecs = [];
            
            for (const fieldId of specFields) {
                const field = document.getElementById(fieldId);
                if (field && (!field.value || field.value.trim() === '')) {
                    const fieldName = fieldId.replace('asset', '').replace(/([A-Z])/g, ' $1').toLowerCase();
                    missingSpecs.push(fieldName);
                }
            }
            
            if (missingSpecs.length > 0) {
                this.showToast(`Untuk kategori ${category}, field berikut harus diisi: ${missingSpecs.join(', ')}`, 'warning');
                return;
            }
        }

        if (missingFields.length > 0) {
            this.showToast(`Field berikut harus diisi: ${missingFields.join(', ')}`, 'warning');
            return;
        }

        // Buat FormData secara manual
        const formData = new FormData();
        
        // Tambahkan semua field secara eksplisit
        formData.append('nameCategory', document.getElementById('assetCategory').value);
        formData.append('kodeAsset', document.getElementById('assetCode').value);
        formData.append('brand', document.getElementById('assetBrand').value);
        formData.append('serialNumber', document.getElementById('assetSerial').value);
        formData.append('description', document.getElementById('assetDescription').value);
        formData.append('purchaseDate', document.getElementById('assetPurchaseDate').value);
        formData.append('quantity', document.getElementById('assetQuantity').value);
        formData.append('price', document.getElementById('assetPrice').value);
        formData.append('division', document.getElementById('assetDivision').value);
        formData.append('username', document.getElementById('assetUsername').value);

        // Tambahkan field spesifikasi jika diperlukan
        if (needsSpec) {
            formData.append('processor', document.getElementById('assetProcessor').value);
            formData.append('ram', document.getElementById('assetRam').value);
            formData.append('hdd', document.getElementById('assetHdd').value);
            formData.append('os', document.getElementById('assetOs').value);
        }

        // Add photo file if selected
        if (this.currentPhotoFile) {
            formData.append('photo', this.currentPhotoFile);
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Menyimpan...';

        try {
            let endpoint = '/add-asset';
            let method = 'POST';

            if (this.currentAssetId) {
                endpoint = `/update-asset/${this.currentAssetId}`;
                method = 'PUT';
            }

            await this.apiCall(endpoint, {
                method: method,
                body: formData
            });

            this.showToast(`Aset berhasil ${this.currentAssetId ? 'diperbarui' : 'ditambahkan'}`, 'success');
            await this.loadAssets();
            this.resetAssetForm();
            
            const modalElement = document.getElementById('assetModal');
            if (modalElement) {
                const modal = bootstrap.Modal.getInstance(modalElement);
                if (modal) modal.hide();
            }
        } catch (error) {
            console.error('Error saving asset:', error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = this.currentAssetId ? 'Update Aset' : 'Simpan Aset';
        }
    }

    editAsset(assetId) {
        this.openAssetModal(assetId);
    }

    viewAsset(assetId) {
        const asset = this.assets.find(a => a.id == assetId);
        if (!asset) return;

        const needsSpec = ['laptop', 'komputer'].includes(asset.nameCategory?.toLowerCase());
        let specsText = '';
        
        if (needsSpec) {
            specsText = `
Prosesor: ${asset.processor || '-'}
RAM: ${asset.ram || '-'}
Storage: ${asset.hdd || '-'}
OS: ${asset.os || '-'}
            `;
        }

        let photoText = '';
        if (asset.photo) {
            photoText = `Foto: Tersedia (${asset.photo})`;
        } else {
            photoText = 'Foto: Tidak tersedia';
        }

        const details = `
KODE: ${asset.kodeAsset}
KATEGORI: ${asset.nameCategory}
BRAND: ${asset.brand}
SERIAL: ${asset.serialNumber}
DESKRIPSI: ${asset.description}
DIVISI: ${asset.division}
PENGGUNA: ${asset.username}
TANGGAL: ${this.formatDate(asset.purchaseDate)}
QUANTITY: ${asset.quantity}
HARGA: ${this.formatCurrency(asset.price)}
${photoText}
${specsText}
        `.trim();
        
        alert('DETAIL ASET:\n\n' + details);
    }

    async deleteAsset(assetId) {
        const asset = this.assets.find(a => a.id == assetId);
        if (!asset) return;

        if (!confirm(`Yakin ingin menghapus aset "${asset.kodeAsset} - ${asset.description}"?`)) return;

        try {
            await this.apiCall(`/delete-asset/${assetId}`, {
                method: 'DELETE'
            });
            
            this.showToast('Aset berhasil dihapus', 'success');
            await this.loadAssets();
        } catch (error) {
            console.error('Error deleting asset:', error);
        }
    }

    printLabel(assetId) {
        const asset = this.assets.find(a => a.id == assetId);
        if (!asset) return;

        const printWindow = window.open('', '_blank', 'width=400,height=500');
        const barcodeURL = `https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(asset.kodeAsset)}&code=MobileQRCode&eclevel=L`;
        
        const labelHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Label Aset - ${this.escapeHtml(asset.kodeAsset)}</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 20px;
            text-align: center;
            background: white;
        }
        .label { 
            border: 2px solid #333;
            padding: 15px;
            margin: 10px auto;
            max-width: 300px;
            background: white;
        }
        .barcode { 
            width: 150px; 
            height: 150px;
            margin: 10px auto;
            display: block;
        }
        .asset-info { 
            text-align: left;
            margin: 10px 0;
            font-size: 12px;
        }
        .asset-info div {
            margin: 2px 0;
            padding: 1px 0;
        }
        .company {
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 10px;
            border-bottom: 1px solid #333;
            padding-bottom: 5px;
        }
        @media print {
            body { margin: 0; }
            .label { border: 1px solid #000; margin: 0; }
        }
    </style>
</head>
<body>
    <div class="label">
        <div class="company">PT. Kaiti Global Indonesia</div>
        <img src="${barcodeURL}" alt="QR Code" class="barcode">
        <div class="asset-info">
            <div><strong>Kode:</strong> ${this.escapeHtml(asset.kodeAsset)}</div>
            <div><strong>Kategori:</strong> ${this.escapeHtml(asset.nameCategory)}</div>
            <div><strong>Brand:</strong> ${this.escapeHtml(asset.brand)}</div>
            <div><strong>Serial:</strong> ${this.escapeHtml(asset.serialNumber)}</div>
            <div><strong>Tanggal:</strong> ${this.formatDate(asset.purchaseDate)}</div>
            <div><strong>Divisi:</strong> ${this.escapeHtml(asset.division)}</div>
            <div><strong>User:</strong> ${this.escapeHtml(asset.username)}</div>
        </div>
    </div>
    <script>
        window.onload = function() {
            window.print();
            setTimeout(() => {
                window.close();
            }, 500);
        }
    </script>
</body>
</html>`;
        
        printWindow.document.write(labelHTML);
        printWindow.document.close();
    }

    // Barcode Scanning Methods
    openScanModal() {
        const scanModal = new bootstrap.Modal(document.getElementById('scanModal'));
        scanModal.show();
        
        // Reset scan result
        const scanResult = document.getElementById('scanResult');
        if (scanResult) {
            scanResult.value = '';
        }
        
        const useScanResultBtn = document.getElementById('useScanResultBtn');
        if (useScanResultBtn) {
            useScanResultBtn.disabled = true;
        }
    }

    async startScanning() {
        try {
            this.codeReader = new ZXing.BrowserMultiFormatReader();
            
            const videoElement = document.getElementById('scanner-video');
            const startScanBtn = document.getElementById('startScanBtn');
            const stopScanBtn = document.getElementById('stopScanBtn');
            
            if (!videoElement) {
                throw new Error('Video element not found');
            }

            // Get available video inputs
            const videoInputDevices = await ZXing.BrowserCodeReader.listVideoInputDevices();
            
            let selectedDeviceId;
            if (videoInputDevices.length > 0) {
                // Use back camera if available, otherwise use first camera
                const backCamera = videoInputDevices.find(device => 
                    device.label.toLowerCase().includes('back') || 
                    device.label.toLowerCase().includes('rear')
                );
                selectedDeviceId = backCamera ? backCamera.deviceId : videoInputDevices[0].deviceId;
            }

            // Update UI
            if (startScanBtn) startScanBtn.disabled = true;
            if (stopScanBtn) stopScanBtn.disabled = false;

            this.isScanning = true;

            // Start decoding
            this.codeReader.decodeFromVideoDevice(
                selectedDeviceId,
                videoElement,
                (result, error) => {
                    if (result) {
                        this.handleScanResult(result.text);
                    }
                    
                    if (error && !(error instanceof ZXing.NotFoundException)) {
                        console.error('Scan error:', error);
                    }
                }
            );

            this.showToast('Scanning dimulai. Arahkan kamera ke barcode/QR code.', 'info');

        } catch (error) {
            console.error('Error starting scan:', error);
            this.showToast('Gagal memulai scan: ' + error.message, 'danger');
            
            // Reset UI
            const startScanBtn = document.getElementById('startScanBtn');
            const stopScanBtn = document.getElementById('stopScanBtn');
            if (startScanBtn) startScanBtn.disabled = false;
            if (stopScanBtn) stopScanBtn.disabled = true;
        }
    }

    stopScanning() {
        if (this.codeReader) {
            this.codeReader.reset();
            this.codeReader = null;
        }

        this.isScanning = false;

        // Stop video stream
        const videoElement = document.getElementById('scanner-video');
        if (videoElement && videoElement.srcObject) {
            const tracks = videoElement.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            videoElement.srcObject = null;
        }

        // Update UI
        const startScanBtn = document.getElementById('startScanBtn');
        const stopScanBtn = document.getElementById('stopScanBtn');
        if (startScanBtn) startScanBtn.disabled = false;
        if (stopScanBtn) stopScanBtn.disabled = true;

        this.showToast('Scanning dihentikan', 'info');
    }

    handleScanResult(resultText) {
        console.log('Scan result:', resultText);
        
        const scanResult = document.getElementById('scanResult');
        const useScanResultBtn = document.getElementById('useScanResultBtn');
        
        if (scanResult) {
            scanResult.value = resultText;
        }
        
        if (useScanResultBtn) {
            useScanResultBtn.disabled = false;
        }

        // Auto-stop scanning after successful scan
        this.stopScanning();
        
        // Play success sound (optional)
        this.playScanSuccessSound();
        
        this.showToast('Barcode berhasil dipindai!', 'success');
    }

    useScanResult() {
        const scanResult = document.getElementById('scanResult');
        const searchInput = document.getElementById('searchInput');
        
        if (scanResult && scanResult.value && searchInput) {
            searchInput.value = scanResult.value;
            
            // Close modal
            const scanModal = bootstrap.Modal.getInstance(document.getElementById('scanModal'));
            if (scanModal) {
                scanModal.hide();
            }
            
            // Trigger search
            this.currentPage = 1;
            this.renderAssets();
            
            this.showToast('Hasil scan diterapkan ke pencarian', 'success');
        }
    }

    playScanSuccessSound() {
        // Create a simple beep sound
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.2);
        } catch (error) {
            console.log('Audio not supported:', error);
        }
    }

    // Export/Import Methods
    async exportAssets() {
        if (this.assets.length === 0) {
            this.showToast('Tidak ada data untuk diekspor', 'warning');
            return;
        }

        try {
            const response = await fetch('/export-assets', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) {
                throw new Error('Gagal mengekspor data');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            
            link.href = url;
            link.download = `assets-export-${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            this.showToast('Data berhasil diekspor', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Gagal mengekspor data', 'danger');
        }
    }

    async importAssets() {
        const fileInput = document.getElementById('excelFile');
        if (!fileInput) return;

        const file = fileInput.files[0];

        if (!file) {
            this.showToast('Pilih file Excel terlebih dahulu', 'warning');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            await this.apiCall('/import-assets', {
                method: 'POST',
                body: formData
            });
            
            this.showToast('Data berhasil diimpor', 'success');
            await this.loadAssets();
            
            // Reset file input
            fileInput.value = '';
        } catch (error) {
            console.error('Import error:', error);
        }
    }

    // Utility Methods
    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    }

    showToast(message, type = "success", title = "Notification") {
        const toastEl = document.getElementById('toast');
        const toastTitle = document.getElementById('toast-title');
        const toastMessage = document.getElementById('toast-message');
        
        if (toastEl && toastTitle && toastMessage) {
            // Set toast content
            toastTitle.textContent = title;
            toastMessage.textContent = message;
            
            // Set toast style based on type
            const toast = new bootstrap.Toast(toastEl);
            
            // Remove existing color classes
            toastEl.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-info');
            
            // Add new color class
            const bgClass = `bg-${type}`;
            toastEl.classList.add(bgClass, 'text-white');
            
            toast.show();
        } else {
            // Fallback alert
            alert(`${title}: ${message}`);
        }
    }

    logout() {
        if (confirm("Yakin ingin logout?")) {
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            this.showToast('Logout berhasil', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        }
    }
}

// Buat instance global untuk akses dari HTML
let assetManager;

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    assetManager = new AssetManager();
});

// Handle window resize for responsive sidebar
window.addEventListener('resize', function() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (window.innerWidth > 768 && sidebar && mainContent) {
        sidebar.classList.remove('active');
        mainContent.classList.remove('sidebar-active');
    }
});