import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import JsBarcode from 'jsbarcode';
import { Printer, X, CheckSquare, Square } from 'lucide-react';

function BarcodeSVG({ code, height = 20, width = 1.3 }) {
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

  // Configuración de cantidades por producto { [productId]: count }
  const [quantities, setQuantities] = useState(() => {
    const init = {};
    products.forEach(p => {
      init[p.id] = 1;
    });
    return init;
  });

  // Cuáles prendas están seleccionadas { [productId]: boolean }
  const [selectedIds, setSelectedIds] = useState(() => {
    const init = {};
    products.forEach(p => {
      init[p.id] = true;
    });
    return init;
  });

  // Formato de hoja: '24' (3x8) o '30' (3x10)
  const [sheetLayout, setSheetLayout] = useState('24');

  // Posición inicial (1 a 24 o 30) para aprovechar hojas empezadas
  const [startPosition, setStartPosition] = useState(1);

  // Filtro de búsqueda en la lista de selección
  const [searchTerm, setSearchTerm] = useState('');

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

  // Seleccionar todas / deseleccionar todas
  const handleSelectAll = (select) => {
    const updated = {};
    products.forEach(p => {
      updated[p.id] = select;
    });
    setSelectedIds(updated);
  };

  // Asignar cantidades según el stock actual
  const handleSetQtyByStock = () => {
    const updated = {};
    products.forEach(p => {
      updated[p.id] = Math.max(1, Number(p.stock) || 1);
    });
    setQuantities(updated);
  };

  // Construir la lista plana de etiquetas a imprimir
  const flatLabels = [];
  // 1. Rellenar huecos en blanco si se empieza en posición > 1
  for (let i = 1; i < startPosition; i++) {
    flatLabels.push({ isBlank: true, key: `blank_${i}` });
  }

  // 2. Agregar etiquetas seleccionadas según su cantidad
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
          code: code
        });
      }
    }
  });

  const totalLabelsToPrint = flatLabels.filter(l => !l.isBlank).length;
  const labelsPerPage = Number(sheetLayout); // 24 o 30
  
  // Dividir en páginas exactas
  const pages = [];
  for (let i = 0; i < flatLabels.length; i += labelsPerPage) {
    pages.push(flatLabels.slice(i, i + labelsPerPage));
  }
  const totalPages = pages.length || 1;

  const handlePrint = () => {
    window.print();
  };

  // Filtrado de lista para el selector
  const filteredProducts = products.filter(p => {
    const q = searchTerm.toLowerCase();
    return p.name?.toLowerCase().includes(q) || 
           p.code?.toLowerCase().includes(q) || 
           p.sku?.toLowerCase().includes(q);
  });

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
          maxWidth: '1020px',
          width: '100%',
          maxHeight: '92vh',
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
                Imprime múltiples etiquetas en hojas adhesivas tamaño carta (Avery / Janel) sin desperdiciar papel.
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

          {/* Cuerpo del modal dividido en 2 columnas: Configuración y Vista Previa */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '360px 1fr',
            flex: 1,
            overflow: 'hidden'
          }}>
            {/* Panel Izquierdo: Selección y Configuración */}
            <div style={{
              padding: '1.25rem',
              borderRight: '1px solid #334155',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              overflowY: 'auto',
              backgroundColor: '#1e293b'
            }}>
              {/* 1. Selector de formato de hoja */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                  1. Formato de Hoja Adhesiva:
                </label>
                <select
                  value={sheetLayout}
                  onChange={(e) => setSheetLayout(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem',
                    borderRadius: '6px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #475569',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="24">24 Etiquetas por Hoja (3x8) - Formato Ropa Ideal</option>
                  <option value="30">30 Etiquetas por Hoja (3x10) - Formato Estándar</option>
                </select>
              </div>

              {/* 2. Posición inicial para ahorrar hojas usadas */}
              <div style={{ backgroundColor: 'rgba(56, 189, 248, 0.08)', padding: '0.75rem', borderRadius: '8px', border: '1px dashed rgba(56, 189, 248, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8' }}>
                    2. ¿Hoja empezada? Iniciar en:
                  </label>
                  <input 
                    type="number"
                    min="1"
                    max={sheetLayout}
                    value={startPosition}
                    onChange={(e) => setStartPosition(Math.min(Number(sheetLayout), Math.max(1, Number(e.target.value) || 1)))}
                    style={{
                      width: '60px',
                      padding: '0.35rem',
                      textAlign: 'center',
                      backgroundColor: '#0f172a',
                      border: '1px solid #38bdf8',
                      color: '#38bdf8',
                      fontWeight: 'bold',
                      borderRadius: '4px'
                    }}
                  />
                </div>
                <small style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem', marginTop: '0.3rem' }}>
                  Si ya usaste las primeras {startPosition - 1} etiquetas de tu hoja, el sistema dejará esos espacios en blanco.
                </small>
              </div>

              {/* 3. Selección rápida de cantidades */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => handleSelectAll(true)}
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    fontSize: '0.75rem',
                    backgroundColor: '#334155',
                    border: 'none',
                    color: '#cbd5e1',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectAll(false)}
                  style={{
                    flex: 1,
                    padding: '0.4rem',
                    fontSize: '0.75rem',
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
                    padding: '0.4rem',
                    fontSize: '0.75rem',
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
                placeholder="Buscar prenda o código..."
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
                maxHeight: '320px'
              }}>
                {filteredProducts.map(p => {
                  const isSelected = !!selectedIds[p.id];
                  const qty = quantities[p.id] || 1;
                  return (
                    <div 
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0.5rem 0.65rem',
                        borderBottom: '1px solid #1e293b',
                        backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.06)' : 'transparent',
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
                          padding: 0
                        }}
                      >
                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                      
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                          ${p.price} | Stock: {p.stock} | <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>{p.code || p.sku || 'S/C'}</span>
                        </div>
                      </div>

                      {/* Selector de copias */}
                      {isSelected && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <button
                            type="button"
                            onClick={() => handleQtyChange(p.id, -1)}
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '4px',
                              backgroundColor: '#334155',
                              border: 'none',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                          >
                            -
                          </button>
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', width: '22px', textAlign: 'center' }}>
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQtyChange(p.id, 1)}
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '4px',
                              backgroundColor: '#334155',
                              border: 'none',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Panel Derecho: Vista previa de la hoja de etiquetas */}
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
                  disabled={totalLabelsToPrint === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 1.25rem',
                    backgroundColor: totalLabelsToPrint > 0 ? '#10b981' : '#475569',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    cursor: totalLabelsToPrint > 0 ? 'pointer' : 'not-allowed',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  <Printer size={16} /> Imprimir Hoja ({totalPages} pág)
                </button>
              </div>

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
                                height: sheetLayout === '24' ? '29mm' : '23.5mm',
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
                              padding: '1.5mm 1.5mm',
                              height: sheetLayout === '24' ? '29mm' : '23.5mm',
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
                              <BarcodeSVG code={item.code} height={20} width={1.3} />
                              <div style={{ fontSize: '0.62rem', fontFamily: 'monospace', fontWeight: 600, color: '#334155', marginTop: '1px', letterSpacing: '0.5px' }}>
                                {item.code}
                              </div>
                            </div>

                            <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>
                              ${Number(item.price).toFixed(2)}
                            </div>
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
                gridTemplateRows: sheetLayout === '24' ? 'repeat(8, 29mm)' : 'repeat(10, 23.5mm)',
                gap: sheetLayout === '24' ? '1.5mm 3mm' : '1mm 2.5mm',
                boxSizing: 'border-box',
                padding: '7mm 6mm',
                width: '100%',
                height: '276mm',
                maxHeight: '276mm',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
                pageBreakAfter: pIdx === pages.length - 1 ? 'avoid' : 'always',
                breakAfter: pIdx === pages.length - 1 ? 'avoid' : 'page',
                backgroundColor: '#ffffff',
                overflow: 'hidden'
              }}
            >
              {pageLabels.map((item) => {
                if (item.isBlank) {
                  return (
                    <div 
                      key={item.key} 
                      style={{ border: 'none', visibility: 'hidden' }}
                    />
                  );
                }
                return (
                  <div 
                    key={item.key}
                    style={{
                      border: '1px solid #111111',
                      borderRadius: '4px',
                      padding: '1.5mm 1mm',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                      backgroundColor: '#ffffff',
                      height: '100%',
                      color: '#000000',
                      pageBreakInside: 'avoid',
                      breakInside: 'avoid'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '7.5px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: 1 }}>
                        ALINA
                      </div>
                      <div style={{
                        fontSize: '9.5px',
                        fontWeight: 'bold',
                        color: '#000000',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: '1px',
                        lineHeight: 1.1
                      }}>
                        {item.name}
                      </div>
                    </div>

                    <div style={{ margin: '0.5mm 0' }}>
                      <BarcodeSVG code={item.code} height={20} width={1.3} />
                      <div style={{ fontSize: '8.5px', fontFamily: 'monospace', fontWeight: 700, color: '#000000', marginTop: '1px', letterSpacing: '0.5px', lineHeight: 1 }}>
                        {item.code}
                      </div>
                    </div>

                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#000000', lineHeight: 1 }}>
                      ${Number(item.price).toFixed(2)}
                    </div>
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
