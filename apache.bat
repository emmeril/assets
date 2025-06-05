@echo off
:: =========================================================
:: Cek apakah sudah dijalankan sebagai Administrator
:: Jika tidak, script akan meminta privilege admin dan restart
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [INFO] Meminta hak Administrator...
    powershell -Command "Start-Process '%~f0' -Verb runAs"
    exit /b
)

:: =========================================================
:: Masuk ke direktori XAMPP (otomatis sesuai lokasi file .bat)
cd /D %~dp0

echo.
echo [INFO] Menginstall Apache sebagai Windows Service...
apache\bin\httpd.exe -k install

if errorlevel 1 (
    echo [ERROR] Gagal menginstall Apache service.
    pause
    exit /b
)

echo.
echo [INFO] Menjalankan service Apache...
net start Apache2.4

if errorlevel 1 (
    echo [ERROR] Gagal menjalankan service Apache.
    pause
    exit /b
)

echo.
echo [SUCCESS] Apache berhasil diinstal sebagai service dan sedang berjalan di background.
echo Anda dapat menutup jendela ini sekarang.
pause
