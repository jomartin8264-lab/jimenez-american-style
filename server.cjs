const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 4500;
const distPath = path.join(__dirname, 'dist');

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

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  let filePath = path.join(distPath, reqPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = { 'Content-Type': contentType };
    if (ext === '.html') {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  } else {
    // SPA Fallback para React Router
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      fs.createReadStream(indexPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Archivo index.html no encontrado. Ejecuta npm run build.');
    }
  }
});

function launchBrowser() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const appUrl = `http://localhost:${PORT}/pos`;
  
  let browserCmd;
  if (fs.existsSync(chromePath)) {
    browserCmd = `start "" "${chromePath}" --app="${appUrl}"`;
  } else if (fs.existsSync(edgePath)) {
    browserCmd = `start "" "${edgePath}" --app="${appUrl}"`;
  } else {
    browserCmd = `start "" "${appUrl}"`;
  }

  exec(browserCmd);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // El servidor ya está activo en segundo plano, abrimos la ventana
    launchBrowser();
  } else {
    console.error('Error en el servidor:', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`  Punto de Venta Alina iniciado en puerto ${PORT}`);
  console.log(`===============================================`);
  launchBrowser();
});
