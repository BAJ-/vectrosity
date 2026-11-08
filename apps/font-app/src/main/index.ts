import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

const createWindow = (): void => {
  const window = new BrowserWindow({ width: 1200, height: 800, title: 'Font editor' });
  // electron-vite sets ELECTRON_RENDERER_URL in development, for hot reloading.
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(join(import.meta.dirname, '../renderer/index.html'));
};

void app.whenReady().then(() => {
  createWindow();
  // macOS: re-open a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS where apps stay open.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
