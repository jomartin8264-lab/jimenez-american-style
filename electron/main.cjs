const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow;
let localServer;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function startLocalServer(distPath) {
  return new Promise((resolve, reject) => {
    localServer = http.createServer((req, res) => {
      let reqPath = decodeURI(req.url.split('?')[0]);
      if (reqPath === '/') reqPath = '/index.html';

      let filePath = path.join(distPath, reqPath);

      // Si el archivo solicitado existe en dist, sírvelo
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
      } else {
        // Enrutamiento SPA: sirve index.html para rutas como /pos, /admin, etc.
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      }
    });

    localServer.listen(0, '127.0.0.1', () => {
      const port = localServer.address().port;
      resolve(port);
    });

    localServer.on('error', reject);
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'Punto de Venta - Tienda Alina',
    icon: path.join(__dirname, '../logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Maximizar ventana al abrir para comodidad en mostrador
  mainWindow.maximize();

  // Quitar menú por defecto para aspecto de aplicación moderna y limpia
  Menu.setApplicationMenu(null);

  const isDev = process.env.ELECTRON_DEV === 'true';

  if (isDev) {
    // Modo desarrollo: conectar a Vite dev server
    mainWindow.loadURL('http://localhost:5173/pos');
  } else {
    // Modo producción: servir dist compilado con servidor local
    const distPath = path.join(__dirname, '../dist');
    try {
      const port = await startLocalServer(distPath);
      mainWindow.loadURL(`http://127.0.0.1:${port}/pos`);
    } catch (err) {
      console.error('Error iniciando servidor local de Electron:', err);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (localServer) localServer.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
