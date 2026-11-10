import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { 
  X, Camera, Scan, CheckCircle2, AlertTriangle, 
  Monitor, Smartphone, Sparkles, Tag, Plus, Check
} from 'lucide-react';
import CameraBarcodeScanner from './CameraBarcodeScanner';
import { compressImageToBase64 } from '../utils/productImages';
import { soundAlert } from '../utils/soundAlert';

const BASE_CATEGORIES = ['Dama', 'Caballero', 'Niños', 'Bebés', 'Accesorios', 'Calzado', 'Otros'];

export default function QuickProductEntryModal({ 
  isOpen, 
  onClose, 
  categories = BASE_CATEGORIES,
  onProductSaved
}) {
  const { currentUser } = useAuth();
  
  // Detección inicial de dispositivo (si pantalla es menor a 768px, inicia en modo celular)
  const [entryMode, setEntryMode] = useState(() => {
    return window.innerWidth <= 768 ? 'mobile' : 'pc';
  });

  // Lista enriquecida de categorías
  const [availableCategories, setAvailableCategories] = useState(() => {
    const passed = Array.isArray(categories) && categories.length > 0 ? categories : [];
    return Array.from(new Set([...BASE_CATEGORIES, ...passed]));
  });
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCatName, setCustomCatName] = useState('');

  // Cargar categorías guardadas en la configuración de la tienda en Firestore
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const snap = await getDoc(doc(db, "config", "categories"));
        if (snap.exists() && Array.isArray(snap.data().list) && snap.data().list.length > 0) {
          const fromDb = snap.data().list;
          const passed = Array.isArray(categories) && categories.length > 0 ? categories : [];
          setAvailableCategories(Array.from(new Set([...BASE_CATEGORIES, ...fromDb, ...passed])));
        }
      } catch (err) {
        console.warn("Error cargando categorías:", err);
      }
    };
    loadCategories();
  }, [categories]);

  // Campos del formulario
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [size, setSize] = useState('M');
  const [customSize, setCustomSize] = useState('');
  const [category, setCategory] = useState('Dama');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('1');
  const [description, setDescription] = useState('');
  const [availableOnline, setAvailableOnline] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Estados de control
  const [isSaving, setIsSaving] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [existingProduct, setExistingProduct] = useState(null);
  const [successToast, setSuccessToast] = useState('');
  const [lastSavedProduct, setLastSavedProduct] = useState(null);

  const codeInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const priceInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sincronizar el canal de venta por defecto según el modo
  useEffect(() => {
    if (entryMode === 'pc') {
      setAvailableOnline(false); // Por defecto en PC: Solo Tienda Física (rápido sin foto)
    } else {
      setAvailableOnline(true);  // Por defecto en Celular: Publicado en Tienda Web con foto
    }
  }, [entryMode]);

  // Enfocar el input de código al abrir el modal o cambiar de modo
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (entryMode === 'pc') {
          codeInputRef.current?.focus();
        }
      }, 150);
    }
  }, [isOpen, entryMode]);

  if (!isOpen) return null;

  // Manejar cambio de foto y preview
  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // Verificar si un código ya existe en Firestore
  const verifyCodeInDB = async (scannedCode) => {
    const cleanCode = scannedCode.trim();
    if (!cleanCode) return;

    try {
      // Buscar por code o sku
      const q = query(collection(db, "products"), where("code", "==", cleanCode));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const found = snap.docs[0].data();
        setExistingProduct({ id: snap.docs[0].id, ...found });
        try { soundAlert('error'); } catch (e) {}
      } else {
        setExistingProduct(null);
        try { soundAlert('beep'); } catch (e) {}
        // Si el código es nuevo y estamos en PC, pasar el foco al campo Nombre
        if (entryMode === 'pc') {
          setTimeout(() => nameInputRef.current?.focus(), 80);
        }
      }
    } catch (err) {
      console.warn("Error al verificar código:", err);
    }
  };

  // Cuando el usuario termina de escanear con la pistola (tecla Enter en el campo de código)
  const handleCodeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      verifyCodeInDB(code);
    }
  };

  // Escaneo exitoso desde la cámara del celular
  const handleCameraScanSuccess = (scanned) => {
    setShowCameraScanner(false);
    setCode(scanned);
    verifyCodeInDB(scanned);
  };

  // Limpiar formulario y reenfocar en código para el siguiente artículo
  const resetFormForNextItem = () => {
    setCode('');
    setName('');
    setCustomSize('');
    setPrice('');
    setStock('1');
    setDescription('');
    setImageFile(null);
    setImagePreview(null);
    setExistingProduct(null);
    setIsCustomCategory(false);
    setCustomCatName('');
    if (fileInputRef.current) fileInputRef.current.value = '';

    setTimeout(() => {
      if (entryMode === 'pc') {
        codeInputRef.current?.focus();
      }
    }, 100);
  };

  // Guardar Prenda en Firestore
  const handleSubmit = async (e) => {
    e.preventDefault();

    const cleanCode = code.trim();
    if (!cleanCode) {
      alert("Por favor ingresa o escanea el código de barras de la prenda.");
      codeInputRef.current?.focus();
      return;
    }

    if (!name.trim()) {
      alert("Por favor escribe el nombre de la prenda.");
      nameInputRef.current?.focus();
      return;
    }

    if (!price || Number(price) <= 0) {
      alert("Por favor ingresa un precio válido mayor a 0.");
      priceInputRef.current?.focus();
      return;
    }

    // Si se eligió publicar en la web, advertir si falta la foto
    if (availableOnline && !imageFile && !imagePreview) {
      const proceedWithout = window.confirm(
        "Has seleccionado 'Publicar en Tienda Web' pero no has tomado una foto. ¿Deseas publicarla con el logo por defecto o prefieres tomarle foto ahora?"
      );
      if (!proceedWithout) return;
    }

    setIsSaving(true);

    try {
      // 1. Procesar imagen si existe
      let uploadedUrl = null;
      if (imageFile) {
        try {
          uploadedUrl = await compressImageToBase64(imageFile);
        } catch (err) {
          console.warn("Compresión local falló:", err);
        }

        // Si la compresión local no funcionó, intentar subir a ImgBB
        if (!uploadedUrl) {
          try {
            const formData = new FormData();
            formData.append('image', imageFile);
            const key = "fab6ce338dcb4e9eeb8ff9a89e463876";
            const res = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, {
              method: 'POST',
              body: formData
            });
            const data = await res.json();
            if (data.success) uploadedUrl = data.data.url;
          } catch (e) {
            console.warn("ImgBB upload falló:", e);
          }
        }
      }

      // Si no hay foto, asignar placeholder seguro
      if (!uploadedUrl) {
        uploadedUrl = '/images/brand_logo_1774572391476.png';
      }

      const authorEmail = currentUser?.email || 'mostrador';
      const authorName = currentUser?.displayName || authorEmail.split('@')[0];
      const finalSize = customSize.trim() ? customSize.trim().toUpperCase() : size;
      const finalCategory = isCustomCategory && customCatName.trim() ? customCatName.trim() : (category || 'Dama');

      const productPayload = {
        name: name.trim(),
        price: Number(price),
        stock: Number(stock) || 1,
        code: cleanCode,
        sku: cleanCode,
        size: finalSize,
        category: finalCategory,
        description: description.trim(),
        availableOnline: Boolean(availableOnline),
        image: uploadedUrl,
        createdBy: authorEmail,
        createdByName: authorName,
        createdAt: new Date().toISOString(),
        labeled: true, // Ya tenía su etiqueta pegada al darla de alta!
        labeledAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, "products"), productPayload);

      try {
        soundAlert('success');
      } catch (e) {}

      const savedWithId = { id: docRef.id, ...productPayload };
      setLastSavedProduct(savedWithId);
      setSuccessToast(`¡"${name}" guardada con SKU ${cleanCode}!`);
      setTimeout(() => setSuccessToast(''), 4000);

      if (onProductSaved) {
        onProductSaved(savedWithId);
      }

      resetFormForNextItem();
    } catch (err) {
      console.error("Error al registrar prenda:", err);
      alert("Error al guardar la prenda en la base de datos: " + (err.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.88)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99990,
      padding: '1rem',
      boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #334155',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
        overflow: 'hidden'
      }}>
        {/* ENCABEZADO */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#1e293b'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Tag size={22} /> Alta Rápida de Prenda
            </h2>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              Escanea el código de la etiqueta ya pegada y captura los datos en segundos.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: '#94a3b8',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* SELECTOR DE MODO: PC VS CELULAR */}
        <div style={{ padding: '0.75rem 1.25rem 0', backgroundColor: '#0f172a' }}>
          <div style={{
            display: 'flex',
            backgroundColor: '#1e293b',
            padding: '0.3rem',
            borderRadius: '10px',
            border: '1px solid #334155',
            gap: '0.35rem'
          }}>
            <button
              type="button"
              onClick={() => setEntryMode('pc')}
              style={{
                flex: 1,
                padding: '0.6rem 0.5rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                backgroundColor: entryMode === 'pc' ? '#38bdf8' : 'transparent',
                color: entryMode === 'pc' ? '#0f172a' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              <Monitor size={17} /> 💻 Modo PC (Pistola / Solo Tienda)
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('mobile')}
              style={{
                flex: 1,
                padding: '0.6rem 0.5rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                backgroundColor: entryMode === 'mobile' ? '#38bdf8' : 'transparent',
                color: entryMode === 'mobile' ? '#0f172a' : '#94a3b8',
                transition: 'all 0.15s ease'
              }}
            >
              <Smartphone size={17} /> 📱 Modo Celular (Cámara + Foto Web)
            </button>
          </div>
        </div>

        {/* TOAST DE ÉXITO */}
        {successToast && (
          <div style={{
            margin: '0.75rem 1.25rem 0',
            backgroundColor: '#065f46',
            color: '#a7f3d0',
            padding: '0.65rem 1rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            border: '1px solid #059669'
          }}>
            <CheckCircle2 size={18} color="#34d399" />
            <span>{successToast}</span>
          </div>
        )}

        {/* FORMULARIO */}
        <form onSubmit={handleSubmit} style={{ padding: '1rem 1.25rem 1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          
          {/* PASO 1: CÓDIGO DE BARRAS / SKU */}
          <div>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>
              <span>1. Código de Barras / SKU pegado en la prenda:</span>
              <span style={{ fontSize: '0.72rem', color: '#38bdf8' }}>
                {entryMode === 'pc' ? '🎯 Da el pistolazo o teclea' : '📷 Escanea con la cámara'}
              </span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                ref={codeInputRef}
                type="text"
                placeholder="Ej. ALN-01001 (Pistolazo)"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setExistingProduct(null);
                }}
                onKeyDown={handleCodeKeyDown}
                onBlur={() => { if (code.trim()) verifyCodeInDB(code); }}
                style={{
                  flex: 1,
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  backgroundColor: '#1e293b',
                  border: existingProduct ? '2px solid #ef4444' : (code.trim() ? '2px solid #10b981' : '1px solid #475569'),
                  color: '#fff',
                  fontSize: '1rem',
                  fontFamily: 'monospace',
                  fontWeight: 700
                }}
                autoFocus={entryMode === 'pc'}
              />
              {entryMode === 'mobile' && (
                <button
                  type="button"
                  onClick={() => setShowCameraScanner(true)}
                  style={{
                    padding: '0.65rem 1rem',
                    backgroundColor: '#0284c7',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer'
                  }}
                >
                  <Camera size={18} /> Escanear
                </button>
              )}
            </div>

            {/* Aviso si el código ya existe */}
            {existingProduct && (
              <div style={{
                marginTop: '0.4rem',
                padding: '0.55rem 0.75rem',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                color: '#fca5a5',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}>
                <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
                <span>
                  <strong>⚠️ Código ya registrado:</strong> "{existingProduct.name}" (${existingProduct.price} | Stock: {existingProduct.stock}). Si continúas, se creará un duplicado.
                </span>
              </div>
            )}
          </div>

          {/* PASO 2: NOMBRE DE LA PRENDA */}
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>
              2. Nombre de la Prenda:
            </label>
            <input
              ref={nameInputRef}
              type="text"
              placeholder="Ej. Playera Polo Ralph Lauren Azul"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                color: '#fff',
                fontSize: '0.95rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* PASO 3: TALLA Y CATEGORÍA */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            {/* TALLA */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>
                3. Talla:
              </label>
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                {['CH', 'M', 'G', 'XL', 'Uni'].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setSize(t); setCustomSize(''); }}
                    style={{
                      padding: '0.3rem 0.55rem',
                      borderRadius: '5px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      border: size === t && !customSize ? '1px solid #38bdf8' : '1px solid #334155',
                      backgroundColor: size === t && !customSize ? '#38bdf8' : '#1e293b',
                      color: size === t && !customSize ? '#0f172a' : '#cbd5e1',
                      cursor: 'pointer'
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Otra talla (ej. 32, 7.5)"
                value={customSize}
                onChange={(e) => setCustomSize(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.7rem',
                  borderRadius: '6px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  color: '#fff',
                  fontSize: '0.8rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* CATEGORÍA */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>
                  4. Categoría:
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomCategory(!isCustomCategory);
                    if (!isCustomCategory) setCustomCatName('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                    padding: 0
                  }}
                >
                  {isCustomCategory ? '← Ver lista' : '+ Otra...'}
                </button>
              </div>

              {isCustomCategory ? (
                <input
                  type="text"
                  placeholder="Escribe la nueva categoría..."
                  value={customCatName}
                  onChange={(e) => {
                    setCustomCatName(e.target.value);
                    setCategory(e.target.value);
                  }}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.7rem',
                    borderRadius: '8px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #38bdf8',
                    color: '#38bdf8',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                    fontWeight: 700
                  }}
                />
              ) : (
                <select
                  value={category}
                  onChange={(e) => {
                    if (e.target.value === '__NEW__') {
                      setIsCustomCategory(true);
                      setCustomCatName('');
                    } else {
                      setCategory(e.target.value);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.7rem',
                    borderRadius: '8px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    color: '#fff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                >
                  {availableCategories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="__NEW__">+ Escribir otra categoría...</option>
                </select>
              )}
            </div>
          </div>

          {/* PASO 4: PRECIO Y STOCK */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>
                5. Precio de Venta ($):
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontWeight: 700 }}>$</span>
                <input
                  ref={priceInputRef}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem 0.65rem 1.8rem',
                    borderRadius: '8px',
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    color: '#fff',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.35rem' }}>
                6. Piezas en Stock:
              </label>
              <input
                type="number"
                min="1"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  color: '#fff',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* PASO 5: CANAL DE VENTA Y FOTO */}
          <div style={{
            backgroundColor: '#1e293b',
            padding: '0.85rem',
            borderRadius: '10px',
            border: '1px solid #334155'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={availableOnline}
                    onChange={(e) => setAvailableOnline(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#38bdf8' }}
                  />
                  <span>🌐 Publicar también en la Tienda Web (Catálogo Clientes)</span>
                </label>
                <div style={{ fontSize: '0.74rem', color: availableOnline ? '#38bdf8' : '#94a3b8', marginTop: '0.2rem', marginLeft: '1.6rem' }}>
                  {availableOnline 
                    ? '✓ Visible en el catálogo web para pedidos por WhatsApp y en caja POS.' 
                    : '🏬 Exclusivo para Mostrador (Solo se venderá físicamente en caja POS).'}
                </div>
              </div>
            </div>

            {/* SECCIÓN DE FOTO: REQUERIDA O SUGERIDA SI ESTÁ EN WEB */}
            {(availableOnline || entryMode === 'mobile' || imagePreview) && (
              <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px dashed #475569' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                  📸 Foto de la Prenda {availableOnline ? '(Recomendada para la web)' : '(Opcional)'}:
                </label>
                
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoSelect}
                    style={{ display: 'none' }}
                    id="quick-entry-camera-input"
                  />
                  <label
                    htmlFor="quick-entry-camera-input"
                    style={{
                      padding: '0.6rem 1rem',
                      backgroundColor: '#0284c7',
                      color: '#fff',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <Camera size={16} /> {entryMode === 'mobile' ? 'Tomar Foto con Cámara' : 'Subir Imagen'}
                  </label>

                  {imagePreview && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <img
                        src={imagePreview}
                        alt="Preview"
                        style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #38bdf8' }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.75rem', cursor: 'pointer' }}
                      >
                        Quitar foto
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* DESCRIPCIÓN OPCIONAL */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.25rem' }}>
              Descripción o notas (opcional):
            </label>
            <input
              type="text"
              placeholder="Ej. Slim fit, algodón 100%, detalle en cuello"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                color: '#fff',
                fontSize: '0.85rem',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '0.75rem',
                backgroundColor: '#334155',
                color: '#cbd5e1',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Cerrar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                flex: 2,
                padding: '0.75rem',
                backgroundColor: isSaving ? '#475569' : '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: isSaving ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)'
              }}
            >
              {isSaving ? 'Guardando en Almacén...' : (entryMode === 'pc' ? '⚡ Guardar Prenda (Enter)' : '✓ Guardar y Dar de Alta')}
            </button>
          </div>
        </form>
      </div>

      {/* MODAL DE CÁMARA PARA ESCANEAR CÓDIGOS DE BARRA EN CELULAR */}
      {showCameraScanner && (
        <CameraBarcodeScanner
          onScan={handleCameraScanSuccess}
          onClose={() => setShowCameraScanner(false)}
        />
      )}
    </div>
  );
}
