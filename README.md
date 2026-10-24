# Smooth Slideshow

High-performance Windows desktop slideshow application built with Electron. Select images from a local folder or drag and drop a folder onto the welcome screen. The app recursively scans sub-folders, supports sequential and true shuffle playback, smooth GPU-accelerated transitions, Ken Burns motion effects, and blurred background padding.

## Running and Packaging

Requirements: Node.js and npm. From the project directory:

```powershell
npm ci
npm start
```

Build Windows installer (tạo bộ cài đặt Start Menu & Desktop) hoặc bản portable:

```powershell
# Tạo cả bộ cài đặt và bản portable:
npm run build

# Hoặc chỉ tạo bộ cài đặt Windows Setup (.exe):
npm run build:installer

# Hoặc chỉ tạo bản portable:
npm run build:portable
```

Các file đầu ra nằm trong thư mục `dist/`:
- `dist/Smooth-Slideshow-Setup-1.0.0.exe`: Bộ cài đặt Windows, tự động tạo shortcut trong Start Menu (tìm kiếm được qua Windows Search) và Desktop.
- `dist/Smooth-Slideshow-Portable-1.0.0.exe`: Bản chạy trực tiếp không cần cài đặt.

## Controls

- Left / Right arrows: Previous / Next image.
- Space: Pause or Resume slideshow.
- F11 or Double-click on image: Toggle Fullscreen; Escape: Exit Fullscreen.
- O: Select image folder.
- S: Toggle True Shuffle (non-repeating).
- K: Toggle Ken Burns effect (Pan & Zoom).
- I: Toggle image file name and count badge.
- Customize slide duration, transition effects, background blur, and zoom level in Settings (⚙).

Supported image formats: JPG, JPEG, PNG, WebP, BMP, GIF, TIFF, and AVIF. Display relies on Chromium's native decoder; unreadable or corrupt images are automatically skipped.

## Testing & Performance

```powershell
npm test
npm run perf
```

- `npm test`: Runs unit and integration tests verifying deck logic, true shuffle cycles, history bounds, and corrupt image handling.
- `npm run perf:scan`: Measures recursive folder scan benchmark across 10,000 files in a temporary directory.
- `npm run perf:render`: Runs an offscreen Electron smoke test rendering 1080p images to verify 60fps compositor stability.
