// Helper para resolver imágenes de productos con fallback seguro
// Reemplaza automáticamente URLs caídas de ImgBB por las imágenes locales

export function getProductImage(product) {
  if (!product) return '/images/brand_logo_1774572391476.png';
  const img = product.image;

  if (!img) return '/images/brand_logo_1774572391476.png';

  // Si la imagen viene de ImgBB (servicio gratuito que frecuentemente cae en 503)
  if (typeof img === 'string' && img.includes('ibb.co')) {
    const name = (product.name || '').toLowerCase();
    if (name.includes('meclilla') || name.includes('mezclilla') || name.includes('azul')) {
      return '/images/alina1.JPG';
    }
    if (name.includes('camisa') || name.includes('caballero')) {
      return '/images/alina2.JPG';
    }
    if (name.includes('chamarra')) {
      return '/images/alina3.JPG';
    }
    if (name.includes('dama')) {
      return '/images/alina 4.JPG';
    }
    if (name.includes('pijama') || name.includes('picachu') || name.includes('niños')) {
      return '/images/alina5.JPG';
    }
    return '/images/brand_logo_1774572391476.png';
  }

  return img;
}

// Comprime una imagen seleccionada por el usuario en formato WebP/JPEG Base64
// para guardarla directamente en Firestore sin depender de ImgBB
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
