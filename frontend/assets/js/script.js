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
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            mainContent.classList.add('sidebar-active');
        });

        sidebarCollapse.addEventListener('click', () => {
            sidebar.classList.remove('active');
            mainContent.classList.remove('sidebar-active');
        });

        // Close sidebar when clicking on overlay (mobile)
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 && 
                !sidebar.contains(e.target) && 
                !sidebarToggle.contains(e.target) &&
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
        if (!this.token || !this.username) {
            window.location.href = '/';
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
        } catch (e) {
            this.showToast('Token tidak valid', 'danger');
            this.logout();
            return false;
        }

        return true;
    }

    async apiCall(endpoint, options = {}) {
        const config = {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(endpoint, config);
            
            if (response.status === 401) {
                this.showToast('Sesi telah kedaluwarsa', 'warning');
                this.logout();
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
        
        categoriesCount.textContent = this.categories.length;
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
        categoryFilter.innerHTML = '<option value="">Semua Kategori</option>' +
            this.categories.map(cat => 
                `<option value="${this.escapeHtml(cat.nameCategory)}">${this.escapeHtml(cat.nameCategory)}</option>`
            ).join('');
    }

    populateAssetCategorySelect() {
        const assetCategory = document.getElementById('assetCategory');
        assetCategory.innerHTML = '<option value="" disabled selected>Pilih Kategori</option>' +
            this.categories.map(cat => 
                `<option value="${this.escapeHtml(cat.nameCategory)}">${this.escapeHtml(cat.nameCategory)}</option>`
            ).join('');
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

        totalAssets.textContent = `Total: ${this.assets.length}`;
        if (totalAssetsMobile) {
            totalAssetsMobile.textContent = `Total: ${this.assets.length}`;
        }
        showingCount.textContent = paginatedAssets.length;
        totalCount.textContent = filteredAssets.length;

        if (paginatedAssets.length === 0) {
            assetsTableBody.innerHTML = `
                <tr>
                    <td colspan="13" class="text-center text-muted py-4">
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

    attachAssetEventListeners() {
        const assetsTableBody = document.getElementById('assetsTableBody');
        
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
        const searchQuery = document.getElementById('searchInput').value.toLowerCase();
        const categoryFilter = document.getElementById('categoryFilter').value;
        const codeFilter = document.getElementById('codeFilter').value.toLowerCase();
        const brandFilter = document.getElementById('brandFilter').value.toLowerCase();

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
            if (categoryFilter && asset.nameCategory !== categoryFilter) {
                return false;
            }

            // Code filter
            if (codeFilter && !asset.kodeAsset.toLowerCase().includes(codeFilter)) {
                return false;
            }

            // Brand filter
            if (brandFilter && !asset.brand.toLowerCase().includes(brandFilter)) {
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
        const totalPages = Math.ceil(totalItems / this.perPage);
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');

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
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });

        // Asset filters
        document.getElementById('searchInput').addEventListener('input', () => {
            this.currentPage = 1;
            this.renderAssets();
        });

        document.getElementById('categoryFilter').addEventListener('change', () => {
            this.currentPage = 1;
            this.renderAssets();
        });

        document.getElementById('codeFilter').addEventListener('input', () => {
            this.currentPage = 1;
            this.renderAssets();
        });

        document.getElementById('brandFilter').addEventListener('input', () => {
            this.currentPage = 1;
            this.renderAssets();
        });

        // Pagination
        document.getElementById('prevBtn').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderAssets();
            }
        });

        document.getElementById('nextBtn').addEventListener('click', () => {
            const totalItems = this.filterAssets().length;
            const totalPages = Math.ceil(totalItems / this.perPage);
            
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderAssets();
            }
        });

        // Category form
        document.getElementById('categoryForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitCategoryForm();
        });

        document.getElementById('categoryCancelBtn').addEventListener('click', () => {
            this.resetCategoryForm();
        });

        // Asset form
        document.getElementById('addAssetBtn').addEventListener('click', () => {
            this.openAssetModal();
        });

        document.getElementById('assetForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitAssetForm();
        });

        document.getElementById('assetCategory').addEventListener('change', (e) => {
            this.toggleSpecifications(e.target.value);
        });

        // Export/Import
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportAssets();
        });

        document.getElementById('importForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.importAssets();
        });

        // Scan button
        document.getElementById('scanBtn').addEventListener('click', () => {
            this.showToast('Fitur scan akan segera hadir', 'info');
        });

        // Auto-generate asset code when category is selected
        document.getElementById('assetCategory').addEventListener('change', () => {
            this.generateAssetCode();
        });
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
        document.getElementById(`${sectionName}-section`).classList.add('active');
        
        // Activate sidebar link
        document.querySelector(`[data-tab="${sectionName}"]`).classList.add('active');

        // Reset page for assets section
        if (sectionName === 'aset') {
            this.currentPage = 1;
            this.renderAssets();
        }
    }

    // Category Methods
    async submitCategoryForm() {
        const categoryId = document.getElementById('categoryId').value;
        const categoryName = document.getElementById('categoryName').value.trim();
        const submitBtn = document.getElementById('categorySubmitBtn');

        if (!categoryName) {
            this.showToast('Nama kategori harus diisi!', 'warning');
            return;
        }

        // Check for duplicate category name
        const isDuplicate = this.categories.some(cat => 
            cat.nameCategory.toLowerCase() === categoryName.toLowerCase() && 
            cat.id != categoryId
        );

        if (isDuplicate) {
            this.showToast('Nama kategori sudah ada!', 'warning');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Menyimpan...';

        try {
            if (categoryId) {
                // Update existing category
                await this.apiCall(`/update-category/${categoryId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nameCategory: categoryName })
                });
                this.showToast('Kategori berhasil diperbarui', 'success');
            } else {
                // Add new category
                await this.apiCall('/add-category', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nameCategory: categoryName })
                });
                this.showToast('Kategori berhasil ditambahkan', 'success');
            }

            await this.loadCategories();
            this.resetCategoryForm();
        } catch (error) {
            console.error('Error saving category:', error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = categoryId ? 'Update Kategori' : 'Tambah Kategori';
        }
    }

    editCategory(categoryId) {
        const category = this.categories.find(cat => cat.id == categoryId);
        if (!category) return;

        document.getElementById('categoryId').value = category.id;
        document.getElementById('categoryName').value = category.nameCategory;
        document.getElementById('categoryFormTitle').innerHTML = '<i class="fa-solid fa-edit me-2"></i>Edit Kategori';
        document.getElementById('categorySubmitBtn').innerHTML = 'Update Kategori';
        document.getElementById('categoryCancelBtn').style.display = 'block';
        
        // Focus on the input field
        document.getElementById('categoryName').focus();
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
        document.getElementById('categoryForm').reset();
        document.getElementById('categoryId').value = '';
        document.getElementById('categoryFormTitle').innerHTML = '<i class="fa-solid fa-plus me-2"></i>Tambah Kategori';
        document.getElementById('categorySubmitBtn').innerHTML = 'Tambah Kategori';
        document.getElementById('categoryCancelBtn').style.display = 'none';
    }

    // Asset Methods
    openAssetModal(assetId = null) {
        this.currentAssetId = assetId;
        const modal = new bootstrap.Modal(document.getElementById('assetModal'));
        const modalTitle = document.getElementById('assetModalTitle');
        const submitBtn = document.getElementById('assetSubmitBtn');

        if (assetId) {
            // Edit mode
            const asset = this.assets.find(a => a.id == assetId);
            if (asset) {
                this.populateAssetForm(asset);
                modalTitle.textContent = 'Edit Aset';
                submitBtn.textContent = 'Update Aset';
            }
        } else {
            // Add mode
            this.resetAssetForm();
            modalTitle.textContent = 'Tambah Aset Baru';
            submitBtn.textContent = 'Simpan Aset';
        }

        modal.show();
    }

    populateAssetForm(asset) {
        document.getElementById('assetCategory').value = asset.nameCategory;
        document.getElementById('assetCode').value = asset.kodeAsset;
        document.getElementById('assetBrand').value = asset.brand;
        document.getElementById('assetSerial').value = asset.serialNumber;
        document.getElementById('assetDescription').value = asset.description;
        document.getElementById('assetPurchaseDate').value = asset.purchaseDate;
        document.getElementById('assetQuantity').value = asset.quantity;
        document.getElementById('assetPrice').value = asset.price;
        document.getElementById('assetDivision').value = asset.division;
        document.getElementById('assetUsername').value = asset.username;
        
        // Specifications
        document.getElementById('assetProcessor').value = asset.processor || '';
        document.getElementById('assetRam').value = asset.ram || '';
        document.getElementById('assetHdd').value = asset.hdd || '';
        document.getElementById('assetOs').value = asset.os || '';

        this.toggleSpecifications(asset.nameCategory);
    }

    resetAssetForm() {
        document.getElementById('assetForm').reset();
        document.getElementById('assetPurchaseDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('assetQuantity').value = '1';
        document.getElementById('specsSection').style.display = 'none';
        this.currentAssetId = null;
        
        // Generate initial asset code
        this.generateAssetCode();
    }

    toggleSpecifications(category) {
        const specsSection = document.getElementById('specsSection');
        const needsSpec = ['laptop', 'komputer'].includes(category?.toLowerCase());
        
        if (needsSpec) {
            specsSection.style.display = 'block';
            // Add required attribute to spec inputs
            ['assetProcessor', 'assetRam', 'assetHdd', 'assetOs'].forEach(id => {
                document.getElementById(id).required = true;
            });
        } else {
            specsSection.style.display = 'none';
            // Remove required attribute from spec inputs
            ['assetProcessor', 'assetRam', 'assetHdd', 'assetOs'].forEach(id => {
                document.getElementById(id).required = false;
            });
        }
    }

    generateAssetCode() {
        const category = document.getElementById('assetCategory').value;
        if (!category || this.currentAssetId) return;

        const prefix = category.substring(0, 3).toUpperCase();
        const timestamp = Date.now().toString().slice(-4);
        const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
        document.getElementById('assetCode').value = `${prefix}-${timestamp}${random}`;
    }

    async submitAssetForm() {
        const formData = new FormData();
        const submitBtn = document.getElementById('assetSubmitBtn');

        // Collect form data
        const formFields = [
            'assetCategory', 'assetCode', 'assetBrand', 'assetSerial', 
            'assetDescription', 'assetPurchaseDate', 'assetQuantity', 
            'assetPrice', 'assetDivision', 'assetUsername', 'assetProcessor', 
            'assetRam', 'assetHdd', 'assetOs'
        ];

        formFields.forEach(field => {
            const value = document.getElementById(field).value;
            const fieldName = field.replace('asset', '').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
            if (value) {
                formData.append(fieldName, value);
            }
        });

        // Add photo file if selected
        const photoFile = document.getElementById('assetPhoto').files[0];
        if (photoFile) {
            // Validate file type and size
            if (!photoFile.type.startsWith('image/')) {
                this.showToast('Hanya file gambar yang diizinkan!', 'warning');
                return;
            }
            if (photoFile.size > 5 * 1024 * 1024) {
                this.showToast('Ukuran file maksimal 5MB!', 'warning');
                return;
            }
            formData.append('photo', photoFile);
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Menyimpan...';

        try {
            if (this.currentAssetId) {
                // Update existing asset
                await this.apiCall(`/update-asset/${this.currentAssetId}`, {
                    method: 'PUT',
                    body: formData
                });
                this.showToast('Aset berhasil diperbarui', 'success');
            } else {
                // Add new asset
                await this.apiCall('/add-asset', {
                    method: 'POST',
                    body: formData
                });
                this.showToast('Aset berhasil ditambahkan', 'success');
            }

            await this.loadAssets();
            this.resetAssetForm();
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('assetModal'));
            modal.hide();
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

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    new AssetManager();
});

// Handle window resize for responsive sidebar
window.addEventListener('resize', function() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (window.innerWidth > 768) {
        sidebar.classList.remove('active');
        mainContent.classList.remove('sidebar-active');
    }
});