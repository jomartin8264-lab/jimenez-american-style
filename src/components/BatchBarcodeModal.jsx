import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import { db } from '../firebase';
import { doc, writeBatch } from 'firebase/firestore';
import { 
  Printer, X, CheckSquare, Square, CheckCircle2, 
  Clock, RotateCcw, Sparkles, Check, Zap, Layers, RefreshCw
} from 'lucide-react';
import { getNextConsecutiveSKUs, peekNextSkuNumber } from '../utils/skuCounter';

function BarcodeSVG({ code, height = 15, width = 1.2 }) {
  const svgRef = useRef(null);
  useEffect(() => {
    if (svgRef.current && code) {
      try {
        JsBarcode(svgRef.current, String(code), {
          format: "CODE128",
          width: width,
          height: height,
          displayValue: false,
          margin: 0,
          background: "transparent",
          lineColor: "#000000"
        });
      } catch (e) {
        console.error("Error Barcode:", e);
      }
    }
  }, [code, height, width]);

  return (
    <svg 
      ref={svgRef} 
      style={{ 
        width: '100%', 
        maxHeight: `${height}px`,
        height: `${height}px`, 
        display: 'block', 
        margin: '0 auto' 
      }} 
    />
  );
}

export default function BatchBarcodeModal({ products = [], onClose }) {
  // Conectar clase especial al body para aislar la hoja en la impresion
  useEffect(() => {
    document.body.classList.add('batch-printing-active');
    return () => {
      document.body.classList.remove('batch-printing-active');
    };
  }, []);

  // Separar productos por estado de etiquetado
  const pendingProducts = products.filter(p => !p.labeled);
  const labeledProducts = products.filter(p => p.labeled === true);

  // Pestaña de filtro activa: 'pending' (solo pendientes), 'all' (todo el catálogo), 'labeled' (ya etiquetadas)
  const [filterTab, setFilterTab] = useState(() => pendingProducts.length > 0 ? 'pending' : 'all');

  // Configuración de cantidades por producto { [productId]: count }
  const [quantities, setQuantities] = useState(() => {
    const init = {};
    products.forEach(p => {
      init[p.id] = 1;
    });
    return init;
  });

  // Cuáles prendas están seleccionadas { [productId]: boolean }
  // Por defecto selecciona las prendas de la pestaña activa (ej. todas las pendientes)
  const [selectedIds, setSelectedIds] = useState(() => {
    const init = {};
    const initialList = pendingProducts.length > 0 ? pendingProducts : products;
    initialList.forEach(p => {
      init[p.id] = true;
    });
    return init;
  });

  // Modo principal: 'preprinted' (Lote de Códigos Libres) | 'existing' (Prendas del Inventario)
  const [mainMode, setMainMode] = useState('preprinted');
  const [blankCount, setBlankCount] = useState(24);
  const [nextStartSeq, setNextStartSeq] = useState(1001);
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const [actualPrintedSkus, setActualPrintedSkus] = useState(null);

  // Consultar el siguiente número de SKU sin avanzar el contador (solo para vista previa)
  useEffect(() => {
    peekNextSkuNumber().then(num => {
      if (num) setNextStartSeq(num);
    });
  }, []);

  // Formato de hoja: '24' (3x8) o '30' (3x10)
  const [sheetLayout, setSheetLayout] = useState('24');

  // Posición inicial (1 a 24 o 30) para aprovechar hojas empezadas
  const [startPosition, setStartPosition] = useState(1);

  // Filtro de búsqueda en la lista de selección
  const [searchTerm, setSearchTerm] = useState('');

  // Estados de post-impresión y actualización de Firestore
  const [showPostPrintPrompt, setShowPostPrintPrompt] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccessMsg, setUpdateSuccessMsg] = useState('');

  // Cambiar pestaña de filtro y auto-seleccionar sus prendas
  const handleTabChange = (newTab) => {
    setFilterTab(newTab);
    const targetList = newTab === 'pending' ? pendingProducts : (newTab === 'labeled' ? labeledProducts : products);
    const newSelected = {};
    targetList.forEach(p => {
      newSelected[p.id] = true;
    });
    setSelectedIds(newSelected);
  };

  // Cambiar cantidad de una prenda
  const handleQtyChange = (id, delta) => {
    setQuantities(prev => ({
      ...prev,
      [id]: Math.max(1, (prev[id] || 1) + delta)
    }));
  };

  // Alternar selección de una prenda
  const toggleSelect = (id) => {
    setSelectedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Obtener lista según pestaña y término de búsqueda
  const currentTabProducts = filterTab === 'pending' 
    ? pendingProducts 
    : (filterTab === 'labeled' ? labeledProducts : products);

  const filteredProducts = currentTabProducts.filter(p => {
    const q = searchTerm.toLowerCase();
    return p.name?.toLowerCase().includes(q) || 
           p.code?.toLowerCase().includes(q) || 
           p.sku?.toLowerCase().includes(q);
  });

  // Seleccionar todas / deseleccionar de la vista actual
  const handleSelectVisible = (select) => {
    setSelectedIds(prev => {
      const updated = { ...prev };
      filteredProducts.forEach(p => {
        updated[p.id] = select;
      });
      return updated;
    });
  };

  // Asignar cantidades según el stock actual
  const handleSetQtyByStock = () => {
    const updated = {};
    products.forEach(p => {
      updated[p.id] = Math.max(1, Number(p.stock) || 1);
    });
    setQuantities(updated);
  };

  // Actualizar en Firestore el estado `labeled` de una lista de IDs
  const handleMarkAsLabeled = async (idsToMark, status = true) => {
    if (!idsToMark || idsToMark.length === 0) return;
    setIsUpdating(true);
    try {
      const batch = writeBatch(db);
      idsToMark.forEach(id => {
        batch.update(doc(db, "products", id), {
          labeled: status,
          labeledAt: status ? new Date().toISOString() : null
        });
      });
      await batch.commit();

      setUpdateSuccessMsg(
        status 
          ? `✅ ¡${idsToMark.length} prenda(s) marcadas como etiquetadas!`
          : `↺ ¡${idsToMark.length} prenda(s) regresadas a pendientes!`
      );
      setShowPostPrintPrompt(false);

      // Desmarcar de la selección actual
      setSelectedIds(prev => {
        const next = { ...prev };
        idsToMark.forEach(id => { next[id] = false; });
        return next;
      });

      setTimeout(() => setUpdateSuccessMsg(''), 4500);
    } catch (err) {
      console.error("Error al actualizar etiquetado:", err);
      alert("Error al actualizar estado en la base de datos: " + (err.message || err));
    } finally {
      setIsUpdating(false);
    }
  };

  // Construir la lista plana de etiquetas a imprimir
  const flatLabels = [];
  // 1. Rellenar huecos en blanco si se empieza en posición > 1
  for (let i = 1; i < startPosition; i++) {
    flatLabels.push({ isBlank: true, key: `blank_${i}` });
  }

  // 2. Construir según el modo activo
  if (mainMode === 'preprinted') {
    const countToUse = actualPrintedSkus ? actualPrintedSkus.length : blankCount;
    for (let i = 0; i < countToUse; i++) {
      const sku = actualPrintedSkus 
        ? actualPrintedSkus[i] 
        : `ALN-${String(nextStartSeq + i).padStart(5, '0')}`;
      flatLabels.push({
        isBlank: false,
        key: `blank_sku_${sku}_${i}`,
        isPreprinted: true,
        name: 'MODA AMERICANA',
        category: 'Ropa',
        price: null,
        code: sku
      });
    }
  } else {
    // Modo de productos existentes
    products.forEach(p => {
      if (selectedIds[p.id]) {
        const count = quantities[p.id] || 1;
        const code = p.code || p.sku || p.id;
        for (let i = 0; i < count; i++) {
          flatLabels.push({
            isBlank: false,
            key: `${p.id}_${i}`,
            id: p.id,
            name: p.name,
            category: p.category || 'Ropa',
            price: p.price,
            code: code,
            isPreprinted: false
          });
        }
      }
    });
  }

  const selectedProductIds = mainMode === 'preprinted' 
    ? [] 
    : Object.keys(selectedIds).filter(id => selectedIds[id]);
  const totalLabelsToPrint = flatLabels.filter(l => !l.isBlank).length;
  const labelsPerPage = Number(sheetLayout); // 24 o 30
  
  // Dividir en páginas exactas
  const pages = [];
  for (let i = 0; i < flatLabels.length; i += labelsPerPage) {
    pages.push(flatLabels.slice(i, i + labelsPerPage));
  }
  const totalPages = pages.length || 1;

  const handlePrint = async () => {
    if (mainMode === 'preprinted') {
      setIsGeneratingBatch(true);
      try {
        const { skus, startSeq, endSeq } = await getNextConsecutiveSKUs(blankCount, 'ALN-');
        setActualPrintedSkus(skus);
        setUpdateSuccessMsg(`✅ ¡Lote de ${skus.length} códigos generado e impreso! Rango: ${skus[0]} al ${skus[skus.length - 1]}`);
        setNextStartSeq(endSeq + 1);
        setTimeout(() => {
          window.print();
          setIsGeneratingBatch(false);
          setShowPostPrintPrompt(false);
        }, 150);
      } catch (err) {
        alert("Error al generar códigos consecutivos: " + (err.message || err));
        setIsGeneratingBatch(false);
      }
    } else {
      window.print();
      // Abrir banner para preguntar si se desea marcar como etiquetadas
      setShowPostPrintPrompt(true);
    }
  };

  return (
    <>
      {/* MODAL INTERACTIVO EN PANTALLA */}
      <div 
        className="batch-modal-screen-wrap"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem',
          backdropFilter: 'blur(5px)'
        }}
      >
        <div style={{
          backgroundColor: '#1e293b',
          color: '#f8fafc',
          borderRadius: '16px',
          maxWidth: '1060px',
          width: '100%',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          border: '1px solid #334155',
          overflow: 'hidden'
        }}>
          {/* Cabecera del modal */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1.2rem 1.5rem',
            borderBottom: '1px solid #334155',
            backgroundColor: '#0f172a'
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Printer size={22} /> Generador de Hoja de Etiquetas en Lote
              </h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                Control inteligente de inventario: imprime por lotes y marca tus prendas etiquetadas sin confusiones.
              </p>
            </div>
            <button 
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)',
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

          {/* Toast / Mensaje de Éxito Flotante */}
          {updateSuccessMsg && (
            <div style={{
              backgroundColor: '#065f46',
              color: '#a7f3d0',
              padding: '0.65rem 1.25rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              borderBottom: '1px solid #059669'
            }}>
              <CheckCircle2 size={18} color="#34d399" />
              <span>{updateSuccessMsg}</span>
            </div>
          )}

          {/* Cuerpo del modal dividido en 2 columnas: Configuración y Vista Previa */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '380px 1fr',
            flex: 1,
            overflow: 'hidden'
          }}>
            {/* Panel Izquierdo: Selección y Configuración */}
            <div style={{
              padding: '1.1rem',
              borderRight: '1px solid #334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
              overflowY: 'auto',
              backgroundColor: '#1e293b'
            }}>
              {/* SELECTOR DE MODO PRINCIPAL: PRE-ETIQUETADO VS INVENTARIO EXISTENTE */}
              <div style={{
                display: 'flex',
                backgroundColor: '#0f172a',
                padding: '0.35rem',
                borderRadius: '8px',
                border: '1px solid #334155',
                gap: '0.35rem'
              }}>
                <button
                  type="button"
                  onClick={() => setMainMode('preprinted')}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.3rem',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    backgroundColor: mainMode === 'preprinted' ? '#38bdf8' : 'transparent',
                    color: mainMode === 'preprinted' ? '#0f172a' : '#94a3b8'
                  }}
                >
                  <Zap size={14} /> 1. Pre-imprimir Códigos
                </button>
                <button
                  type="button"
                  onClick={() => setMainMode('existing')}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.3rem',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    backgroundColor: mainMode === 'existing' ? '#38bdf8' : 'transparent',
                    color: mainMode === 'existing' ? '#0f172a' : '#94a3b8'
                  }}
                >
                  <Layers size={14} /> 2. Prendas Registradas
                </button>
              </div>

              {/* MODO PRE-ETIQUETADO: IMPRESIÓN DE CÓDIGOS LIBRES */}
              {mainMode === 'preprinted' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  <div style={{
                    backgroundColor: '#0f172a',
                    padding: '0.8rem',
                    borderRadius: '8px',
                    border: '1px solid #334155'
                  }}>
                    <div style={{ fontSize: '0.82rem', color: '#38bdf8', fontWeight: 700, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Zap size={14} /> Flujo Rápido de Pre-etiquetado
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8', lineHeight: 1.45 }}>
                      1. Imprime tus stickers con códigos continuos e irrepetibles.<br />
                      2. Pégaselos a las prendas físicas en tienda.<br />
                      3. Da de alta cada prenda en segundos escaneándola con la pistola o celular.
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      ¿Cuántas etiquetas deseas generar?
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={blankCount}
                        onChange={(e) => setBlankCount(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          flex: 1,
                          padding: '0.55rem 0.75rem',
                          borderRadius: '6px',
                          backgroundColor: '#0f172a',
                          border: '2px solid #38bdf8',
                          color: '#38bdf8',
                          fontSize: '1.15rem',
                          fontWeight: 800,
                          boxSizing: 'border-box'
                        }}
                      />
                      <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600 }}>etiquetas</span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      {[24, 48, 72, 96, 100].map(cnt => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => setBlankCount(cnt)}
                          style={{
                            flex: '1 1 auto',
                            padding: '0.35rem 0.45rem',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            backgroundColor: blankCount === cnt ? '#38bdf8' : '#0f172a',
                            color: blankCount === cnt ? '#000' : '#94a3b8',
                            border: blankCount === cnt ? '1px solid #38bdf8' : '1px solid #334155',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          {cnt === 24 ? '24 (1 hoja)' : cnt === 48 ? '48 (2 hojas)' : cnt === 72 ? '72 (3 hojas)' : cnt === 96 ? '96 (4 hojas)' : `${cnt} pzas`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{
                    backgroundColor: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '8px',
                    padding: '0.8rem'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '0.25rem' }}>
                      Rango de SKUs único y consecutivo:
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace' }}>
                      ALN-{String(nextStartSeq).padStart(5, '0')} <span style={{ color: '#94a3b8' }}>➔</span> ALN-{String(nextStartSeq + blankCount - 1).padStart(5, '0')}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#34d399', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <CheckCircle2 size={13} /> Sincronizado en Firestore sin duplicados
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.25rem' }}>
                        Formato de Hoja:
                      </label>
                      <select
                        value={sheetLayout}
                        onChange={(e) => setSheetLayout(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          borderRadius: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #475569',
                          color: '#fff',
                          fontSize: '0.8rem'
                        }}
                      >
                        <option value="24">24 (3x8) Ropa</option>
                        <option value="30">30 (3x10) Compacto</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.25rem' }}>
                        ¿Hoja empezada? Celda:
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={Number(sheetLayout)}
                        value={startPosition}
                        onChange={(e) => setStartPosition(Math.min(Number(sheetLayout), Math.max(1, parseInt(e.target.value) || 1)))}
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          borderRadius: '6px',
                          backgroundColor: '#0f172a',
                          border: '1px solid #475569',
                          color: '#fff',
                          fontSize: '0.8rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '8px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                      💡 <strong>Tip:</strong> Puedes imprimir varios paquetes de 100 etiquetas y tenerlas listas en tienda para pegar conforme desempacas mercancía.
                    </div>
                  </div>
                </div>
              )}

              {/* MODO PRENDAS REGISTRADAS: BANDEJA DE ETIQUETAS */}
              {mainMode === 'existing' && (
                <>
              {/* PESTAÑAS INTELIGENTES: Pendientes vs Todo el Catálogo */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Bandeja de Etiquetas:
                </label>
                <div style={{ display: 'flex', gap: '0.35rem', backgroundColor: '#0f172a', padding: '0.3rem', borderRadius: '8px', border: '1px solid #334155' }}>
                  <button
                    type="button"
                    onClick={() => handleTabChange('pending')}
                    style={{
                      flex: 1.2,
                      padding: '0.45rem 0.3rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                      backgroundColor: filterTab === 'pending' ? '#eab308' : 'transparent',
                      color: filterTab === 'pending' ? '#000' : '#e2e8f0'
                    }}
                  >
                    <Clock size={13} />
                    Pendientes ({pendingProducts.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('all')}
                    style={{
                      flex: 1,
                      padding: '0.45rem 0.3rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                      backgroundColor: filterTab === 'all' ? '#38bdf8' : 'transparent',
                      color: filterTab === 'all' ? '#000' : '#94a3b8'
                    }}
                  >
                    Todas ({products.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('labeled')}
                    style={{
                      flex: 1,
                      padding: '0.45rem 0.3rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                      backgroundColor: filterTab === 'labeled' ? '#10b981' : 'transparent',
                      color: filterTab === 'labeled' ? '#000' : '#94a3b8'
                    }}
                  >
                    Listas ({labeledProducts.length})
                  </button>
                </div>
              </div>

              {/* 1. Selector de formato de hoja */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.25rem' }}>
                    Formato de Hoja:
                  </label>
                  <select
                    value={sheetLayout}
                    onChange={(e) => setSheetLayout(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem',
                      borderRadius: '6px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #475569',
                      color: '#fff',
                      fontSize: '0.8rem'
                    }}
                  >
                    <option value="24">24 (3x8) Ropa</option>
                    <option value="30">30 (3x10) Compacto</option>
                  </select>
                </div>

                {/* 2. Posición inicial para ahorrar hojas usadas */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.25rem' }}>
                    Iniciar en celda:
                  </label>
                  <input 
                    type="number"
                    min="1"
                    max={sheetLayout}
                    value={startPosition}
                    onChange={(e) => setStartPosition(Math.min(Number(sheetLayout), Math.max(1, Number(e.target.value) || 1)))}
                    title="Si ya gastaste etiquetas de la hoja, inicia en esta posición"
                    style={{
                      width: '100%',
                      padding: '0.45rem',
                      textAlign: 'center',
                      backgroundColor: '#0f172a',
                      border: '1px solid #38bdf8',
                      color: '#38bdf8',
                      fontWeight: 'bold',
                      borderRadius: '6px',
                      fontSize: '0.85rem'
                    }}
                  />
                </div>
              </div>

              {/* 3. Botones de acción rápida sobre selección */}
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => handleSelectVisible(true)}
                  style={{
                    flex: 1,
                    padding: '0.35rem',
                    fontSize: '0.72rem',
                    backgroundColor: '#334155',
                    border: 'none',
                    color: '#cbd5e1',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Visibles
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectVisible(false)}
                  style={{
                    flex: 1,
                    padding: '0.35rem',
                    fontSize: '0.72rem',
                    backgroundColor: '#334155',
                    border: 'none',
                    color: '#cbd5e1',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Ninguna
                </button>
                <button
                  type="button"
                  onClick={handleSetQtyByStock}
                  title="Poner la cantidad de etiquetas igual al stock de cada prenda"
                  style={{
                    flex: 1.2,
                    padding: '0.35rem',
                    fontSize: '0.72rem',
                    backgroundColor: 'rgba(52, 211, 153, 0.15)',
                    border: '1px solid rgba(52, 211, 153, 0.4)',
                    color: '#34d399',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Copias x Stock
                </button>
              </div>

              {/* Buscador de prendas */}
              <input 
                type="text"
                placeholder="Buscar por nombre o SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.6rem',
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  color: '#fff',
                  fontSize: '0.8rem',
                  borderRadius: '6px'
                }}
              />

              {/* Lista de prendas a elegir */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                border: '1px solid #334155',
                borderRadius: '8px',
                backgroundColor: '#0f172a',
                maxHeight: '260px'
              }}>
                {filteredProducts.length === 0 ? (
                  <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                    {filterTab === 'pending' 
                      ? '🎉 ¡No hay prendas pendientes de etiquetar!'
                      : 'No se encontraron prendas con ese filtro.'}
                  </div>
                ) : (
                  filteredProducts.map(p => {
                    const isSelected = !!selectedIds[p.id];
                    const qty = quantities[p.id] || 1;
                    const isItemLabeled = p.labeled === true;

                    return (
                      <div 
                        key={p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0.45rem 0.6rem',
                          borderBottom: '1px solid #1e293b',
                          backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                          gap: '0.5rem'
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSelect(p.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: isSelected ? '#38bdf8' : '#64748b',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
                        </button>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {p.name}
                            </span>
                            {isItemLabeled ? (
                              <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                                ✓ Lista
                              </span>
                            ) : (
                              <span style={{ backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#facc15', fontSize: '0.62rem', padding: '1px 5px', borderRadius: '4px', fontWeight: 600 }}>
                                ⏳ Pendiente
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '1px' }}>
                            ${p.price} | Stock: {p.stock} | <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{p.code || p.sku || 'S/C'}</span>
                          </div>
                        </div>

                        {/* Selector de copias */}
                        {isSelected && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                            <button
                              type="button"
                              onClick={() => handleQtyChange(p.id, -1)}
                              style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '4px',
                                border: '1px solid #475569',
                                backgroundColor: '#1e293b',
                                color: '#cbd5e1',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              -
                            </button>
                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', width: '18px', textAlign: 'center', color: '#38bdf8' }}>
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQtyChange(p.id, 1)}
                              style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '4px',
                                border: '1px solid #475569',
                                backgroundColor: '#1e293b',
                                color: '#cbd5e1',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Botón de marcación manual directa */}
              {selectedProductIds.length > 0 && (
                <div style={{ marginTop: 'auto', paddingTop: '0.4rem', borderTop: '1px solid #334155' }}>
                  {filterTab === 'labeled' ? (
                    <button
                      type="button"
                      onClick={() => handleMarkAsLabeled(selectedProductIds, false)}
                      disabled={isUpdating}
                      style={{
                        width: '100%',
                        padding: '0.55rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        backgroundColor: 'rgba(234, 179, 8, 0.15)',
                        border: '1px solid rgba(234, 179, 8, 0.4)',
                        color: '#facc15',
                        borderRadius: '6px',
                        cursor: isUpdating ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <RotateCcw size={14} />
                      {isUpdating ? 'Actualizando...' : `Regresar ${selectedProductIds.length} a Pendientes`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleMarkAsLabeled(selectedProductIds, true)}
                      disabled={isUpdating}
                      style={{
                        width: '100%',
                        padding: '0.55rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        color: '#34d399',
                        borderRadius: '6px',
                        cursor: isUpdating ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <CheckCircle2 size={14} />
                      {isUpdating ? 'Guardando...' : `Marcar ${selectedProductIds.length} como ya Etiquetadas`}
                    </button>
                  )}
                </div>
              )}
                </>
              )}
            </div>

            {/* Panel Derecho: Vista previa e Impresión */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#0f172a',
              overflow: 'hidden'
            }}>
              {/* Barra de control superior */}
              <div style={{
                padding: '0.75rem 1.25rem',
                borderBottom: '1px solid #334155',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#1e293b'
              }}>
                <div style={{ fontSize: '0.85rem' }}>
                  <strong>{totalLabelsToPrint}</strong> etiqueta(s) a imprimir en <strong>{totalPages}</strong> hoja(s) carta.
                </div>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={totalLabelsToPrint === 0 || isGeneratingBatch}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 1.25rem',
                    backgroundColor: (totalLabelsToPrint > 0 && !isGeneratingBatch) ? '#10b981' : '#475569',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    cursor: (totalLabelsToPrint > 0 && !isGeneratingBatch) ? 'pointer' : 'not-allowed',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  {isGeneratingBatch ? (
                    <><RefreshCw size={16} className="animate-spin" /> Guardando contador...</>
                  ) : (
                    <><Printer size={16} /> Imprimir {mainMode === 'preprinted' ? `${blankCount} Códigos Consecutivos` : `Hoja (${totalPages} pág)`}</>
                  )}
                </button>
              </div>

              {/* Banner Interactivo Post-Impresión */}
              {showPostPrintPrompt && selectedProductIds.length > 0 && (
                <div style={{
                  backgroundColor: '#064e3b',
                  borderBottom: '2px solid #10b981',
                  padding: '0.85rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <Sparkles size={22} color="#34d399" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff' }}>
                        ¿Se imprimieron bien tus etiquetas?
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#a7f3d0' }}>
                        Marca las {selectedProductIds.length} prenda(s) para sacarlas automáticamente de tu bandeja de pendientes.
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => handleMarkAsLabeled(selectedProductIds, true)}
                      disabled={isUpdating}
                      style={{
                        backgroundColor: '#10b981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.45rem 0.9rem',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: isUpdating ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <Check size={15} />
                      {isUpdating ? 'Guardando...' : 'Sí, marcar como etiquetadas'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPostPrintPrompt(false)}
                      style={{
                        backgroundColor: 'transparent',
                        color: '#94a3b8',
                        border: '1px solid #065f46',
                        borderRadius: '6px',
                        padding: '0.45rem 0.75rem',
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      Dejar pendientes
                    </button>
                  </div>
                </div>
              )}

              {/* Vista previa en pantalla */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.5rem',
                backgroundColor: '#090d16'
              }}>
                {pages.map((pageLabels, pIdx) => (
                  <div 
                    key={`preview_page_${pIdx}`}
                    style={{
                      width: '100%',
                      maxWidth: '700px',
                      backgroundColor: '#ffffff',
                      color: '#000000',
                      padding: '8mm 6mm',
                      borderRadius: '4px',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'right', marginBottom: '4px' }}>
                      Página {pIdx + 1} de {totalPages}
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: sheetLayout === '24' ? '2mm 3mm' : '1.5mm 2.5mm'
                    }}>
                      {pageLabels.map((item, idx) => {
                        if (item.isBlank) {
                          return (
                            <div 
                              key={item.key} 
                              style={{
                                border: '1px dashed #e2e8f0',
                                height: sheetLayout === '24' ? '28mm' : '23mm',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#cbd5e1',
                                fontSize: '0.7rem'
                              }}
                            >
                              Vacío (#{idx + 1})
                            </div>
                          );
                        }

                        return (
                          <div 
                            key={item.key}
                            style={{
                              border: '1px solid #e2e8f0',
                              borderRadius: '4px',
                              padding: '1.2mm 1.2mm',
                              height: sheetLayout === '24' ? '28mm' : '23mm',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              textAlign: 'center',
                              boxSizing: 'border-box',
                              overflow: 'hidden',
                              backgroundColor: '#fff'
                            }}
                          >
                            <div>
                              <div style={{ fontSize: '0.62rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1 }}>
                                ALINA
                              </div>
                              <div style={{
                                fontSize: '0.70rem',
                                fontWeight: 'bold',
                                color: '#0f172a',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                marginTop: '1px'
                              }}>
                                {item.name}
                              </div>
                            </div>

                            <div style={{ margin: '1px 0' }}>
                              <BarcodeSVG code={item.code} height={15} width={1.2} />
                              <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', fontWeight: 600, color: '#334155', marginTop: '1px', letterSpacing: '0.5px' }}>
                                {item.code}
                              </div>
                            </div>

                            {item.isPreprinted || item.price == null ? (
                              <div style={{ 
                                fontSize: '0.62rem', 
                                color: '#334155', 
                                fontWeight: 700, 
                                lineHeight: 1,
                                borderTop: '0.5px dashed #cbd5e1',
                                paddingTop: '2px'
                              }}>
                                TALLA: _____ &nbsp; $________
                              </div>
                            ) : (
                              <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>
                                ${Number(item.price).toFixed(2)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PORTAL EXCLUSIVO DE IMPRESIÓN (Aislado totalmente del resto de la página) */}
      {createPortal(
        <div id="batch-print-portal" className="batch-print-portal">
          {pages.map((pageLabels, pIdx) => (
            <div 
              key={`print_page_${pIdx}`}
              className="batch-print-page"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gridAutoRows: sheetLayout === '24' ? '24mm' : '20mm',
                gap: sheetLayout === '24' ? '1mm 2mm' : '0.8mm 1.5mm',
                boxSizing: 'border-box',
                padding: '4mm 4mm',
                width: '100%',
                maxWidth: '215mm',
                margin: '0 auto',
                alignContent: 'start',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
                pageBreakAfter: pIdx === pages.length - 1 ? 'avoid' : 'always',
                breakAfter: pIdx === pages.length - 1 ? 'avoid' : 'page',
                backgroundColor: '#ffffff'
              }}
            >
              {pageLabels.map((item) => {
                if (item.isBlank) {
                  return (
                    <div 
                      key={item.key} 
                      style={{ 
                        border: 'none', 
                        visibility: 'hidden',
                        height: sheetLayout === '24' ? '24mm' : '20mm',
                        minHeight: sheetLayout === '24' ? '24mm' : '20mm',
                        maxHeight: sheetLayout === '24' ? '24mm' : '20mm',
                        boxSizing: 'border-box'
                      }}
                    />
                  );
                }
                return (
                  <div 
                    key={item.key}
                    style={{
                      border: '1px solid #111111',
                      borderRadius: '3px',
                      padding: '1mm 1mm',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      backgroundColor: '#ffffff',
                      height: sheetLayout === '24' ? '24mm' : '20mm',
                      minHeight: sheetLayout === '24' ? '24mm' : '20mm',
                      maxHeight: sheetLayout === '24' ? '24mm' : '20mm',
                      color: '#000000',
                      pageBreakInside: 'avoid',
                      breakInside: 'avoid'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '7px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1 }}>
                        ALINA
                      </div>
                      <div style={{
                        fontSize: '8.5px',
                        fontWeight: 'bold',
                        color: '#000000',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: '1px',
                        lineHeight: 1
                      }}>
                        {item.name}
                      </div>
                    </div>

                    <div style={{ margin: '0.2mm 0' }}>
                      <BarcodeSVG code={item.code} height={15} width={1.2} />
                      <div style={{ fontSize: '7.5px', fontFamily: 'monospace', fontWeight: 700, color: '#000000', marginTop: '1px', letterSpacing: '0.5px', lineHeight: 1 }}>
                        {item.code}
                      </div>
                    </div>

                    {item.isPreprinted || item.price == null ? (
                      <div style={{ 
                        fontSize: '7.5px', 
                        color: '#000000', 
                        fontWeight: 700, 
                        lineHeight: 1,
                        borderTop: '0.5px dashed #64748b',
                        paddingTop: '1px'
                      }}>
                        TALLA: _____ &nbsp; $________
                      </div>
                    ) : (
                      <div style={{ fontSize: '10px', fontWeight: '800', color: '#000000', lineHeight: 1 }}>
                        ${Number(item.price).toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
