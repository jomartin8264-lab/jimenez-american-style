import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, increment, collection, getDocs, limit, query, orderBy } from 'firebase/firestore';

/**
 * Obtiene el siguiente lote de SKUs consecutivos e irrepetibles.
 * Utiliza un contador atómico en Firestore (config/counters -> skuSequence).
 * 
 * @param {number} count Cantidad de códigos a generar (ej. 24, 48, 100)
 * @param {string} prefix Prefijo del código (por defecto 'ALN-')
 * @returns {Promise<{ skus: string[], startSeq: number, endSeq: number }>}
 */
export async function getNextConsecutiveSKUs(count = 24, prefix = 'ALN-') {
  if (count <= 0) count = 1;
  const counterRef = doc(db, "config", "counters");
  
  let currentSeq = 1000; // Valor base por defecto

  try {
    const snap = await getDoc(counterRef);
    if (snap.exists() && typeof snap.data().skuSequence === 'number') {
      currentSeq = snap.data().skuSequence;
    } else {
      // Si el contador no existe, buscar si hay códigos existentes para no solapar
      try {
        const prodSnap = await getDocs(query(collection(db, "products"), limit(50)));
        let highest = 1000;
        prodSnap.forEach(d => {
          const c = d.data().code || d.data().sku || '';
          const match = c.match(/ALN-0*(\d+)/i);
          if (match && match[1]) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > highest && num < 1000000) {
              highest = num;
            }
          }
        });
        currentSeq = highest;
      } catch (e) {
        console.warn("No se pudo inspeccionar productos existentes para base de SKU:", e);
      }
      await setDoc(counterRef, { skuSequence: currentSeq }, { merge: true });
    }
  } catch (err) {
    console.error("Error al leer config/counters:", err);
  }

  const startSeq = currentSeq + 1;
  const endSeq = currentSeq + count;

  // Actualizar el contador en Firestore
  try {
    await updateDoc(counterRef, {
      skuSequence: increment(count),
      lastUpdated: new Date().toISOString()
    });
  } catch (err) {
    // Si falla update (ej. no existe aún el doc), intentar setDoc con merge
    await setDoc(counterRef, {
      skuSequence: endSeq,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  }

  // Generar la lista de SKUs consecutivos con formato estándar (ej. ALN-01001)
  const skus = [];
  for (let s = startSeq; s <= endSeq; s++) {
    const padded = String(s).padStart(5, '0');
    skus.push(`${prefix}${padded}`);
  }

  return { skus, startSeq, endSeq };
}

/**
 * Consulta el número actual del contador sin incrementarlo (solo lectura/preview).
 */
export async function peekNextSkuNumber() {
  try {
    const counterRef = doc(db, "config", "counters");
    const snap = await getDoc(counterRef);
    if (snap.exists() && typeof snap.data().skuSequence === 'number') {
      return snap.data().skuSequence + 1;
    }
  } catch (e) {
    console.error(e);
  }
  return 1001;
}
