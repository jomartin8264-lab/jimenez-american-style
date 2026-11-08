// Helper para resolver imágenes de productos con fallback seguro

export function getProductImage(product) {
  if (!product) return '/images/brand_logo_1774572391476.png';
  const img = product.image;

  if (!img || typeof img !== 'string' || img.trim() === '') {
    return '/images/brand_logo_1774572391476.png';
  }

  // Devolver siempre la imagen real subida por el usuario
  return img.trim();
}

// Comprime una imagen seleccionada por el usuario en formato WebP/JPEG Base64
// para guardarla directamente en Firestore sin depender de servicios externos
export function compressImageToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Generar JPEG comprimido a 75% de calidad (pesa entre 20KB y 40KB)
        const base64Data = canvas.toDataURL('image/jpeg', 0.75);
        resolve(base64Data);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
